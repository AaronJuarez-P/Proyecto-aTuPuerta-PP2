const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const {
    obtenerIdValido,
    obtenerTextoValido,
    obtenerTextoQuery,
    obtenerFechaQuery,
    obtenerBooleanoQuery
} = require('../utils/validacion');
const {
    ESTADOS_PEDIDO,
    ESTADOS_TERMINALES,
    cancelarPedido
} = require('../services/pedido.service');
const { bloquearRepartidor } = require('../services/repartidor.service');
const { obtenerUltimaUbicacionPedido } = require('../services/ubicacion.service');
const { emitirEstadoDePedido } = require('../services/tiemporeal.service');
const { enviarNotificaciones } = require('./notificaciones.controller');

// Panel de administracion - supervision de pedidos y trazabilidad (semana 13, CU24).

const ACCIONES_AUDITORIA = ['INSERT', 'UPDATE', 'DELETE'];

const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// Lee un filtro de id opcional de la query string. Devuelve { valor } con el numero o
// undefined si no vino, o { error } con el mensaje si vino mal.
const leerIdOpcional = (valor, nombre) => {
    if (valor === undefined || valor === '') {
        return { valor: undefined };
    }

    const id = obtenerIdValido(typeof valor === 'string' ? valor : NaN);
    return id === null ? { error: `${nombre} tiene que ser un número válido` } : { valor: id };
};

// desde / hasta validados. Devuelve { desde, hasta } o { error }.
const leerRangoFechas = (query) => {
    const desde = obtenerFechaQuery(query.desde);
    const hasta = obtenerFechaQuery(query.hasta);

    if (desde === null || hasta === null) {
        return { error: "desde y hasta tienen que ser fechas con formato AAAA-MM-DD" };
    }

    if (desde && hasta && desde > hasta) {
        return { error: "desde no puede ser posterior a hasta" };
    }

    return { desde, hasta };
};

// ---------------------------------------------------------------------------
// CU24 - Supervisar pedidos
// ---------------------------------------------------------------------------

