import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { actualizarPerfil, cambiarContrasena, darDeBajaCuenta, obtenerPerfil } from '../../api/perfil'
import { actualizarPerfilComercio, obtenerPerfilComercio } from '../../api/comercio'
import { actualizarPerfilRepartidor, obtenerPerfilRepartidor } from '../../api/repartidor'
import { Cargando, MensajeError, Modal } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { CATEGORIAS_COMERCIO } from '../../utils/categorias'
import { VEHICULOS } from '../../utils/estados'
import { formatearFecha } from '../../utils/formato'
import { etiquetaDelRol } from '../../utils/roles'
import './Perfil.css'

// Perfil de la cuenta (CU11) y, según la sesión, el del comercio (CU12) o el del
// repartidor (CU18). La cuenta es la misma para todos los roles.
export default function Perfil() {
  const { usuario, salir } = useSesion()
  const navigate = useNavigate()
  const { datos, cargando, error, recargar } = useCarga(() => obtenerPerfil(), [])
  const cuenta = datos?.usuario

  async function cerrarSesion() {
    navigate('/')
    await salir()
  }

  if (!cuenta) {
    return (
      <main className="perfil-page">
        <section className="perfil-container">
          {error ? <MensajeError error={error} alReintentar={recargar} /> : cargando && <Cargando />}
        </section>
      </main>
    )
  }

  return (
    <main className="perfil-page">
      <section className="perfil-container">
        <div className="perfil-header">
          <div className="perfil-avatar" aria-hidden="true">{usuario.nombre.charAt(0).toUpperCase()}</div>
          <div>
            <p className="perfil-label">Mi cuenta</p>
            <h1>{usuario.nombre}</h1>
            <p className="perfil-rol">
              Sesión de {etiquetaDelRol(usuario.rol).toLowerCase()} · {cuenta.email} · desde el {formatearFecha(cuenta.created_at, { conHora: false })}
            </p>
          </div>
        </div>

        <MisDatos cuenta={cuenta} alGuardar={recargar} />

        {usuario.rol === 'comercio' && <MiComercio />}
        {usuario.rol === 'repartidor' && <MiVehiculo />}

        <Contrasena />

        <Perfiles cuenta={cuenta} />

        <div className="perfil-acciones">
          {usuario.rol === 'cliente' && <Link to="/pedidos" className="perfil-button">📦 Mis pedidos</Link>}
          {usuario.rol !== 'administrador' && <Link to="/reclamos" className="perfil-button secondary">📣 Mis reclamos</Link>}
          <Link to="/notificaciones" className="perfil-button secondary">🔔 Notificaciones</Link>
          <button type="button" className="perfil-button logout" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>

        <ZonaBaja />
      </section>
    </main>
  )
}

