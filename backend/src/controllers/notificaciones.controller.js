const database = require("../database/database");
const webpush = require("../config/webpush");

// Función para traer la suscripción del sistema de notificaciones
const suscribir = async (req, res) => {
    try {

        // Url del navegador al aceptar las notificaciones
        // Claves publica y privada
        // Publica para el front
        const { endpoint, keys } = req.body;

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
            return res.status(400).json({
                codigo: 400,
                estado: "Suscripción invalida",
                datos: null
            });
        }

        // Inserta la suscripcion al servicio de notificaciones
        // en la tabla de suscripciones
        await database.query(
            `INSERT INTO suscripciones_push (usuario_id, endpoint, p256dh, auth)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
            [req.usuario.id, endpoint, keys.p256dh, keys.auth]
        );

        return res.status(201).json({
            codigo: 201,
            estado: "Suscripcion correcta",
            datos: null
        });

    } catch (error) {

        console.error("Error al suscribir notificaciones push:", error);

        return res.status(500).json({
            codigo: 500,
            estado: "Error interno del servidor",
            datos: null
        });

    }
};

// Funcion generica para enviar notificaciones
// IMPORTANTE: nunca debe tirar (throw) hacia quien la llama.
// Si notificar falla, el flujo principal (crear pedido, cambiar estado, etc.)
// tiene que seguir funcionando igual.
const enviarNotificaciones = async (usuarioId, { titulo, mensaje, url }) => {
    try {

        // El historial in-app se guarda aunque el usuario no tenga una suscripción
        // push activa o el navegador no pueda recibir el aviso.
        try {
            await database.query(
                `INSERT INTO notificaciones (usuario_id, tipo, mensaje)
                 VALUES (?, ?, ?)`,
                [usuarioId, "push", mensaje]
            );
        } catch (error) {
            console.error(`Error guardando notificación para usuario ${usuarioId}:`, error.message);
        }

        // Trae la suscripcion (si existe) del usuario
        const [suscripciones] = await database.query(
            `SELECT endpoint, p256dh, auth FROM suscripciones_push
             WHERE usuario_id = ?`,
            [usuarioId]
        );

        // Si el usuario nunca aceptó notificaciones, no hay nada que mandar.
        if (suscripciones.length === 0) return;

        // Datos que viajan en la notificación
        const payload = JSON.stringify({ title: titulo, body: mensaje, url });

        // Define la suscripcion (suscripcionPush) con los datos de la base
        for (const sub of suscripciones) {
            const suscripcionPush = {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
            };

            try {
                // Pushea la noti. con los datos de la suscripcion y el payload
                await webpush.sendNotification(suscripcionPush, payload);
            } catch (error) {
                // 404/410: el navegador ya no reconoce esa suscripción, se limpia de la base.
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await database.query(
                        `DELETE FROM suscripciones_push WHERE endpoint = ?`,
                        [sub.endpoint]
                    );
                } else {
                    // Cualquier otro error (red, payload, credenciales VAPID, etc.)
                    // se loguea para poder diagnosticarlo, pero no debe cortar el flujo.
                    console.error(
                        `Error enviando push a usuario ${usuarioId} (endpoint ${sub.endpoint}):`,
                        error.message
                    );
                }
            }
        }

    } catch (error) {
        // Error al leer suscripciones (ej: falla de conexión a la DB).
        // Se loguea pero NO se relanza: notificar nunca debe romper
        // el endpoint que la invoca.
        console.error(`Error en enviarNotificaciones para usuario ${usuarioId}:`, error.message);
    }
};

module.exports = {
    suscribir,
    enviarNotificaciones
};