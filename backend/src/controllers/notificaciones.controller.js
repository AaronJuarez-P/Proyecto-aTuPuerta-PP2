const database = require("../database/database");
const { pushHabilitado, clavePublica } = require("../config/webPush");
const {
    registrarNotificacionRol,
    enviarPush,
    enviarPushRol
} = require("../services/notificacion.service");

// suscripciones_push.endpoint es VARCHAR(500); p256dh y auth, VARCHAR(255)
const LARGO_MAXIMO_ENDPOINT = 500;
const LARGO_MAXIMO_CLAVE = 255;

// POST /api/notificaciones/suscribir
// Body: la PushSubscription que devuelve el navegador, tal cual:
//       { "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." } }
const suscribir = async (req, res) => {
    try {
        const { endpoint, keys } = req.body ?? {};

        // Los servicios de push de los navegadores siempre son https. Validar el
        // formato evita guardar basura que despues falla en cada envio.
        const endpointValido = typeof endpoint === "string" &&
            endpoint.startsWith("https://") &&
            endpoint.length <= LARGO_MAXIMO_ENDPOINT;

        const clavesValidas = typeof keys?.p256dh === "string" && typeof keys?.auth === "string" &&
            keys.p256dh.length > 0 && keys.p256dh.length <= LARGO_MAXIMO_CLAVE &&
            keys.auth.length > 0 && keys.auth.length <= LARGO_MAXIMO_CLAVE;

        if (!endpointValido || !clavesValidas) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Suscripción inválida: hacen falta endpoint (https) y keys.p256dh / keys.auth" }
            });
        }

        // Un mismo navegador puede volver a suscribirse (el endpoint es UNIQUE): se
        // actualizan las claves y tambien el dueño, por si en ese navegador ahora
        // entro otra persona.
        await database.query(
            `INSERT INTO suscripciones_push (usuario_id, endpoint, p256dh, auth)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
            [req.usuario.id, endpoint, keys.p256dh, keys.auth]
        );

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Suscripción registrada",
                push_habilitado: pushHabilitado
            }
        });

    } catch (error) {
        console.error("Error al suscribir notificaciones push:", error);

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// GET /api/notificaciones/clave-publica
//
// El front la necesita para suscribirse (applicationServerKey de pushManager.subscribe).
// Es publica a proposito: no identifica a nadie y sin ella no hay forma de suscribirse.
const obtenerClavePublica = (req, res) => {
    return res.status(200).json({
        codigo: 200,
        estado: "exito",
        datos: {
            push_habilitado: pushHabilitado,
            clave_publica: clavePublica
        }
    });
};

// Funcion generica para notificar a un usuario: guarda la fila y manda el push.
//
// IMPORTANTE: nunca tira (throw) hacia quien la llama. Si notificar falla, el flujo
// principal (crear pedido, cambiar estado, etc.) tiene que seguir funcionando igual.
//
// La fila se awaitea (es una escritura corta en la base) para que un GET /notificaciones
// inmediatamente despues ya la vea. El push NO se awaitea: es una llamada de red y quien
// llama puede tener todavia una conexion del pool tomada (misma regla que las emisiones
// del socket, ver tiemporeal.service.js).
const enviarNotificaciones = async (usuarioId, { titulo, mensaje, url, tipo = "general" }) => {
    try {
        await database.query(
            `INSERT INTO notificaciones (usuario_id, tipo, mensaje)
             VALUES (?, ?, ?)`,
            [usuarioId, tipo, mensaje]
        );
    } catch (error) {
        console.error(`Error guardando notificación para usuario ${usuarioId}:`, error.message);
    }

    enviarPush(usuarioId, { titulo, mensaje, url }).catch(() => {});
};

// Notificacion general para todo un rol: una sola fila con usuario_id NULL y push a
// los usuarios activos que tienen abierta una sesion de ese rol. Mismas reglas que
// enviarNotificaciones: nunca tira y el push no se awaitea.
const enviarNotificacionRol = async (rol, { titulo, mensaje, url, tipo = "general" }) => {
    try {
        await registrarNotificacionRol(database, { rol, tipo, mensaje });
    } catch (error) {
        console.error(`Error guardando notificación general para el rol ${rol}:`, error.message);
    }

    enviarPushRol(rol, { titulo, mensaje, url }).catch(() => {});
};

// Se conserva el nombre original porque lo usan pagos y comercio.
const enviarNotificacionRepartidores = (datos) =>
    enviarNotificacionRol("repartidor", { tipo: "pedido_disponible", ...datos });

module.exports = {
    suscribir,
    obtenerClavePublica,
    enviarNotificaciones,
    enviarNotificacionRol,
    enviarNotificacionRepartidores
};
