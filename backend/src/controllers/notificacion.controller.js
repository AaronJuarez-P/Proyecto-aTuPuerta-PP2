const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');

// GET /api/notificaciones?pagina=&limite=
//
// Sirve para cualquier rol: cada usuario ve solo las suyas, las del id del token.
// Por ahora es la forma en que el cliente se entera del codigo de entrega de su pedido.
// Marcarlas como leidas queda para la semana 11.
const listarNotificaciones = async (req, res) => {
    try {
        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM notificaciones WHERE usuario_id = ?`,
            [req.usuario.id]
        );

        const [notificaciones] = await database.query(
            `SELECT id, tipo, mensaje, leida, created_at
            FROM notificaciones
            WHERE usuario_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ? OFFSET ?`,
            [req.usuario.id, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                notificaciones,
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

module.exports = { listarNotificaciones };
