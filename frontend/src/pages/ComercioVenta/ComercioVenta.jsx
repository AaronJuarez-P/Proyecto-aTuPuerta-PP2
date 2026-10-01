import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { marcarPreparado, obtenerVenta } from '../../api/comercio'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Modal } from '../../components/Comunes/Comunes'
import FormularioReclamo from '../../components/FormularioReclamo/FormularioReclamo'
import { useAvisos } from '../../context/avisos'
import { useCarga } from '../../hooks/useCarga'
import { formatearFecha, formatearPrecio } from '../../utils/formato'

// Detalle de una venta propia (GET /api/comercio/ventas/:id). También es a donde llevan
// las notificaciones push de "pedido nuevo" (/comercio/pedidos/:id redirige acá).
export default function ComercioVenta() {
  const { id } = useParams()
  const avisar = useAvisos()
  const { datos, cargando, error, recargar } = useCarga(() => obtenerVenta(id), [id])
  const [marcando, setMarcando] = useState(false)
  const [reclamando, setReclamando] = useState(false)

  async function marcar() {
    setMarcando(true)

    try {
      await marcarPreparado(id)
      avisar(`Pedido #${id} listo: ya lo puede retirar un repartidor.`)
      recargar()
    } catch (errorMarcar) {
      avisar(errorMarcar.message, 'error')
    } finally {
      setMarcando(false)
    }
  }

  const venta = datos?.venta

  return (
    <main className="pagina">
      <div className="pagina-contenido">
        <Link className="volver-link" to="/comercio?ver=ventas">← Pedidos y ventas</Link>

        {error && !venta ? (
          error.codigo === 404 || error.codigo === 403 ? (
            <EstadoVacio icono="🧾" titulo="Venta no encontrada">{error.message}</EstadoVacio>
          ) : (
            <MensajeError error={error} alReintentar={recargar} />
          )
        ) : cargando && !venta ? (
          <Cargando />
        ) : (
          <>
            <div className="pagina-encabezado">
              <div>
                <p className="etiqueta-seccion">Venta #{venta.id}</p>
                <h1>{venta.cliente}</h1>
                <p>Pedido del {formatearFecha(venta.created_at)}</p>
              </div>
              <EstadoBadge estado={venta.estado} />
            </div>

            <div className="grilla-dos">
              <section className="tarjeta">
                <h2>Productos</h2>
                {venta.items.map((item) => (
                  <div className="dato-fila" key={item.producto_id}>
                    <span>{item.cantidad} × {item.nombre}</span>
                    <strong>{formatearPrecio(item.subtotal)}</strong>
                  </div>
                ))}
                <div className="dato-fila">
                  <span>Total</span>
                  <strong>{formatearPrecio(venta.total)}</strong>
                </div>

                {venta.estado === 'en_preparacion' && (
                  <div className="acciones">
                    <button type="button" className="boton boton-primario" disabled={marcando} onClick={marcar}>
                      {marcando ? 'Marcando…' : '✓ Está listo para retirar'}
                    </button>
                  </div>
                )}
              </section>

              <aside>
                <section className="tarjeta">
                  <h2>Seguimiento</h2>
                  <div className="dato-fila">
                    <span>Repartidor</span>
                    <strong>{venta.repartidor ?? 'Todavía sin asignar'}</strong>
                  </div>
                  <div className="dato-fila">
                    <span>Última novedad</span>
                    <strong>{formatearFecha(venta.updated_at)}</strong>
                  </div>
                  {venta.motivo_cancelacion && (
                    <div className="dato-fila">
                      <span>Motivo de cancelación</span>
                      <strong>{venta.motivo_cancelacion}</strong>
                    </div>
                  )}
                </section>

                <section className="tarjeta">
                  <h2>¿Algún problema?</h2>
                  <p className="texto-apagado">Si hubo un inconveniente con este pedido, avisale al equipo de ATuPuerta.</p>
                  <div className="acciones">
                    <button type="button" className="boton boton-secundario" onClick={() => setReclamando(true)}>
                      Hacer un reclamo
                    </button>
                  </div>
                </section>
              </aside>
            </div>

            <Modal abierto={reclamando} titulo={`Reclamo sobre el pedido #${venta.id}`} alCerrar={() => setReclamando(false)}>
              <FormularioReclamo pedidoId={venta.id} alTerminar={() => setReclamando(false)} />
            </Modal>
          </>
        )}
      </div>
    </main>
  )
}
