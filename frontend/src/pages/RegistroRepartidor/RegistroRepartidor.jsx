import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { registrarRepartidor } from '../../api/auth'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { VEHICULOS } from '../../utils/estados'
import '../Registro/Registro.css'

// Igual que el comercio, el perfil de repartidor se crea sobre una cuenta que ya existe
// (POST /api/registroRepartidor) y deja la cuenta con la sesión de repartidor abierta.
//
// El backend exige patente (única) y licencia para cualquier vehículo. Una bicicleta no
// tiene ninguna de las dos, así que para ese caso son opcionales acá y se completan con
// un identificador derivado del DNI, que es único: B + DNI entra en los 10 caracteres.
export default function RegistroRepartidor() {
  const { usuario, entrar, olvidarSesion } = useSesion()
  const avisar = useAvisos()
  const navigate = useNavigate()

  const [formulario, setFormulario] = useState({
    email: usuario?.email ?? '',
    contrasena: '',
    nombre: usuario?.rol === 'cliente' ? usuario.nombre : '',
    telefono: '',
    dni: '',
    tipo_vehiculo: 'moto',
    patente: '',
    numero_licencia: '',
  })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const esBicicleta = formulario.tipo_vehiculo === 'bicicleta'

  const cambiar = (campo) => (evento) =>
    setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }))

  async function manejarRegistro(evento) {
    evento.preventDefault()
    setError('')

    const datos = {
      ...formulario,
      email: formulario.email.trim(),
      nombre: formulario.nombre.trim(),
      telefono: formulario.telefono.trim(),
      patente: formulario.patente.trim().toUpperCase() || (esBicicleta ? `B${formulario.dni}` : ''),
      numero_licencia: formulario.numero_licencia.trim() || (esBicicleta ? 'No aplica' : ''),
    }

    if (Object.values(datos).some((valor) => !String(valor).trim())) {
      setError('Completá todos los campos.')
      return
    }

    if (!/^\d{8}$/.test(datos.dni)) {
      setError('El DNI tiene 8 dígitos.')
      return
    }

    setCargando(true)

    try {
      await registrarRepartidor(datos)
      olvidarSesion()
      await entrar('repartidor', { email: datos.email, contrasena: datos.contrasena })
      avisar('¡Bienvenido! Ponete en servicio para empezar a ver pedidos.')
      navigate('/repartidor', { replace: true })
    } catch (errorRegistro) {
      setError(errorRegistro.message)
      setCargando(false)
    }
  }

  return (
    <main className="registro-page">
      <section className="registro-container">
        <div className="registro-intro">
          <p className="eyebrow">PARA REPARTIDORES</p>
          <h1>Sumate a repartir</h1>
          <p>Conectá los comercios de tu barrio con sus vecinos.</p>
        </div>

        <form className="registro-form" onSubmit={manejarRegistro}>
          <p className="registro-nota">
            El perfil de repartidor se crea sobre tu cuenta de ATuPuerta. Si todavía no tenés
            una, <Link to="/registro?volver=/registro/repartidor">creala primero</Link>.
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

          <h2 className="registro-bloque">Tus datos</h2>

          <div className="fila-registro">
            <div className="campo">
              <label htmlFor="nombre">Nombre completo</label>
              <input
                id="nombre"
                type="text"
                value={formulario.nombre}
                onChange={cambiar('nombre')}
                autoComplete="name"
                maxLength={100}
              />
            </div>

            <div className="campo">
              <label htmlFor="telefono">Teléfono</label>
              <input
                id="telefono"
                type="tel"
                value={formulario.telefono}
                onChange={cambiar('telefono')}
                autoComplete="tel"
                maxLength={20}
              />
            </div>
          </div>

          <div className="fila-registro">
            <div className="campo">
              <label htmlFor="dni">DNI</label>
              <input
                id="dni"
                type="text"
                inputMode="numeric"
                value={formulario.dni}
                onChange={(evento) =>
                  setFormulario((actual) => ({
                    ...actual,
                    dni: evento.target.value.replace(/\D/g, '').slice(0, 8),
                  }))
                }
                placeholder="8 dígitos"
              />
            </div>

            <div className="campo">
              <label htmlFor="tipo_vehiculo">Vehículo</label>
              <select id="tipo_vehiculo" value={formulario.tipo_vehiculo} onChange={cambiar('tipo_vehiculo')}>
                {Object.entries(VEHICULOS).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>{etiqueta}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="fila-registro">
            <div className="campo">
              <label htmlFor="patente">Patente{esBicicleta && ' (opcional)'}</label>
              <input
                id="patente"
                type="text"
                value={formulario.patente}
                onChange={cambiar('patente')}
                placeholder={esBicicleta ? 'Sin patente' : 'Ej. A123BCD'}
                maxLength={10}
              />
            </div>

            <div className="campo">
              <label htmlFor="numero_licencia">Licencia de conducir{esBicicleta && ' (opcional)'}</label>
              <input
                id="numero_licencia"
                type="text"
                value={formulario.numero_licencia}
                onChange={cambiar('numero_licencia')}
                placeholder={esBicicleta ? 'No aplica' : 'Número de licencia'}
                maxLength={30}
              />
            </div>
          </div>

          {esBicicleta && (
            <p className="campo-ayuda">
              Una bicicleta no tiene patente ni licencia: si las dejás vacías, se identifica con tu DNI.
            </p>
          )}

          {error && <p className="registro-error">{error}</p>}

          <button type="submit" className="registro-button" disabled={cargando}>
            {cargando ? 'Registrando…' : 'Quiero repartir'}
          </button>

          <p className="registro-login">
            ¿Ya te registraste? <Link to="/login?rol=repartidor">Iniciá sesión como repartidor</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
