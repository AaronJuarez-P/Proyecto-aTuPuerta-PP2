import { useCallback, useEffect, useMemo, useState } from 'react'
import { CarritoContext } from './carrito'
import { useSesion } from './sesion'
import {
  agregarAlCarrito,
  cambiarCantidadEnCarrito,
  confirmarCarrito,
  obtenerCarrito,
  quitarDelCarrito,
} from '../api/carrito'

// El carrito de la sesión de cliente, compartido entre el header (contador), la ficha
// del comercio, el carrito y el checkout. Cada cambio vuelve a pedirlo al backend, que
// es quien sabe los precios, el stock y qué sigue disponible.
export default function CarritoProvider({ children }) {
  const { usuario } = useSesion()
  const usuarioId = usuario?.rol === 'cliente' ? usuario.id : null

  // Se guarda de quién es el carrito cargado: si cambia la sesión, el anterior no se
  // muestra aunque todavía esté en el estado
  const [estado, setEstado] = useState({ usuarioId: null, datos: null, error: null })

  const recargar = useCallback(async () => {
    if (!usuarioId) {
      return null
    }

    try {
      const datos = await obtenerCarrito()
      setEstado({ usuarioId, datos, error: null })
      return datos
    } catch (error) {
      setEstado((previo) => ({ usuarioId, datos: previo.usuarioId === usuarioId ? previo.datos : null, error }))
      throw error
    }
  }, [usuarioId])

  useEffect(() => {
    if (!usuarioId) {
      return
    }

    let vigente = true

    obtenerCarrito().then(
      (datos) => vigente && setEstado({ usuarioId, datos, error: null }),
      (error) => vigente && setEstado({ usuarioId, datos: null, error })
    )

    return () => {
      vigente = false
    }
  }, [usuarioId])

  const agregar = useCallback(async (idProducto, cantidad = 1) => {
    await agregarAlCarrito(idProducto, cantidad)
    return recargar()
  }, [recargar])

  const cambiarCantidad = useCallback(async (idProducto, cantidad) => {
    await cambiarCantidadEnCarrito(idProducto, cantidad)
    return recargar()
  }, [recargar])

  const quitar = useCallback(async (idProducto) => {
    await quitarDelCarrito(idProducto)
    return recargar()
  }, [recargar])

  const confirmar = useCallback(async (direccionEntrega) => {
    const resultado = await confirmarCarrito(direccionEntrega)
    await recargar().catch(() => {})
    return resultado
  }, [recargar])

  const esDeEstaSesion = usuarioId !== null && estado.usuarioId === usuarioId
  const carrito = esDeEstaSesion ? estado.datos : null

  const cantidad = useMemo(
    () => (carrito?.comercios ?? []).reduce(
      (total, comercio) => total + comercio.items.reduce((suma, item) => suma + item.cantidad, 0),
      0
    ),
    [carrito]
  )

  const valor = useMemo(() => ({
    carrito,
    cantidad,
    error: esDeEstaSesion ? estado.error : null,
    recargar,
    agregar,
    cambiarCantidad,
    quitar,
    confirmar,
  }), [carrito, cantidad, esDeEstaSesion, estado.error, recargar, agregar, cambiarCantidad, quitar, confirmar])

  return <CarritoContext.Provider value={valor}>{children}</CarritoContext.Provider>
}
