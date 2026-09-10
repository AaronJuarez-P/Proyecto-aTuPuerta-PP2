import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Perfil.css'

export default function Perfil() {
  const usuarioGuardado = localStorage.getItem('usuario')
  const usuario = usuarioGuardado ? JSON.parse(usuarioGuardado) : null

  if (!usuario) {
    window.location.href = '/login'
    return null
  }

  function cerrarSesion() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    window.location.href = '/'
  }

  return (
    <>
      <Header />

      <main className="perfil-page">
        <section className="perfil-container">
          <div className="perfil-header">
            <div className="perfil-avatar">
              👤
            </div>

            <div>
              <p className="perfil-label">Mi cuenta</p>
              <h1>{usuario.nombre}</h1>
              <p className="perfil-rol">Cliente</p>
            </div>
          </div>

          <div className="perfil-card">
            <h2>Mis datos</h2>

            <div className="perfil-datos">
              <div className="dato">
                <span>Nombre</span>
                <strong>{usuario.nombre}</strong>
              </div>

              <div className="dato">
                <span>Correo electrónico</span>
                <strong>{usuario.correo}</strong>
              </div>

              <div className="dato">
                <span>Teléfono</span>
                <strong>{usuario.telefono || 'No especificado'}</strong>
              </div>

              <div className="dato">
                <span>Tipo de cuenta</span>
                <strong>Cliente</strong>
              </div>
            </div>
          </div>

          <div className="perfil-acciones">
            <a href="/pedidos" className="perfil-button">
              📦 Mis pedidos
            </a>

            <a href="/comercios" className="perfil-button secondary">
              🛍️ Ver comercios
            </a>

            <button
              className="perfil-button logout"
              onClick={cerrarSesion}
            >
              Cerrar sesión
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}