function MisDatos({ cuenta, alGuardar }) {
  const { usuario, actualizarUsuario } = useSesion()
  const avisar = useAvisos()
  const esCliente = Boolean(cuenta.perfiles.cliente)
  const [formulario, setFormulario] = useState({
    nombre: cuenta.nombre,
    telefono: cuenta.telefono,
    direccion_entrega: cuenta.perfiles.cliente?.direccion_entrega ?? '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambiar = (campo) => (evento) => setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }))

  async function guardar(evento) {
    evento.preventDefault()
    setError('')

    // Solo viaja lo que cambió: PATCH acepta cualquier subconjunto
    const cambios = {}
    if (formulario.nombre.trim() !== cuenta.nombre) cambios.nombre = formulario.nombre.trim()
    if (formulario.telefono.trim() !== cuenta.telefono) cambios.telefono = formulario.telefono.trim()
    if (esCliente && formulario.direccion_entrega.trim() !== cuenta.perfiles.cliente.direccion_entrega) {
      cambios.direccion_entrega = formulario.direccion_entrega.trim()
    }

    if (Object.keys(cambios).length === 0) {
      setError('No cambiaste nada.')
      return
    }

    setGuardando(true)

    try {
      await actualizarPerfil(cambios)
      // En la sesión de comercio el header muestra el nombre del comercio, no el de la persona
      if (cambios.nombre && usuario.rol !== 'comercio') {
        actualizarUsuario({ nombre: cambios.nombre })
      }
      avisar('Guardaste tus datos.')
      alGuardar()
    } catch (errorGuardar) {
      setError(errorGuardar.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="perfil-card">
      <h2>Mis datos</h2>

      <form className="formulario" onSubmit={guardar}>
        <div className="fila-campos">
          <div className="campo-form">
            <label htmlFor="perfil-nombre">Nombre</label>
            <input id="perfil-nombre" value={formulario.nombre} onChange={cambiar('nombre')} maxLength={100} autoComplete="name" />
          </div>
          <div className="campo-form">
            <label htmlFor="perfil-telefono">Teléfono</label>
            <input id="perfil-telefono" type="tel" value={formulario.telefono} onChange={cambiar('telefono')} maxLength={20} autoComplete="tel" />
          </div>
        </div>

        {esCliente && (
          <div className="campo-form">
            <label htmlFor="perfil-direccion">Dirección de entrega</label>
            <input id="perfil-direccion" value={formulario.direccion_entrega} onChange={cambiar('direccion_entrega')} maxLength={200} autoComplete="street-address" />
            <small>Es la que se usa por defecto en tus pedidos.</small>
          </div>
        )}

        <div className="campo-form">
          <label htmlFor="perfil-email">Correo electrónico</label>
          <input id="perfil-email" value={cuenta.email} disabled />
          <small>Es con lo que iniciás sesión, así que no se cambia desde acá. Si lo necesitás, pedíselo al equipo de ATuPuerta.</small>
        </div>

        {error && <p className="aviso-form aviso-form-error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton boton-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </section>
  )
}

function MiComercio() {
  const { actualizarUsuario } = useSesion()
  const avisar = useAvisos()
  const { datos, error, recargar } = useCarga(() => obtenerPerfilComercio(), [])
  const comercio = datos?.comercio

  if (!comercio) {
    return error ? <MensajeError error={error} alReintentar={recargar} /> : null
  }

  return (
    <FormularioPerfilRol
      key={comercio.id}
      titulo="Mi comercio"
      inicial={{
        nombre: comercio.nombre,
        categoria: comercio.categoria,
        direccion: comercio.direccion,
        horario_atencion: comercio.horario_atencion,
      }}
      campos={[
        { clave: 'nombre', etiqueta: 'Nombre del comercio', maximo: 100 },
        { clave: 'categoria', etiqueta: 'Rubro', maximo: 50, sugerencias: CATEGORIAS_COMERCIO },
        { clave: 'direccion', etiqueta: 'Dirección del local', maximo: 200, ayuda: 'Si la cambiás, se vuelve a ubicar en el mapa.' },
        { clave: 'horario_atencion', etiqueta: 'Horario de atención', maximo: 100 },
      ]}
      nota={`CUIL/CUIT ${comercio.cuit_cuil}: no se cambia, es con lo que entrás como comercio.`}
      alGuardar={async (cambios) => {
        await actualizarPerfilComercio(cambios)
        if (cambios.nombre) {
          actualizarUsuario({ nombre: cambios.nombre })
        }
        avisar('Guardaste los datos del comercio.')
        recargar()
      }}
    />
  )
}

function MiVehiculo() {
  const avisar = useAvisos()
  const { datos, error, recargar } = useCarga(() => obtenerPerfilRepartidor(), [])
  const repartidor = datos?.repartidor

  if (!repartidor) {
    return error ? <MensajeError error={error} alReintentar={recargar} /> : null
  }

  return (
    <FormularioPerfilRol
      key={`${repartidor.id}-${repartidor.patente}`}
      titulo="Mi vehículo"
      inicial={{
        tipo_vehiculo: repartidor.tipo_vehiculo,
        patente: repartidor.patente,
        numero_licencia: repartidor.numero_licencia,
      }}
      campos={[
        { clave: 'tipo_vehiculo', etiqueta: 'Vehículo', opciones: VEHICULOS },
        { clave: 'patente', etiqueta: 'Patente', maximo: 10 },
        { clave: 'numero_licencia', etiqueta: 'Licencia', maximo: 30 },
      ]}
      nota={
        datos.pedido_en_curso
          ? `Tenés el pedido #${datos.pedido_en_curso} en camino: los datos del vehículo se pueden cambiar cuando lo entregues.`
          : `DNI ${repartidor.dni}: no se cambia desde acá.`
      }
      alGuardar={async (cambios) => {
        await actualizarPerfilRepartidor(cambios)
        avisar('Guardaste los datos del vehículo.')
        recargar()
      }}
    />
  )
}

// Formulario genérico de los perfiles de comercio y repartidor: manda solo lo que cambió
function FormularioPerfilRol({ titulo, inicial, campos, nota, alGuardar }) {
  const [formulario, setFormulario] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento) {
    evento.preventDefault()
    setError('')

    const cambios = Object.fromEntries(
      Object.entries(formulario)
        .map(([clave, valor]) => [clave, typeof valor === 'string' ? valor.trim() : valor])
        .filter(([clave, valor]) => valor !== inicial[clave])
    )

    if (Object.keys(cambios).length === 0) {
      setError('No cambiaste nada.')
      return
    }

    setGuardando(true)

    try {
      await alGuardar(cambios)
    } catch (errorGuardar) {
      setError(errorGuardar.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="perfil-card">
      <h2>{titulo}</h2>

      <form className="formulario" onSubmit={guardar}>
        <div className="fila-campos">
          {campos.map(({ clave, etiqueta, maximo, opciones, sugerencias, ayuda }) => (
            <div className="campo-form" key={clave}>
              <label htmlFor={`perfil-${clave}`}>{etiqueta}</label>

              {opciones ? (
                <select
                  id={`perfil-${clave}`}
                  value={formulario[clave]}
                  onChange={(evento) => setFormulario((actual) => ({ ...actual, [clave]: evento.target.value }))}
                >
                  {Object.entries(opciones).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
                </select>
              ) : (
                <input
                  id={`perfil-${clave}`}
                  value={formulario[clave]}
                  onChange={(evento) => setFormulario((actual) => ({ ...actual, [clave]: evento.target.value }))}
                  maxLength={maximo}
                  list={sugerencias ? `sugerencias-${clave}` : undefined}
                />
              )}

              {sugerencias && (
                <datalist id={`sugerencias-${clave}`}>
                  {sugerencias.map((sugerencia) => <option key={sugerencia} value={sugerencia} />)}
                </datalist>
              )}

              {ayuda && <small>{ayuda}</small>}
            </div>
          ))}
        </div>

        {nota && <p className="texto-apagado">{nota}</p>}
        {error && <p className="aviso-form aviso-form-error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton boton-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Contrasena() {
  const avisar = useAvisos()
  const [formulario, setFormulario] = useState({ actual: '', nueva: '', confirmar: '' })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cambiar = (campo) => (evento) => setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }))

  async function guardar(evento) {
    evento.preventDefault()
    setError('')

    if (formulario.nueva.length < 8 || formulario.nueva.length > 72) {
      setError('La contraseña nueva tiene que tener entre 8 y 72 caracteres.')
      return
    }

    if (formulario.nueva !== formulario.confirmar) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }

    setGuardando(true)

    try {
      await cambiarContrasena(formulario.actual, formulario.nueva)
      avisar('Cambiaste tu contraseña.')
      setFormulario({ actual: '', nueva: '', confirmar: '' })
    } catch (errorGuardar) {
      setError(errorGuardar.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="perfil-card">
      <h2>Contraseña</h2>

      <form className="formulario" onSubmit={guardar}>
        <div className="campo-form">
          <label htmlFor="contrasena-actual">Contraseña actual</label>
          <input id="contrasena-actual" type="password" value={formulario.actual} onChange={cambiar('actual')} autoComplete="current-password" />
        </div>

        <div className="fila-campos">
          <div className="campo-form">
            <label htmlFor="contrasena-nueva">Contraseña nueva</label>
            <input id="contrasena-nueva" type="password" value={formulario.nueva} onChange={cambiar('nueva')} autoComplete="new-password" placeholder="Entre 8 y 72 caracteres" />
          </div>
          <div className="campo-form">
            <label htmlFor="contrasena-confirmar">Repetila</label>
            <input id="contrasena-confirmar" type="password" value={formulario.confirmar} onChange={cambiar('confirmar')} autoComplete="new-password" />
          </div>
        </div>

        {error && <p className="aviso-form aviso-form-error">{error}</p>}

        <div className="acciones">
          <button type="submit" className="boton boton-primario" disabled={guardando || !formulario.actual}>
            {guardando ? 'Cambiando…' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </section>
  )
}

// Los perfiles que tiene la cuenta. La sesión es una sola: para usar otro, se entra de nuevo.
function Perfiles({ cuenta }) {
  const { usuario } = useSesion()
  const roles = ['cliente', 'comercio', 'repartidor', 'administrador'].filter((rol) => cuenta.perfiles[rol])
  const otros = roles.filter((rol) => rol !== usuario.rol)

  return (
    <section className="perfil-card">
      <h2>Tus perfiles</h2>

      <div className="perfiles-cuenta">
        {roles.map((rol) => (
          <span key={rol} className={`estado-badge ${rol === usuario.rol ? 'tono-ok' : 'tono-neutro'}`}>
            {etiquetaDelRol(rol)}{rol === usuario.rol && ' · sesión actual'}
          </span>
        ))}
      </div>

      {otros.length > 0 && (
        <p className="texto-apagado">
          Tu cuenta tiene una sola sesión abierta a la vez. Para usar otro perfil, entrá con ese rol:{' '}
          {otros.map((rol, indice) => (
            <span key={rol}>
              {indice > 0 && ' · '}
              <Link to={`/login?rol=${rol}`}>entrar como {etiquetaDelRol(rol).toLowerCase()}</Link>
            </span>
          ))}
        </p>
      )}

      {usuario.rol === 'cliente' && (!cuenta.perfiles.comercio || !cuenta.perfiles.repartidor) && (
        <div className="acciones">
          {!cuenta.perfiles.comercio && <Link className="boton boton-secundario" to="/registro/comercio">🏪 Sumar mi comercio</Link>}
          {!cuenta.perfiles.repartidor && <Link className="boton boton-secundario" to="/registro/repartidor">🛵 Quiero repartir</Link>}
        </div>
      )}
    </section>
  )
}

function ZonaBaja() {
  const { olvidarSesion } = useSesion()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function darDeBaja(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)

    try {
      const { pedidos_cancelados: cancelados = [] } = await darDeBajaCuenta(contrasena)
      navigate('/')
      olvidarSesion()
      avisar(cancelados.length > 0
        ? `Diste de baja tu cuenta. Se cancelaron ${cancelados.length} pedidos que no habías pagado.`
        : 'Diste de baja tu cuenta.')
    } catch (errorBaja) {
      setError(errorBaja.message)
      setEnviando(false)
    }
  }

  return (
    <section className="perfil-card zona-baja">
      <h2>Dar de baja la cuenta</h2>
      <p className="texto-apagado">
        Deja de funcionar para todos tus perfiles. No se puede con pedidos pagados en curso, y
        los que todavía no pagaste se cancelan.
      </p>
      <div className="acciones">
        <button type="button" className="boton boton-peligro" onClick={() => setAbierto(true)}>Dar de baja mi cuenta</button>
      </div>

      <Modal abierto={abierto} titulo="¿Dar de baja tu cuenta?" alCerrar={() => setAbierto(false)}>
        <form className="formulario" onSubmit={darDeBaja}>
          <p className="texto-apagado">Para confirmar, escribí tu contraseña.</p>
          <div className="campo-form">
            <label htmlFor="baja-contrasena">Contraseña</label>
            <input id="baja-contrasena" type="password" value={contrasena} onChange={(evento) => setContrasena(evento.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="aviso-form aviso-form-error">{error}</p>}
          <div className="acciones">
            <button type="submit" className="boton boton-peligro" disabled={enviando || !contrasena}>
              {enviando ? 'Dando de baja…' : 'Sí, dar de baja'}
            </button>
            <button type="button" className="boton boton-secundario" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
