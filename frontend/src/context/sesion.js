import { createContext, useContext } from 'react'

// Separado de SesionProvider.jsx para que ese archivo exporte solo el componente
// (lo pide la regla only-export-components de oxlint, por el hot reload de Vite).
export const SesionContext = createContext(null)

// { sesion, usuario, entrar, salir, olvidarSesion, actualizarUsuario, avisoSesion, limpiarAvisoSesion }
export function useSesion() {
  const contexto = useContext(SesionContext)

  if (!contexto) {
    throw new Error('useSesion tiene que usarse adentro de <SesionProvider>')
  }

  return contexto
}
