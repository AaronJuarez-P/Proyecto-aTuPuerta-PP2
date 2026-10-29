import { pedir } from './cliente'

// El Portero, el asistente de ayuda (Desarrollo con IA). Las dos rutas son públicas y van
// con token: null, así una respuesta del asistente nunca dispara "sesión vencida".

// Los mismos límites que valida el backend (ayuda.controller.js)
export const LARGO_MINIMO_PREGUNTA = 3
export const LARGO_MAXIMO_PREGUNTA = 300

// -> { activo, modo }
export const estadoAyuda = () => pedir('/ayuda/estado', { token: null })

// -> { respuesta, fuentes, recuperados, umbral, modo }
// Viaja solo la pregunta, nunca el historial: cada pregunta se busca sola.
export const preguntarAlPortero = (pregunta) =>
  pedir('/ayuda/preguntar', { metodo: 'POST', body: { pregunta }, token: null })
