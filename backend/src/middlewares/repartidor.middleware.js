const database = require('../database/database');

// Deja en req.repartidorId el id del repartidor del usuario autenticado, y en
// req.repartidorDisponible si puede tomar un pedido nuevo.
// Se usa despues de verificarToken y verificarRol('repartidor').
// Resuelve siempre contra la base y no contra el repartidorId del token: la base es
// la fuente de verdad, asi un token viejo o de un usuario dado de baja no sirve.
//
// Por eso tambien exige u.rol = 'repartidor' y no alcanza con el rol del token:
// cerrarSesionRepartidor deja al usuario en 'cliente', y el JWT ya emitido sigue
// diciendo 'repartidor' hasta que expira. Sin este filtro, cerrar sesion no haria nada.
//
// req.repartidorDisponible se lee fuera de cualquier transaccion. Alcanza para listar,
// pero lo que modifica (aceptar, entregar) lo vuelve a leer con lock.
const resolverRepartidor = async (req, res, next) => {
    try {
        const [repartidores] = await database.query(
            `SELECT r.id, r.disponible
             FROM repartidores r
             INNER JOIN usuarios u ON u.id = r.usuario_id
             WHERE r.usuario_id = ? AND u.activo = TRUE AND u.rol = 'repartidor'`,
            [req.usuario.id]
        );

        if (repartidores.length === 0) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "No tenés un perfil de repartidor activo asociado a tu cuenta" }
            });
        }

        req.repartidorId = repartidores[0].id;
        req.repartidorDisponible = Boolean(repartidores[0].disponible);
        next();

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = { resolverRepartidor };
