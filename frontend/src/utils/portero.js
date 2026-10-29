// Cómo se muestran las respuestas del Portero, el asistente de ayuda. Sin imports a
// propósito: así estas funciones se pueden probar con Node, sin el navegador.

// La frase exacta de backend/rag/prompt.txt (NO_LO_ENCUENTRO en backend/rag/rag.mjs)
export const NO_LO_ENCUENTRO = 'No lo encuentro en los documentos.'

// "## ¿Cómo pago mi pedido?" -> "¿Cómo pago mi pedido?"
const sinNumerales = (texto) => texto.replace(/#+\s*/g, '').trim()

// "archivo · sección", como la etiqueta de backend/rag/rag.mjs pero sin los "##"
export const etiqueta = ({ fuente, seccion, posicion }) =>
  `${fuente} · ${seccion ? sinNumerales(seccion) : `fragmento ${posicion}`}`

// El texto de un fragmento sin su título, que ya se ve en la etiqueta
export const sinTitulo = ({ texto = '', seccion }) =>
  seccion && texto.startsWith(seccion) ? texto.slice(seccion.length).trim() : texto

// La frase exacta de prompt.txt. Se compara el comienzo: si el modelo le agregara algo,
// igual cuenta como que no está.
export const esNoLoEncuentro = (respuesta) => respuesta.trim().startsWith(NO_LO_ENCUENTRO.slice(0, -1))

const RENGLON_FUENTE = /^[\s*]*fuentes?[\s*]*:/i

// El modelo termina con un renglón "Fuente: …" (lo pide prompt.txt) y a veces copia los
// guiones y el "##" de la etiqueta del fragmento:
//   "Fuente: --- ayuda-clientes.md · ## ¿Cómo pago mi pedido? ---"
// Se separa del texto para mostrarlo limpio, como pie de la burbuja. Del texto también
// se sacan los ** de negrita de Markdown, que acá se verían tal cual.
export function separarFuente(respuesta) {
  const renglones = respuesta.trim().split('\n')
  const indice = renglones.findLastIndex((renglon) => RENGLON_FUENTE.test(renglon))
  const sinNegritas = (texto) => texto.replace(/\*\*(.+?)\*\*/g, '$1').trim()

  if (indice === -1) {
    return { cuerpo: sinNegritas(respuesta), fuenteCitada: null }
  }

  const fuenteCitada = renglones[indice]
    .replace(RENGLON_FUENTE, '')
    .split(/-{2,}/)
    .map((parte) => sinNumerales(parte.replaceAll('*', '')))
    // Si cita dos fragmentos, entre los guiones puede quedar un "y" o una coma suelta
    .filter((parte) => parte && !/^(y|e|o|[,;])$/i.test(parte))
    .join(' / ')

  return {
    cuerpo: sinNegritas(renglones.filter((_, i) => i !== indice).join('\n')),
    fuenteCitada: fuenteCitada || null,
  }
}
