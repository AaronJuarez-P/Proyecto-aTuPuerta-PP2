import { useEffect, useState } from 'react'
import './Header.css'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cantidadCarrito, setCantidadCarrito] = useState(0)

  const usuarioGuardado = localStorage.getItem('usuario')
  const usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null

  useEffect(() => {
    function actualizarCantidad() {
      const carritoGuardado = JSON.parse(localStorage.getItem('carrito')) || []

      const cantidad = carritoGuardado.reduce(
        (total, producto) => total + producto.cantidad,
        0
      )

      setCantidadCarrito(cantidad)
    }

    actualizarCantidad()

    window.addEventListener('storage', actualizarCantidad)

    return () => {
      window.removeEventListener('storage', actualizarCantidad)
    }
  }, [])

  function cerrarSesion() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')

    window.location.href = '/'
  }

  return (
    <header className="site-header">
      <div className="header-inner">

        <a
          className="brand"
          href="/"
          aria-label="ATuPuerta, volver al inicio"
        >
          <span aria-hidden="true">🚪</span> ATuPuerta
        </a>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? 'Cerrar menú' : 'Menú'}
          <span aria-hidden="true">
            {menuOpen ? '×' : '☰'}
          </span>
        </button>

        <nav
          id="main-navigation"
          className={`main-navigation${menuOpen ? ' is-open' : ''}`}
          aria-label="Navegación principal"
        >

          <a
            href="/comercios"
            onClick={() => setMenuOpen(false)}
          >
            Comercios
          </a>

          <a
            href="/#como-funciona"
            onClick={() => setMenuOpen(false)}
          >
            Cómo funciona
          </a>

          {usuario && (
  <a
    href="/carrito"
    className="cart-link"
    onClick={() => setMenuOpen(false)}
  >
    🛒 Carrito

    {cantidadCarrito > 0 && (
      <span className="cart-counter">
        {cantidadCarrito}
      </span>
    )}
  </a>
)}

          {usuario ? (
            <>
              <span className="user-name">
                👤 {usuario.nombre}
              </span>

              <a
                href="/perfil"
                className="profile-button"
                onClick={() => setMenuOpen(false)}
              >
                Mi perfil
              </a>

              <button
                className="logout-button"
                onClick={cerrarSesion}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            <a
              className="nav-cta"
              href="/login"
              onClick={() => setMenuOpen(false)}
            >
              Iniciar sesión
              <span aria-hidden="true">↗</span>
            </a>
          )}

        </nav>
      </div>
    </header>
  )
}