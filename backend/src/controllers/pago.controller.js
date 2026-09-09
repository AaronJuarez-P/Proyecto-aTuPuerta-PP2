const database = require('../database/database');
const { esModoMock, crearPreferencia, consultarPago, validarFirmaWebhook } = require('../services/pago.service');
const { cambiarEstadoPedido, restaurarStockPedido } = require('../services/pedido.service');

// Estados de pagos.estado de los que ya no se vuelve. Si el pago esta en uno de estos,
// una notificacion repetida no tiene que volver a tocar nada.
const ESTADOS_TERMINALES = ['aprobado', 'rechazado', 'fallido'];

// pagos.motivo_rechazo es VARCHAR(255)
const LARGO_MAXIMO_MOTIVO = 255;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Valida el :id de la ruta. Devuelve el numero o null si no sirve
const obtenerIdValido = (valor) => {
    const id = parseInt(valor, 10);
    return (isNaN(id) || id < 1) ? null : id;
};

// Devuelve { clienteId } o { error: { codigo, mensaje } }
const resolverClienteId = async (conexion, usuarioId) => {
    const [clientes] = await conexion.query(
        `SELECT id FROM clientes WHERE usuario_id = ?`,
        [usuarioId]
    );

    if (clientes.length === 0) {
        return { error: { codigo: 404, mensaje: "No existe un perfil de cliente para este usuario" } };
    }

    return { clienteId: clientes[0].id };
};

// Busca un pedido y verifica que sea del cliente autenticado.
// Sirve tanto con el pool como con una conexion de transaccion.
// Devuelve { pedido } o { error: { codigo, mensaje } }
const buscarPedidoDelCliente = async (conexion, pedidoId, clienteId) => {
    const [pedidos] = await conexion.query(
        `SELECT id, cliente_id, comercio_id, estado, total FROM pedidos WHERE id = ?`,
        [pedidoId]
    );

    if (pedidos.length === 0) {
        return { error: { codigo: 404, mensaje: "Pedido no encontrado" } };
    }

    if (pedidos[0].cliente_id !== clienteId) {
        return { error: { codigo: 403, mensaje: "Ese pedido no es tuyo" } };
    }

    return { pedido: pedidos[0] };
};

// Traduce el status de MercadoPago al ENUM de pagos.estado.
// authorized/pending/in_process todavia no resuelven nada, se quedan en pendiente.
const mapearEstadoPago = (estadoExterno) => {
    switch (estadoExterno) {
        case 'approved':
            return 'aprobado';
        case 'rejected':
            return 'rechazado';
        case 'cancelled':
        case 'refunded':
        case 'charged_back':
            return 'fallido';
        default:
            return 'pendiente';
    }
};

const recortarMotivo = (motivo) => {
    if (!motivo) {
        return null;
    }
    return String(motivo).slice(0, LARGO_MAXIMO_MOTIVO);
};

