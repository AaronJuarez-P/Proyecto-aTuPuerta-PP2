import { useState } from 'react'
import './Header.css'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#inicio" aria-label="ATuPuerta, volver al inicio"><span aria-hidden="true">🚪</span> ATuPuerta</a>
        <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? 'Cerrar menú' : 'Menú'} <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
        </button>
        <nav id="main-navigation" className={`main-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Navegación principal">
          <a href="#comercios" onClick={() => setMenuOpen(false)}>Comercios</a>
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Cómo funciona</a>
          <a className="nav-cta" href="#para-todos" onClick={() => setMenuOpen(false)}>Conocé ATuPuerta <span aria-hidden="true">↗</span></a>
        </nav>
      </div>
    </header>
  )
}
