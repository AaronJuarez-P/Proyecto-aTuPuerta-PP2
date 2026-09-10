import { useEffect, useState } from 'react'
import './Header.css'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [cantidadCarrito, setCantidadCarrito] = useState(0)

  const esPaginaSimple = [
    '/checkout',
    '/carrito',
    '/perfil'
  ].includes(window.location.pathname)

  const usuarioGuardado = localStorage.getItem('usuario')

  const usuario = usuarioGuardado
    ? JSON.parse(usuarioGuardado)
    : null

  useEffect(() => {
    function actualizarCantidad() {
      const carritoGuardado =
        JSON.parse(localStorage.getItem('carrito')) || []

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

        {/* ============================= */}
        {/* IZQUIERDA                     */}
        {/* ============================= */}

        <div className="header-left">

          {!esPaginaSimple && (
            <>
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
            </>
          )}

        </div>

        {/* ============================= */}
        {/* LOGO                           */}
        {/* ============================= */}

        <a
          className="brand"
          href="/"
          aria-label="ATuPuerta, volver al inicio"
        >
          <span aria-hidden="true">
            🚪
          </span>

          ATuPuerta
        </a>

        {/* ============================= */}
        {/* DERECHA                        */}
        {/* ============================= */}

        <div className="header-right">

          {usuario ? (
            <>
              {/* ========================= */}
              {/* CARRITO                    */}
              {/* ========================= */}

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

              {/* ========================= */}
              {/* USUARIO                    */}
              {/* ========================= */}

              {esPaginaSimple ? (
                <a
                  href="/perfil"
                  className="profile-button"
                  onClick={() => setMenuOpen(false)}
                >
                  👤 Mi perfil
                </a>
              ) : (
                <a
                  href="/perfil"
                  className="profile-button"
                  onClick={() => setMenuOpen(false)}
                >
                  👤 {usuario.nombre}
                </a>
              )}

              {/* ========================= */}
              {/* PANELES                    */}
              {/* ========================= */}

              {!esPaginaSimple && (
                <>
                  {usuario.rol === 'comercio' && (
                    <a
                      href="/comercio-admin"
                      className="profile-button"
                      onClick={() => setMenuOpen(false)}
                    >
                      Panel de comercio
                    </a>
                  )}

                  {usuario.rol === 'repartidor' && (
                    <a
                      href="/repartidor-admin"
                      className="profile-button"
                      onClick={() => setMenuOpen(false)}
                    >
                      Panel de repartidor
                    </a>
                  )}

                  {usuario.rol === 'administrador' && (
                    <a
                      href="/admin"
                      className="profile-button"
                      onClick={() => setMenuOpen(false)}
                    >
                      Panel de administrador
                    </a>
                  )}
                </>
              )}

              {/* ========================= */}
              {/* CERRAR SESIÓN              */}
              {/* ========================= */}

              <button
                className="logout-button"
                onClick={cerrarSesion}
              >
                Cerrar sesión
              </button>
            </>
          ) : (
            !esPaginaSimple && (
              <a
                className="nav-cta"
                href="/login"
                onClick={() => setMenuOpen(false)}
              >
                Iniciar sesión
                <span aria-hidden="true">↗</span>
              </a>
            )
          )}

        </div>

        {/* ============================= */}
        {/* MENÚ MOBILE                   */}
        {/* ============================= */}

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

      </div>

      {/* Navegación mobile */}
      <nav
        id="main-navigation"
        className={`main-navigation ${
          menuOpen ? 'is-open' : ''
        }`}
      >
        {!esPaginaSimple && (
          <>
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
          </>
        )}

        {usuario && (
          <>
            <a
              href="/carrito"
              onClick={() => setMenuOpen(false)}
            >
              🛒 Carrito
            </a>

            <a
              href="/perfil"
              onClick={() => setMenuOpen(false)}
            >
              👤 {esPaginaSimple ? 'Mi perfil' : usuario.nombre}
            </a>

            <button
              onClick={cerrarSesion}
            >
              Cerrar sesión
            </button>
          </>
        )}
      </nav>
    </header>
  )
}