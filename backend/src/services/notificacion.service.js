// Guarda una notificacion para un usuario en la tabla notificaciones (semana 8).
//
// Es la version minima: deja la fila para que el usuario la lea con
// GET /api/notificaciones. El envio en tiempo real es de la semana 11.
//
// Recibe la CONEXION del controlador, igual que auditoria.service.js, para que la
// notificacion quede en la misma transaccion que el cambio que la origina: si el
// pedido no se llega a asignar, tampoco queda un aviso con un codigo que no sirve.
//
// tipo: identificador corto del evento en snake_case ('pedido_en_camino', ...)
const registrarNotificacion = async (conexion, { usuarioId, tipo, mensaje }) => {
    await conexion.query(
        `INSERT INTO notificaciones (usuario_id, tipo, mensaje)
        VALUES (?, ?, ?)`,
        [usuarioId, tipo, mensaje]
    );
};

module.exports = { registrarNotificacion };
