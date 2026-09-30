import { useNavigate } from 'react-router'
import { useSesion } from '../../context/sesion'
import './Perfil.css'

export default function Perfil() {
  const { usuario, salir } = useSesion()
  const navigate = useNavigate()

  async function cerrarSesion() {
    navigate('/')
    await salir()
  }

  return (
    <>

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
                <strong>{usuario.email}</strong>
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

    </>
  )
}