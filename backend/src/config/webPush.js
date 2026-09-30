require("dotenv").config();
const webPush = require("web-push");

// Las claves VAPID identifican a este servidor ante el servicio de push del navegador.
// Se generan una sola vez con: npx web-push generate-vapid-keys
//
// Sin ellas el push queda apagado y el servidor arranca igual. Antes setVapidDetails
// tiraba al importar este archivo, y como lo importan los controladores de carrito,
// pagos y comercio, la API entera no levantaba por una funcionalidad opcional. Las
// notificaciones se siguen guardando en la base y se leen con GET /api/notificaciones:
// lo unico que se pierde es el aviso del navegador.
const clavePublica = process.env.VAPID_PUBLIC_KEY;
const clavePrivada = process.env.VAPID_PRIVATE_KEY;

let pushHabilitado = false;

if (clavePublica && clavePrivada) {
  try {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:ATuPuerta@gmail.org",
      clavePublica,
      clavePrivada
    );
    pushHabilitado = true;
  } catch (error) {
    console.error("Las claves VAPID del .env no son válidas, el push queda deshabilitado:", error.message);
  }
} else {
  console.warn("Push deshabilitado: faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en el .env. Las notificaciones se siguen guardando en la base.");
}

module.exports = {
  webPush,
  pushHabilitado,
  // La publica es publica de verdad: el front la necesita para suscribirse
  clavePublica: pushHabilitado ? clavePublica : null
};
