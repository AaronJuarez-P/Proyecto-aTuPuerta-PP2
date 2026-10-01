import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { asignarReclamo, obtenerReclamoAdmin, resolverReclamo } from '../../api/admin'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { formatearFecha, formatearPrecio } from '../../utils/formato'
import './Admin.css'

const LARGO_MINIMO_RESOLUCION = 5
const LARGO_MAXIMO_RESOLUCION = 2000

// Un reclamo visto por el administrador (CU25): pendiente -> en_revision al tomarlo, y de
// ahí resuelto o rechazado con una respuesta que le llega a quien reclamó.
export default function AdminReclamo() {
  const { id } = useParams()
  const { usuario: yo } = useSesion()
  const avisar = useAvisos()
  const { datos, cargando, error, recargar } = useCarga(() => obtenerReclamoAdmin(id), [id])
  const [tomando, setTomando] = useState(false)
  const reclamo = datos?.reclamo

  // Tomarlo sirve también para pasárselo a uno mismo si lo tenía otro administrador
  async function tomar() {
    setTomando(true)

    try {
      await asignarReclamo(id)
      avisar('El reclamo quedó a tu cargo')
      recargar()
    } catch (errorAsignar) {
      avisar(errorAsignar.message, 'error')
    } finally {
      setTomando(false)
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin/reclamos">← Reclamos</Link>

        {error && !reclamo ? (
          error.codigo === 404 ? <EstadoVacio icono="📣" titulo="Reclamo no encontrado" /> : <MensajeError error={error} alReintentar={recargar} />
        ) : cargando && !reclamo ? (
          <Cargando />
        ) : (
          <>
            <header className="admin-header">
              <div>
                <p className="admin-label">Reclamo #{reclamo.id}</p>
                <h1>{reclamo.pedido_id ? `Sobre el pedido #${reclamo.pedido_id}` : 'Reclamo general'}</h1>
                <p>Hecho el {formatearFecha(reclamo.created_at)} por {reclamo.usuario}</p>
              </div>
              <EstadoBadge tipo="reclamo" estado={reclamo.estado} />
            </header>

            <div className="grilla-dos">
              <div>
                <section className="tarjeta">
                  <h2>Lo que cuenta</h2>
                  <p className="admin-texto">{reclamo.descripcion}</p>
                  <div className="dato-fila">
                    <span>Hecho por</span>
                    <strong><Link to={`/admin/usuarios/${reclamo.usuario_id}`}>{reclamo.usuario}</Link></strong>
                  </div>
                  <div className="dato-fila"><span>Email</span><strong>{reclamo.usuario_email}</strong></div>
                </section>

                <section className="tarjeta">
                  <h2>Atención</h2>
                  <Atencion reclamo={reclamo} esMio={reclamo.admin_asignado_id === yo.administradorId} tomando={tomando} alTomar={tomar} alResolver={recargar} />
                </section>
              </div>

              <aside>
                {reclamo.pedido ? (
                  <section className="tarjeta">
                    <h2>Pedido #{reclamo.pedido.id}</h2>
                    <div className="dato-fila"><span>Comercio</span><strong>{reclamo.pedido.comercio}</strong></div>
                    <div className="dato-fila"><span>Estado</span><strong><EstadoBadge estado={reclamo.pedido.estado} /></strong></div>
                    <div className="dato-fila"><span>Total</span><strong>{formatearPrecio(reclamo.pedido.total)}</strong></div>
                    <div className="dato-fila"><span>Fecha</span><strong>{formatearFecha(reclamo.pedido.created_at)}</strong></div>
                    <div className="acciones">
                      <Link className="boton boton-secundario" to={`/admin/pedidos/${reclamo.pedido.id}`}>Ver el pedido completo</Link>
                    </div>
                  </section>
                ) : (
                  <section className="tarjeta">
                    <h2>Sin pedido</h2>
                    <p className="texto-apagado">Es un reclamo general, no está atado a ninguna compra.</p>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function Atencion({ reclamo, esMio, tomando, alTomar, alResolver }) {
  if (reclamo.estado === 'resuelto' || reclamo.estado === 'rechazado') {
    return (
      <>
        <p className="admin-texto">{reclamo.resolucion}</p>
        <p className="texto-apagado">
          {reclamo.estado === 'resuelto' ? 'Resuelto' : 'Rechazado'} por {reclamo.admin_asignado ?? 'un administrador'} el {formatearFecha(reclamo.updated_at)}
        </p>
      </>
    )
  }

  if (reclamo.estado === 'pendiente') {
    return (
      <>
        <p className="texto-apagado">
          Nadie lo tomó todavía. Al tomarlo pasa a «En revisión» y le avisamos a {reclamo.usuario}.
        </p>
        <div className="acciones">
          <button type="button" className="boton boton-primario" disabled={tomando} onClick={alTomar}>
            {tomando ? 'Tomando…' : 'Tomar el reclamo'}
          </button>
        </div>
      </>
    )
  }

  if (!esMio) {
    return (
      <>
        <p className="texto-apagado">
          Lo está atendiendo {reclamo.admin_asignado}. Solo quien lo tiene asignado lo puede cerrar.
        </p>
        <div className="acciones">
          <button type="button" className="boton boton-secundario" disabled={tomando} onClick={alTomar}>
            {tomando ? 'Un momento…' : 'Pasármelo a mí'}
          </button>
        </div>
      </>
    )
  }

  return <Resolver reclamo={reclamo} alResolver={alResolver} />
}

function Resolver({ reclamo, alResolver }) {
  const avisar = useAvisos()
  const [estado, setEstado] = useState('resuelto')
  const [resolucion, setResolucion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    setError('')
    setEnviando(true)

    try {
      await resolverReclamo(reclamo.id, estado, resolucion.trim())
      avisar(estado === 'resuelto' ? 'Reclamo resuelto' : 'Reclamo rechazado')
      alResolver()
    } catch (errorResolver) {
      setError(errorResolver.message)
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <p className="texto-apagado">Lo tenés vos. Cerralo con una respuesta: le llega a {reclamo.usuario} como notificación.</p>

      <div className="chips" role="radiogroup" aria-label="Cómo se cierra">
        {[['resuelto', 'Resuelto'], ['rechazado', 'Rechazado']].map(([valor, texto]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={estado === valor}
            className={`chip ${estado === valor ? 'activo' : ''}`}
            onClick={() => setEstado(valor)}
          >
            {texto}
          </button>
        ))}
      </div>

      <div className="campo-form">
        <label htmlFor="resolucion">Respuesta</label>
        <textarea
          id="resolucion"
          value={resolucion}
          onChange={(evento) => setResolucion(evento.target.value)}
          minLength={LARGO_MINIMO_RESOLUCION}
          maxLength={LARGO_MAXIMO_RESOLUCION}
          rows={5}
          required
        />
        <small>{resolucion.trim().length} de {LARGO_MAXIMO_RESOLUCION} caracteres (mínimo {LARGO_MINIMO_RESOLUCION}).</small>
      </div>

      {error && <p className="aviso-form aviso-form-error">{error}</p>}

      <div className="acciones">
        <button
          type="submit"
          className={`boton ${estado === 'rechazado' ? 'boton-peligro' : 'boton-primario'}`}
          disabled={enviando || resolucion.trim().length < LARGO_MINIMO_RESOLUCION}
        >
          {enviando ? 'Cerrando…' : estado === 'resuelto' ? 'Cerrar como resuelto' : 'Cerrar como rechazado'}
        </button>
      </div>
    </form>
  )
}
