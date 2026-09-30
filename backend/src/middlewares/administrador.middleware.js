const database = require('../database/database');

// Deja en req.administradorId el id de la tabla administradores del usuario autenticado
// (semana 13). Se usa despues de verificarToken y verificarRol('administrador').
//
// Hace falta el id de administradores y no el de usuarios porque es lo que guardan
// auditoria_productos.administrador_id, auditoria_pedidos.administrador_id y
// reclamos.admin_asignado_id.
//
// Mismo criterio que resolverComercio y resolverRepartidor: resuelve contra la base y no
// contra el administradorId del token, y exige u.activo = TRUE y u.rol = 'administrador'.
// Un administrador dado de baja, o al que le cerraron la sesion, no entra con un token
// viejo.
const resolverAdministrador = async (req, res, next) => {
    try {
        const [administradores] = await database.query(
            `SELECT a.id
             FROM administradores a
             INNER JOIN usuarios u ON u.id = a.usuario_id
             WHERE a.usuario_id = ? AND u.activo = TRUE AND u.rol = 'administrador'`,
            [req.usuario.id]
        );

        if (administradores.length === 0) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "No tenés un perfil de administrador activo asociado a tu cuenta" }
            });
        }

        req.administradorId = administradores[0].id;
        next();

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = { resolverAdministrador };
