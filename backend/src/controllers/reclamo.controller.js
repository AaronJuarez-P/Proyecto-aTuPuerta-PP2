const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const { obtenerIdValido, obtenerTextoValido, obtenerTextoQuery } = require('../utils/validacion');
const { enviarNotificaciones, enviarNotificacionRol } = require('./notificaciones.controller');

// Reportes y reclamos (semana 13, CU25).
//
// Ciclo de vida de un reclamo:
//
//   pendiente -> en_revision -> resuelto
//                            -> rechazado
//
// - pendiente -> en_revision: un administrador lo toma (o se lo asignan).
// - en_revision -> resuelto | rechazado: lo cierra el administrador asignado, con una
//   resolucion que le llega al usuario.
// Reasignar se puede mientras esta abierto; un reclamo cerrado no se reabre: si el
// problema sigue, se hace uno nuevo.

const ESTADOS_RECLAMO = ['pendiente', 'en_revision', 'resuelto', 'rechazado'];
const ESTADOS_ABIERTOS = ['pendiente', 'en_revision'];

// reclamos.descripcion y reclamos.resolucion son TEXT. El tope es de la aplicacion: un
// reclamo de 60.000 caracteres no ayuda a nadie a resolverlo.
const LARGO_MAXIMO_TEXTO = 2000;

const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// ---------------------------------------------------------------------------
// Lado usuario: cliente, comercio o repartidor
// ---------------------------------------------------------------------------

