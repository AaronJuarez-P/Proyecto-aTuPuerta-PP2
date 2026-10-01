import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { useCarrito } from '../../context/carrito'
import { useNotificaciones } from '../../context/notificaciones'
import { useSesion } from '../../context/sesion'
import { etiquetaDelRol } from '../../utils/roles'
import './Header.css'

// Qué ve cada rol en la barra. La sesión es una sola por cuenta (usuarios.rol en el
// backend), así que la navegación sigue al rol con el que se entró.
const NAVEGACION = {
  anonimo: [
    { a: '/comercios', texto: 'Comercios' },
    { a: '/#como-funciona', texto: 'Cómo funciona' },
  ],
  cliente: [
    { a: '/comercios', texto: 'Comercios' },
    { a: '/pedidos', texto: 'Mis pedidos' },
    { a: '/reclamos', texto: 'Reclamos' },
  ],
  comercio: [
    { a: '/comercio', texto: 'Pedidos y ventas', exacto: true },
    { a: '/comercio/productos', texto: 'Productos' },
    { a: '/reclamos', texto: 'Reclamos' },
  ],
  repartidor: [
    { a: '/repartidor', texto: 'Mis entregas' },
    { a: '/reclamos', texto: 'Reclamos' },
  ],
  administrador: [
    { a: '/admin', texto: 'Panel', exacto: true },
  ],
}

export default function Header() {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const { usuario, salir } = useSesion()
  const { cantidad: cantidadCarrito } = useCarrito()
  const { noLeidas } = useNotificaciones()
  const navigate = useNavigate()

  const cerrarMenu = () => setMenuAbierto(false)

  // Primero se sale de la ruta actual: si es protegida y la sesión se borrara antes, la
  // ruta mandaría al login en vez de al inicio
  async function cerrarSesion() {
    cerrarMenu()
    navigate('/')
    await salir()
  }

  const enlaces = (NAVEGACION[usuario?.rol] ?? NAVEGACION.anonimo).map(({ a, texto, exacto }) => (
    <NavLink key={a} to={a} end={exacto} onClick={cerrarMenu}>
      {texto}
    </NavLink>
  ))

  const acciones = usuario ? (
    <>
      <Link to="/notificaciones" className="cart-link" onClick={cerrarMenu} aria-label={noLeidas > 0 ? `Notificaciones: ${noLeidas} sin leer` : 'Notificaciones'}>
        🔔
        {noLeidas > 0 && <span className="cart-counter campanita-contador">{noLeidas > 99 ? '99+' : noLeidas}</span>}
      </Link>

      {usuario.rol === 'cliente' && (
        <Link to="/carrito" className="cart-link" onClick={cerrarMenu}>
          🛒 Carrito
          {cantidadCarrito > 0 && (
            <span className="cart-counter" aria-label={`${cantidadCarrito} productos`}>
              {cantidadCarrito}
            </span>
          )}
        </Link>
      )}

      <Link to="/perfil" className="profile-button" onClick={cerrarMenu}>
        👤 {usuario.nombre}
        {usuario.rol !== 'cliente' && (
          <span className="rol-sesion">{etiquetaDelRol(usuario.rol)}</span>
        )}
      </Link>

      <button type="button" className="logout-button" onClick={cerrarSesion}>
        Cerrar sesión
      </button>
    </>
  ) : (
    <>
      <Link to="/registro" onClick={cerrarMenu}>
        Registrarse
      </Link>

      <Link className="nav-cta" to="/login" onClick={cerrarMenu}>
        Iniciar sesión
        <span aria-hidden="true">↗</span>
      </Link>
    </>
  )

  return (
    <header className="site-header">
      <div className="header-inner">
        <nav className="header-left" aria-label="Principal">
          {enlaces}
        </nav>

        <Link className="brand" to="/" aria-label="ATuPuerta, volver al inicio" onClick={cerrarMenu}>
          <span aria-hidden="true">🚪</span>
          ATuPuerta
        </Link>

        <div className="header-right">{acciones}</div>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuAbierto}
          aria-controls="main-navigation"
          onClick={() => setMenuAbierto(!menuAbierto)}
        >
          {menuAbierto ? 'Cerrar menú' : 'Menú'}
          <span aria-hidden="true">{menuAbierto ? '×' : '☰'}</span>
        </button>
      </div>

      <nav
        id="main-navigation"
        className={`main-navigation ${menuAbierto ? 'is-open' : ''}`}
        aria-label="Menú"
      >
        {enlaces}
        {acciones}
      </nav>
    </header>
  )
}