// ---------------------------------------------------------------------------
// Aplicacion del resultado de un pago
//
// Es el nucleo del modulo y lo comparten el webhook real y el simulador de modo mock,
// justamente para que lo que se prueba sea lo mismo que corre en serio.
//
// Tiene que ejecutarse SIEMPRE dentro de una transaccion ya abierta por quien llama.
// Toma los locks en un orden fijo (pagos -> pedidos -> productos) porque el carrito
// tambien lockea productos: si cada uno los pidiera en distinto orden, dos operaciones
// simultaneas sobre el mismo producto se deadlockearian.
// ---------------------------------------------------------------------------
const aplicarResultadoPago = async (connection, { pedidoId, estadoExterno, motivo, referenciaExterna, monto }) => {
    const [pagos] = await connection.query(
        `SELECT id, estado FROM pagos WHERE pedido_id = ? FOR UPDATE`,
        [pedidoId]
    );

    if (pagos.length === 0) {
        return { resultado: "sin_pago" };
    }
    const pago = pagos[0];

    // Idempotencia. MercadoPago reintenta las notificaciones (y puede mandar varias por
    // el mismo pago), asi que sin esta guarda un aviso repetido devolveria el stock dos
    // veces o volveria a mover un pedido que ya avanzo.
    if (ESTADOS_TERMINALES.includes(pago.estado)) {
        return { resultado: "ya_procesado", estado: pago.estado };
    }

    const [pedidos] = await connection.query(
        `SELECT id, estado, total FROM pedidos WHERE id = ? FOR UPDATE`,
        [pedidoId]
    );

    if (pedidos.length === 0) {
        return { resultado: "sin_pedido" };
    }
    const pedido = pedidos[0];

    const nuevoEstado = mapearEstadoPago(estadoExterno);

    // Todavia no se resolvio (efectivo, transferencia pendiente de acreditar). Se
    // guarda la referencia y se espera la proxima notificacion.
    if (nuevoEstado === 'pendiente') {
        await connection.query(
            `UPDATE pagos SET referencia_externa = ? WHERE id = ?`,
            [referenciaExterna, pago.id]
        );

        return { resultado: "pendiente" };
    }

    // El monto lo decide la base, no la notificacion: si no coincide con el total del
    // pedido, alguien pago de menos y el pedido no se libera.
    if (nuevoEstado === 'aprobado' && Number(monto) !== Number(pedido.total)) {
        await connection.query(
            `UPDATE pagos SET estado = 'fallido', motivo_rechazo = ?, referencia_externa = ? WHERE id = ?`,
            [
                recortarMotivo(`El monto pagado (${monto}) no coincide con el total del pedido (${pedido.total})`),
                referenciaExterna,
                pago.id
            ]
        );

        await cambiarEstadoPedido(connection, { pedidoId, nuevoEstado: 'cancelado' });
        await restaurarStockPedido(connection, pedidoId);

        return { resultado: "monto_invalido" };
    }

    if (nuevoEstado === 'aprobado') {
        await connection.query(
            `UPDATE pagos
             SET estado = 'aprobado', motivo_rechazo = NULL, referencia_externa = ?, fecha_pago = NOW()
             WHERE id = ?`,
            [referenciaExterna, pago.id]
        );

        await cambiarEstadoPedido(connection, { pedidoId, nuevoEstado: 'en_preparacion' });

        return { resultado: "aprobado" };
    }

    // Rechazado o fallido: queda el motivo registrado, el pedido se cancela y el stock
    // que habia reservado confirmarCarrito vuelve al catalogo.
    await connection.query(
        `UPDATE pagos SET estado = ?, motivo_rechazo = ?, referencia_externa = ? WHERE id = ?`,
        [nuevoEstado, recortarMotivo(motivo), referenciaExterna, pago.id]
    );

    await cambiarEstadoPedido(connection, { pedidoId, nuevoEstado: 'cancelado' });
    await restaurarStockPedido(connection, pedidoId);

    return { resultado: nuevoEstado };
};

// ---------------------------------------------------------------------------
// CU07 - Realizar pago
// ---------------------------------------------------------------------------

