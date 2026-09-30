const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const { obtenerIdValido, obtenerBooleanoQuery } = require('../utils/validacion');

// Una notificacion le llega a un usuario de dos formas (semana 11):
// - personal: usuario_id es el suyo;
// - general: usuario_id NULL y destinatario_rol igual al rol de la sesion abierta. Es
//   una sola fila para todos los repartidores, por ejemplo.
//
// Se compara contra el rol de la SESION (el del token) y no contra los perfiles que
// tiene: quien esta usando la app como cliente no tiene por que ver los avisos de
// "pedido disponible para repartir", aunque tambien sea repartidor.
const CONDICION_DESTINATARIO = `(n.usuario_id = ? OR (n.usuario_id IS NULL AND n.destinatario_rol = ?))`;

// Si esta leida, para este usuario. Una personal tiene su propia columna leida; una
// general no puede usarla (el primero que la leyera la marcaria para todos), asi que su
// lectura es una fila en notificaciones_leidas. leida admite NULL en el esquema: NULL
// cuenta como no leida.
const EXPRESION_LEIDA = `(CASE WHEN n.usuario_id IS NULL
                               THEN nl.usuario_id IS NOT NULL
                               ELSE COALESCE(n.leida, FALSE) = TRUE
                          END)`;

// GET /api/notificaciones?no_leidas=true&pagina=&limite=
//
// Sirve para cualquier rol: cada usuario ve las suyas y las generales de su rol, las
// mas nuevas primero. no_leidas viaja siempre, con o sin filtro: es el numero del
// globito de la campana.
const listarNotificaciones = async (req, res) => {
    try {
        const soloNoLeidas = obtenerBooleanoQuery(req.query.no_leidas);

        if (soloNoLeidas === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "no_leidas tiene que ser true o false" }
            });
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);
        const parametros = [req.usuario.id, req.usuario.id, req.usuario.rol];
        const filtro = soloNoLeidas ? `AND NOT ${EXPRESION_LEIDA}` : '';

        const [conteos] = await database.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(NOT ${EXPRESION_LEIDA}), 0) AS no_leidas
             FROM notificaciones n
             LEFT JOIN notificaciones_leidas nl
                    ON nl.notificacion_id = n.id AND nl.usuario_id = ?
             WHERE ${CONDICION_DESTINATARIO}`,
            parametros
        );

        // Con el filtro, el total de la paginacion son las no leidas
        const totalFiltrado = Number(soloNoLeidas ? conteos[0].no_leidas : conteos[0].total);

        const [notificaciones] = await database.query(
            `SELECT n.id, n.tipo, n.mensaje,
                    ${EXPRESION_LEIDA} AS leida,
                    (n.usuario_id IS NULL) AS general,
                    n.created_at
             FROM notificaciones n
             LEFT JOIN notificaciones_leidas nl
                    ON nl.notificacion_id = n.id AND nl.usuario_id = ?
             WHERE ${CONDICION_DESTINATARIO} ${filtro}
             ORDER BY n.created_at DESC, n.id DESC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                notificaciones: notificaciones.map((notificacion) => ({
                    ...notificacion,
                    leida: Boolean(notificacion.leida),
                    general: Boolean(notificacion.general)
                })),
                no_leidas: Number(conteos[0].no_leidas),
                paginacion: { pagina, limite, total: totalFiltrado }
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

// PATCH /api/notificaciones/:id/leida
//
// Idempotente: marcar dos veces la misma no es un error. Una notificacion ajena contesta
// 404 y no 403, para no confirmar que ese id existe.
const marcarLeida = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id de la notificación no es válido" }
            });
        }

        const [notificaciones] = await database.query(
            `SELECT n.id, n.usuario_id
             FROM notificaciones n
             WHERE n.id = ? AND ${CONDICION_DESTINATARIO}`,
            [id, req.usuario.id, req.usuario.rol]
        );

        if (notificaciones.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Notificación no encontrada" }
            });
        }

        if (notificaciones[0].usuario_id !== null) {
            await database.query(
                `UPDATE notificaciones SET leida = TRUE WHERE id = ?`,
                [id]
            );
        } else {
            // INSERT IGNORE: si ya estaba marcada, la PK compuesta rechaza el duplicado
            // en silencio y el endpoint sigue siendo idempotente
            await database.query(
                `INSERT IGNORE INTO notificaciones_leidas (notificacion_id, usuario_id) VALUES (?, ?)`,
                [id, req.usuario.id]
            );
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Notificación marcada como leída",
                notificacion: { id, leida: true }
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

// PATCH /api/notificaciones/leidas
//
// Marca todas: las personales y las generales del rol de la sesion.
const marcarTodasLeidas = async (req, res) => {
    try {
        const [personales] = await database.query(
            `UPDATE notificaciones
             SET leida = TRUE
             WHERE usuario_id = ? AND COALESCE(leida, FALSE) = FALSE`,
            [req.usuario.id]
        );

        const [generales] = await database.query(
            `INSERT IGNORE INTO notificaciones_leidas (notificacion_id, usuario_id)
             SELECT n.id, ?
             FROM notificaciones n
             WHERE n.usuario_id IS NULL AND n.destinatario_rol = ?`,
            [req.usuario.id, req.usuario.rol]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Todas las notificaciones quedaron leídas",
                marcadas: personales.affectedRows + generales.affectedRows
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

module.exports = { listarNotificaciones, marcarLeida, marcarTodasLeidas };
