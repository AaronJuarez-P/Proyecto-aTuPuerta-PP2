import { createContext, useContext } from 'react'

export const CarritoContext = createContext(null)

// { carrito, cantidad, error, recargar, agregar, cambiarCantidad, quitar, confirmar }
// carrito es null mientras carga o si la sesión no es de cliente.
export function useCarrito() {
  const contexto = useContext(CarritoContext)

  if (!contexto) {
    throw new Error('useCarrito tiene que usarse adentro de <CarritoProvider>')
  }

  return contexto
}
