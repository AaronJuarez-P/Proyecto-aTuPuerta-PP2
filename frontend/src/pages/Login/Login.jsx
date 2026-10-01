import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useSesion } from '../../context/sesion'
import { esRutaInterna, inicioDelRol } from '../../utils/roles'
import './Login.css'

// El backend tiene un login por rol: cada uno abre esa sesión en la cuenta. El de
// administrador no va en las pestañas: se entra por /login?rol=administrador.
const PESTANAS = [
  { rol: 'cliente', texto: 'Cliente' },
  { rol: 'comercio', texto: 'Comercio' },
  { rol: 'repartidor', texto: 'Repartidor' },
]

const ROLES_VALIDOS = ['cliente', 'comercio', 'repartidor', 'administrador']

const REGISTRO_POR_ROL = {
  cliente: { a: '/registro', pregunta: '¿No tenés una cuenta?', texto: 'Registrate' },
  comercio: { a: '/registro/comercio', pregunta: '¿Todavía no sumaste tu comercio?', texto: 'Registralo acá' },
  repartidor: { a: '/registro/repartidor', pregunta: '¿Querés repartir con nosotros?', texto: 'Sumate' },
}

// Las cuentas de la semilla (backend/scripts/aTuPuerta.sql), para probar rápido. Solo en
// desarrollo: en el build de producción import.meta.env.DEV es false y esto no existe.
const CUENTAS_DE_PRUEBA = import.meta.env.DEV
  ? [
      { rol: 'cliente', email: 'maria.gomez@test.com', nombre: 'María (cliente)' },
      { rol: 'cliente', email: 'juan.perez@test.com', nombre: 'Juan (cliente)' },
      { rol: 'comercio', email: 'libreria.sur@test.com', cuil: '20405060708', nombre: 'Librería del Sur' },
      { rol: 'comercio', email: 'ferreteria.central@test.com', cuil: '20304050607', nombre: 'Ferretería Central' },
      { rol: 'repartidor', email: 'lucia.repartidor@test.com', nombre: 'Lucía (repartidora)' },
      { rol: 'repartidor', email: 'carlos.repartidor@test.com', nombre: 'Carlos (repartidor)' },
      { rol: 'administrador', email: 'admin@test.com', nombre: 'Administrador' },
    ]
  : []

const CONTRASENA_DE_PRUEBA = 'Test1234!'

export default function Login() {
  const [parametros] = useSearchParams()
  const rolPedido = parametros.get('rol')
  const volver = parametros.get('volver')

  const [rol, setRol] = useState(ROLES_VALIDOS.includes(rolPedido) ? rolPedido : 'cliente')
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [cuil, setCuil] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const { entrar, avisoSesion, limpiarAvisoSesion } = useSesion()
  const navigate = useNavigate()

  const esAdministrador = rol === 'administrador'
  const registro = REGISTRO_POR_ROL[rol]

  function cambiarRol(nuevoRol) {
    setRol(nuevoRol)
    setError('')
  }

  function usarCuenta(cuenta) {
    setRol(cuenta.rol)
    setEmail(cuenta.email)
    setContrasena(CONTRASENA_DE_PRUEBA)
    setCuil(cuenta.cuil ?? '')
    setError('')
  }

  async function manejarLogin(evento) {
    evento.preventDefault()
    setError('')
    limpiarAvisoSesion()

    if (rol === 'comercio' && cuil.length !== 11) {
      setError('El CUIL/CUIT tiene 11 dígitos, sin guiones.')
      return
    }

    setCargando(true)

    try {
      const usuario = await entrar(rol, { email, contrasena, cuil })
      navigate(esRutaInterna(volver) ? volver : inicioDelRol(usuario.rol), { replace: true })
    } catch (errorLogin) {
      setError(errorLogin.message)
      setCargando(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link to="/" className="login-brand">
          🚪 ATuPuerta
        </Link>

        <h1>{esAdministrador ? 'Administración' : 'Iniciar sesión'}</h1>

        <p className="login-description">
          {esAdministrador
            ? 'Acceso para el equipo de ATuPuerta.'
            : 'Elegí con qué rol querés entrar.'}
        </p>

        {avisoSesion && <p className="login-aviso">{avisoSesion}</p>}

        {!esAdministrador && (
          <div className="login-roles" role="tablist" aria-label="Rol">
            {PESTANAS.map((pestana) => (
              <button
                key={pestana.rol}
                type="button"
                role="tab"
                aria-selected={rol === pestana.rol}
                className={rol === pestana.rol ? 'activo' : ''}
                onClick={() => cambiarRol(pestana.rol)}
              >
                {pestana.texto}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={manejarLogin}>
          <div className="form-group">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              required
            />
          </div>

          {rol === 'comercio' && (
            <div className="form-group">
              <label htmlFor="cuil">CUIL / CUIT del comercio</label>
              <input
                id="cuil"
                type="text"
                inputMode="numeric"
                value={cuil}
                onChange={(evento) => setCuil(evento.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="11 dígitos, sin guiones"
                required
              />
            </div>
          )}

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="login-button" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Iniciar sesión'}
          </button>
        </form>

        {registro && (
          <p className="register-link">
            {registro.pregunta} <Link to={registro.a}>{registro.texto}</Link>
          </p>
        )}

        <p className="register-link">
          {esAdministrador ? (
            <button type="button" className="login-link-boton" onClick={() => cambiarRol('cliente')}>
              ← Volver al inicio de sesión de usuarios
            </button>
          ) : (
            <button type="button" className="login-link-boton" onClick={() => cambiarRol('administrador')}>
              Acceso de administradores
            </button>
          )}
        </p>

        {CUENTAS_DE_PRUEBA.length > 0 && (
          <details className="login-pruebas">
            <summary>Cuentas de prueba (solo en desarrollo)</summary>
            <p>Todas con la contraseña <code>{CONTRASENA_DE_PRUEBA}</code>.</p>
            <ul>
              {CUENTAS_DE_PRUEBA.map((cuenta) => (
                <li key={cuenta.email}>
                  <button type="button" onClick={() => usarCuenta(cuenta)}>
                    {cuenta.nombre}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  )
}