// POST /api/pedidos/:id/pagar
const iniciarPago = async (req, res) => {

    const connection = await database.getConnection();

    try {
        const id = obtenerIdValido(req.params.id);
        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido no es válido" }
            });
        }

        const { clienteId, error: errorCliente } = await resolverClienteId(connection, req.usuario.id);
        if (errorCliente) {
            return res.status(errorCliente.codigo).json({
                codigo: errorCliente.codigo,
                estado: "error",
                datos: { mensaje: errorCliente.mensaje }
            });
        }

        const { pedido, error } = await buscarPedidoDelCliente(connection, id, clienteId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        if (pedido.estado !== 'pendiente_pago') {
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: `El pedido está en estado "${pedido.estado}" y ya no se puede pagar` }
            });
        }

        const [items] = await connection.query(
            `SELECT ip.producto_id, ip.cantidad, ip.precio_unit, p.nombre AS producto_nombre
             FROM items_pedido ip
             INNER JOIN productos p ON p.id = ip.producto_id
             WHERE ip.pedido_id = ?`,
            [id]
        );

        if (items.length === 0) {
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: "El pedido no tiene items para cobrar" }
            });
        }

        // La llamada a la pasarela va FUERA de la transaccion: no conviene tener una
        // transaccion abierta esperando una respuesta de red.
        const { referenciaExterna, urlPago } = await crearPreferencia({ pedidoId: id, items });

        await connection.beginTransaction();

        // pagos tiene UNIQUE KEY uq_pagos_pedido: hay una sola fila por pedido, asi que
        // un reintento actualiza la que ya existe en vez de insertar otra.
        await connection.query(
            `INSERT INTO pagos (pedido_id, metodo, estado, monto, referencia_externa)
             VALUES (?, 'mercadopago', 'pendiente', ?, ?)
             ON DUPLICATE KEY UPDATE
                estado             = 'pendiente',
                monto              = VALUES(monto),
                referencia_externa = VALUES(referencia_externa),
                motivo_rechazo     = NULL,
                fecha_pago         = NULL`,
            [id, pedido.total, referenciaExterna]
        );

        // Se commitea ANTES de devolver la URL a proposito: asi la fila de pagos ya
        // existe cuando el cliente entra a pagar y el webhook no puede llegar antes.
        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Intento de pago registrado",
                pago: {
                    pedido_id: id,
                    estado: "pendiente",
                    monto: Number(pedido.total),
                    referencia_externa: referenciaExterna
                },
                url_pago: urlPago,
                modo: esModoMock() ? "mock" : "sandbox"
            }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// POST /api/pagos/webhook
