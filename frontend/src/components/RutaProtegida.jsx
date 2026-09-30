import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useSesion } from '../context/sesion'
import { etiquetaDelRol, inicioDelRol } from '../utils/roles'
import { EstadoVacio } from './Comunes/Comunes'

// Envuelve las rutas que necesitan sesión. Sin sesión manda al login y, al entrar,
// vuelve a donde estaba. Con la sesión de otro rol explica por qué no puede entrar en
// vez de redirigir en silencio: la sesión es una sola por cuenta, y es fácil olvidarse
// de con cuál se entró.
export default function RutaProtegida({ roles }) {
  const { usuario } = useSesion()
  const ubicacion = useLocation()

  if (!usuario) {
    const volver = encodeURIComponent(ubicacion.pathname + ubicacion.search)
    return <Navigate to={`/login?volver=${volver}`} replace />
  }

  if (roles && !roles.includes(usuario.rol)) {
    const paraQuien = roles.map((rol) => etiquetaDelRol(rol).toLowerCase()).join(' o ')

    return (
      <main className="pagina">
        <div className="pagina-angosta">
          <EstadoVacio
            icono="🔒"
            titulo="Esta sección no es para tu sesión"
            accion={
              <Link className="boton boton-primario" to={inicioDelRol(usuario.rol)}>
                Ir a mi inicio
              </Link>
            }
          >
            Es para {paraQuien}, y ahora estás con la sesión de{' '}
            {etiquetaDelRol(usuario.rol).toLowerCase()}. Para entrar, cerrá sesión e
            iniciala con el rol que corresponde.
          </EstadoVacio>
        </div>
      </main>
    )
  }

  return <Outlet />
}
