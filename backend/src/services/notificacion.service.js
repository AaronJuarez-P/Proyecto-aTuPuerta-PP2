// Notificaciones (semanas 8 y 11).
//
// Son dos cosas distintas que viajan juntas:
// - la FILA en la tabla notificaciones, que es el historial in-app y la verdad: se lee
//   con GET /api/notificaciones aunque el navegador nunca haya recibido nada;
// - el PUSH al navegador (Web Push), que es best-effort: puede no haber suscripcion,
//   puede estar apagado por falta de claves VAPID o puede fallar el servicio de push.
//
// Las registrar* reciben la CONEXION del controlador, igual que auditoria.service.js,
// para que la fila quede en la misma transaccion que el cambio que la origina: si el
// pedido no se llega a asignar, tampoco queda un aviso con un codigo que no sirve.
//
// Las enviarPush* usan el POOL y NUNCA tiran: se llaman despues del commit y sin
// await, igual que las emisiones del socket (ver tiemporeal.service.js). Un push que
// falla no tiene que poder romper el flujo que lo origino.

const database = require('../database/database');
const { webPush, pushHabilitado } = require('../config/webPush');

// Notificacion personal. tipo: identificador corto del evento en snake_case
// ('pedido_en_camino', ...)
const registrarNotificacion = async (conexion, { usuarioId, tipo, mensaje }) => {
    await conexion.query(
        `INSERT INTO notificaciones (usuario_id, tipo, mensaje)
        VALUES (?, ?, ?)`,
        [usuarioId, tipo, mensaje]
    );
};

// Notificacion general para todos los usuarios de un rol (usuario_id NULL). Es una sola
// fila y no una por usuario: la lectura de cada uno se guarda aparte, en
// notificaciones_leidas.
const registrarNotificacionRol = async (conexion, { rol, tipo, mensaje }) => {
    await conexion.query(
        `INSERT INTO notificaciones (usuario_id, destinatario_rol, tipo, mensaje)
         VALUES (NULL, ?, ?, ?)`,
        [rol, tipo, mensaje]
    );
};

// Manda el mismo aviso a una lista de suscripciones. Si una devuelve 404/410, el
// navegador ya no la reconoce (el usuario la revoco o expiro) y se borra de la base.
const enviarASuscripciones = async (suscripciones, { titulo, mensaje, url }) => {
    const payload = JSON.stringify({ title: titulo, body: mensaje, url });

    for (const sub of suscripciones) {
        try {
            await webPush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
            );
        } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                await database.query(
                    `DELETE FROM suscripciones_push WHERE endpoint = ?`,
                    [sub.endpoint]
                );
            } else {
                console.error(`Error enviando push (endpoint ${sub.endpoint}):`, error.message);
            }
        }
    }
};

// Push a todas las suscripciones de un usuario (una por dispositivo). No guarda fila.
const enviarPush = async (usuarioId, datos) => {
    if (!pushHabilitado) {
        return;
    }

    try {
        const [suscripciones] = await database.query(
            `SELECT endpoint, p256dh, auth FROM suscripciones_push WHERE usuario_id = ?`,
            [usuarioId]
        );

        await enviarASuscripciones(suscripciones, datos);
    } catch (error) {
        console.error(`Error enviando push al usuario ${usuarioId}:`, error.message);
    }
};

// Push a los usuarios activos que tienen abierta una sesion de ese rol.
const enviarPushRol = async (rol, datos) => {
    if (!pushHabilitado) {
        return;
    }

    try {
        const [suscripciones] = await database.query(
            `SELECT sp.endpoint, sp.p256dh, sp.auth
             FROM suscripciones_push sp
             INNER JOIN usuarios u ON u.id = sp.usuario_id
             WHERE u.rol = ? AND u.activo = TRUE`,
            [rol]
        );

        await enviarASuscripciones(suscripciones, datos);
    } catch (error) {
        console.error(`Error enviando push al rol ${rol}:`, error.message);
    }
};

module.exports = {
    registrarNotificacion,
    registrarNotificacionRol,
    enviarPush,
    enviarPushRol
};
