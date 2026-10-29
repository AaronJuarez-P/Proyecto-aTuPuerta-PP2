const { estado, preguntar } = require('../services/ayuda.service');
const { obtenerTextoValido } = require('../utils/validacion');

// El Portero, el asistente de ayuda (Desarrollo con IA). Lo del RAG esta en
// ayuda.service.js: aca solo se valida la pregunta y se arma la respuesta HTTP.

// Menos de 3 caracteres no es una pregunta, y mas de 300 tampoco: cada caracter viaja
// en el prompt que se le manda a Gemini
const LARGO_MINIMO_PREGUNTA = 3;
const LARGO_MAXIMO_PREGUNTA = 300;

const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// GET /api/ayuda/estado
// El front lo consulta al cargar: con el Portero apagado, no muestra el boton.
const obtenerEstado = (req, res) => {
    return res.status(200).json({
        codigo: 200,
        estado: "exito",
        datos: estado()
    });
};

// POST /api/ayuda/preguntar
// Body: { "pregunta": "¿Cómo pago mi pedido?" }
//
// Responde { respuesta, fuentes, recuperados, umbral, modo }. Con el Portero apagado, o
// si fallan Ollama, Postgres o Gemini, 503 con un mensaje para la persona.
const preguntarAlPortero = async (req, res) => {
    try {
        const pregunta = obtenerTextoValido(req.body?.pregunta, { min: LARGO_MINIMO_PREGUNTA, max: LARGO_MAXIMO_PREGUNTA });

        if (pregunta === null) {
            return responderError(res, 400, `La pregunta tiene que tener entre ${LARGO_MINIMO_PREGUNTA} y ${LARGO_MAXIMO_PREGUNTA} caracteres`);
        }

        const datos = await preguntar(pregunta);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos
        });
    } catch (error) {
        if (error.codigoHttp) {
            return responderError(res, error.codigoHttp, error.message);
        }

        return responderError(res, 500, "Error interno del servidor");
    }
};

module.exports = { obtenerEstado, preguntarAlPortero };
