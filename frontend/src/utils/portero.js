// Cómo se muestran las respuestas del Portero, el asistente de ayuda. Sin imports a
// propósito: así estas funciones se pueden probar con Node, sin el navegador.

// La frase exacta de backend/rag/prompt.txt (NO_LO_ENCUENTRO en backend/rag/rag.mjs)
export const NO_LO_ENCUENTRO = 'No lo encuentro en los documentos.'

// La frase exacta de prompt.txt. Se compara el comienzo: si el modelo le agregara algo,
// igual cuenta como que no está.
export const esNoLoEncuentro = (respuesta) => respuesta.trim().startsWith(NO_LO_ENCUENTRO.slice(0, -1))

const RENGLON_FUENTE = /^[\s*]*fuentes?[\s*]*:/i

// El modelo termina con un renglón "Fuente: …" (lo pide prompt.txt). Se saca del texto
// porque la fuente va aparte, al pie (fuentesDeLaRespuesta). También se sacan los ** de
// negrita de Markdown, que acá se verían tal cual.
export const sinFuente = (respuesta) =>
  respuesta
    .trim()
    .split('\n')
    .filter((renglon) => !RENGLON_FUENTE.test(renglon))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .trim()

// "## ¿Cómo pago mi pedido?" -> "¿Cómo pago mi pedido?"
const sinNumerales = (texto) => texto.replace(/#+\s*/g, '').trim()

// "archivo · sección", como la etiqueta de backend/rag/rag.mjs pero sin los "##"
export const etiqueta = ({ fuente, seccion }) => (seccion ? `${fuente} · ${sinNumerales(seccion)}` : fuente)

// De dónde sale una respuesta: las fuentes que el modelo cita en su renglón "Fuente:",
// buscadas entre las que le mandó el backend. Así se muestran limpias, sin los guiones ni
// el "##" que a veces copia ("Fuente: --- ayuda-clientes.md · ## ¿Cómo pago mi pedido? ---"),
// y solo si son fragmentos que de verdad recibió. Si no reconoce ninguna, o si no hay
// renglón (en modo faq no lo hay), son todas las que recibió: no tuvo otra cosa para
// responder.
export function fuentesDeLaRespuesta(respuesta, fuentes) {
  const citado = sinNumerales(
    respuesta
      .split('\n')
      .filter((renglon) => RENGLON_FUENTE.test(renglon))
      .join(' ')
      .replace(/-{2,}|\*/g, ' '),
  ).replace(/\s+/g, ' ')

  const citadas = fuentes.filter((fuente) => citado.includes(etiqueta(fuente)))
  return citadas.length > 0 ? citadas : fuentes
}
