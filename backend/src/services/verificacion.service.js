const crypto = require('crypto');

// Reglas del codigo de verificacion del correo (registro de clientes).
//
// Este service no toca la base ni manda nada: genera el codigo, lo convierte en el hash
// que se guarda en registros_pendientes y lo compara. Mandarlo es cosa de
// email.service.js y guardarlo, de registro.controller.js.

const numeroDelEntorno = (nombre, porDefecto) => {
    const valor = Number(process.env[nombre]);
    return Number.isInteger(valor) && valor > 0 ? valor : porDefecto;
};

// Cuanto vale un codigo. Corto a proposito: es lo que tarda alguien en abrir el correo
// y copiarlo, y cuanto menos vive, menos tiempo hay para adivinarlo.
const MINUTOS_VIGENCIA = numeroDelEntorno('EMAIL_CODIGO_MINUTOS', 15);

// Codigos incorrectos que se le perdonan a un mismo codigo. Con 6 digitos hay un millon
// de combinaciones: 5 intentos son 1 posibilidad en 200.000 de acertar por codigo.
// El tope de 100 es por la columna (intentos_fallidos es TINYINT UNSIGNED): con un
// valor mas grande que 255 en el .env el contador nunca llegaria al maximo y los
// intentos quedarian sin limite.
const INTENTOS_MAXIMOS = Math.min(numeroDelEntorno('EMAIL_CODIGO_INTENTOS', 5), 100);

// Espera para pedirle otro codigo al mismo correo. Sin esto, el boton de reenviar (o
// registrarse una y otra vez con el correo de otro) serviria para llenarle la casilla.
const SEGUNDOS_REENVIO = numeroDelEntorno('EMAIL_REENVIO_SEGUNDOS', 60);

// 6 digitos, con los ceros de adelante. crypto.randomInt y no Math.random: Math.random
// es predecible, y quien pueda predecir el proximo codigo no necesita leer el correo.
const generarCodigo = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

// Lo que se guarda en la base. El codigo en texto plano no se guarda nunca: quien
// llegue a leer la tabla (un backup, phpMyAdmin) no puede usarlo para verificar un
// registro ajeno.
//
// Es un HMAC con JWT_SECRET y no un hash comun ni bcrypt. Un hash sin clave de algo que
// tiene solo un millon de valores posibles se revierte probandolos todos, en menos de
// un segundo; con la clave, tener la tabla no alcanza. El prefijo separa este uso del
// de firmar tokens.
const hashearCodigo = (codigo) =>
    crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(`verificacion-registro:${codigo}`)
        .digest('hex');

// timingSafeEqual tarda lo mismo acierte o no: comparar con === corta en el primer
// caracter distinto, y esa diferencia de tiempo se puede medir desde afuera.
const codigoCoincide = (codigo, hashGuardado) => {
    const calculado = Buffer.from(hashearCodigo(codigo), 'hex');
    const guardado = Buffer.from(String(hashGuardado), 'hex');

    return calculado.length === guardado.length && crypto.timingSafeEqual(calculado, guardado);
};

// Exige typeof string: un codigo que llega como numero ya perdio los ceros de adelante
// (012345 seria 12345), y es mejor un 400 claro que un "codigo incorrecto" inexplicable.
const esCodigoBienFormado = (valor) =>
    typeof valor === 'string' && /^\d{6}$/.test(valor.trim());

module.exports = {
    MINUTOS_VIGENCIA,
    INTENTOS_MAXIMOS,
    SEGUNDOS_REENVIO,
    generarCodigo,
    hashearCodigo,
    codigoCoincide,
    esCodigoBienFormado
};
