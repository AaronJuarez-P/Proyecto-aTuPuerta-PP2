import { useCallback, useEffect, useMemo, useState } from 'react'
import { SesionContext } from './sesion'
import {
  EVENTO_SESION_VENCIDA,
  borrarSesion,
  guardarSesion,
  leerSesionGuardada,
} from '../api/cliente'
import { cerrarSesionEnServidor, iniciarSesion } from '../api/auth'
import { obtenerPerfil } from '../api/perfil'

// Claves que usaba el prototipo del front, cuando todo se guardaba en el navegador con
// datos inventados. Se borran para que no queden pedidos o usuarios falsos dando vueltas.
const CLAVES_DEL_PROTOTIPO = ['token', 'usuario', 'usuarios', 'carrito', 'pedidos', 'pedidoActual']

export default function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leerSesionGuardada)
  const [avisoSesion, setAvisoSesion] = useState('')

  useEffect(() => {
    for (const clave of CLAVES_DEL_PROTOTIPO) {
      localStorage.removeItem(clave)
    }
  }, [])

  // El backend dijo que la sesión ya no sirve: venció el token, se abrió otra sesión de
  // la misma cuenta (es una sola por cuenta) o un administrador la suspendió. Se olvida
  // acá y RutaProtegida manda al login, que muestra el motivo.
  useEffect(() => {
    function alVencer(evento) {
      borrarSesion()
      setSesion(null)
      setAvisoSesion(evento.detail?.mensaje ?? 'Tu sesión terminó. Iniciá sesión de nuevo.')
    }

    window.addEventListener(EVENTO_SESION_VENCIDA, alVencer)
    return () => window.removeEventListener(EVENTO_SESION_VENCIDA, alVencer)
  }, [])

  // localStorage es compartido entre pestañas: si en otra se entra o se sale, esta se entera
  useEffect(() => {
    function alCambiarStorage(evento) {
      if (evento.key === 'sesion' || evento.key === null) {
        setSesion(leerSesionGuardada())
      }
    }

    window.addEventListener('storage', alCambiarStorage)
    return () => window.removeEventListener('storage', alCambiarStorage)
  }, [])

  // Una sesión guardada se confirma contra el backend al abrir la app. Si el token ya no
  // sirve, el cliente HTTP avisa y el efecto de arriba la borra. Si sirve, se trae el
  // nombre al día, que lo puede haber cambiado un administrador.
  const token = sesion?.token

  useEffect(() => {
    if (!token) {
      return
    }

    let vigente = true

    obtenerPerfil()
      .then(({ usuario: cuenta }) => {
        if (!vigente) {
          return
        }

        setSesion((actual) => {
          if (!actual || actual.token !== token) {
            return actual
          }

          const nombre = actual.usuario.rol === 'comercio'
            ? cuenta.perfiles.comercio?.nombre ?? actual.usuario.nombre
            : cuenta.nombre

          if (nombre === actual.usuario.nombre) {
            return actual
          }

          const actualizada = { ...actual, usuario: { ...actual.usuario, nombre } }
          guardarSesion(actualizada)
          return actualizada
        })
      })
      .catch(() => {})

    return () => {
      vigente = false
    }
  }, [token])

  const entrar = useCallback(async (rol, credenciales) => {
    const nueva = await iniciarSesion(rol, credenciales)
    guardarSesion(nueva)
    setSesion(nueva)
    setAvisoSesion('')
    return nueva.usuario
  }, [])

  const salir = useCallback(async () => {
    try {
      await cerrarSesionEnServidor(leerSesionGuardada()?.usuario?.rol)
    } catch {
      // Si el token ya no servía no hay nada que cerrar del lado del servidor
    }

    borrarSesion()
    setSesion(null)
    setAvisoSesion('')
  }, [])

  // Para cuando el backend ya cambió la sesión por su cuenta: registrar un comercio o un
  // repartidor abre esa sesión nueva y el token de cliente que había deja de servir.
  const olvidarSesion = useCallback(() => {
    borrarSesion()
    setSesion(null)
  }, [])

  const limpiarAvisoSesion = useCallback(() => setAvisoSesion(''), [])

  // Después de editar el perfil: el nombre del header sale de acá
  const actualizarUsuario = useCallback((cambios) => {
    setSesion((actual) => {
      if (!actual) {
        return actual
      }

      const actualizada = { ...actual, usuario: { ...actual.usuario, ...cambios } }
      guardarSesion(actualizada)
      return actualizada
    })
  }, [])

  const valor = useMemo(() => ({
    sesion,
    usuario: sesion?.usuario ?? null,
    entrar,
    salir,
    olvidarSesion,
    actualizarUsuario,
    avisoSesion,
    limpiarAvisoSesion,
  }), [sesion, entrar, salir, olvidarSesion, actualizarUsuario, avisoSesion, limpiarAvisoSesion])

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}