// POST /api/reclamos
// Body: { "descripcion": "...", "pedido_id": 3 }   (pedido_id es opcional)
//
// Si el reclamo es sobre un pedido, el pedido tiene que ser del usuario: como cliente
// que lo compro, como comercio que lo vendio o como repartidor que lo llevo. Y no puede
// tener otro reclamo abierto sobre el mismo pedido: dos reclamos iguales duplican el
// trabajo de quien los atiende.
const crearReclamo = async (req, res) => {
    let connection;
    try {
        const descripcion = obtenerTextoValido(req.body?.descripcion, { min: 10, max: LARGO_MAXIMO_TEXTO });

        if (descripcion === null) {
            return responderError(res, 400, `La descripción es obligatoria: entre 10 y ${LARGO_MAXIMO_TEXTO} caracteres`);
        }

        let pedidoId = null;

        if (req.body?.pedido_id !== undefined && req.body?.pedido_id !== null) {
            pedidoId = obtenerIdValido(req.body.pedido_id);
            if (pedidoId === null) {
                return responderError(res, 400, "pedido_id tiene que ser un número válido");
            }
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        if (pedidoId !== null) {
            // Con lock sobre el pedido: dos reclamos simultaneos sobre el mismo pedido
            // se serializan aca, y el segundo ve el reclamo abierto del primero
            const [pedidos] = await connection.query(
                `SELECT pe.id,
                        (cl.usuario_id = ? OR co.usuario_id = ? OR COALESCE(re.usuario_id = ?, FALSE)) AS participa
                 FROM pedidos pe
                 INNER JOIN clientes cl ON cl.id = pe.cliente_id
                 INNER JOIN comercios co ON co.id = pe.comercio_id
                 LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
                 WHERE pe.id = ?
                 FOR UPDATE`,
                [req.usuario.id, req.usuario.id, req.usuario.id, pedidoId]
            );

            if (pedidos.length === 0) {
                await connection.rollback();
                return responderError(res, 404, "Pedido no encontrado");
            }

            if (!pedidos[0].participa) {
                await connection.rollback();
                return responderError(res, 403, "Ese pedido no es tuyo");
            }

            const [abiertos] = await connection.query(
                `SELECT id FROM reclamos
                 WHERE usuario_id = ? AND pedido_id = ? AND estado IN (?)`,
                [req.usuario.id, pedidoId, ESTADOS_ABIERTOS]
            );

            if (abiertos.length > 0) {
                await connection.rollback();
                return responderError(res, 409, `Ya tenés un reclamo abierto por ese pedido (#${abiertos[0].id})`);
            }
        }

        const [resultado] = await connection.query(
            `INSERT INTO reclamos (usuario_id, pedido_id, descripcion) VALUES (?, ?, ?)`,
            [req.usuario.id, pedidoId, descripcion]
        );

        await connection.commit();

        const reclamoId = resultado.insertId;

        // A todos los administradores: todavia no esta asignado a ninguno
        await enviarNotificacionRol('administrador', {
            tipo: "reclamo_nuevo",
            titulo: "Nuevo reclamo",
            mensaje: `Llegó el reclamo #${reclamoId}${pedidoId ? ` sobre el pedido #${pedidoId}` : ''}. Está pendiente de asignación.`,
            url: `/admin/reclamos/${reclamoId}`
        });

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Reclamo registrado. Un administrador lo va a revisar",
                reclamo: {
                    id: reclamoId,
                    pedido_id: pedidoId,
                    descripcion,
                    estado: "pendiente"
                }
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

// GET /api/reclamos?estado=&pagina=&limite=
//
// Los reclamos propios. No muestra que administrador lo atiende: para el usuario lo que
// importa es en que estado esta y, al final, la resolucion.
const listarMisReclamos = async (req, res) => {
    try {
        const estado = obtenerTextoQuery(req.query.estado);

        if (estado === null || (estado !== "" && !ESTADOS_RECLAMO.includes(estado))) {
            return responderError(res, 400, `El estado tiene que ser uno de: ${ESTADOS_RECLAMO.join(', ')}`);
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = ['usuario_id = ?'];
        const parametros = [req.usuario.id];

        if (estado !== "") {
            condiciones.push('estado = ?');
            parametros.push(estado);
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM reclamos ${where}`,
            parametros
        );

        const [reclamos] = await database.query(
            `SELECT id, pedido_id, descripcion, estado, resolucion, created_at, updated_at
             FROM reclamos
             ${where}
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                reclamos,
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// GET /api/reclamos/:id
//
// Uno ajeno contesta 404 y no 403: un reclamo es un dato privado y no hace falta
// confirmar que ese id existe.
const obtenerMiReclamo = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del reclamo no es válido");
        }

        const [reclamos] = await database.query(
            `SELECT id, pedido_id, descripcion, estado, resolucion, created_at, updated_at
             FROM reclamos
             WHERE id = ? AND usuario_id = ?`,
            [id, req.usuario.id]
        );

        if (reclamos.length === 0) {
            return responderError(res, 404, "Reclamo no encontrado");
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { reclamo: reclamos[0] }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// ---------------------------------------------------------------------------
// Lado administrador
// ---------------------------------------------------------------------------

const SELECT_RECLAMO_ADMIN = `
    SELECT r.id, r.usuario_id, u.nombre AS usuario, u.email AS usuario_email,
           r.pedido_id, r.descripcion, r.estado, r.admin_asignado_id,
           ua.nombre AS admin_asignado, r.resolucion, r.created_at, r.updated_at
    FROM reclamos r
    INNER JOIN usuarios u ON u.id = r.usuario_id
    LEFT  JOIN administradores ad ON ad.id = r.admin_asignado_id
    LEFT  JOIN usuarios ua ON ua.id = ad.usuario_id`;

// GET /api/admin/reclamos?estado=&asignado=yo|ninguno&pagina=&limite=
//
// Los abiertos primero y, dentro de ellos, los mas viejos primero: es una cola de
// atencion, el que espera hace mas tiempo va adelante.
const listarReclamosAdmin = async (req, res) => {
    try {
        const estado = obtenerTextoQuery(req.query.estado);
        const asignado = obtenerTextoQuery(req.query.asignado);

        if (estado === null || (estado !== "" && !ESTADOS_RECLAMO.includes(estado))) {
            return responderError(res, 400, `El estado tiene que ser uno de: ${ESTADOS_RECLAMO.join(', ')}`);
        }

        if (asignado === null || (asignado !== "" && asignado !== "yo" && asignado !== "ninguno")) {
            return responderError(res, 400, 'asignado tiene que ser "yo" o "ninguno"');
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = [];
        const parametros = [];

        if (estado !== "") {
            condiciones.push('r.estado = ?');
            parametros.push(estado);
        }

        if (asignado === "yo") {
            condiciones.push('r.admin_asignado_id = ?');
            parametros.push(req.administradorId);
        } else if (asignado === "ninguno") {
            condiciones.push('r.admin_asignado_id IS NULL');
        }

        const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM reclamos r ${where}`,
            parametros
        );

        const [reclamos] = await database.query(
            `${SELECT_RECLAMO_ADMIN}
             ${where}
             ORDER BY (r.estado IN ('pendiente', 'en_revision')) DESC, r.created_at ASC, r.id ASC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        const [porEstado] = await database.query(
            `SELECT estado, COUNT(*) AS cantidad FROM reclamos GROUP BY estado`
        );

        const resumen = Object.fromEntries(ESTADOS_RECLAMO.map((valor) => [valor, 0]));
        for (const fila of porEstado) {
            resumen[fila.estado] = Number(fila.cantidad);
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                reclamos,
                resumen_por_estado: resumen,
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// GET /api/admin/reclamos/:id
const obtenerReclamoAdmin = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del reclamo no es válido");
        }

        const [reclamos] = await database.query(
            `${SELECT_RECLAMO_ADMIN} WHERE r.id = ?`,
            [id]
        );

        if (reclamos.length === 0) {
            return responderError(res, 404, "Reclamo no encontrado");
        }

        const reclamo = reclamos[0];
        let pedido = null;

        if (reclamo.pedido_id !== null) {
            const [pedidos] = await database.query(
                `SELECT pe.id, pe.estado, pe.total, pe.created_at, co.nombre AS comercio
                 FROM pedidos pe
                 INNER JOIN comercios co ON co.id = pe.comercio_id
                 WHERE pe.id = ?`,
                [reclamo.pedido_id]
            );

            pedido = pedidos.length > 0 ? { ...pedidos[0], total: Number(pedidos[0].total) } : null;
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { reclamo: { ...reclamo, pedido } }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// PATCH /api/admin/reclamos/:id/asignar
// Body (opcional): { "administrador_id": 2 }. Sin body, se lo asigna quien lo pide.
//
// Pasa el reclamo a en_revision. Sirve tambien para reasignar mientras sigue abierto.
const asignarReclamo = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del reclamo no es válido");
        }

        let administradorId = req.administradorId;

        if (req.body?.administrador_id !== undefined) {
            administradorId = obtenerIdValido(req.body.administrador_id);
            if (administradorId === null) {
                return responderError(res, 400, "administrador_id tiene que ser un número válido");
            }
        }

        const [administradores] = await database.query(
            `SELECT a.id, u.id AS usuario_id, u.nombre
             FROM administradores a
             INNER JOIN usuarios u ON u.id = a.usuario_id
             WHERE a.id = ? AND u.activo = TRUE`,
            [administradorId]
        );

        if (administradores.length === 0) {
            return responderError(res, 400, "Ese administrador no existe o no está activo");
        }

        const [reclamos] = await database.query(
            `SELECT usuario_id, estado FROM reclamos WHERE id = ?`,
            [id]
        );

        if (reclamos.length === 0) {
            return responderError(res, 404, "Reclamo no encontrado");
        }

        // UPDATE condicional: si otro administrador lo cerro en el medio, afecta 0 filas
        // y no reabre un reclamo cerrado
        const [resultado] = await database.query(
            `UPDATE reclamos
             SET admin_asignado_id = ?, estado = 'en_revision'
             WHERE id = ? AND estado IN (?)`,
            [administradorId, id, ESTADOS_ABIERTOS]
        );

        if (resultado.affectedRows === 0) {
            return responderError(res, 409, `El reclamo ya está cerrado y no se puede asignar`);
        }

        // Al usuario se le avisa la primera vez que alguien lo toma, no en cada
        // reasignacion
        if (reclamos[0].estado === 'pendiente') {
            await enviarNotificaciones(reclamos[0].usuario_id, {
                tipo: "reclamo_en_revision",
                titulo: "Reclamo en revisión",
                mensaje: `Tu reclamo #${id} ya está en revisión.`,
                url: `/reclamos/${id}`
            });
        }

        // Si se lo asignaron a otro, que se entere
        if (administradorId !== req.administradorId) {
            await enviarNotificaciones(administradores[0].usuario_id, {
                tipo: "reclamo_asignado",
                titulo: "Reclamo asignado",
                mensaje: `Te asignaron el reclamo #${id}.`,
                url: `/admin/reclamos/${id}`
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: `Reclamo asignado a ${administradores[0].nombre}`,
                reclamo: { id, estado: "en_revision", admin_asignado_id: administradorId }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// PATCH /api/admin/reclamos/:id/resolver
// Body: { "estado": "resuelto" | "rechazado", "resolucion": "..." }
//
// Solo lo cierra el administrador que lo tiene asignado. Sin esa regla, dos
// administradores podrian contestarle cosas distintas al mismo usuario.
const resolverReclamo = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del reclamo no es válido");
        }

        const estado = req.body?.estado;

        if (estado !== 'resuelto' && estado !== 'rechazado') {
            return responderError(res, 400, 'El estado tiene que ser "resuelto" o "rechazado"');
        }

        const resolucion = obtenerTextoValido(req.body?.resolucion, { min: 5, max: LARGO_MAXIMO_TEXTO });

        if (resolucion === null) {
            return responderError(res, 400, `La resolución es obligatoria: entre 5 y ${LARGO_MAXIMO_TEXTO} caracteres. Es lo que le llega al usuario`);
        }

        // UPDATE condicional: verificar el estado y la asignacion y cerrarlo es una sola
        // operacion atomica, igual que la asignacion de pedidos (pedido.service.js)
        const [resultado] = await database.query(
            `UPDATE reclamos
             SET estado = ?, resolucion = ?
             WHERE id = ? AND estado = 'en_revision' AND admin_asignado_id = ?`,
            [estado, resolucion, id, req.administradorId]
        );

        if (resultado.affectedRows === 0) {
            // Camino de error: averiguar el motivo para contestar algo util
            const [reclamos] = await database.query(
                `SELECT estado, admin_asignado_id FROM reclamos WHERE id = ?`,
                [id]
            );

            if (reclamos.length === 0) {
                return responderError(res, 404, "Reclamo no encontrado");
            }

            if (reclamos[0].estado === 'pendiente') {
                return responderError(res, 409, "El reclamo todavía no está asignado: asignalo antes de resolverlo");
            }

            if (reclamos[0].estado !== 'en_revision') {
                return responderError(res, 409, `El reclamo ya está ${reclamos[0].estado}`);
            }

            return responderError(res, 403, "El reclamo está asignado a otro administrador");
        }

        const [reclamos] = await database.query(
            `SELECT usuario_id FROM reclamos WHERE id = ?`,
            [id]
        );

        await enviarNotificaciones(reclamos[0].usuario_id, {
            tipo: "reclamo_cerrado",
            titulo: estado === 'resuelto' ? "Reclamo resuelto" : "Reclamo rechazado",
            mensaje: `Tu reclamo #${id} fue ${estado}: ${resolucion}`,
            url: `/reclamos/${id}`
        });

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: `Reclamo ${estado}`,
                reclamo: { id, estado, resolucion }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

module.exports = {
    crearReclamo,
    listarMisReclamos,
    obtenerMiReclamo,
    listarReclamosAdmin,
    obtenerReclamoAdmin,
    asignarReclamo,
    resolverReclamo
};
