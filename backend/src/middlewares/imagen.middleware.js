const multer = require('multer');

// Recibe la imagen de un formulario multipart/form-data, en el campo "imagen": el logo
// del comercio o la foto de un producto.
//
// En memoria y no en disco: el archivo queda en req.file.buffer y lo escribe
// guardarImagen (imagen.service.js) recien cuando el resto del pedido ya se valido, asi
// un pedido con datos invalidos no deja nada en la carpeta. El tope de tamaño acota la
// memoria que puede ocupar.
//
// Lo que no es multipart pasa de largo sin tocarlo. Por eso POST /api/productos y
// POST /api/registroComercio siguen aceptando JSON como siempre, y ahi la imagen es
// opcional.

const numeroDelEntorno = (nombre, porDefecto) => {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) && valor > 0 ? valor : porDefecto;
};

const MAXIMO_MB = numeroDelEntorno('IMAGENES_MAX_MB', 2);

const subida = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAXIMO_MB * 1024 * 1024,
        files: 1,
        // El registro de comercio, el formulario con mas campos, tiene 8
        fields: 20,
        fieldSize: 100 * 1024
    }
}).single('imagen');

const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// Se llama a mano para traducir los errores de multer al sobre de la API: sin esto
// llegarian al manejador de app.js y saldrian todos como 500
const recibirImagen = (req, res, next) => {
    subida(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return responderError(res, 413, `La imagen no puede pesar más de ${MAXIMO_MB} MB`);
            }

            if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
                return responderError(res, 400, "Mandá una sola imagen, en el campo imagen");
            }

            return responderError(res, 400, "El formulario tiene demasiados campos o alguno es demasiado largo");
        }

        // Un multipart cortado o mal armado
        return responderError(res, 400, "No se pudo leer el formulario: revisá que sea multipart/form-data");
    });
};

module.exports = { recibirImagen };
