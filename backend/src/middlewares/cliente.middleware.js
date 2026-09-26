const database = require('../database/database');

// Deja en req.clienteId el id del cliente del usuario autenticado.
// Se usa despues de verificarToken y verificarRol('cliente').
// Resuelve siempre contra la base y no contra el token: la base es la fuente de verdad,
// asi un token viejo o de un usuario dado de baja no sirve.
//
// Por eso tambien exige u.activo = TRUE y u.rol = 'cliente' y no alcanza con el rol del
// token: un JWT ya emitido sigue diciendo 'cliente' hasta que expira, aunque la cuenta
// se haya dado de baja en el medio.
//
// El mensaje es el mismo que devolvia el helper resolverClienteId de pago.controller.js,
// palabra por palabra, para que las guias de prueba de la semana 6 sigan valiendo.
const resolverCliente = async (req, res, next) => {
    try {
        const [clientes] = await database.query(
            `SELECT c.id
             FROM clientes c
             INNER JOIN usuarios u ON u.id = c.usuario_id
             WHERE c.usuario_id = ? AND u.activo = TRUE AND u.rol = 'cliente'`,
            [req.usuario.id]
        );

        if (clientes.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe un perfil de cliente para este usuario" }
            });
        }

        req.clienteId = clientes[0].id;
        next();

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = { resolverCliente };
