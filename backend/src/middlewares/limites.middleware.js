const { rateLimit } = require('express-rate-limit');

// Limites de pedidos por IP (semana 14).
//
// Los contadores viven en memoria: alcanza mientras el backend corra en un solo
// proceso, que es el mismo supuesto del canal de Socket.IO (ver tiemporeal.service.js).
// Con varias instancias cada una contaria por su lado y haria falta un store compartido.

const numeroDelEntorno = (nombre, porDefecto) => {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
};

const ventanaMs = () => numeroDelEntorno('RATE_LIMIT_VENTANA_MINUTOS', 15) * 60 * 1000;

// El 429 con el mismo envoltorio { codigo, estado, datos } que el resto de la API: sin
// esto express-rate-limit contesta texto plano y el front tendria que parsear dos
// formatos de error.
const responderLimite = (mensaje) => (req, res, next, opciones) => {
    return res.status(opciones.statusCode).json({
        codigo: opciones.statusCode,
        estado: "error",
        datos: { mensaje }
    });
};

// General, para toda la API. Es generoso a proposito: tiene que frenar a un script que
// martilla el servidor, no a una persona usando la app ni a quien corre las guias de
// Postman de punta a punta.
const limitadorGeneral = rateLimit({
    windowMs: ventanaMs(),
    limit: numeroDelEntorno('RATE_LIMIT_MAX', 1000),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: responderLimite("Demasiadas solicitudes. Esperá unos minutos y volvé a intentar")
});

// Para todo lo que verifica una contraseña: los cuatro logins, los tres registros (los
// de comercio y repartidor comparan la contraseña de una cuenta que ya existe),
// cambiar la contraseña y dar de baja la cuenta.
//
// Cuenta solo los intentos FALLIDOS (skipSuccessfulRequests): alcanza para que
// adivinar una contraseña probando de a una sea impracticable, y quien entra bien
// nunca se lo cruza.
const limitadorAutenticacion = rateLimit({
    windowMs: ventanaMs(),
    limit: numeroDelEntorno('RATE_LIMIT_LOGIN_MAX', 10),
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: responderLimite("Demasiados intentos fallidos. Esperá unos minutos y volvé a intentar")
});

module.exports = { limitadorGeneral, limitadorAutenticacion };
