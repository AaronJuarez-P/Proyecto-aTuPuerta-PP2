import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { cancelarPedidoAdmin, obtenerPedidoAdmin } from '../../api/admin'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Modal } from '../../components/Comunes/Comunes'
import MapaSeguimiento from '../../components/MapaSeguimiento/MapaSeguimiento'
import { useAvisos } from '../../context/avisos'
import { useCarga } from '../../hooks/useCarga'
import { ESTADOS_TERMINALES, METODOS_PAGO, VEHICULOS } from '../../utils/estados'
import { formatearDistancia, formatearFecha, formatearFechaYHora, formatearMinutos, formatearPrecio } from '../../utils/formato'
import { autorDeAuditoria } from './auditoria'
import './Admin.css'

// Detalle de un pedido para supervisarlo (CU24): los tres actores, el pago, la última
// posición del repartidor, su auditoría completa y los reclamos. Se puede cancelar con
// motivo desde cualquier estado no terminal.
export default function AdminPedido() {
  const { id } = useParams()
  const avisar = useAvisos()
  const { datos, cargando, error, recargar } = useCarga(() => obtenerPedidoAdmin(id), [id])
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [errorCancelar, setErrorCancelar] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function cancelar(evento) {
    evento.preventDefault()
    setErrorCancelar('')
    setEnviando(true)

    try {
      const resultado = await cancelarPedidoAdmin(id, motivo.trim())
      avisar(resultado.reembolso_manual
        ? 'Pedido cancelado. Estaba pagado: la devolución del dinero se hace a mano.'
        : 'Pedido cancelado.')
      setCancelando(false)
      setMotivo('')
      recargar()
    } catch (errorAccion) {
      setErrorCancelar(errorAccion.message)
    } finally {
      setEnviando(false)
    }
  }

  const pedido = datos?.pedido

  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin/pedidos">← Pedidos</Link>

        {error && !pedido ? (
          error.codigo === 404 ? <EstadoVacio icono="📦" titulo="Pedido no encontrado" /> : <MensajeError error={error} alReintentar={recargar} />
        ) : cargando && !pedido ? (
          <Cargando />
        ) : (
          <>
            <header className="admin-header">
              <div>
                <p className="admin-label">Pedido #{pedido.id}</p>
                <h1>{pedido.comercio.nombre} → {pedido.cliente.nombre}</h1>
                <p>Creado el {formatearFecha(pedido.created_at)} · última novedad {formatearFecha(pedido.updated_at)}</p>
              </div>
              <div className="admin-acciones-pedido">
                <EstadoBadge estado={pedido.estado} />
                {!ESTADOS_TERMINALES.includes(pedido.estado) && (
                  <button type="button" className="boton boton-peligro" onClick={() => setCancelando(true)}>
                    Cancelar pedido
                  </button>
                )}
              </div>
            </header>

            {pedido.motivo_cancelacion && (
              <p className="aviso-form aviso-form-error admin-aviso">{pedido.motivo_cancelacion}</p>
            )}

            <div className="grilla-dos">
              <div>
                <section className="tarjeta">
                  <h2>Productos</h2>
                  {pedido.items.map((item) => (
                    <div className="dato-fila" key={item.producto_id}>
                      <span>{item.cantidad} × {item.nombre} ({formatearPrecio(item.precio_unit)})</span>
                      <strong>{formatearPrecio(item.subtotal)}</strong>
                    </div>
                  ))}
                  <div className="dato-fila"><span>Total</span><strong>{formatearPrecio(pedido.total)}</strong></div>
                  <div className="dato-fila"><span>Comisión del repartidor</span><strong>{formatearPrecio(pedido.comision)}</strong></div>
                  <div className="dato-fila">
                    <span>Recorrido estimado</span>
                    <strong>{formatearDistancia(pedido.distancia_km)} · {formatearMinutos(pedido.tiempo_estimado)}</strong>
                  </div>
                </section>

                <section className="tarjeta">
                  <h2>Auditoría</h2>
                  {pedido.auditoria.length === 0 ? (
                    <p className="texto-apagado">Sin registros.</p>
                  ) : (
                    <ol className="linea-auditoria">
                      {pedido.auditoria.map((registro) => (
                        <li key={registro.id}>
                          <EstadoBadge tipo="auditoria" estado={registro.accion} />
                          <div>
                            <strong>{registro.detalle ?? '—'}</strong>
                            <small>{formatearFechaYHora(registro.fecha, registro.hora)} · {autorDeAuditoria(registro)}</small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {pedido.reclamos.length > 0 && (
                  <section className="tarjeta">
                    <h2>Reclamos</h2>
                    {pedido.reclamos.map((reclamo) => (
                      <Link className="fila-tablero" key={reclamo.id} to={`/admin/reclamos/${reclamo.id}`}>
                        <span><strong>#{reclamo.id}</strong> de {reclamo.usuario}<small>{formatearFecha(reclamo.created_at)}</small></span>
                        <EstadoBadge tipo="reclamo" estado={reclamo.estado} />
                      </Link>
                    ))}
                  </section>
                )}
              </div>

              <aside>
                <section className="tarjeta">
                  <h2>Cliente</h2>
                  <div className="dato-fila"><span>Nombre</span><strong>{pedido.cliente.nombre}</strong></div>
                  <div className="dato-fila"><span>Email</span><strong>{pedido.cliente.email}</strong></div>
                  <div className="dato-fila"><span>Teléfono</span><strong>{pedido.cliente.telefono}</strong></div>
                  <div className="dato-fila"><span>Entrega</span><strong>{pedido.direccion_entrega}</strong></div>
                </section>

                <section className="tarjeta">
                  <h2>Comercio</h2>
                  <div className="dato-fila"><span>Nombre</span><strong>{pedido.comercio.nombre}</strong></div>
                  <div className="dato-fila"><span>Dirección</span><strong>{pedido.comercio.direccion}</strong></div>
                </section>

                <section className="tarjeta">
                  <h2>Repartidor</h2>
                  {pedido.repartidor ? (
                    <>
                      <div className="dato-fila"><span>Nombre</span><strong>{pedido.repartidor.nombre}</strong></div>
                      <div className="dato-fila"><span>Teléfono</span><strong>{pedido.repartidor.telefono}</strong></div>
                      <div className="dato-fila"><span>Vehículo</span><strong>{VEHICULOS[pedido.repartidor.tipo_vehiculo] ?? pedido.repartidor.tipo_vehiculo}</strong></div>
                    </>
                  ) : (
                    <p className="texto-apagado">Todavía sin asignar.</p>
                  )}
                </section>

                <section className="tarjeta">
                  <h2>Pago</h2>
                  {pedido.pago ? (
                    <>
                      <div className="dato-fila"><span>Estado</span><strong><EstadoBadge tipo="pago" estado={pedido.pago.estado} /></strong></div>
                      <div className="dato-fila"><span>Método</span><strong>{METODOS_PAGO[pedido.pago.metodo] ?? pedido.pago.metodo}</strong></div>
                      <div className="dato-fila"><span>Monto</span><strong>{formatearPrecio(pedido.pago.monto)}</strong></div>
                      {pedido.pago.referencia_externa && <div className="dato-fila"><span>Referencia</span><strong>{pedido.pago.referencia_externa}</strong></div>}
                      {pedido.pago.fecha_pago && <div className="dato-fila"><span>Fecha</span><strong>{formatearFecha(pedido.pago.fecha_pago)}</strong></div>}
                      {pedido.pago.motivo_rechazo && <div className="dato-fila"><span>Motivo</span><strong>{pedido.pago.motivo_rechazo}</strong></div>}
                    </>
                  ) : (
                    <p className="texto-apagado">Sin intentos de pago.</p>
                  )}
                </section>

                {pedido.ultima_ubicacion && (
                  <section className="tarjeta">
                    <h2>Última posición del repartidor</h2>
                    <p className="texto-apagado">Registrada el {formatearFecha(pedido.ultima_ubicacion.registrado_en)}</p>
                    <MapaSeguimiento repartidor={pedido.ultima_ubicacion} etiquetas={{ repartidor: pedido.repartidor?.nombre ?? 'Repartidor' }} />
                  </section>
                )}
              </aside>
            </div>

            <Modal abierto={cancelando} titulo={`Cancelar el pedido #${pedido.id}`} alCerrar={() => setCancelando(false)}>
              <form className="formulario" onSubmit={cancelar}>
                <p className="texto-apagado">
                  Se devuelve el stock y, si iba en camino, el repartidor vuelve a quedar disponible. Si
                  ya estaba pagado, la devolución del dinero se hace a mano. Se les avisa al cliente, al
                  comercio y al repartidor.
                </p>
                <div className="campo-form">
                  <label htmlFor="motivo-cancelacion">Motivo</label>
                  <textarea id="motivo-cancelacion" value={motivo} onChange={(evento) => setMotivo(evento.target.value)} maxLength={200} />
                  <small>Lo ven el cliente, el comercio y el repartidor.</small>
                </div>
                {errorCancelar && <p className="aviso-form aviso-form-error">{errorCancelar}</p>}
                <div className="acciones">
                  <button type="submit" className="boton boton-peligro" disabled={enviando || !motivo.trim()}>
                    {enviando ? 'Cancelando…' : 'Cancelar el pedido'}
                  </button>
                </div>
              </form>
            </Modal>
          </>
        )}
      </section>
    </main>
  )
}
