const database = require('../database/database');

// Deja en req.comercioId el id del comercio del usuario autenticado.
// Se usa despues de verificarToken y verificarRol('comercio').
// Resuelve siempre contra la base y no contra el comercioId del token: la base es
// la fuente de verdad, asi un token viejo o de un comercio dado de baja no sirve.
//
// Por eso tambien exige u.rol = 'comercio' y no alcanza con el rol del token:
// cerrarSesionComercio deja al usuario en 'cliente', y el JWT ya emitido sigue
// diciendo 'comercio' hasta que expira. Sin este filtro, cerrar sesion no haria nada.
const resolverComercio = async (req, res, next) => {
    try {
        const [comercios] = await database.query(
            `SELECT c.id
             FROM comercios c
             INNER JOIN usuarios u ON u.id = c.usuario_id
             WHERE c.usuario_id = ? AND c.activo = TRUE AND u.rol = 'comercio'`,
            [req.usuario.id]
        );

        if (comercios.length === 0) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "No tenés un comercio activo asociado a tu cuenta" }
            });
        }

        req.comercioId = comercios[0].id;
        next();

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = { resolverComercio };
