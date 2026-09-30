// Cliente HTTP de la API. Todas las llamadas del front pasan por acá: arma la URL,
// pone el token y desarma el sobre { codigo, estado, datos } que devuelve el backend
// en TODAS sus respuestas, de éxito y de error (ver "Formato de respuesta uniforme" en
// backend/readme.md).

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/+$/, '')

// El socket del seguimiento va sobre el mismo servidor que la API, sin el /api
export const SERVIDOR_URL = API_URL.replace(/\/api$/, '')

const CLAVE_SESION = 'sesion'

// Lo dispara el cliente cuando el backend dice que la sesión ya no sirve. Lo escucha
// SesionProvider, que la borra y manda al login.
export const EVENTO_SESION_VENCIDA = 'atupuerta:sesion-vencida'

// Los únicos errores que significan "tu sesión ya no sirve" son los de validarSesion
// (backend/src/middlewares/autenticacion.middleware.js). Por eso se comparan los mensajes
// y no solo el código: un 401 por "contraseña actual incorrecta" al cambiarla viene con
// un token válido y NO tiene que cerrar la sesión.
const MENSAJES_SESION_INVALIDA = [
  'Token no proporcionado',
  'Token inválido o expirado',
  'La sesión ya no es válida: iniciá sesión de nuevo',
  'Tu cuenta está suspendida o dada de baja',
]

export class ErrorApi extends Error {
  constructor(mensaje, codigo, datos = {}) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.codigo = codigo
    this.datos = datos
  }
}

export function leerSesionGuardada() {
  try {
    const sesion = JSON.parse(localStorage.getItem(CLAVE_SESION))
    return sesion?.token && sesion?.usuario ? sesion : null
  } catch {
    return null
  }
}

export function guardarSesion(sesion) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
}

export function borrarSesion() {
  localStorage.removeItem(CLAVE_SESION)
}

export const esErrorDeSesion = (mensaje) => MENSAJES_SESION_INVALIDA.includes(mensaje)

export function avisarSesionVencida(mensaje) {
  window.dispatchEvent(new CustomEvent(EVENTO_SESION_VENCIDA, { detail: { mensaje } }))
}

// Los filtros vacíos no viajan: el backend los toma como "sin filtro", pero así la URL
// queda limpia y los logs del servidor también.
function armarUrl(ruta, query) {
  const url = new URL(API_URL + ruta, window.location.origin)

  for (const [clave, valor] of Object.entries(query ?? {})) {
    if (valor !== undefined && valor !== null && valor !== '') {
      url.searchParams.set(clave, valor)
    }
  }

  return url
}

// token: undefined usa el de la sesión guardada; null no manda ninguno. Los logins y
// los registros van con null: ahí un 401 significa "credenciales incorrectas", no
// "sesión vencida".
export async function pedir(ruta, { metodo = 'GET', body, query, token } = {}) {
  const tokenUsado = token === undefined ? leerSesionGuardada()?.token : token
  const headers = {}

  if (tokenUsado) {
    headers.Authorization = tokenUsado
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let respuesta

  try {
    respuesta = await fetch(armarUrl(ruta, query), {
      method: metodo,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor. Revisá que el backend esté levantado.', 0)
  }

  let json = null

  try {
    json = await respuesta.json()
  } catch {
    json = null
  }

  const datos = json?.datos ?? {}

  if (!respuesta.ok || json?.estado === 'error') {
    const mensaje = datos.mensaje || `El servidor respondió con un error (${respuesta.status})`

    if (tokenUsado && esErrorDeSesion(mensaje)) {
      avisarSesionVencida(mensaje)
    }

    throw new ErrorApi(mensaje, respuesta.status, datos)
  }

  return datos
}
