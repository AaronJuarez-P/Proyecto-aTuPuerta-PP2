const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const {
    obtenerIdValido,
    obtenerTextoValido,
    obtenerTextoQuery,
    obtenerFechaQuery
} = require('../utils/validacion');
const { cambiarEstadoPedido } = require('../services/pedido.service');
const { emitirEstadoDePedido } = require('../services/tiemporeal.service');
const { geocodificarDireccion } = require('../services/maps.service');
const { enviarNotificaciones, enviarNotificacionRepartidores } = require('./notificaciones.controller');

// Estados que el comercio ve como ventas (CU17): todos menos pago_espera. Un pedido sin
// pagar todavia no es una venta, y el comercio ni siquiera se entero de que existe
// (se le avisa recien cuando se aprueba el pago).
const ESTADOS_VENTA = ['en_preparacion', 'preparado', 'en_camino', 'entregado', 'cancelado'];

// Respuesta de error de validacion, para no repetir el mismo objeto en cada filtro
const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// CU03 - Explorar comercios
// GET /api/comercios?categoria=&buscar=&pagina=&limite=
const listarComercios = async (req, res) => {
    try {
        const categoria = obtenerTextoQuery(req.query.categoria);
        const buscar = obtenerTextoQuery(req.query.buscar);

        if (categoria === null || buscar === null) {
            return responderError(res, 400, "Los filtros categoria y buscar tienen que ser texto");
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        // Se arman las condiciones dinamicamente segun los filtros que llegaron
        const condiciones = ['activo = TRUE'];
        const parametros = [];

        if (categoria !== "") {
            condiciones.push('categoria = ?');
            parametros.push(categoria);
        }

        if (buscar !== "") {
            condiciones.push('nombre LIKE ?');
            parametros.push(`%${buscar}%`);
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM comercios ${where}`,
            parametros
        );

        const [comercios] = await database.query(
            `SELECT id, nombre, categoria, direccion, horario_atencion
            FROM comercios
            ${where}
            ORDER BY nombre ASC
            LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                comercios,
                paginacion: { pagina, limite, total: total[0].cantidad }
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

// CU03 - Ver el detalle de un comercio
// GET /api/comercios/:id
const obtenerComercio = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del comercio debe ser un número válido");
        }

        const [comercios] = await database.query(
            `SELECT id, nombre, categoria, direccion, horario_atencion
            FROM comercios
            WHERE id = ? AND activo = TRUE`,
            [id]
        );

        if (comercios.length === 0) {
            return responderError(res, 404, "Comercio no encontrado");
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { comercio: comercios[0] }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// CU03 - Listar los productos de un comercio
// GET /api/comercios/:id/productos?categoria=&buscar=&pagina=&limite=
const listarProductosDeComercio = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del comercio debe ser un número válido");
        }

        const categoria = obtenerTextoQuery(req.query.categoria);
        const buscar = obtenerTextoQuery(req.query.buscar);

        if (categoria === null || buscar === null) {
            return responderError(res, 400, "Los filtros categoria y buscar tienen que ser texto");
        }

        // Se valida que el comercio exista para poder distinguir un comercio
        // inexistente (404) de un comercio que todavia no cargo productos (lista vacia)
        const [comercios] = await database.query(
            `SELECT id, nombre FROM comercios WHERE id = ? AND activo = TRUE`,
            [id]
        );

        if (comercios.length === 0) {
            return responderError(res, 404, "Comercio no encontrado");
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = ['comercio_id = ?', 'activo = TRUE'];
        const parametros = [id];

        if (categoria !== "") {
            condiciones.push('categoria = ?');
            parametros.push(categoria);
        }

        if (buscar !== "") {
            condiciones.push('(nombre LIKE ? OR descripcion LIKE ?)');
            parametros.push(`%${buscar}%`, `%${buscar}%`);
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM productos ${where}`,
            parametros
        );

        const [productos] = await database.query(
            `SELECT id, comercio_id, nombre, descripcion, categoria, precio, stock
            FROM productos
            ${where}
            ORDER BY nombre ASC
            LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                comercio: comercios[0],
                productos,
                paginacion: { pagina, limite, total: total[0].cantidad }
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

// ---------------------------------------------------------------------------
// Semana 7 - El comercio confirma que un pedido propio fue preparado
// ---------------------------------------------------------------------------

// PATCH /api/comercios/pedidos/:id/subir
//
// Transicion en_preparacion -> preparado (ver TRANSICIONES_PEDIDO en pedido.service.js).
// El pedido solo llega a en_preparacion una vez que el pago fue aprobado (ver
// aplicarResultadoPago en pago.controller.js).
//
// Efectos: queda auditado, se emite por el socket y se avisa al cliente y a los
// repartidores. El codigo de entrega NO lo genera este archivo sino asignarPedido en
// pedido.controller.js, cuando un repartidor lo toma.
const subirPedido = async (req, res) => {
    let connection;
    try {
        const idPedido = obtenerIdValido(req.params.id);

        if (idPedido === null) {
            return responderError(res, 400, "El id del pedido debe ser un número válido");
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // El pedido con lock, para que dos confirmaciones simultaneas no pasen las dos.
        // El comercio sale de req.comercioId (resolverComercio), nunca del body.
        const [pedidos] = await connection.query(
            `SELECT p.id, p.estado, p.comercio_id,
                    c.usuario_id AS cliente_usuario_id,
                    co.nombre AS comercio_nombre
             FROM pedidos p
             INNER JOIN clientes c ON c.id = p.cliente_id
             INNER JOIN comercios co ON co.id = p.comercio_id
             WHERE p.id = ?
             FOR UPDATE`,
            [idPedido]
        );

        if (pedidos.length === 0) {
            await connection.rollback();
            return responderError(res, 404, "Pedido no encontrado");
        }
        const pedido = pedidos[0];

        if (pedido.comercio_id !== req.comercioId) {
            await connection.rollback();
            return responderError(res, 403, "Este pedido no pertenece a tu comercio");
        }

        // El pago tiene que estar aprobado (en_preparacion) y el pedido no puede
        // haberlo tomado ya un repartidor (en_camino).
        if (pedido.estado !== 'en_preparacion') {
            await connection.rollback();
            return responderError(res, 409, `El pedido está en estado "${pedido.estado}" y no se puede subir como preparado`);
        }

        // Pasa por la maquina de estados: antes era un UPDATE suelto y el cambio no
        // quedaba en auditoria_pedidos.
        await cambiarEstadoPedido(connection, {
            pedidoId: idPedido,
            nuevoEstado: 'preparado',
            usuarioId: req.usuario.id
        });

        await connection.commit();

        // CU26: el cliente que tiene el seguimiento abierto ve el cambio en vivo.
        emitirEstadoDePedido({ pedidoId: idPedido, estado: 'preparado' }).catch(() => {});

        await enviarNotificaciones(pedido.cliente_usuario_id, {
            tipo: "pedido_preparado",
            titulo: "Tu pedido está listo",
            mensaje: `Tu pedido #${pedido.id} fue preparado y ya va a salir hacia tu domicilio`,
            url: `/cliente/pedidos/${pedido.id}`
        });

        // Una sola notificacion general para el rol y no una fila por repartidor, igual
        // que el aviso del pago aprobado (ver enviarNotificacionRol).
        await enviarNotificacionRepartidores({
            titulo: "Pedido listo para retirar",
            mensaje: `El pedido #${pedido.id} está listo para retirar en ${pedido.comercio_nombre}`,
            url: "/repartidor/pedidos-disponibles"
        });

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Pedido subido correctamente como preparado",
                pedidoId: pedido.id
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

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

// ---------------------------------------------------------------------------
// Semana 3 - Perfil del comercio (CU12)
// El comercio sale siempre de req.comercioId, nunca del body
// ---------------------------------------------------------------------------

const buscarPerfilComercio = async (conexion, comercioId) => {
    const [comercios] = await conexion.query(
        `SELECT c.id, c.nombre, c.cuit_cuil, c.categoria, c.direccion, c.latitud, c.longitud,
                c.horario_atencion, c.activo,
                u.id AS usuario_id, u.email, u.telefono
         FROM comercios c
         INNER JOIN usuarios u ON u.id = c.usuario_id
         WHERE c.id = ?`,
        [comercioId]
    );

    const comercio = comercios[0];
    return comercio && { ...comercio, activo: Boolean(comercio.activo) };
};

// GET /api/comercio/perfil
const obtenerPerfilComercio = async (req, res) => {
    try {
        const comercio = await buscarPerfilComercio(database, req.comercioId);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { comercio }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// Campos editables del comercio y el largo maximo de cada columna. El CUIT no esta:
// es con lo que el comercio inicia sesion y lo que lo identifica ante AFIP.
const CAMPOS_COMERCIO = {
    nombre: 100,
    categoria: 50,
    direccion: 200,
    horario_atencion: 100
};

// PATCH /api/comercio/perfil
// Body: cualquier subconjunto de { nombre, categoria, direccion, horario_atencion }
const actualizarPerfilComercio = async (req, res) => {
    try {
        const cambios = {};

        for (const [campo, largoMaximo] of Object.entries(CAMPOS_COMERCIO)) {
            if (req.body?.[campo] === undefined) {
                continue;
            }

            const valor = obtenerTextoValido(req.body[campo], { max: largoMaximo });
            if (valor === null) {
                return responderError(res, 400, `${campo} tiene que ser un texto de entre 1 y ${largoMaximo} caracteres`);
            }

            cambios[campo] = valor;
        }

        if (Object.keys(cambios).length === 0) {
            return responderError(res, 400, `Mandá al menos un campo para actualizar: ${Object.keys(CAMPOS_COMERCIO).join(', ')}`);
        }

        // Direccion nueva: se geocodifica ANTES de escribir, porque es una llamada de
        // red (misma regla que el registro). Si no se puede ubicar, las coordenadas
        // quedan en NULL y se completan solas la primera vez que hagan falta
        // (asegurarCoordenadasComercio): lo que no puede pasar es que queden las de la
        // direccion vieja.
        if (cambios.direccion !== undefined) {
            const punto = await geocodificarDireccion(cambios.direccion);
            cambios.latitud = punto?.latitud ?? null;
            cambios.longitud = punto?.longitud ?? null;
        }

        // Los nombres de columna salen de CAMPOS_COMERCIO, nunca del body: el body
        // solo aporta valores, que van con placeholders.
        const columnas = Object.keys(cambios);

        await database.query(
            `UPDATE comercios SET ${columnas.map((columna) => `${columna} = ?`).join(', ')} WHERE id = ?`,
            [...columnas.map((columna) => cambios[columna]), req.comercioId]
        );

        const comercio = await buscarPerfilComercio(database, req.comercioId);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Perfil del comercio actualizado",
                comercio
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

// ---------------------------------------------------------------------------
// Semana 12 - Historial de ventas del comercio (CU17)
// ---------------------------------------------------------------------------

// GET /api/comercio/ventas?estado=&desde=&hasta=&pagina=&limite=
//
// Todos los pedidos pagados del comercio, los mas nuevos primero. Sirve como
// historial y tambien como bandeja de trabajo: ?estado=en_preparacion son los pedidos
// que tiene que preparar ahora.
//
// resumen se calcula sobre el filtro completo y no sobre la pagina: el total vendido
// de marzo no cambia segun en que pagina este el que mira.
const listarVentas = async (req, res) => {
    try {
        const estado = obtenerTextoQuery(req.query.estado);
        const desde = obtenerFechaQuery(req.query.desde);
        const hasta = obtenerFechaQuery(req.query.hasta);

        if (estado === null || (estado !== "" && !ESTADOS_VENTA.includes(estado))) {
            return responderError(res, 400, `El estado tiene que ser uno de: ${ESTADOS_VENTA.join(', ')}`);
        }

        if (desde === null || hasta === null) {
            return responderError(res, 400, "desde y hasta tienen que ser fechas con formato AAAA-MM-DD");
        }

        if (desde && hasta && desde > hasta) {
            return responderError(res, 400, "desde no puede ser posterior a hasta");
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = ['pe.comercio_id = ?', "pe.estado <> 'pago_espera'"];
        const parametros = [req.comercioId];

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

        const [resumenFilas] = await database.query(
            `SELECT COUNT(*) AS cantidad,
                    COALESCE(SUM(pe.estado = 'entregado'), 0) AS entregados,
                    COALESCE(SUM(pe.estado = 'cancelado'), 0) AS cancelados,
                    COALESCE(SUM(pe.estado IN ('en_preparacion', 'preparado', 'en_camino')), 0) AS en_curso,
                    COALESCE(SUM(CASE WHEN pe.estado = 'entregado' THEN pe.total ELSE 0 END), 0) AS total_vendido
             FROM pedidos pe
             ${where}`,
            parametros
        );

        const [ventas] = await database.query(
            `SELECT pe.id, pe.estado, pe.total, pe.motivo_cancelacion, pe.created_at, pe.updated_at,
                    uc.nombre AS cliente,
                    ur.nombre AS repartidor,
                    (SELECT COALESCE(SUM(ip.cantidad), 0)
                     FROM items_pedido ip
                     WHERE ip.pedido_id = pe.id) AS cantidad_productos
             FROM pedidos pe
             INNER JOIN clientes cl ON cl.id = pe.cliente_id
             INNER JOIN usuarios uc ON uc.id = cl.usuario_id
             LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
             LEFT  JOIN usuarios ur ON ur.id = re.usuario_id
             ${where}
             ORDER BY pe.created_at DESC, pe.id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        // mysql2 devuelve DECIMAL y SUM como string: se convierten para que el front
        // no tenga que acordarse
        const resumen = resumenFilas[0];
        const entregados = Number(resumen.entregados);
        const totalVendido = Number(resumen.total_vendido);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                ventas: ventas.map((venta) => ({
                    ...venta,
                    total: Number(venta.total),
                    cantidad_productos: Number(venta.cantidad_productos)
                })),
                resumen: {
                    pedidos: Number(resumen.cantidad),
                    entregados,
                    cancelados: Number(resumen.cancelados),
                    en_curso: Number(resumen.en_curso),
                    total_vendido: totalVendido,
                    ticket_promedio: entregados > 0 ? Math.round((totalVendido / entregados) * 100) / 100 : 0
                },
                paginacion: { pagina, limite, total: Number(resumen.cantidad) }
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

// GET /api/comercio/ventas/:id
//
// Detalle de una venta propia con sus items. Muestra el nombre del cliente pero no su
// direccion ni su telefono: el comercio prepara el pedido, quien lo lleva es el
// repartidor.
const obtenerVenta = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del pedido debe ser un número válido");
        }

        const [pedidos] = await database.query(
            `SELECT pe.id, pe.comercio_id, pe.estado, pe.total, pe.motivo_cancelacion,
                    pe.created_at, pe.updated_at,
                    uc.nombre AS cliente,
                    ur.nombre AS repartidor
             FROM pedidos pe
             INNER JOIN clientes cl ON cl.id = pe.cliente_id
             INNER JOIN usuarios uc ON uc.id = cl.usuario_id
             LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
             LEFT  JOIN usuarios ur ON ur.id = re.usuario_id
             WHERE pe.id = ?`,
            [id]
        );

        // Un pedido sin pagar no es una venta: se contesta igual que si no existiera
        if (pedidos.length === 0 || pedidos[0].estado === 'pago_espera') {
            return responderError(res, 404, "Venta no encontrada");
        }

        const { comercio_id, ...venta } = pedidos[0];

        if (comercio_id !== req.comercioId) {
            return responderError(res, 403, "Este pedido no pertenece a tu comercio");
        }

        const [items] = await database.query(
            `SELECT ip.producto_id, p.nombre, ip.cantidad, ip.precio_unit, ip.subtotal
             FROM items_pedido ip
             INNER JOIN productos p ON p.id = ip.producto_id
             WHERE ip.pedido_id = ?
             ORDER BY p.nombre ASC`,
            [id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                venta: {
                    ...venta,
                    total: Number(venta.total),
                    items: items.map((item) => ({
                        ...item,
                        precio_unit: Number(item.precio_unit),
                        subtotal: Number(item.subtotal)
                    }))
                }
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

module.exports = {
    listarComercios,
    obtenerComercio,
    listarProductosDeComercio,
    subirPedido,
    obtenerPerfilComercio,
    actualizarPerfilComercio,
    listarVentas,
    obtenerVenta
};
