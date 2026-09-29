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
const database = require('../database/database');
const webPush = require('../config/webpush');

// Envía un push a todas las suscripciones activas de un usuario.
// Si una suscripción devuelve 404/410, ya no existe del lado del navegador
// (el usuario la revocó o expiró) y se borra de la base.
const enviarNotificacion = async (usuarioId, payload) => {
    const [suscripciones] = await database.query(
        `SELECT endpoint, p256dh, auth FROM suscripciones_push WHERE usuario_id = ?`,
        [usuarioId]
    );

    for (const sub of suscripciones) {
        const suscripcionPush = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
        };

        try {
            await webPush.sendNotification(suscripcionPush, JSON.stringify(payload));
        } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                await database.query(
                    `DELETE FROM suscripciones_push WHERE endpoint = ?`,
                    [sub.endpoint]
                );
            } else {
                console.error("Error enviando push:", error.message);
            }
        }
    }
};

module.exports = { enviarNotificacion };
