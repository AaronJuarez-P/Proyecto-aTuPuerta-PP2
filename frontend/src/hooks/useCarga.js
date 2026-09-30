import { useCallback, useEffect, useEffectEvent, useState } from 'react'

// Carga datos de la API al montar la pantalla y cada vez que cambian las dependencias.
// Devuelve { datos, cargando, error, recargar, setDatos }.
//
// Mientras recarga conserva los datos anteriores, para que la pantalla no parpadee al
// cambiar un filtro. Si cambian las dependencias o la pantalla se desmonta antes de que
// conteste, la respuesta vieja se descarta.
export function useCarga(cargar, dependencias = []) {
  const [version, setVersion] = useState(0)

  // Identifica el pedido vigente: cambia con las dependencias y con cada recargar().
  // "cargando" y "error" se derivan de ella en vez de guardarse aparte.
  const clave = JSON.stringify([...dependencias, version])

  const [resultado, setResultado] = useState({ clave: null, datos: null, error: null })

  // cargar es una función nueva en cada render: como Effect Event se usa la última sin
  // que el efecto tenga que depender de ella
  const ejecutarCarga = useEffectEvent(() => cargar())

  useEffect(() => {
    let vigente = true

    ejecutarCarga().then(
      (datos) => {
        if (vigente) {
          setResultado({ clave, datos, error: null })
        }
      },
      (error) => {
        if (vigente) {
          setResultado((previo) => ({ clave, datos: previo.datos, error }))
        }
      }
    )

    return () => {
      vigente = false
    }
  }, [clave])

  const recargar = useCallback(() => setVersion((actual) => actual + 1), [])

  const setDatos = useCallback((actualizar) => {
    setResultado((previo) => ({
      ...previo,
      datos: typeof actualizar === 'function' ? actualizar(previo.datos) : actualizar,
    }))
  }, [])

  const vigente = resultado.clave === clave

  return {
    datos: resultado.datos,
    cargando: !vigente,
    error: vigente ? resultado.error : null,
    recargar,
    setDatos,
  }
}
