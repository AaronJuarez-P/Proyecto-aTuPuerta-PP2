import { useCallback, useEffect, useMemo, useState } from 'react'
import { NotificacionesContext } from './notificaciones'
import { useSesion } from './sesion'
import { listarNotificaciones } from '../api/notificaciones'

// Cada cuánto se vuelve a preguntar cuántas hay sin leer. El backend no las empuja por
// el socket (las salas son por pedido), así que la campanita las va a buscar. También
// se pregunta al volver a la pestaña.
const CONSULTAR_CADA_MS = 30000

export default function NotificacionesProvider({ children }) {
  const { usuario } = useSesion()
  const usuarioId = usuario?.id ?? null
  const rol = usuario?.rol ?? null

  // De qué sesión es el número: si cambia la sesión, el anterior no se muestra
  const [estado, setEstado] = useState({ clave: null, noLeidas: 0 })
  const clave = usuarioId ? `${usuarioId}:${rol}` : null

  const recargar = useCallback(async () => {
    if (!clave) {
      return
    }

    try {
      const { no_leidas: noLeidas } = await listarNotificaciones({ no_leidas: true, limite: 1 })
      setEstado({ clave, noLeidas })
    } catch {
      // Sin red o sin sesión: la campanita se queda como estaba
    }
  }, [clave])

  useEffect(() => {
    if (!clave) {
      return
    }

    let vigente = true

    const consultar = () => {
      listarNotificaciones({ no_leidas: true, limite: 1 })
        .then(({ no_leidas: noLeidas }) => vigente && setEstado({ clave, noLeidas }))
        .catch(() => {})
    }

    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        consultar()
      }
    }

    consultar()
    const intervalo = setInterval(consultar, CONSULTAR_CADA_MS)
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vigente = false
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [clave])

  const noLeidas = clave && estado.clave === clave ? estado.noLeidas : 0

  const valor = useMemo(() => ({ noLeidas, recargar }), [noLeidas, recargar])

  return <NotificacionesContext.Provider value={valor}>{children}</NotificacionesContext.Provider>
}
