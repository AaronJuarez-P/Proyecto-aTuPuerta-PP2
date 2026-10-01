import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  cambiarEstadoComercio,
  cambiarEstadoUsuario,
  darDeBajaUsuario,
  editarUsuario,
  obtenerUsuario,
} from '../../api/admin'
import { Cargando, Confirmacion, EstadoBadge, EstadoVacio, MensajeError, Modal } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { VEHICULOS } from '../../utils/estados'
import { formatearFecha, plural } from '../../utils/formato'
import { etiquetaDelRol } from '../../utils/roles'
import './Admin.css'

// Detalle de una cuenta (CU23): sus datos, sus perfiles, lo que tiene en curso y las
// acciones del administrador. Suspender corta el acceso al instante (el backend revisa
// usuarios.activo en cada pedido) y es reversible tal cual; la baja además saca el
// comercio del catálogo y cancela los pedidos que nunca se pagaron.
export default function AdminUsuario() {
  const { id } = useParams()
  const { usuario: yo, actualizarUsuario } = useSesion()
  const avisar = useAvisos()
  const { datos, cargando, error, recargar } = useCarga(() => obtenerUsuario(id), [id])
  const [accion, setAccion] = useState(null)

  const cuenta = datos?.usuario
  const cerrar = () => setAccion(null)

  if (error && !cuenta) {
    return (
      <Pantalla>
        {error.codigo === 404 ? <EstadoVacio icono="👥" titulo="Usuario no encontrado" /> : <MensajeError error={error} alReintentar={recargar} />}
      </Pantalla>
    )
  }

  if (cargando && !cuenta) {
    return <Pantalla><Cargando /></Pantalla>
  }

  const { cliente, comercio, repartidor, administrador } = cuenta.perfiles
  const { en_curso: enCurso } = datos.pedidos
  const esMiCuenta = cuenta.id === yo.id

  // Lo mismo que frena el backend con un 409: mejor explicarlo antes que dejar intentar
  const impedimento = esMiCuenta
    ? 'Es tu propia cuenta: no la podés suspender ni dar de baja desde el panel.'
    : enCurso.length > 0
      ? `Tiene ${plural(enCurso.length, 'pedido')} en curso que dependen de esta cuenta. Primero tienen que entregarse o cancelarse.`
      : null

  function terminar(mensaje) {
    cerrar()
    avisar(mensaje)
    recargar()
  }

  const ventanas = {
    editar: {
      titulo: 'Editar datos',
      contenido: (
        <EditarDatos
          cuenta={cuenta}
          alGuardar={(actualizada) => {
            if (esMiCuenta) {
              actualizarUsuario({ nombre: actualizada.nombre })
            }
            terminar('Datos actualizados')
          }}
        />
      ),
    },
    suspender: {
      titulo: `Suspender a ${cuenta.nombre}`,
      contenido: (
        <Confirmacion
          boton="Suspender la cuenta"
          peligro
          alConfirmar={async () => {
            await cambiarEstadoUsuario(cuenta.id, false)
            terminar('Cuenta suspendida')
          }}
        >
          <p>Deja de poder entrar al instante: la sesión que tenga abierta se cierra en su próximo movimiento.</p>
          {repartidor && <p>Como repartidor, queda fuera de servicio.</p>}
          <p>No se borra nada y se puede reactivar cuando quieras.</p>
        </Confirmacion>
      ),
    },
    reactivar: {
      titulo: `Reactivar a ${cuenta.nombre}`,
      contenido: (
        <Confirmacion
          boton="Reactivar la cuenta"
          alConfirmar={async () => {
            await cambiarEstadoUsuario(cuenta.id, true)
            terminar('Cuenta reactivada')
          }}
        >
          <p>Vuelve a poder entrar y le llega un aviso.</p>
          {comercio && !comercio.activo && <p>Su comercio sigue suspendido: se reactiva aparte.</p>}
        </Confirmacion>
      ),
    },
    baja: {
      titulo: `Dar de baja a ${cuenta.nombre}`,
      contenido: (
        <Confirmacion
          boton="Dar de baja"
          peligro
          alConfirmar={async () => {
            const { pedidos_cancelados: cancelados } = await darDeBajaUsuario(cuenta.id)
            terminar(cancelados.length > 0
              ? `Cuenta dada de baja. Se cancelaron sus pedidos sin pagar: ${cancelados.map((numero) => `#${numero}`).join(', ')}`
              : 'Cuenta dada de baja')
          }}
        >
          <p>Es la baja que pide una persona cuando deja la plataforma:</p>
          <ul>
            <li>la cuenta queda desactivada;</li>
            {comercio && <li>el comercio sale del catálogo;</li>}
            {repartidor && <li>el repartidor queda fuera de servicio;</li>}
            {cliente && <li>se cancelan los pedidos que nunca pagó y vuelve el stock;</li>}
            <li>se borran sus suscripciones a notificaciones.</li>
          </ul>
          <p>No se borra su historial. La cuenta se puede reactivar después{comercio ? ', pero el comercio hay que reactivarlo aparte' : ''}.</p>
        </Confirmacion>
      ),
    },
    comercio: comercio && {
      titulo: `${comercio.activo ? 'Suspender' : 'Reactivar'} ${comercio.nombre}`,
      contenido: (
        <Confirmacion
          boton={comercio.activo ? 'Suspender el comercio' : 'Reactivar el comercio'}
          peligro={comercio.activo}
          alConfirmar={async () => {
            await cambiarEstadoComercio(comercio.id, !comercio.activo)
            terminar(comercio.activo ? 'Comercio suspendido' : 'Comercio reactivado')
          }}
        >
          {comercio.activo ? (
            <p>
              Sale del catálogo y no puede gestionar pedidos ni productos. La cuenta sigue activa:
              la persona puede seguir comprando como cliente.
            </p>
          ) : (
            <p>Vuelve a aparecer en el catálogo y puede volver a vender.</p>
          )}
        </Confirmacion>
      ),
    },
  }

  const ventana = accion ? ventanas[accion] : null

  return (
    <Pantalla>
      <header className="admin-header">
        <div>
          <p className="admin-label">Usuario #{cuenta.id}{esMiCuenta ? ' · tu cuenta' : ''}</p>
          <h1>{cuenta.nombre}</h1>
          <p>{cuenta.email} · alta el {formatearFecha(cuenta.created_at, { conHora: false })}</p>
        </div>
        <span className={`estado-badge ${cuenta.activo ? 'tono-ok' : 'tono-error'}`}>
          {cuenta.activo ? 'Activa' : 'Inactiva'}
        </span>
      </header>

      <div className="grilla-dos">
        <div>
          <section className="tarjeta">
            <h2>Datos de la cuenta</h2>
            <div className="dato-fila"><span>Nombre</span><strong>{cuenta.nombre}</strong></div>
            <div className="dato-fila"><span>Email</span><strong>{cuenta.email}</strong></div>
            <div className="dato-fila"><span>Teléfono</span><strong>{cuenta.telefono}</strong></div>
            <div className="dato-fila">
              <span>Sesión abierta</span>
              <strong>{cuenta.sesion ? `como ${etiquetaDelRol(cuenta.sesion).toLowerCase()}` : 'Ninguna'}</strong>
            </div>
            <div className="acciones">
              <button type="button" className="boton boton-secundario" onClick={() => setAccion('editar')}>
                Editar datos
              </button>
            </div>
          </section>

          <section className="tarjeta">
            <h2>Perfiles</h2>

            {cliente && (
              <div className="admin-perfil">
                <h3>🛍️ Cliente</h3>
                <div className="dato-fila"><span>Dirección de entrega</span><strong>{cliente.direccion_entrega}</strong></div>
                <Link to={`/admin/pedidos?clienteId=${cliente.id}`}>
                  Ver sus compras ({datos.pedidos.como_cliente})
                </Link>
              </div>
            )}

            {comercio && (
              <div className="admin-perfil">
                <h3>🏪 Comercio</h3>
                <div className="dato-fila"><span>Nombre</span><strong>{comercio.nombre}</strong></div>
                <div className="dato-fila">
                  <span>Estado</span>
                  <strong>
                    <span className={`estado-badge ${comercio.activo ? 'tono-ok' : 'tono-error'}`}>
                      {comercio.activo ? 'En el catálogo' : 'Suspendido'}
                    </span>
                  </strong>
                </div>
                <div className="admin-enlaces">
                  <Link to={`/admin/pedidos?comercioId=${comercio.id}`}>Ver sus ventas ({datos.pedidos.como_comercio})</Link>
                  <Link to={`/admin/auditoria?ver=productos&comercioId=${comercio.id}`}>Cambios en sus productos</Link>
                </div>
                <div className="acciones">
                  <button
                    type="button"
                    className={`boton ${comercio.activo ? 'boton-peligro' : 'boton-secundario'}`}
                    onClick={() => setAccion('comercio')}
                  >
                    {comercio.activo ? 'Suspender el comercio' : 'Reactivar el comercio'}
                  </button>
                </div>
              </div>
            )}

            {repartidor && (
              <div className="admin-perfil">
                <h3>🛵 Repartidor</h3>
                <div className="dato-fila"><span>Vehículo</span><strong>{VEHICULOS[repartidor.tipo_vehiculo] ?? repartidor.tipo_vehiculo}</strong></div>
                <div className="dato-fila"><span>Servicio</span><strong>{repartidor.disponible ? 'En servicio' : 'Fuera de servicio'}</strong></div>
                <Link to={`/admin/pedidos?repartidorId=${repartidor.id}`}>
                  Ver sus entregas ({datos.pedidos.como_repartidor})
                </Link>
              </div>
            )}

            {administrador && (
              <div className="admin-perfil">
                <h3>⚙️ Administrador</h3>
                <p className="texto-apagado">Puede entrar al panel de administración.</p>
              </div>
            )}
          </section>
        </div>

        <aside>
          <section className="tarjeta">
            <h2>Actividad</h2>
            <div className="dato-fila"><span>Reclamos hechos</span><strong>{datos.reclamos}</strong></div>
            <div className="dato-fila"><span>Pedidos en curso</span><strong>{enCurso.length}</strong></div>
            {enCurso.map((pedido) => (
              <Link className="fila-tablero" key={pedido.id} to={`/admin/pedidos/${pedido.id}`}>
                <strong>Pedido #{pedido.id}</strong>
                <EstadoBadge estado={pedido.estado} />
              </Link>
            ))}
            <div className="acciones">
              <Link className="boton boton-secundario" to={`/admin/auditoria?usuarioId=${cuenta.id}`}>
                Lo que hizo en los pedidos
              </Link>
            </div>
          </section>

          <section className="tarjeta admin-zona-peligro">
            <h2>Acceso</h2>
            {impedimento && <p className="aviso-form aviso-form-info">{impedimento}</p>}
            <div className="acciones">
              {cuenta.activo ? (
                <button type="button" className="boton boton-peligro" disabled={Boolean(impedimento)} onClick={() => setAccion('suspender')}>
                  Suspender la cuenta
                </button>
              ) : (
                <button type="button" className="boton boton-primario" disabled={esMiCuenta} onClick={() => setAccion('reactivar')}>
                  Reactivar la cuenta
                </button>
              )}
              <button type="button" className="boton boton-secundario" disabled={Boolean(impedimento)} onClick={() => setAccion('baja')}>
                Dar de baja
              </button>
            </div>
          </section>
        </aside>
      </div>

      <Modal abierto={Boolean(ventana)} titulo={ventana?.titulo} alCerrar={cerrar}>
        {ventana?.contenido}
      </Modal>
    </Pantalla>
  )
}

