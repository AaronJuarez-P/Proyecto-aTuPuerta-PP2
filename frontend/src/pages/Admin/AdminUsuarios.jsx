import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { crearUsuario, listarUsuarios } from '../../api/admin'
import { Cargando, EstadoVacio, MensajeError, Modal, Paginacion } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useCarga } from '../../hooks/useCarga'
import { useFiltrosUrl } from '../../hooks/useFiltrosUrl'
import { formatearFecha } from '../../utils/formato'
import { etiquetaDelRol } from '../../utils/roles'
import './Admin.css'

const FILTROS = ['rol', 'activo', 'buscar']

const PERFILES = [
  { rol: 'cliente', texto: 'Clientes' },
  { rol: 'comercio', texto: 'Comercios' },
  { rol: 'repartidor', texto: 'Repartidores' },
  { rol: 'administrador', texto: 'Administradores' },
]

// Gestión de usuarios (CU23). El filtro por rol mira los perfiles que tiene cada cuenta,
// no la sesión que tiene abierta: un comercio que ahora está comprando sigue siendo comercio.
export default function AdminUsuarios() {
  const { filtros, pagina, hayFiltros, cambiar, cambiarPagina, limpiar } = useFiltrosUrl(FILTROS)
  const [creando, setCreando] = useState(false)
  const avisar = useAvisos()
  const navigate = useNavigate()

  const { datos, cargando, error, recargar } = useCarga(
    () => listarUsuarios({ ...filtros, pagina, limite: 20 }),
    [...Object.values(filtros), pagina]
  )

  function buscar(evento) {
    evento.preventDefault()
    cambiar({ buscar: String(new FormData(evento.currentTarget).get('buscar') ?? '').trim() })
  }

  function alCrear(usuario) {
    avisar(`Cuenta de ${usuario.nombre} creada`)
    navigate(`/admin/usuarios/${usuario.id}`)
  }

  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin">← Panel</Link>

        <header className="admin-header">
          <div>
            <p className="admin-label">Gestión</p>
            <h1>Usuarios</h1>
            <p>Las cuentas de la plataforma con sus perfiles. Desde acá se suspenden, se reactivan y se eliminan definitivamente.</p>
          </div>
          <button type="button" className="boton boton-primario" onClick={() => setCreando(true)}>
            + Nuevo usuario
          </button>
        </header>

        <div className="barra-filtros">
          <form className="admin-busqueda" role="search" onSubmit={buscar} key={filtros.buscar}>
            <div className="campo-form">
              <label htmlFor="filtro-buscar">Nombre o email</label>
              <input id="filtro-buscar" name="buscar" type="search" defaultValue={filtros.buscar} placeholder="Buscar…" />
            </div>
            <button type="submit" className="boton boton-secundario">Buscar</button>
          </form>

          <div className="campo-form">
            <label htmlFor="filtro-rol">Perfil</label>
            <select id="filtro-rol" value={filtros.rol} onChange={(evento) => cambiar({ rol: evento.target.value })}>
              <option value="">Todos</option>
              {PERFILES.map(({ rol, texto }) => (
                <option key={rol} value={rol}>{texto}</option>
              ))}
            </select>
          </div>

          <div className="campo-form">
            <label htmlFor="filtro-activo">Estado</label>
            <select id="filtro-activo" value={filtros.activo} onChange={(evento) => cambiar({ activo: evento.target.value })}>
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Suspendidos o dados de baja</option>
            </select>
          </div>

          {hayFiltros && (
            <button type="button" className="boton boton-secundario" onClick={() => limpiar()}>
              Limpiar filtros
            </button>
          )}
        </div>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : datos?.usuarios.length === 0 ? (
          <EstadoVacio icono="👥" titulo="No hay usuarios con estos filtros" />
        ) : datos && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Perfiles</th>
                  <th>Sesión abierta</th>
                  <th>Estado</th>
                  <th>Alta</th>
                </tr>
              </thead>
              <tbody>
                {datos.usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>
                      <Link to={`/admin/usuarios/${usuario.id}`}>{usuario.nombre}</Link>
                      <small className="admin-celda-secundaria">{usuario.email}</small>
                    </td>
                    <td>
                      <div className="admin-perfiles">
                        {usuario.perfiles.map((perfil) => (
                          <span
                            key={perfil}
                            className={`estado-badge ${perfil === 'comercio' && usuario.comercio && !usuario.comercio.activo ? 'tono-error' : 'tono-neutro'}`}
                            title={perfil === 'comercio' && usuario.comercio ? usuario.comercio.nombre : undefined}
                          >
                            {etiquetaDelRol(perfil)}
                            {perfil === 'comercio' && usuario.comercio && !usuario.comercio.activo && ' (suspendido)'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{usuario.sesion ? etiquetaDelRol(usuario.sesion) : '—'}</td>
                    <td>
                      <span className={`estado-badge ${usuario.activo ? 'tono-ok' : 'tono-error'}`}>
                        {usuario.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>{formatearFecha(usuario.created_at, { conHora: false })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion paginacion={datos?.paginacion} alCambiar={cambiarPagina} />
      </section>

      <Modal abierto={creando} titulo="Nuevo usuario" alCerrar={() => setCreando(false)}>
        <NuevoUsuario alCrear={alCrear} />
      </Modal>
    </main>
  )
}

const VACIO = { rol: 'cliente', nombre: '', email: '', contrasena: '', telefono: '', direccion_entrega: '' }

// Desde el panel solo se crean clientes y administradores. Los comercios y repartidores
// se registran ellos mismos, sobre una cuenta que ya existe, con datos que solo tienen
// ellos (CUIL, licencia, patente). Es la única forma de crear un administrador.
function NuevoUsuario({ alCrear }) {
  const [datos, setDatos] = useState(VACIO)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiarCampo = (evento) => setDatos({ ...datos, [evento.target.name]: evento.target.value })

  async function enviar(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)

    try {
      const { usuario } = await crearUsuario({
        rol: datos.rol,
        nombre: datos.nombre.trim(),
        email: datos.email.trim(),
        contrasena: datos.contrasena,
        telefono: datos.telefono.trim(),
        ...(datos.rol === 'cliente' && { direccion_entrega: datos.direccion_entrega.trim() }),
      })
      alCrear(usuario)
    } catch (errorAlta) {
      setError(errorAlta.message)
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <div className="chips" role="radiogroup" aria-label="Tipo de cuenta">
        {['cliente', 'administrador'].map((rol) => (
          <button
            key={rol}
            type="button"
            role="radio"
            aria-checked={datos.rol === rol}
            className={`chip ${datos.rol === rol ? 'activo' : ''}`}
            onClick={() => setDatos({ ...datos, rol })}
          >
            {etiquetaDelRol(rol)}
          </button>
        ))}
      </div>

      {datos.rol === 'administrador' && (
        <p className="aviso-form aviso-form-info">
          Va a poder ver y cambiar todo lo de la plataforma, incluidas las demás cuentas.
        </p>
      )}

      <div className="campo-form">
        <label htmlFor="nuevo-nombre">Nombre</label>
        <input id="nuevo-nombre" name="nombre" value={datos.nombre} onChange={cambiarCampo} maxLength={100} required />
      </div>

      <div className="fila-campos">
        <div className="campo-form">
          <label htmlFor="nuevo-email">Email</label>
          <input id="nuevo-email" name="email" type="email" value={datos.email} onChange={cambiarCampo} required />
        </div>
        <div className="campo-form">
          <label htmlFor="nuevo-telefono">Teléfono</label>
          <input id="nuevo-telefono" name="telefono" type="tel" value={datos.telefono} onChange={cambiarCampo} minLength={6} maxLength={20} required />
        </div>
      </div>

      <div className="campo-form">
        <label htmlFor="nuevo-contrasena">Contraseña inicial</label>
        <input id="nuevo-contrasena" name="contrasena" type="password" value={datos.contrasena} onChange={cambiarCampo} minLength={8} maxLength={72} autoComplete="new-password" required />
        <small>De 8 a 72 caracteres. Pasásela a la persona: la puede cambiar desde su perfil.</small>
      </div>

      {datos.rol === 'cliente' && (
        <div className="campo-form">
          <label htmlFor="nuevo-direccion">Dirección de entrega</label>
          <input id="nuevo-direccion" name="direccion_entrega" value={datos.direccion_entrega} onChange={cambiarCampo} maxLength={200} required />
        </div>
      )}

      {error && <p className="aviso-form aviso-form-error">{error}</p>}

      <div className="acciones">
        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Creando…' : `Crear ${datos.rol === 'cliente' ? 'cliente' : 'administrador'}`}
        </button>
      </div>
    </form>
  )
}
