// Cómo se muestran las respuestas del Portero, el asistente de ayuda. Sin imports a
// propósito: así estas funciones se pueden probar con Node, sin el navegador.

// La frase exacta de backend/rag/prompt.txt (NO_LO_ENCUENTRO en backend/rag/rag.mjs)
export const NO_LO_ENCUENTRO = 'No lo encuentro en los documentos.'

// La frase exacta de prompt.txt. Se compara el comienzo: si el modelo le agregara algo,
// igual cuenta como que no está.
export const esNoLoEncuentro = (respuesta) => respuesta.trim().startsWith(NO_LO_ENCUENTRO.slice(0, -1))

const RENGLON_FUENTE = /^[\s*]*fuentes?[\s*]*:/i

// El modelo termina con un renglón "Fuente: …" (lo pide prompt.txt). El chat muestra solo
// el texto, así que ese renglón se saca. También se sacan los ** de negrita de Markdown,
// que acá se verían tal cual.
export const sinFuente = (respuesta) =>
  respuesta
    .trim()
    .split('\n')
    .filter((renglon) => !RENGLON_FUENTE.test(renglon))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim()
