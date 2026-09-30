const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const {
    obtenerIdValido,
    obtenerTextoQuery,
    obtenerFechaQuery
} = require('../utils/validacion');
const { ESTADOS_PEDIDO, cancelarPedido } = require('../services/pedido.service');
const { emitirEstadoDePedido } = require('../services/tiemporeal.service');

// El lado CLIENTE de los pedidos (semanas 7 y 12). Mismo criterio que
// seguimiento.routes.js: pedido.controller.js es entero del lado repartidor, y mezclar
// los dos lados en un archivo volveria ambiguo de quien es cada endpoint.
//
// El cliente sale siempre de req.clienteId (resolverCliente), nunca del body.

const responderError = (res, codigo, mensaje, extra = {}) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje, ...extra }
    });
};

// Mismo "es tuyo o 403" que buscarPedidoDelCliente en pago.controller.js, con los
// mismos textos: el cliente ya conoce esos mensajes.
const buscarPedidoPropio = async (conexion, pedidoId, clienteId, { bloquear = false } = {}) => {
    const [pedidos] = await conexion.query(
        `SELECT id, cliente_id, estado FROM pedidos WHERE id = ? ${bloquear ? 'FOR UPDATE' : ''}`,
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

// ---------------------------------------------------------------------------
// CU09 - Historial de pedidos del cliente
// ---------------------------------------------------------------------------

// GET /api/pedidos?estado=&desde=&hasta=&pagina=&limite=
//
// Todos los pedidos del cliente, los mas nuevos primero. Usa idx_pedidos_cliente_fecha.
const listarMisPedidos = async (req, res) => {
    try {
        const estado = obtenerTextoQuery(req.query.estado);
        const desde = obtenerFechaQuery(req.query.desde);
        const hasta = obtenerFechaQuery(req.query.hasta);

        if (estado === null || (estado !== "" && !ESTADOS_PEDIDO.includes(estado))) {
            return responderError(res, 400, `El estado tiene que ser uno de: ${ESTADOS_PEDIDO.join(', ')}`);
        }

        if (desde === null || hasta === null) {
            return responderError(res, 400, "desde y hasta tienen que ser fechas con formato AAAA-MM-DD");
        }

        if (desde && hasta && desde > hasta) {
            return responderError(res, 400, "desde no puede ser posterior a hasta");
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = ['pe.cliente_id = ?'];
        const parametros = [req.clienteId];

        if (estado !== "") {
            condiciones.push('pe.estado = ?');
            parametros.push(estado);
        }

        if (desde) {
            condiciones.push('pe.created_at >= ?');
            parametros.push(desde);
        }

        // hasta es inclusivo: "hasta el 31" incluye todo el dia 31
        if (hasta) {
            condiciones.push('pe.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
            parametros.push(hasta);
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM pedidos pe ${where}`,
            parametros
        );

        const [pedidos] = await database.query(
            `SELECT pe.id, pe.estado, pe.total, pe.direccion_entrega, pe.motivo_cancelacion,
                    pe.created_at, pe.updated_at,
                    co.id AS comercio_id, co.nombre AS comercio,
                    (SELECT COALESCE(SUM(ip.cantidad), 0)
                     FROM items_pedido ip
                     WHERE ip.pedido_id = pe.id) AS cantidad_productos
             FROM pedidos pe
             INNER JOIN comercios co ON co.id = pe.comercio_id
             ${where}
             ORDER BY pe.created_at DESC, pe.id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedidos: pedidos.map((pedido) => ({
                    ...pedido,
                    total: Number(pedido.total),
                    cantidad_productos: Number(pedido.cantidad_productos)
                })),
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// GET /api/pedidos/:id
//
// Detalle de un pedido propio: items, comercio, pago y repartidor. El codigo de entrega
// aparece solo mientras el pedido esta en camino, que es cuando le sirve al cliente
// (se lo tiene que dictar al repartidor). Es el mismo que ya le llego por notificacion.
const obtenerMiPedido = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del pedido no es válido");
        }

        const [pedidos] = await database.query(
            `SELECT pe.id, pe.cliente_id, pe.estado, pe.total, pe.direccion_entrega, pe.codigo,
                    pe.motivo_cancelacion, pe.distancia_km, pe.tiempo_estimado,
                    pe.created_at, pe.updated_at,
                    co.id AS comercio_id, co.nombre AS comercio, co.direccion AS direccion_comercio,
                    ur.nombre AS repartidor, re.tipo_vehiculo
             FROM pedidos pe
             INNER JOIN comercios co ON co.id = pe.comercio_id
             LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
             LEFT  JOIN usuarios ur ON ur.id = re.usuario_id
             WHERE pe.id = ?`,
            [id]
        );

        if (pedidos.length === 0) {
            return responderError(res, 404, "Pedido no encontrado");
        }

        const { cliente_id, codigo, ...pedido } = pedidos[0];

        if (cliente_id !== req.clienteId) {
            return responderError(res, 403, "Ese pedido no es tuyo");
        }

        const [items] = await database.query(
            `SELECT ip.producto_id, p.nombre, ip.cantidad, ip.precio_unit, ip.subtotal
             FROM items_pedido ip
             INNER JOIN productos p ON p.id = ip.producto_id
             WHERE ip.pedido_id = ?
             ORDER BY p.nombre ASC`,
            [id]
        );

        const [pagos] = await database.query(
            `SELECT metodo, estado, monto, fecha_pago, motivo_rechazo
             FROM pagos
             WHERE pedido_id = ?`,
            [id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedido: {
                    ...pedido,
                    total: Number(pedido.total),
                    distancia_km: Number(pedido.distancia_km),
                    codigo_entrega: pedido.estado === 'en_camino' ? codigo : null,
                    items: items.map((item) => ({
                        ...item,
                        precio_unit: Number(item.precio_unit),
                        subtotal: Number(item.subtotal)
                    })),
                    pago: pagos.length > 0 ? { ...pagos[0], monto: Number(pagos[0].monto) } : null
                }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// ---------------------------------------------------------------------------
// CU10 - Repetir pedido
// ---------------------------------------------------------------------------

// POST /api/pedidos/:id/repetir
//
// Vuelve a cargar en el carrito los productos de un pedido anterior, de cualquier
// estado (tambien uno cancelado: es la forma de reintentar un pago rechazado). No crea
// el pedido: el cliente revisa el carrito y confirma como siempre.
//
// Reglas:
// - SUMA al carrito actual, no lo reemplaza: pisar lo que el cliente ya habia cargado
//   seria perderle trabajo sin avisar.
// - Precios de HOY. El carrito no guarda precio (se toma al confirmar), asi que se
//   informa el anterior y el actual para que el cambio no sea una sorpresa.
// - Producto o comercio dado de baja: va a omitidos.
// - Stock que no alcanza: se agrega lo que hay (descontando lo que ya esta en el
//   carrito, igual que agregarAlCarrito) y se marca como parcial.
// - Si no se puede agregar nada, 409 con la lista de omitidos y el carrito queda
//   como estaba.
const repetirPedido = async (req, res) => {
    let connection;
    try {
        const pedidoId = obtenerIdValido(req.params.id);

        if (pedidoId === null) {
            return responderError(res, 400, "El id del pedido no es válido");
        }

        const { error } = await buscarPedidoPropio(database, pedidoId, req.clienteId);

        if (error) {
            return responderError(res, error.codigo, error.mensaje);
        }

        const [itemsPedido] = await database.query(
            `SELECT producto_id, SUM(cantidad) AS cantidad, MAX(precio_unit) AS precio_anterior
             FROM items_pedido
             WHERE pedido_id = ?
             GROUP BY producto_id
             ORDER BY producto_id ASC`,
            [pedidoId]
        );

        // No deberia pasar (confirmarCarrito nunca crea un pedido vacio), pero un IN ()
        // vacio es un error de sintaxis en SQL: mejor un 409 claro que un 500
        if (itemsPedido.length === 0) {
            return responderError(res, 409, "Ese pedido no tiene productos para volver a pedir", { omitidos: [] });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // Lock de los productos ordenado por id, el mismo orden que restaurarStockPedido:
        // dos transacciones sobre los mismos productos nunca se deadlockean entre si
        const [productos] = await connection.query(
            `SELECT p.id, p.nombre, p.precio, p.stock, p.activo, c.activo AS comercio_activo
             FROM productos p
             INNER JOIN comercios c ON c.id = p.comercio_id
             WHERE p.id IN (?)
             ORDER BY p.id ASC
             FOR UPDATE`,
            [itemsPedido.map((item) => item.producto_id)]
        );

        const productoPorId = new Map(productos.map((producto) => [producto.id, producto]));

        // Carrito del cliente, o uno nuevo. Mismo manejo de la carrera que
        // agregarAlCarrito: si otro request lo creo en el medio, UNIQUE(cliente_id)
        // rechaza el INSERT y se usa el que ya existe.
        const [carritos] = await connection.query(
            `SELECT id FROM carritos WHERE cliente_id = ?`,
            [req.clienteId]
        );

        let carritoId;
        if (carritos.length > 0) {
            carritoId = carritos[0].id;
        } else {
            try {
                const [nuevoCarrito] = await connection.query(
                    `INSERT INTO carritos (cliente_id) VALUES (?)`,
                    [req.clienteId]
                );
                carritoId = nuevoCarrito.insertId;
            } catch (errorCarrito) {
                if (errorCarrito.code !== "ER_DUP_ENTRY") {
                    throw errorCarrito;
                }

                const [carritoExistente] = await connection.query(
                    `SELECT id FROM carritos WHERE cliente_id = ?`,
                    [req.clienteId]
                );
                carritoId = carritoExistente[0].id;
            }
        }

        const [enCarrito] = await connection.query(
            `SELECT producto_id, cantidad
             FROM items_carrito
             WHERE carrito_id = ?
             FOR UPDATE`,
            [carritoId]
        );

        const cantidadEnCarrito = new Map(enCarrito.map((item) => [item.producto_id, item.cantidad]));

        const agregados = [];
        const omitidos = [];

        for (const item of itemsPedido) {
            const producto = productoPorId.get(item.producto_id);
            const cantidadPedida = Number(item.cantidad);

            if (!producto || !producto.activo || !producto.comercio_activo) {
                omitidos.push({
                    producto_id: item.producto_id,
                    nombre: producto?.nombre ?? null,
                    motivo: "El producto ya no está disponible"
                });
                continue;
            }

            const disponible = producto.stock - (cantidadEnCarrito.get(producto.id) ?? 0);

            if (disponible <= 0) {
                omitidos.push({
                    producto_id: producto.id,
                    nombre: producto.nombre,
                    motivo: "Sin stock (contando lo que ya tenés en el carrito)"
                });
                continue;
            }

            const cantidad = Math.min(cantidadPedida, disponible);

            await connection.query(
                `INSERT INTO items_carrito (carrito_id, producto_id, cantidad)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                [carritoId, producto.id, cantidad]
            );

            agregados.push({
                producto_id: producto.id,
                nombre: producto.nombre,
                cantidad,
                cantidad_pedida: cantidadPedida,
                parcial: cantidad < cantidadPedida,
                precio_anterior: Number(item.precio_anterior),
                precio_actual: Number(producto.precio)
            });
        }

        if (agregados.length === 0) {
            await connection.rollback();
            return responderError(res, 409, "Ninguno de los productos de ese pedido se puede volver a pedir", { omitidos });
        }

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: omitidos.length > 0 || agregados.some((item) => item.parcial)
                    ? "Se agregó al carrito lo que había disponible. Revisalo antes de confirmar"
                    : "Se agregaron al carrito todos los productos del pedido",
                carritoId,
                agregados,
                omitidos
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

// ---------------------------------------------------------------------------
// Semana 7 - El cliente cancela un pedido que todavia no pago
// ---------------------------------------------------------------------------

// PATCH /api/pedidos/:id/cancelar
// Body (opcional): { "motivo": "..." }
//
// Solo en pago_espera. confirmarCarrito descuenta el stock al crear el pedido, asi que
// un pedido que nunca se paga lo tenia reservado para siempre: esta es la salida.
// Despues de pagar ya hay un comercio preparandolo; ahi la via es un reclamo, y lo
// cancela un administrador (CU24).
const cancelarMiPedido = async (req, res) => {
    let connection;
    try {
        const pedidoId = obtenerIdValido(req.params.id);

        if (pedidoId === null) {
            return responderError(res, 400, "El id del pedido no es válido");
        }

        let motivo = "Cancelado por el cliente antes de pagar";

        if (req.body?.motivo !== undefined) {
            if (typeof req.body.motivo !== "string" || !req.body.motivo.trim() || req.body.motivo.trim().length > 200) {
                return responderError(res, 400, "El motivo tiene que ser un texto de entre 1 y 200 caracteres");
            }
            motivo = `Cancelado por el cliente: ${req.body.motivo.trim()}`;
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const { pedido, error } = await buscarPedidoPropio(connection, pedidoId, req.clienteId, { bloquear: true });

        if (error) {
            await connection.rollback();
            return responderError(res, error.codigo, error.mensaje);
        }

        if (pedido.estado !== 'pago_espera') {
            await connection.rollback();
            return responderError(res, 409, `El pedido está en estado "${pedido.estado}". Solo se puede cancelar un pedido que todavía no pagaste; si ya lo pagaste, hacé un reclamo`);
        }

        // En pago_espera todavia no hay repartidor, asi que no hay nada que bloquear
        // antes (ver la precondicion de cancelarPedido)
        await cancelarPedido(connection, {
            pedidoId,
            usuarioId: req.usuario.id,
            motivo
        });

        await connection.commit();

        emitirEstadoDePedido({ pedidoId, estado: 'cancelado' }).catch(() => {});

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Pedido cancelado. Los productos volvieron al catálogo",
                pedido: { id: pedidoId, estado: "cancelado" }
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        if (error.codigoHttp) {
            return responderError(res, error.codigoHttp, error.message);
        }

        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    listarMisPedidos,
    obtenerMiPedido,
    repetirPedido,
    cancelarMiPedido
};
