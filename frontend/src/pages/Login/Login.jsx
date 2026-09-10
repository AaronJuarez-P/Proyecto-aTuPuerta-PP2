import { useState } from 'react'
import './Login.css'

const API_URL = 'http://localhost:4000/api'

export default function Login() {
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function manejarLogin(e) {
    e.preventDefault()
  
    setError('')
    setCargando(true)
  
    // Usuario de prueba
    const usuarioPrueba = {
      correo: 'gonzalo@test.com',
      contrasena: '123456',
      usuario: {
        id: 1,
        nombre: 'Gonzalo',
        correo: 'gonzalo@test.com',
        rol: 'cliente',
      },
    }
  
    try {
      // Simulamos un pequeño tiempo de carga
      await new Promise(resolve => setTimeout(resolve, 500))
  
      if (
        correo !== usuarioPrueba.correo ||
        contrasena !== usuarioPrueba.contrasena
      ) {
        throw new Error('Correo o contraseña incorrectos')
      }
  
      // Guardamos los datos como haría el backend
      localStorage.setItem('token', 'token-prueba')
      localStorage.setItem(
        'usuario',
        JSON.stringify(usuarioPrueba.usuario)
      )
  
      console.log('Login correcto:', usuarioPrueba.usuario)
  
      window.location.href = '/'
    } catch (error) {
      console.error(error)
      setError(error.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">

        <a href="/" className="login-brand">
          🚪 ATuPuerta
        </a>

        <h1>Iniciar sesión</h1>

        <p className="login-description">
          Ingresá a tu cuenta para continuar.
        </p>

        <form onSubmit={manejarLogin}>

          <div className="form-group">
            <label htmlFor="correo">Correo electrónico</label>

            <input
              id="correo"
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tu@email.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="contrasena">Contraseña</label>

            <input
              id="contrasena"
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Tu contraseña"
              required
            />
          </div>

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={cargando}
          >
            {cargando ? 'Ingresando...' : 'Iniciar sesión'}
          </button>

        </form>

        <p className="register-link">
          ¿No tenés una cuenta? <a href="/registro">Registrate</a>
        </p>

      </section>
    </main>
  )
}