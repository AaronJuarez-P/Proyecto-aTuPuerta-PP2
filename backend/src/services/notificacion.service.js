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