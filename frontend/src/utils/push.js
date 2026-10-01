import { guardarSuscripcionPush, obtenerClavePublica } from '../api/notificaciones'

// Notificaciones del navegador (Web Push). Son un extra: las notificaciones se guardan
// en el backend igual, y la campanita las muestra aunque esto no esté activado.

export const pushSoportado = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

// Si el servicio de push del navegador no contesta, la suscripción no termina nunca
const ESPERA_MAXIMA_MS = 15000

const conTiempoMaximo = (promesa) =>
  Promise.race([
    promesa,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo agotado')), ESPERA_MAXIMA_MS)),
  ])

// La clave VAPID llega en base64url y PushManager la quiere en bytes
function claveABytes(base64url) {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
}

// -> { soportado, habilitado (el backend tiene claves VAPID), clave, activo, permiso }
export async function consultarEstadoPush() {
  if (!pushSoportado()) {
    return { soportado: false }
  }

  const { push_habilitado: habilitado, clave_publica: clave } = await obtenerClavePublica()
  const registro = await navigator.serviceWorker.getRegistration('/sw.js')
  const suscripcion = await registro?.pushManager.getSubscription()

  return {
    soportado: true,
    habilitado: Boolean(habilitado),
    clave,
    activo: Boolean(suscripcion) && Notification.permission === 'granted',
    permiso: Notification.permission,
  }
}

// Pide permiso, registra el service worker, se suscribe y le pasa la suscripción al
// backend, que la asocia a la cuenta de la sesión
export async function activarPush(clave) {
  const permiso = await Notification.requestPermission()

  if (permiso !== 'granted') {
    throw new Error('No diste permiso para mostrar notificaciones. Lo podés cambiar en la configuración del navegador.')
  }

  const registro = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let suscripcion

  try {
    suscripcion =
      (await registro.pushManager.getSubscription()) ??
      (await conTiempoMaximo(registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clave) })))
  } catch (error) {
    if (error.message === 'tiempo agotado') {
      throw new Error('El servicio de notificaciones del navegador no respondió. Probá de nuevo en un rato.')
    }

    // El mensaje del navegador ("Registration failed - permission denied") no le dice nada
    // a nadie. El caso típico: Chrome no permite push en las ventanas de incógnito.
    throw new Error('Este navegador no dejó activar las notificaciones. Las ventanas privadas o de incógnito no las permiten.')
  }

  await guardarSuscripcionPush(suscripcion.toJSON())
}
