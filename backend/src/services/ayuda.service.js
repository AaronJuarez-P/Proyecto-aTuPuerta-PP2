const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// El Portero, el asistente de ayuda (Desarrollo con IA).
//
// Es el UNICO archivo del backend que sabe que existe el RAG de backend/rag. Ese RAG es
// el de la clase 8: ESM (.mjs), con su propio package.json y su propio .env. Este
// backend es CommonJS, asi que lo carga con un import() dinamico, y recien con la
// primera pregunta.
//
// Tres modos, segun AYUDA_MODO en el .env:
//   off -> apagado, y es el valor por defecto. No se carga nada de backend/rag: el
//          backend arranca igual sin Docker, sin Ollama y sin el npm install del RAG.
//   faq -> busca el fragmento mas parecido a la pregunta y lo devuelve tal cual, sin
//          llamar al modelo.
//   rag -> busca los fragmentos mas parecidos y Gemini redacta la respuesta con ellos.

const CARPETA_RAG = path.join(__dirname, '..', '..', 'rag');
const MODOS = ['off', 'faq', 'rag'];

// Se lee una sola vez, al arrancar: un valor mal escrito se avisa una vez en el log y
// no en cada pregunta. Ante la duda, apagado.
const leerModo = () => {
    const valor = (process.env.AYUDA_MODO || '').trim().toLowerCase() || 'off';

    if (!MODOS.includes(valor)) {
        console.warn(`[ayuda] AYUDA_MODO="${process.env.AYUDA_MODO}" no es off, faq ni rag: el Portero queda apagado.`);
        return 'off';
    }

    return valor;
};

const MODO = leerModo();

if (MODO !== 'off') {
    console.log(`[ayuda] El Portero está en modo ${MODO}: el RAG se carga con la primera pregunta`);
}

// Error con el codigo HTTP que le corresponde, como crearErrorPedido en
// pedido.service.js: el controlador lo devuelve tal cual, sin comparar mensajes
const crearErrorAyuda = (codigoHttp, mensaje) => {
    const error = new Error(mensaje);
    error.codigoHttp = codigoHttp;
    return error;
};

const importarRag = async () => {
    const archivoEnv = path.join(CARPETA_RAG, '.env');

    // Los dos olvidos mas comunes se revisan ANTES del import(): si un import() falla,
    // Node guarda el error en su cache de modulos y reintentar no lo arregla hasta
    // reiniciar el backend. Asi alcanza con corregirlo y volver a preguntar.
    if (!fs.existsSync(archivoEnv)) {
        throw new Error('Falta backend/rag/.env: copiá backend/rag/.env.example y completalo');
    }

    if (!fs.existsSync(path.join(CARPETA_RAG, 'node_modules', 'pg'))) {
        throw new Error('Faltan las dependencias del RAG: corré npm install en backend/rag');
    }

    // Suma las variables del RAG a las del backend, sin pisar ninguna que ya exista. La
    // clave queda en el servidor: el navegador nunca la ve.
    process.loadEnvFile(archivoEnv);

    // require() no puede cargar rag.mjs: es ESM y tiene un await afuera de toda funcion
    // (lee prompt.txt al cargarse). En Windows, import() necesita una URL file://
    const rag = await import(pathToFileURL(path.join(CARPETA_RAG, 'rag.mjs')).href);

    // Es el mismo pool que usa rag.mjs: Node carga cada modulo una sola vez
    const { db } = await import(pathToFileURL(path.join(CARPETA_RAG, 'db.mjs')).href);

    // Si Postgres se cae o corta una conexion, la conexion ociosa del pool emite
    // 'error', y un 'error' que nadie escucha termina el proceso: se caeria el backend
    // entero, no solo el Portero. Asi queda en el log y la proxima pregunta contesta 503.
    db.on('error', (error) => {
        console.error('[ayuda] Se cortó una conexión con Postgres:', error.message);
    });

    console.log(`[ayuda] RAG cargado desde backend/rag (modo ${MODO})`);
    return rag;
};

// Perezosa: carga el RAG con la primera pregunta. Guarda la promesa y no el modulo, asi
// dos preguntas que llegan juntas esperan la misma carga. Si falla no guarda nada, y la
// proxima pregunta lo vuelve a intentar.
let carga = null;

const cargarRag = () => {
    if (!carga) {
        carga = importarRag().catch((error) => {
            carga = null;
            throw error;
        });
    }

    return carga;
};

const estado = () => ({ activo: MODO !== 'off', modo: MODO });

// Devuelve { respuesta, fuentes, recuperados, umbral, modo }. Si algo falla, el error
// real va al log y la persona recibe un mensaje que entiende: un ECONNREFUSED no le
// dice nada a quien pregunta, y "no está disponible" no le sirve a quien lo arregla.
const preguntar = async (pregunta) => {
    if (MODO === 'off') {
        throw crearErrorAyuda(503, "El Portero está apagado");
    }

    try {
        const rag = await cargarRag();
        const { respuesta, fuentes, recuperados, umbral, modo } = await rag.preguntarRAG(pregunta, { modo: MODO });
        return { respuesta, fuentes, recuperados, umbral, modo };
    } catch (error) {
        console.error('[ayuda] No se pudo contestar la pregunta:', error);

        // Google limito los pedidos, y api.mjs ya reintento tres veces (a los 10, 20 y
        // 30 segundos) antes de rendirse
        if (/respondió 429/.test(error.message)) {
            throw crearErrorAyuda(503, "El Portero está con mucha gente, probá en un rato");
        }

        // Ollama o Postgres caidos, o el .env del RAG incompleto
        throw crearErrorAyuda(503, "El Portero no está disponible en este momento");
    }
};

module.exports = { estado, preguntar };
