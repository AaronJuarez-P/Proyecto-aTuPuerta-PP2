import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { registrarComercio } from '../../api/auth'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { CATEGORIAS_COMERCIO } from '../../utils/categorias'
import '../Registro/Registro.css'

// El comercio se crea sobre una cuenta que ya existe (POST /api/registroComercio compara
// la contraseña de esa cuenta). Al registrarlo, el backend deja la cuenta con la sesión de
// comercio abierta y el token de cliente que hubiera deja de servir: por eso después se
// entra de nuevo, ya como comercio.
export default function RegistroComercio() {
  const { usuario, entrar, olvidarSesion } = useSesion()
  const avisar = useAvisos()
  const navigate = useNavigate()

  const [formulario, setFormulario] = useState({
    email: usuario?.email ?? '',
    contrasena: '',
    nombre: '',
    cuit_cuil: '',
    categoria: '',
    direccion: '',
    horario_atencion: '',
    telefono: '',
  })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const cambiar = (campo) => (evento) =>
    setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }))

  async function manejarRegistro(evento) {
    evento.preventDefault()
    setError('')

    if (Object.values(formulario).some((valor) => !valor.trim())) {
      setError('Completá todos los campos.')
      return
    }

    if (!/^\d{11}$/.test(formulario.cuit_cuil)) {
      setError('El CUIL/CUIT tiene 11 dígitos, sin guiones.')
      return
    }

    setCargando(true)

    try {
      const datos = Object.fromEntries(
        Object.entries(formulario).map(([campo, valor]) => [campo, campo === 'contrasena' ? valor : valor.trim()])
      )

      await registrarComercio(datos)
      olvidarSesion()
      await entrar('comercio', { email: datos.email, contrasena: datos.contrasena, cuil: datos.cuit_cuil })
      avisar('¡Listo! Tu comercio ya está en ATuPuerta. Cargá tus productos para empezar a vender.')
      navigate('/comercio', { replace: true })
    } catch (errorRegistro) {
      setError(errorRegistro.message)
      setCargando(false)
    }
  }

  return (
    <main className="registro-page">
      <section className="registro-container">
        <div className="registro-intro">
          <p className="eyebrow">PARA COMERCIOS</p>
          <h1>Sumá tu comercio</h1>
          <p>Vendé en tu barrio sin el sobrecosto de las apps tradicionales.</p>
        </div>

        <form className="registro-form" onSubmit={manejarRegistro}>
          <p className="registro-nota">
            El comercio se crea sobre tu cuenta de ATuPuerta. Si todavía no tenés una,{' '}
            <Link to="/registro?volver=/registro/comercio">creala primero</Link>.
          </p>

          <h2 className="registro-bloque">Tu cuenta</h2>

          <div className="campo">
            <label htmlFor="email">Correo de tu cuenta</label>
            <input
              id="email"
              type="email"
              value={formulario.email}
              onChange={cambiar('email')}
              autoComplete="email"
            />
          </div>

          <div className="campo">
            <label htmlFor="contrasena">Contraseña de tu cuenta</label>
            <input
              id="contrasena"
              type="password"
              value={formulario.contrasena}
              onChange={cambiar('contrasena')}
              autoComplete="current-password"
            />
          </div>

          <h2 className="registro-bloque">Tu comercio</h2>

          <div className="campo">
            <label htmlFor="nombre">Nombre del comercio</label>
            <input
              id="nombre"
              type="text"
              value={formulario.nombre}
              onChange={cambiar('nombre')}
              placeholder="Ej. Librería del Centro"
              maxLength={100}
            />
          </div>

          <div className="fila-registro">
            <div className="campo">
              <label htmlFor="cuit_cuil">CUIL / CUIT</label>
              <input
                id="cuit_cuil"
                type="text"
                inputMode="numeric"
                value={formulario.cuit_cuil}
                onChange={(evento) =>
                  setFormulario((actual) => ({
                    ...actual,
                    cuit_cuil: evento.target.value.replace(/\D/g, '').slice(0, 11),
                  }))
                }
                placeholder="11 dígitos"
              />
              <small className="campo-ayuda">Lo vas a usar para iniciar sesión como comercio.</small>
            </div>

            <div className="campo">
              <label htmlFor="categoria">Rubro</label>
              <input
                id="categoria"
                type="text"
                list="categorias-comercio"
                value={formulario.categoria}
                onChange={cambiar('categoria')}
                placeholder="Elegí o escribí uno"
                maxLength={50}
              />
              <datalist id="categorias-comercio">
                {CATEGORIAS_COMERCIO.map((categoria) => (
                  <option key={categoria} value={categoria} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="campo">
            <label htmlFor="direccion">Dirección del local</label>
            <input
              id="direccion"
              type="text"
              value={formulario.direccion}
              onChange={cambiar('direccion')}
              placeholder="Calle, número y ciudad"
              autoComplete="street-address"
              maxLength={200}
            />
            <small className="campo-ayuda">De acá salen los pedidos: se usa para calcular las rutas.</small>
          </div>

          <div className="fila-registro">
            <div className="campo">
              <label htmlFor="horario_atencion">Horario de atención</label>
              <input
                id="horario_atencion"
                type="text"
                value={formulario.horario_atencion}
                onChange={cambiar('horario_atencion')}
                placeholder="Lun a Sáb 08:00-20:00"
                maxLength={100}
              />
            </div>

            <div className="campo">
              <label htmlFor="telefono">Teléfono de contacto</label>
              <input
                id="telefono"
                type="tel"
                value={formulario.telefono}
                onChange={cambiar('telefono')}
                placeholder="Ej. 342 555 1234"
                maxLength={20}
              />
            </div>
          </div>

          {error && <p className="registro-error">{error}</p>}

          <button type="submit" className="registro-button" disabled={cargando}>
            {cargando ? 'Registrando…' : 'Registrar mi comercio'}
          </button>

          <p className="registro-login">
            ¿Ya lo registraste? <Link to="/login?rol=comercio">Iniciá sesión como comercio</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
