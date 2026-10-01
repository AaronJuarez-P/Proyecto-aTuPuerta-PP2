import { createContext, useContext } from 'react'

export const NotificacionesContext = createContext(null)

// { noLeidas, recargar } para la campanita del header
export function useNotificaciones() {
  const contexto = useContext(NotificacionesContext)

  if (!contexto) {
    throw new Error('useNotificaciones tiene que usarse adentro de <NotificacionesProvider>')
  }

  return contexto
}