// GET /api/admin/pedidos?estado=&activos=&comercioId=&clienteId=&repartidorId=&desde=&hasta=&pagina=&limite=
//
// Vista global, activos e historicos. activos=true son los que todavia no terminaron.
// resumen_por_estado es global y no respeta los filtros a proposito: son los numeros
// del tablero del panel, que no cambian segun lo que se este buscando.
const listarPedidosAdmin = async (req, res) => {
    try {
        const estado = obtenerTextoQuery(req.query.estado);
        const activos = obtenerBooleanoQuery(req.query.activos);

        if (estado === null || (estado !== "" && !ESTADOS_PEDIDO.includes(estado))) {
            return responderError(res, 400, `El estado tiene que ser uno de: ${ESTADOS_PEDIDO.join(', ')}`);
        }

        if (activos === null) {
            return responderError(res, 400, "activos tiene que ser true o false");
        }

        const filtrosId = {
            comercioId: leerIdOpcional(req.query.comercioId, 'comercioId'),
            clienteId: leerIdOpcional(req.query.clienteId, 'clienteId'),
            repartidorId: leerIdOpcional(req.query.repartidorId, 'repartidorId')
        };

        const errorId = Object.values(filtrosId).find((filtro) => filtro.error);
        if (errorId) {
            return responderError(res, 400, errorId.error);
        }

        const rango = leerRangoFechas(req.query);
        if (rango.error) {
            return responderError(res, 400, rango.error);
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = [];
        const parametros = [];

        if (estado !== "") {
            condiciones.push('pe.estado = ?');
            parametros.push(estado);
        }

        if (activos !== undefined) {
            condiciones.push(activos ? 'pe.estado NOT IN (?)' : 'pe.estado IN (?)');
            parametros.push(ESTADOS_TERMINALES);
        }

        const columnasId = { comercioId: 'pe.comercio_id', clienteId: 'pe.cliente_id', repartidorId: 'pe.repartidor_id' };

        for (const [filtro, columna] of Object.entries(columnasId)) {
            if (filtrosId[filtro].valor !== undefined) {
                condiciones.push(`${columna} = ?`);
                parametros.push(filtrosId[filtro].valor);
            }
        }

        if (rango.desde) {
            condiciones.push('pe.created_at >= ?');
            parametros.push(rango.desde);
        }

        if (rango.hasta) {
            condiciones.push('pe.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
            parametros.push(rango.hasta);
        }

        const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM pedidos pe ${where}`,
            parametros
        );

        const [pedidos] = await database.query(
            `SELECT pe.id, pe.estado, pe.total, pe.comision, pe.motivo_cancelacion,
                    pe.created_at, pe.updated_at,
                    uc.nombre AS cliente, co.nombre AS comercio, ur.nombre AS repartidor,
                    pa.estado AS pago
             FROM pedidos pe
             INNER JOIN clientes cl ON cl.id = pe.cliente_id
             INNER JOIN usuarios uc ON uc.id = cl.usuario_id
             INNER JOIN comercios co ON co.id = pe.comercio_id
             LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
             LEFT  JOIN usuarios ur ON ur.id = re.usuario_id
             LEFT  JOIN pagos pa ON pa.pedido_id = pe.id
             ${where}
             ORDER BY pe.created_at DESC, pe.id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        const [porEstado] = await database.query(
            `SELECT estado, COUNT(*) AS cantidad FROM pedidos GROUP BY estado`
        );

        // Todos los estados aparecen, aunque sea con 0: el tablero no tiene que
        // adivinar cuales faltan
        const resumenPorEstado = Object.fromEntries(ESTADOS_PEDIDO.map((valor) => [valor, 0]));
        for (const fila of porEstado) {
            if (fila.estado in resumenPorEstado) {
                resumenPorEstado[fila.estado] = Number(fila.cantidad);
            }
        }

        const totalPedidos = Object.values(resumenPorEstado).reduce((suma, cantidad) => suma + cantidad, 0);
        const terminados = ESTADOS_TERMINALES.reduce((suma, valor) => suma + resumenPorEstado[valor], 0);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedidos: pedidos.map((pedido) => ({
                    ...pedido,
                    total: Number(pedido.total),
                    comision: Number(pedido.comision)
                })),
                resumen_por_estado: {
                    ...resumenPorEstado,
                    total: totalPedidos,
                    activos: totalPedidos - terminados
                },
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// GET /api/admin/pedidos/:id
//
// Todo lo que el administrador necesita para entender un pedido: los tres actores, los
// items, el pago, la ultima posicion del repartidor, la auditoria completa y los
// reclamos que se hicieron sobre el. No incluye el codigo de entrega: no le sirve para
// nada y es lo que autoriza la entrega.
const obtenerPedidoAdmin = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del pedido no es válido");
        }

        const [pedidos] = await database.query(
            `SELECT pe.id, pe.estado, pe.total, pe.comision, pe.distancia_km, pe.tiempo_estimado,
                    pe.direccion_entrega, pe.motivo_cancelacion, pe.created_at, pe.updated_at,
                    cl.id AS cliente_id, uc.nombre AS cliente_nombre, uc.email AS cliente_email,
                    uc.telefono AS cliente_telefono,
                    co.id AS comercio_id, co.nombre AS comercio_nombre, co.direccion AS comercio_direccion,
                    re.id AS repartidor_id, ur.nombre AS repartidor_nombre, ur.telefono AS repartidor_telefono,
                    re.tipo_vehiculo
             FROM pedidos pe
             INNER JOIN clientes cl ON cl.id = pe.cliente_id
             INNER JOIN usuarios uc ON uc.id = cl.usuario_id
             INNER JOIN comercios co ON co.id = pe.comercio_id
             LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
             LEFT  JOIN usuarios ur ON ur.id = re.usuario_id
             WHERE pe.id = ?`,
            [id]
        );

        if (pedidos.length === 0) {
            return responderError(res, 404, "Pedido no encontrado");
        }

        const pedido = pedidos[0];

        const [items] = await database.query(
            `SELECT ip.producto_id, p.nombre, ip.cantidad, ip.precio_unit, ip.subtotal
             FROM items_pedido ip
             INNER JOIN productos p ON p.id = ip.producto_id
             WHERE ip.pedido_id = ?
             ORDER BY p.nombre ASC`,
            [id]
        );

        const [pagos] = await database.query(
            `SELECT metodo, estado, monto, referencia_externa, motivo_rechazo, fecha_pago
             FROM pagos
             WHERE pedido_id = ?`,
            [id]
        );

        const [auditoria] = await database.query(
            `SELECT a.id, a.accion, a.detalle, DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.hora,
                    u.nombre AS usuario, ua.nombre AS administrador
             FROM auditoria_pedidos a
             LEFT JOIN usuarios u ON u.id = a.usuario_id
             LEFT JOIN administradores ad ON ad.id = a.administrador_id
             LEFT JOIN usuarios ua ON ua.id = ad.usuario_id
             WHERE a.pedido_id = ?
             ORDER BY a.fecha ASC, a.hora ASC, a.id ASC`,
            [id]
        );

        const [reclamos] = await database.query(
            `SELECT r.id, r.estado, r.created_at, u.nombre AS usuario
             FROM reclamos r
             INNER JOIN usuarios u ON u.id = r.usuario_id
             WHERE r.pedido_id = ?
             ORDER BY r.id ASC`,
            [id]
        );

        const ubicacion = await obtenerUltimaUbicacionPedido(database, id);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedido: {
                    id: pedido.id,
                    estado: pedido.estado,
                    total: Number(pedido.total),
                    comision: Number(pedido.comision),
                    distancia_km: Number(pedido.distancia_km),
                    tiempo_estimado: pedido.tiempo_estimado,
                    direccion_entrega: pedido.direccion_entrega,
                    motivo_cancelacion: pedido.motivo_cancelacion,
                    created_at: pedido.created_at,
                    updated_at: pedido.updated_at,
                    cliente: {
                        id: pedido.cliente_id,
                        nombre: pedido.cliente_nombre,
                        email: pedido.cliente_email,
                        telefono: pedido.cliente_telefono
                    },
                    comercio: {
                        id: pedido.comercio_id,
                        nombre: pedido.comercio_nombre,
                        direccion: pedido.comercio_direccion
                    },
                    repartidor: pedido.repartidor_id !== null
                        ? {
                            id: pedido.repartidor_id,
                            nombre: pedido.repartidor_nombre,
                            telefono: pedido.repartidor_telefono,
                            tipo_vehiculo: pedido.tipo_vehiculo
                        }
                        : null,
                    items: items.map((item) => ({
                        ...item,
                        precio_unit: Number(item.precio_unit),
                        subtotal: Number(item.subtotal)
                    })),
                    pago: pagos.length > 0 ? { ...pagos[0], monto: Number(pagos[0].monto) } : null,
                    ultima_ubicacion: ubicacion,
                    auditoria,
                    reclamos
                }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// PATCH /api/admin/pedidos/:id/cancelar
// Body: { "motivo": "..." }
//
// Cancela desde cualquier estado no terminal: devuelve el stock, libera al repartidor si
// lo llevaba en camino y avisa a todos los involucrados (ver cancelarPedido en
// pedido.service.js). Queda en auditoria_pedidos con el administrador_id.
//
// Si el pedido ya estaba pagado, la devolucion del dinero es manual: el pago sigue
// 'aprobado' en la tabla pagos, porque es lo que paso, y la respuesta lo avisa.
const cancelarPedidoAdmin = async (req, res) => {
    let connection;
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del pedido no es válido");
        }

        const motivo = obtenerTextoValido(req.body?.motivo, { max: 200 });

        if (motivo === null) {
            return responderError(res, 400, "El motivo es obligatorio: un texto de entre 1 y 200 caracteres");
        }

        // Lectura SIN lock, solo para saber que repartidor bloquear primero (orden de
        // locks repartidores -> pedidos). cancelarPedido la vuelve a leer con lock y
        // corta con 409 si en el medio lo tomo alguien.
        const [previos] = await database.query(
            `SELECT estado, repartidor_id FROM pedidos WHERE id = ?`,
            [id]
        );

        if (previos.length === 0) {
            return responderError(res, 404, "Pedido no encontrado");
        }

        if (ESTADOS_TERMINALES.includes(previos[0].estado)) {
            return responderError(res, 409, `El pedido ya está ${previos[0].estado} y no se puede cancelar`);
        }

        const repartidorId = previos[0].repartidor_id;

        connection = await database.getConnection();
        await connection.beginTransaction();

        if (repartidorId !== null) {
            await bloquearRepartidor(connection, repartidorId);
        }

        const { estadoAnterior, repartidorLiberado } = await cancelarPedido(connection, {
            pedidoId: id,
            usuarioId: req.usuario.id,
            administradorId: req.administradorId,
            motivo: `Cancelado por un administrador: ${motivo}`,
            repartidorBloqueadoId: repartidorId
        });

        const [involucrados] = await connection.query(
            `SELECT cl.usuario_id AS cliente_usuario, co.usuario_id AS comercio_usuario,
                    re.usuario_id AS repartidor_usuario, pa.estado AS pago
             FROM pedidos pe
             INNER JOIN clientes cl ON cl.id = pe.cliente_id
             INNER JOIN comercios co ON co.id = pe.comercio_id
             LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
             LEFT  JOIN pagos pa ON pa.pedido_id = pe.id
             WHERE pe.id = ?`,
            [id]
        );

        await connection.commit();

        const { cliente_usuario, comercio_usuario, repartidor_usuario, pago } = involucrados[0];
        const reembolsoManual = pago === 'aprobado';

        emitirEstadoDePedido({ pedidoId: id, estado: 'cancelado' }).catch(() => {});

        const aviso = {
            tipo: "pedido_cancelado",
            titulo: "Pedido cancelado",
            url: `/pedidos/${id}`
        };

        await enviarNotificaciones(cliente_usuario, {
            ...aviso,
            mensaje: `Un administrador canceló tu pedido #${id}. Motivo: ${motivo}.${reembolsoManual ? ' Te vamos a devolver el dinero.' : ''}`
        });

        // El comercio se entera de un pedido recien cuando se paga: si se cancela antes,
        // para el nunca existio
        if (estadoAnterior !== 'pago_espera') {
            await enviarNotificaciones(comercio_usuario, {
                ...aviso,
                mensaje: `Un administrador canceló el pedido #${id}. Motivo: ${motivo}.`
            });
        }

        if (repartidor_usuario) {
            await enviarNotificaciones(repartidor_usuario, {
                ...aviso,
                mensaje: `Un administrador canceló el pedido #${id} que llevabas. Motivo: ${motivo}. Ya estás disponible para tomar otro.`
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: reembolsoManual
                    ? "Pedido cancelado. Estaba pagado: la devolución del dinero se hace a mano"
                    : "Pedido cancelado",
                pedido: { id, estado: "cancelado", estado_anterior: estadoAnterior },
                stock_restaurado: true,
                repartidor_liberado: repartidorLiberado,
                reembolso_manual: reembolsoManual
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

// ---------------------------------------------------------------------------
// Trazabilidad: consultas sobre auditoria_productos y auditoria_pedidos
// ---------------------------------------------------------------------------

// Filtros comunes de las dos auditorias: accion y rango de fechas sobre a.fecha
const armarFiltrosAuditoria = (query, condiciones, parametros) => {
    const accion = obtenerTextoQuery(query.accion);

    if (accion === null || (accion !== "" && !ACCIONES_AUDITORIA.includes(accion.toUpperCase()))) {
        return `accion tiene que ser una de: ${ACCIONES_AUDITORIA.join(', ')}`;
    }

    const rango = leerRangoFechas(query);
    if (rango.error) {
        return rango.error;
    }

    const usuarioId = leerIdOpcional(query.usuarioId, 'usuarioId');
    if (usuarioId.error) {
        return usuarioId.error;
    }

    if (accion !== "") {
        condiciones.push('a.accion = ?');
        parametros.push(accion.toUpperCase());
    }

    if (usuarioId.valor !== undefined) {
        condiciones.push('a.usuario_id = ?');
        parametros.push(usuarioId.valor);
    }

    if (rango.desde) {
        condiciones.push('a.fecha >= ?');
        parametros.push(rango.desde);
    }

    if (rango.hasta) {
        condiciones.push('a.fecha <= ?');
        parametros.push(rango.hasta);
    }

    return null;
};

// GET /api/admin/auditoria/productos?productoId=&comercioId=&usuarioId=&accion=&desde=&hasta=&pagina=&limite=
const listarAuditoriaProductos = async (req, res) => {
    try {
        const condiciones = [];
        const parametros = [];

        const productoId = leerIdOpcional(req.query.productoId, 'productoId');
        const comercioId = leerIdOpcional(req.query.comercioId, 'comercioId');

        const error = productoId.error || comercioId.error ||
            armarFiltrosAuditoria(req.query, condiciones, parametros);

        if (error) {
            return responderError(res, 400, error);
        }

        if (productoId.valor !== undefined) {
            condiciones.push('a.producto_id = ?');
            parametros.push(productoId.valor);
        }

        if (comercioId.valor !== undefined) {
            condiciones.push('p.comercio_id = ?');
            parametros.push(comercioId.valor);
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);
        const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const desde = `FROM auditoria_productos a
             INNER JOIN productos p ON p.id = a.producto_id
             INNER JOIN comercios co ON co.id = p.comercio_id
             LEFT  JOIN usuarios u ON u.id = a.usuario_id
             LEFT  JOIN administradores ad ON ad.id = a.administrador_id
             LEFT  JOIN usuarios ua ON ua.id = ad.usuario_id
             ${where}`;

        const [total] = await database.query(`SELECT COUNT(*) AS cantidad ${desde}`, parametros);

        const [auditoria] = await database.query(
            `SELECT a.id, a.producto_id, p.nombre AS producto, co.id AS comercio_id,
                    co.nombre AS comercio, a.accion,
                    DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.hora,
                    a.usuario_id, u.nombre AS usuario,
                    a.administrador_id, ua.nombre AS administrador
             ${desde}
             ORDER BY a.fecha DESC, a.hora DESC, a.id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                auditoria,
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// GET /api/admin/auditoria/pedidos?pedidoId=&usuarioId=&accion=&desde=&hasta=&pagina=&limite=
const listarAuditoriaPedidos = async (req, res) => {
    try {
        const condiciones = [];
        const parametros = [];

        const pedidoId = leerIdOpcional(req.query.pedidoId, 'pedidoId');

        const error = pedidoId.error || armarFiltrosAuditoria(req.query, condiciones, parametros);

        if (error) {
            return responderError(res, 400, error);
        }

        if (pedidoId.valor !== undefined) {
            condiciones.push('a.pedido_id = ?');
            parametros.push(pedidoId.valor);
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);
        const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const desde = `FROM auditoria_pedidos a
             LEFT JOIN usuarios u ON u.id = a.usuario_id
             LEFT JOIN administradores ad ON ad.id = a.administrador_id
             LEFT JOIN usuarios ua ON ua.id = ad.usuario_id
             ${where}`;

        const [total] = await database.query(`SELECT COUNT(*) AS cantidad ${desde}`, parametros);

        const [auditoria] = await database.query(
            `SELECT a.id, a.pedido_id, a.accion, a.detalle,
                    DATE_FORMAT(a.fecha, '%Y-%m-%d') AS fecha, a.hora,
                    a.usuario_id, u.nombre AS usuario,
                    a.administrador_id, ua.nombre AS administrador
             ${desde}
             ORDER BY a.fecha DESC, a.hora DESC, a.id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                auditoria,
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

module.exports = {
    listarPedidosAdmin,
    obtenerPedidoAdmin,
    cancelarPedidoAdmin,
    listarAuditoriaProductos,
    listarAuditoriaPedidos
};