function Pantalla({ children }) {
  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin/usuarios">← Usuarios</Link>
        {children}
      </section>
    </main>
  )
}

// Solo viaja lo que cambió: el email repetido de otra cuenta lo frena el backend (409)
function EditarDatos({ cuenta, alGuardar }) {
  const [valores, setValores] = useState({ nombre: cuenta.nombre, telefono: cuenta.telefono, email: cuenta.email })
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cambiarCampo = (evento) => setValores({ ...valores, [evento.target.name]: evento.target.value })

  async function enviar(evento) {
    evento.preventDefault()
    setError('')

    const cambios = Object.fromEntries(
      Object.entries(valores)
        .map(([campo, valor]) => [campo, valor.trim()])
        .filter(([campo, valor]) => valor !== cuenta[campo])
    )

    if (Object.keys(cambios).length === 0) {
      setError('No cambiaste nada.')
      return
    }

    setEnviando(true)

    try {
      const { usuario } = await editarUsuario(cuenta.id, cambios)
      alGuardar(usuario)
    } catch (errorEdicion) {
      setError(errorEdicion.message)
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <div className="campo-form">
        <label htmlFor="editar-nombre">Nombre</label>
        <input id="editar-nombre" name="nombre" value={valores.nombre} onChange={cambiarCampo} maxLength={100} required />
      </div>
      <div className="campo-form">
        <label htmlFor="editar-telefono">Teléfono</label>
        <input id="editar-telefono" name="telefono" type="tel" value={valores.telefono} onChange={cambiarCampo} minLength={6} maxLength={20} required />
      </div>
      <div className="campo-form">
        <label htmlFor="editar-email">Email</label>
        <input id="editar-email" name="email" type="email" value={valores.email} onChange={cambiarCampo} required />
        <small>Es con lo que entra. Cambialo solo si verificaste que quien lo pide es la persona.</small>
      </div>
      {error && <p className="aviso-form aviso-form-error">{error}</p>}
      <div className="acciones">
        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
