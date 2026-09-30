// Valida un id numerico que llega por la ruta, el body o la query.
// Devuelve el numero o null si no sirve.
const obtenerIdValido = (valor) => {
    const id = parseInt(valor, 10);
    return (isNaN(id) || id < 1) ? null : id;
};

// Valida una coordenada (semana 9). Devuelve el numero redondeado a 7 decimales,
// que es la precision de las columnas DECIMAL(10,7), o null si no sirve.
//
// Exige typeof number y no acepta strings numericos a proposito, igual que el
// chequeo de "disponible" en repartidor.controller.js: si aceptara strings, un
// cliente que manda "" o "abc" tendria una coordenada convertida en 0 o NaN sin
// enterarse, y 0 es una latitud perfectamente valida (el ecuador). Que falle
// ruidoso con un 400 es mejor que registrar al repartidor en el Golfo de Guinea.
const obtenerCoordenadaValida = (valor, maximo) => {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return null;
    }

    if (valor < -maximo || valor > maximo) {
        return null;
    }

    return Math.round(valor * 1e7) / 1e7;
};

// Atajos para no tener que acordarse de los limites en cada controlador
const obtenerLatitudValida = (valor) => obtenerCoordenadaValida(valor, 90);
const obtenerLongitudValida = (valor) => obtenerCoordenadaValida(valor, 180);

// Validacion de formato de email, deliberadamente laxa: no intenta cumplir el RFC 5322
// (que acepta direcciones que ningun proveedor real emite) sino descartar lo obviamente
// mal escrito antes de que llegue a la base. Lo unico que prueba de verdad que un email
// existe es mandarle un mail de verificacion, que el proyecto todavia no hace.
// El limite de 150 es el largo de usuarios.email en el esquema.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const esEmailValido = (valor) => {
    if (typeof valor !== 'string') {
        return false;
    }

    const limpio = valor.trim();
    return limpio.length > 0 && limpio.length <= 150 && EMAIL_REGEX.test(limpio);
};

// ---------------------------------------------------------------------------
// Semana 14 - validacion y sanitizacion de entradas
// ---------------------------------------------------------------------------

// Texto obligatorio con largo acotado. Devuelve el string recortado o null si no sirve.
//
// Los maximos son los de las columnas. Pasarse no daba un 400: con MySQL en modo
// estricto era un 500 ("Data too long") y en XAMPP, que no usa el modo estricto, un
// recorte silencioso del dato.
const obtenerTextoValido = (valor, { min = 1, max }) => {
    if (typeof valor !== 'string') {
        return null;
    }

    const limpio = valor.trim();
    return (limpio.length < min || limpio.length > max) ? null : limpio;
};

// Texto de un parametro de query string. Devuelve el string recortado, '' si no vino,
// o null si vino con otra forma.
//
// Express parsea ?buscar[]=x como array y ?buscar[a]=x como objeto, asi que un
// req.query.buscar no siempre es un string: antes eso llegaba hasta un .trim() y
// terminaba en un 500.
const obtenerTextoQuery = (valor) => {
    if (valor === undefined) {
        return '';
    }

    return typeof valor === 'string' ? valor.trim() : null;
};

// Fecha 'YYYY-MM-DD' de un filtro (desde / hasta). Devuelve el string, '' si no vino o
// null si no sirve. Chequea que la fecha exista de verdad: 2026-02-31 no pasa, porque
// Date la "corrige" a marzo y el filtro daria un resultado que nadie pidio.
const obtenerFechaQuery = (valor) => {
    const texto = obtenerTextoQuery(valor);

    if (texto === null || texto === '') {
        return texto;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return null;
    }

    const fecha = new Date(`${texto}T00:00:00Z`);
    return (isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) ? null : texto;
};

// true / false de un parametro de query string, que siempre llega como texto.
// Devuelve undefined si no vino y null si vino con otro valor.
const obtenerBooleanoQuery = (valor) => {
    if (valor === undefined || valor === '') {
        return undefined;
    }

    if (valor === 'true') return true;
    if (valor === 'false') return false;
    return null;
};

// Digitos, espacios, +, - y parentesis. usuarios.telefono es VARCHAR(20).
const TELEFONO_REGEX = /^[0-9+\-\s()]{6,20}$/;

const esTelefonoValido = (valor) =>
    typeof valor === 'string' && TELEFONO_REGEX.test(valor.trim());

// Entre 8 y 72 caracteres. El tope no es arbitrario: bcrypt solo mira los primeros 72
// bytes, asi que dos contraseñas que difieren recien despues serian la misma. Se mide
// en bytes porque una ñ o una letra con tilde ocupan dos.
//
// Solo se exige al crear o cambiar una contraseña, nunca al iniciar sesion: una cuenta
// vieja con una contraseña mas corta tiene que poder seguir entrando.
const esContrasenaValida = (valor) =>
    typeof valor === 'string' && valor.length >= 8 && Buffer.byteLength(valor, 'utf8') <= 72;

module.exports = {
    obtenerIdValido,
    obtenerCoordenadaValida,
    obtenerLatitudValida,
    obtenerLongitudValida,
    esEmailValido,
    obtenerTextoValido,
    obtenerTextoQuery,
    obtenerFechaQuery,
    obtenerBooleanoQuery,
    esTelefonoValido,
    esContrasenaValida
};
