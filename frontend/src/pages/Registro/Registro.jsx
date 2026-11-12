import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { registrarCliente } from '../../api/auth'
import { useSesion } from '../../context/sesion'
import { esRutaInterna } from '../../utils/roles'
import VerificarCorreo from '../../components/VerificarCorreo/VerificarCorreo'
import './Registro.css'

// Mismas reglas que valida el backend (POST /api/registro), para avisar antes de mandar
const CONTRASENA_MINIMA = 8
const CONTRASENA_MAXIMA = 72

export default function Registro() {
  const [formulario, setFormulario] = useState({
    nombre: '',
    email: '',
    telefono: '',
    direccion_entrega: '',
    contrasena: '',
    confirmarContrasena: '',
  })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  // Lo que contestó el backend al mandar el código. Mientras tenga algo, en lugar del
  // formulario se muestra el paso "Verificá tu correo".
  const [envio, setEnvio] = useState(null)

  const { entrar } = useSesion()
  const navigate = useNavigate()
  const [parametros] = useSearchParams()
  const volver = parametros.get('volver')

  const cambiar = (campo) => (evento) =>
    setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }))

  // El registro no devuelve token: se inicia sesión con lo que se acaba de cargar
  async function entrarYSeguir() {
    await entrar('cliente', { email: formulario.email, contrasena: formulario.contrasena })
    navigate(esRutaInterna(volver) ? volver : '/comercios', { replace: true })
  }

  async function manejarRegistro(evento) {
    evento.preventDefault()
    setError('')

    const { confirmarContrasena, ...datos } = formulario

    if (Object.values(datos).some((valor) => !valor.trim())) {
      setError('Completá todos los campos.')
      return
    }

    if (datos.contrasena.length < CONTRASENA_MINIMA || datos.contrasena.length > CONTRASENA_MAXIMA) {
      setError(`La contraseña tiene que tener entre ${CONTRASENA_MINIMA} y ${CONTRASENA_MAXIMA} caracteres.`)
      return
    }

    if (datos.contrasena !== confirmarContrasena) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setCargando(true)

    try {
      const respuesta = await registrarCliente({
        ...datos,
        nombre: datos.nombre.trim(),
        email: datos.email.trim(),
        telefono: datos.telefono.trim(),
        direccion_entrega: datos.direccion_entrega.trim(),
      })

      // Con la verificación del correo prendida en el backend la cuenta todavía no
      // existe: falta el código. Sin ella (EMAIL_MODO=off) ya está creada y se entra
      // directo, como siempre.
      if (respuesta.verificacion_pendiente) {
        setEnvio(respuesta)
        setCargando(false)
        return
      }

      await entrarYSeguir()
    } catch (errorRegistro) {
      setError(errorRegistro.message)
      setCargando(false)
    }
  }

  // Segundo paso: el código que llegó por correo. No es otra ruta: el formulario se deja
  // de mostrar, pero sus datos siguen en el estado, así que "Usar otro correo" vuelve con
  // todo cargado y la contraseña que pide el backend sale de ahí, de la memoria.
  if (envio) {
    return (
      <main className="registro-page">
        <section className="registro-container">
          <div className="registro-intro">
            <p className="eyebrow">ATUPUERTA</p>
            <h1>Verificá tu correo</h1>
            <p>Falta un paso para terminar de crear tu cuenta.</p>
          </div>

          <div className="registro-form">
            <VerificarCorreo
              email={envio.email}
              contrasena={formulario.contrasena}
              envio={envio}
              textoVolver="Usar otro correo"
              alVerificar={entrarYSeguir}
              alVolver={() => setEnvio(null)}
            />
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="registro-page">
      <section className="registro-container">
        <div className="registro-intro">
          <p className="eyebrow">ATUPUERTA</p>
          <h1>Creá tu cuenta</h1>
          <p>Registrate para hacer pedidos y seguirlos desde un solo lugar.</p>
        </div>

        <form className="registro-form" onSubmit={manejarRegistro}>
          <div className="campo">
            <label htmlFor="nombre">Nombre completo</label>
            <input
              id="nombre"
              type="text"
              value={formulario.nombre}
              onChange={cambiar('nombre')}
              placeholder="Tu nombre"
              autoComplete="name"
              maxLength={100}
            />
          </div>

          <div className="campo">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              value={formulario.email}
              onChange={cambiar('email')}
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>

          <div className="campo">
            <label htmlFor="telefono">Teléfono</label>
            <input
              id="telefono"
              type="tel"
              value={formulario.telefono}
              onChange={cambiar('telefono')}
              placeholder="Ej. 342 555 1234"
              autoComplete="tel"
              maxLength={20}
            />
          </div>

          <div className="campo">
            <label htmlFor="direccion_entrega">Dirección de entrega</label>
            <input
              id="direccion_entrega"
              type="text"
              value={formulario.direccion_entrega}
              onChange={cambiar('direccion_entrega')}
              placeholder="Calle, número y ciudad"
              autoComplete="street-address"
              maxLength={200}
            />
            <small className="campo-ayuda">
              Es donde te llevamos los pedidos. Podés cambiarla desde tu perfil o en cada compra.
            </small>
          </div>

          <div className="campo">
            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              value={formulario.contrasena}
              onChange={cambiar('contrasena')}
              placeholder={`Entre ${CONTRASENA_MINIMA} y ${CONTRASENA_MAXIMA} caracteres`}
              autoComplete="new-password"
            />
          </div>

          <div className="campo">
            <label htmlFor="confirmarContrasena">Confirmar contraseña</label>
            <input
              id="confirmarContrasena"
              type="password"
              value={formulario.confirmarContrasena}
              onChange={cambiar('confirmarContrasena')}
              placeholder="Repetí tu contraseña"
              autoComplete="new-password"
            />
          </div>

          {error && <p className="registro-error">{error}</p>}

          <button type="submit" className="registro-button" disabled={cargando}>
            {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p className="registro-login">
            ¿Ya tenés una cuenta? <Link to="/login">Iniciá sesión</Link>
          </p>

          <p className="registro-login">
            ¿Tenés un comercio? <Link to="/registro/comercio">Registralo</Link>
            {' · '}
            ¿Querés repartir? <Link to="/registro/repartidor">Sumate</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
