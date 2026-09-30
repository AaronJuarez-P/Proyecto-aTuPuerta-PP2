const database = require('../database/database');
const { esModoMock, crearPreferencia, consultarPago, validarFirmaWebhook } = require('../services/pago.service');
const { cambiarEstadoPedido, restaurarStockPedido } = require('../services/pedido.service');
const { emitirEstadoDePedido } = require('../services/tiemporeal.service');
const { obtenerIdValido } = require('../utils/validacion');
const {
    enviarNotificaciones,
    enviarNotificacionRol,
    enviarNotificacionRepartidores
} = require('./notificaciones.controller');

// Estados de pagos.estado de los que ya no se vuelve. Si el pago esta en uno de estos,
// una notificacion repetida no tiene que volver a tocar nada.
const ESTADOS_TERMINALES = ['aprobado', 'rechazado', 'fallido'];

// A que estado quedo el PEDIDO segun como salio el PAGO (semana 10, CU26).
//
// aplicarResultadoPago no cuenta el estado del pedido, cuenta el del pago, y no todos
// los resultados mueven el pedido: 'ya_procesado', 'pendiente', 'sin_pago' y
// 'sin_pedido' lo dejan donde estaba. Solo los de este mapa emiten, y es lo que impide
// que el reintento de un webhook de MercadoPago le anuncie dos veces al cliente un
// cambio que paso una sola vez.
const ESTADO_SEGUN_RESULTADO = {
    aprobado:       'en_preparacion',
    rechazado:      'cancelado',
    fallido:        'cancelado',
    monto_invalido: 'cancelado'
};

// Se llama despues del commit y sin await, igual que el resto de las emisiones
// (ver la regla en el encabezado de tiemporeal.service.js).
const avisarCambioDeEstado = (pedidoId, resultado) => {
    const estado = ESTADO_SEGUN_RESULTADO[resultado];

    if (estado) {
        emitirEstadoDePedido({ pedidoId, estado }).catch(() => {});
    }
};

// pagos.motivo_rechazo es VARCHAR(255)
const LARGO_MAXIMO_MOTIVO = 255;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// El cliente_id lo resuelve el middleware resolverCliente y llega en req.clienteId
// (semana 10). Hasta entonces habia un helper local que hacia el mismo SELECT en los
// tres handlers de este archivo.
//
// Ahora se resuelve FUERA de la transaccion, no adentro como antes. Es seguro:
// clientes.usuario_id no cambia a mitad de un request, y es el mismo criterio que
// resolverRepartidor y resolverComercio ya venian aceptando.

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

