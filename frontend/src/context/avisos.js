import { createContext, useContext } from 'react'

export const AvisosContext = createContext(null)

// Devuelve avisar(mensaje, tipo): un cartelito que se va solo. tipo: 'exito' | 'error' | 'info'
export function useAvisos() {
  const avisar = useContext(AvisosContext)

  if (!avisar) {
    throw new Error('useAvisos tiene que usarse adentro de <AvisosProvider>')
  }

  return avisar
}
