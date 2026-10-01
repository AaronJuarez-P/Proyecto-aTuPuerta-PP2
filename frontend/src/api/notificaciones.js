import { pedir } from './cliente'

// Notificaciones (CU27): las propias y las generales del rol de la sesión

// { no_leidas, pagina, limite } -> { notificaciones, no_leidas, paginacion }
// no_leidas (el número) viene siempre, con o sin el filtro
export const listarNotificaciones = (filtros = {}) => pedir('/notificaciones', { query: filtros })

export const marcarLeida = (id) => pedir(`/notificaciones/${id}/leida`, { metodo: 'PATCH' })

export const marcarTodasLeidas = () => pedir('/notificaciones/leidas', { metodo: 'PATCH' })

// Web Push. -> { push_habilitado, clave_publica }. Pública: no hace falta sesión.
export const obtenerClavePublica = () => pedir('/notificaciones/clave-publica', { token: null })

// La PushSubscription del navegador: { endpoint, keys: { p256dh, auth } }
export const guardarSuscripcionPush = (suscripcion) =>
  pedir('/notificaciones/suscribir', { metodo: 'POST', body: suscripcion })