// Avisos que deja el resultado de un pago (semana 11). Se mandan despues del commit:
// lo que se anuncia ya tiene que estar en la base. Cada clave es opcional, porque no
// todos los resultados avisan a todos.
const notificarResultadoPago = async (notificaciones) => {
    if (!notificaciones) {
        return;
    }

    if (notificaciones.cliente) {
        await enviarNotificaciones(notificaciones.cliente.usuarioId, notificaciones.cliente);
    }

    if (notificaciones.comercio) {
        await enviarNotificaciones(notificaciones.comercio.usuarioId, notificaciones.comercio);
    }

    if (notificaciones.repartidores) {
        await enviarNotificacionRepartidores(notificaciones.repartidores);
    }

    if (notificaciones.administradores) {
        await enviarNotificacionRol('administrador', notificaciones.administradores);
    }
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
// El orden completo del proyecto es repartidores -> pagos -> pedidos -> productos: los
// flujos del repartidor (semana 8) lockean su fila en repartidores antes que el pedido.
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

    // Se trae tambien el usuario_id del comercio: si el pago se aprueba, es el
    // momento correcto para avisarle que tiene un pedido nuevo para preparar. Y el del
    // cliente, que se entera de como salio su pago (semana 11).
    const [pedidos] = await connection.query(
        `SELECT p.id, p.estado, p.total,
                co.usuario_id AS comercio_usuario_id,
                co.nombre AS comercio_nombre,
                cl.usuario_id AS cliente_usuario_id
         FROM pedidos p
         INNER JOIN comercios co ON co.id = p.comercio_id
         INNER JOIN clientes cl ON cl.id = p.cliente_id
         WHERE p.id = ? FOR UPDATE`,
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

    // El pedido ya no espera el pago: el cliente o un administrador lo cancelaron
    // mientras el pago estaba en curso (semana 13). Se registra lo que paso con el
    // dinero, que es la verdad, pero el pedido NO se mueve: un cancelado no vuelve a
    // en_preparacion (ver TRANSICIONES_PEDIDO). Si el pago se aprobo, la devolucion es
    // manual y se avisa a los administradores para que no se pierda.
    //
    // Sin esta guarda, cambiarEstadoPedido tiraria la transicion ilegal, el webhook
    // contestaria 500 y MercadoPago lo reintentaria para siempre.
    if (pedido.estado !== 'pago_espera') {
        const aprobado = nuevoEstado === 'aprobado';

        await connection.query(
            `UPDATE pagos
             SET estado = ?, motivo_rechazo = ?, referencia_externa = ?, fecha_pago = IF(? , NOW(), fecha_pago)
             WHERE id = ?`,
            [
                nuevoEstado,
                recortarMotivo(aprobado
                    ? `El pedido ya estaba en estado "${pedido.estado}": requiere devolución manual`
                    : motivo),
                referenciaExterna,
                aprobado,
                pago.id
            ]
        );

        return {
            resultado: "pedido_no_pagable",
            notificaciones: aprobado ? {
                administradores: {
                    tipo: "pago_a_devolver",
                    titulo: "Pago a devolver",
                    mensaje: `Se aprobó un pago de $${pedido.total} para el pedido #${pedidoId}, que ya estaba en estado "${pedido.estado}". Hay que devolver el dinero.`,
                    url: `/admin/pedidos/${pedidoId}`
                }
            } : null
        };
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

        await cambiarEstadoPedido(connection, { pedidoId, nuevoEstado: 'cancelado', detalle: 'el monto pagado no coincide' });
        await restaurarStockPedido(connection, pedidoId);

        return {
            resultado: "monto_invalido",
            notificaciones: {
                cliente: {
                    usuarioId: pedido.cliente_usuario_id,
                    tipo: "pago_rechazado",
                    titulo: "Pago rechazado",
                    mensaje: `El pago del pedido #${pedidoId} no coincide con el total y el pedido se canceló.`,
                    url: `/cliente/pedidos/${pedidoId}`
                }
            }
        };
    }

    if (nuevoEstado === 'aprobado') {
        await connection.query(
            `UPDATE pagos
             SET estado = 'aprobado', motivo_rechazo = NULL, referencia_externa = ?, fecha_pago = NOW()
             WHERE id = ?`,
            [referenciaExterna, pago.id]
        );

        await cambiarEstadoPedido(connection, { pedidoId, nuevoEstado: 'en_preparacion', detalle: 'pago aprobado' });

        return {
            resultado: "aprobado",
            notificaciones: {
                cliente: {
                    usuarioId: pedido.cliente_usuario_id,
                    tipo: "pago_aprobado",
                    titulo: "Pago aprobado",
                    mensaje: `Tu pago del pedido #${pedidoId} fue aprobado. ${pedido.comercio_nombre} ya lo está preparando.`,
                    url: `/cliente/pedidos/${pedidoId}`
                },
                comercio: {
                    usuarioId: pedido.comercio_usuario_id,
                    titulo: "Nuevo pedido pagado",
                    mensaje: `Tenés un nuevo pedido #${pedidoId} para preparar`,
                    url: `/comercio/pedidos/${pedidoId}`,
                    tipo: "pedido_creado"
                },
                repartidores: {
                    titulo: "Nuevo pedido disponible",
                    mensaje: `Se creó el pedido #${pedidoId} y está disponible para repartir`,
                    url: "/repartidor/pedidos"
                }
            }
        };
    }

    // Rechazado o fallido: queda el motivo registrado, el pedido se cancela y el stock
    // que habia reservado confirmarCarrito vuelve al catalogo.
    await connection.query(
        `UPDATE pagos SET estado = ?, motivo_rechazo = ?, referencia_externa = ? WHERE id = ?`,
        [nuevoEstado, recortarMotivo(motivo), referenciaExterna, pago.id]
    );

    await cambiarEstadoPedido(connection, { pedidoId, nuevoEstado: 'cancelado', detalle: `pago ${nuevoEstado}` });
    await restaurarStockPedido(connection, pedidoId);

    return {
        resultado: nuevoEstado,
        notificaciones: {
            cliente: {
                usuarioId: pedido.cliente_usuario_id,
                tipo: "pago_rechazado",
                titulo: "Pago rechazado",
                mensaje: `El pago del pedido #${pedidoId} fue rechazado y el pedido se canceló. Podés volver a armarlo desde tu historial.`,
                url: `/cliente/pedidos/${pedidoId}`
            }
        }
    };
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

        const { pedido, error } = await buscarPedidoDelCliente(connection, id, req.clienteId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        // El pedido solo se puede pagar mientras está en 'pago_espera' (recién creado,
        // esperando el pago del cliente). Cualquier otro estado significa que
        // ya se pagó, ya avanzó, o ya se canceló.
        if (pedido.estado !== 'pago_espera') {
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
        const aplicacion = await aplicarResultadoPago(connection, datosPago);
        await connection.commit();

        // Antes decia "resultado" a secas, una variable que no existe en este
        // handler: tiraba ReferenceError DESPUES del commit, el webhook contestaba 500
        // y MercadoPago lo reintentaba aunque el pago ya estuviera aplicado.
        avisarCambioDeEstado(datosPago.pedidoId, aplicacion.resultado);
        await notificarResultadoPago(aplicacion.notificaciones);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { resultado: aplicacion.resultado }
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

        const { pedido, error } = await buscarPedidoDelCliente(database, id, req.clienteId);
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
        // Tiene que ser identico al 404 de app.js, si no se nota que la ruta existe.
        return res.status(404).json({
            codigo: 404,
            estado: "error",
            datos: { mensaje: "Ruta no encontrada" }
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

        const { pedido, error } = await buscarPedidoDelCliente(connection, id, req.clienteId);
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

        avisarCambioDeEstado(id, respuesta.resultado);
        await notificarResultadoPago(respuesta.notificaciones);

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