//
// Publico a proposito: MercadoPago no tiene nuestro JWT, no puede pasar por
// verificarToken. La firma x-signature es la unica autenticacion que tiene este
// endpoint, y es lo que impide que cualquiera mande una aprobacion falsa.
const recibirWebhook = async (req, res) => {

    // En modo mock no hay MercadoPago del otro lado, asi que nunca va a llegar una
    // notificacion real. Se contesta explicitamente en vez de intentar consultar un
    // pago contra una API para la que no hay credenciales.
    if (esModoMock()) {
        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "El backend está en MP_MODO=mock. Para simular un resultado usá POST /api/pagos/simular" }
        });
    }

    const connection = await database.getConnection();

    try {
        // MercadoPago manda el id del recurso por query string y tambien en el body
        const dataId = req.query['data.id'] || req.body?.data?.id;

        try {
            validarFirmaWebhook({
                xSignature: req.headers['x-signature'],
                xRequestId: req.headers['x-request-id'],
                dataId
            });
        } catch (errorFirma) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Firma de la notificación inválida" }
            });
        }

        const tipo = req.body?.type || req.body?.topic;

        // Tambien llegan avisos de merchant_order y otros recursos. Se confirman con 200
        // para que MercadoPago no los reintente, pero no hay nada que hacer con ellos.
        if (tipo !== 'payment' || !dataId) {
            return res.status(200).json({
                codigo: 200,
                estado: "exito",
                datos: { mensaje: "Notificación recibida y omitida" }
            });
        }

        // El body solo trae un id. El estado y el monto reales se piden a la API: creerle
        // al cuerpo de la notificacion seria confiar en datos que manda quien hace el POST.
        const datosPago = await consultarPago(dataId);

        if (!datosPago.pedidoId) {
            return res.status(200).json({
                codigo: 200,
                estado: "exito",
                datos: { mensaje: "El pago no tiene un pedido asociado" }
            });
        }

        await connection.beginTransaction();
        const { resultado } = await aplicarResultadoPago(connection, datosPago);
        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { resultado }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        // Se devuelve 500 a proposito para que MercadoPago reintente: si el error fue
        // pasajero (la base caida un segundo), perder la notificacion dejaria un pedido
        // pagado sin acreditar. El reintento es seguro porque aplicarResultadoPago es
        // idempotente.
        console.error("Error procesando webhook de MercadoPago:", error.message);

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// GET /api/pedidos/:id/pago
//
// El webhook es asincronico, asi que el cliente necesita poder preguntar si el pago
// ya se acredito en vez de adivinarlo.
const consultarPagoPedido = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);
        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido no es válido" }
            });
        }

        const { clienteId, error: errorCliente } = await resolverClienteId(database, req.usuario.id);
        if (errorCliente) {
            return res.status(errorCliente.codigo).json({
                codigo: errorCliente.codigo,
                estado: "error",
                datos: { mensaje: errorCliente.mensaje }
            });
        }

        const { pedido, error } = await buscarPedidoDelCliente(database, id, clienteId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        const [pagos] = await database.query(
            `SELECT pedido_id, metodo, estado, monto, referencia_externa, motivo_rechazo, fecha_pago
             FROM pagos
             WHERE pedido_id = ?`,
            [id]
        );

        if (pagos.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Todavía no se registró ningún intento de pago para este pedido" }
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pago: pagos[0],
                pedido: { id: pedido.id, estado: pedido.estado, total: Number(pedido.total) }
            }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// POST /api/pagos/simular
//
// Atajo de desarrollo: corre exactamente la misma logica que el webhook, pero con un
// resultado elegido a mano. Permite demostrar aprobacion y rechazo sin depender de
// ngrok ni de credenciales. Solo existe con MP_MODO=mock.
const simularPago = async (req, res) => {

    if (!esModoMock()) {
        return res.status(404).json({
            codigo: 404,
            estado: "Ruta no encontrada",
            datos: null
        });
    }

    const connection = await database.getConnection();

    try {
        const { pedido_id, resultado, monto } = req.body;

        const id = obtenerIdValido(pedido_id);
        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "pedido_id es obligatorio y debe ser un número válido" }
            });
        }

        if (resultado !== 'approved' && resultado !== 'rejected') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: 'resultado debe ser "approved" o "rejected"' }
            });
        }

        const { clienteId, error: errorCliente } = await resolverClienteId(connection, req.usuario.id);
        if (errorCliente) {
            return res.status(errorCliente.codigo).json({
                codigo: errorCliente.codigo,
                estado: "error",
                datos: { mensaje: errorCliente.mensaje }
            });
        }

        const { pedido, error } = await buscarPedidoDelCliente(connection, id, clienteId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        // Sin monto explicito se simula un pago correcto por el total. Mandandolo a mano
        // se puede probar la verificacion de monto.
        const montoSimulado = monto !== undefined ? Number(monto) : Number(pedido.total);

        await connection.beginTransaction();

        const respuesta = await aplicarResultadoPago(connection, {
            pedidoId: id,
            estadoExterno: resultado,
            motivo: resultado === 'approved' ? 'accredited' : 'cc_rejected_insufficient_amount',
            referenciaExterna: `MOCK-PAY-${Date.now()}`,
            monto: montoSimulado
        });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Resultado de pago simulado aplicado",
                resultado: respuesta.resultado
            }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// GET /api/pagos/retorno
//
// A donde vuelve el navegador despues de pagar en MercadoPago (back_urls). El estado
// real no se toma de aca sino del webhook: esta pantalla es solo el "ya volviste".
const retornoPago = (req, res) => {
    return res.status(200).json({
        codigo: 200,
        estado: "exito",
        datos: {
            mensaje: "Volviste de MercadoPago. El estado del pedido se actualiza cuando llega la confirmación.",
            referencia_externa: req.query.payment_id || null
        }
    });
};

module.exports = {
    iniciarPago,
    recibirWebhook,
    consultarPagoPedido,
    simularPago,
    retornoPago
};
