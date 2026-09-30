import { useState } from 'react'
import { Link } from 'react-router'
import { Cargando, MensajeError } from '../../components/Comunes/Comunes'
import { useCarrito } from '../../context/carrito'
import { formatearDistancia, formatearMinutos, formatearPrecio, plural } from '../../utils/formato'
import './Checkout.css'

// Confirmar el carrito (CU06). El backend crea un pedido por comercio, en pago_espera:
// el pago (CU07) se hace después, desde el detalle de cada pedido.
export default function Checkout() {
  const { carrito, error, recargar, confirmar } = useCarrito()

  // null = la dirección del perfil. Si el cliente la cambia, vale solo para esta compra
  // (el backend la geocodifica pero no pisa la del perfil).
  const [direccion, setDireccion] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [errorConfirmar, setErrorConfirmar] = useState(null)
  const [pedidosCreados, setPedidosCreados] = useState(null)

  const direccionPerfil = carrito?.direccion_entrega_default ?? ''
  const direccionElegida = direccion ?? direccionPerfil
  const esOtraDireccion = direccionElegida.trim() !== direccionPerfil.trim()

  async function confirmarPedido(evento) {
    evento.preventDefault()
    setErrorConfirmar(null)

    if (!direccionElegida.trim()) {
      setErrorConfirmar(new Error('Completá la dirección de entrega.'))
      return
    }

    setConfirmando(true)

    try {
      const { pedidos } = await confirmar(esOtraDireccion ? direccionElegida.trim() : undefined)
      setPedidosCreados(pedidos)
      window.scrollTo(0, 0)
    } catch (errorConfirmacion) {
      setErrorConfirmar(errorConfirmacion)
    } finally {
      setConfirmando(false)
    }
  }

  if (pedidosCreados) {
    const varios = pedidosCreados.length > 1

    return (
      <main className="checkout-page">
        <section className="order-success">
          <div className="success-icon" aria-hidden="true">✓</div>

          <p className="eyebrow">{varios ? 'PEDIDOS CONFIRMADOS' : 'PEDIDO CONFIRMADO'}</p>
          <h1>{varios ? `¡Listo! Armamos ${pedidosCreados.length} pedidos.` : '¡Listo! Tu pedido está hecho.'}</h1>

          <p>
            Falta el pago: {varios ? 'pagá cada pedido' : 'pagalo'} para que el comercio lo empiece a
            preparar. {varios && 'Son uno por comercio, porque cada uno prepara y despacha lo suyo.'}
          </p>

          <div className="success-status">
            <small>ESTADO ACTUAL</small>
            <span>Esperando pago</span>
          </div>

          <ul className="pedidos-creados">
            {pedidosCreados.map((pedido) => (
              <li key={pedido.pedidoId}>
                <div>
                  <strong>Pedido #{pedido.pedidoId} · {pedido.comercio}</strong>
                  <small>
                    Llega en unos {formatearMinutos(pedido.tiempo_estimado)} · {formatearDistancia(pedido.distancia_km)}
                  </small>
                </div>
                <span>{formatearPrecio(pedido.total)}</span>
                <Link className="boton boton-primario boton-chico" to={`/pedidos/${pedido.pedidoId}`}>
                  Pagar
                </Link>
              </li>
            ))}
          </ul>

          <div className="success-actions">
            <Link to="/pedidos">Ver mis pedidos</Link>
            <Link to="/comercios" className="secondary-action">Seguir comprando</Link>
          </div>
        </section>
      </main>
    )
  }

  if (!carrito) {
    return (
      <main className="checkout-page">
        <div className="checkout-container">
          {error ? <MensajeError error={error} alReintentar={() => recargar().catch(() => {})} /> : <Cargando />}
        </div>
      </main>
    )
  }

  const comercios = carrito.comercios ?? []

  if (comercios.length === 0) {
    return (
      <main className="checkout-page">
        <section className="checkout-empty">
          <div className="checkout-empty-icon" aria-hidden="true">🛒</div>
          <p className="eyebrow">CHECKOUT</p>
          <h1>Tu carrito está vacío</h1>
          <p>Agregá algunos productos antes de continuar con tu pedido.</p>
          <Link to="/comercios">Explorar comercios</Link>
        </section>
      </main>
    )
  }

  const hayNoDisponibles = comercios.some((grupo) => grupo.items.some((item) => !item.disponible))
  const erroresDeItems = errorConfirmar?.datos?.errores ?? []

  return (
    <main className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-title">
          <Link to="/carrito" className="back-link">
            <span aria-hidden="true">←</span> Volver al carrito
          </Link>
          <p className="eyebrow">CHECKOUT</p>
          <h1>Finalizá tu pedido</h1>
          <p>Revisá la dirección de entrega y confirmá. El pago viene después.</p>
        </div>

        <div className="checkout-layout">
          <form className="checkout-form" onSubmit={confirmarPedido}>
            <section className="checkout-card">
              <div className="card-heading">
                <span className="card-number">01</span>
                <div>
                  <h2>Datos de entrega</h2>
                  <p>¿Dónde querés recibir tu pedido?</p>
                </div>
              </div>

              <div className="form-fields">
                <div className="form-group">
                  <label htmlFor="direccion">Dirección de entrega</label>
                  <div className="input-wrapper">
                    <span className="input-icon" aria-hidden="true">📍</span>
                    <input
                      id="direccion"
                      type="text"
                      value={direccionElegida}
                      onChange={(evento) => setDireccion(evento.target.value)}
                      placeholder="Calle, número y ciudad"
                      autoComplete="street-address"
                      maxLength={200}
                    />
                  </div>
                  <small className="input-help">
                    {esOtraDireccion ? (
                      <>
                        Es una entrega en otra dirección: vale solo para esta compra.{' '}
                        <button type="button" className="enlace-boton" onClick={() => setDireccion(null)}>
                          Usar la de mi perfil
                        </button>
                      </>
                    ) : (
                      'Es la dirección de tu perfil. Si la cambiás acá, vale solo para esta compra.'
                    )}
                  </small>
                </div>
              </div>
            </section>

            <section className="checkout-card">
              <div className="card-heading">
                <span className="card-number">02</span>
                <div>
                  <h2>Pago</h2>
                  <p>Cómo se paga tu pedido.</p>
                </div>
              </div>

              <div className="payment-option pago-informativo">
                <span className="payment-icon" aria-hidden="true">💳</span>
                <span className="payment-content">
                  <strong>MercadoPago</strong>
                  <small>
                    Al confirmar, {comercios.length > 1 ? 'cada pedido queda' : 'el pedido queda'} esperando
                    el pago. Lo pagás desde el detalle del pedido y el comercio lo empieza a preparar
                    apenas se acredita.
                  </small>
                </span>
              </div>
            </section>

            {errorConfirmar && (
              <div className="mensaje-error" role="alert">
                <div>
                  <p>{errorConfirmar.message}</p>
                  {erroresDeItems.length > 0 && (
                    <ul className="checkout-errores">
                      {erroresDeItems.map((item) => <li key={item.producto_id}>{item.mensaje}</li>)}
                    </ul>
                  )}
                </div>
                {erroresDeItems.length > 0 && (
                  <Link className="boton boton-secundario" to="/carrito">Revisar el carrito</Link>
                )}
              </div>
            )}

            {hayNoDisponibles && !errorConfirmar && (
              <p className="aviso-form aviso-form-error">
                Hay productos que ya no se pueden comprar. <Link to="/carrito">Revisá el carrito</Link> para continuar.
              </p>
            )}

            <button type="submit" className="confirm-order-button" disabled={confirmando || hayNoDisponibles}>
              {confirmando
                ? 'Confirmando…'
                : comercios.length > 1 ? `Confirmar ${comercios.length} pedidos` : 'Confirmar pedido'}
              <span aria-hidden="true">→</span>
            </button>
          </form>

          <aside className="checkout-summary">
            <div className="summary-heading">
              <p className="eyebrow">TU PEDIDO</p>
              <h2>Resumen</h2>
            </div>

            {comercios.map((grupo) => (
              <div className="summary-products" key={grupo.comercio_id}>
                <p className="summary-comercio">🏪 {grupo.comercio_nombre}</p>

                {grupo.items.map((item) => (
                  <div className="summary-product" key={item.producto_id}>
                    <div className="summary-product-info">
                      <strong>{item.nombre}</strong>
                      <small>
                        {item.cantidad} × {formatearPrecio(item.precio_unitario)}
                      </small>
                    </div>
                    <strong>{formatearPrecio(item.subtotal)}</strong>
                  </div>
                ))}
              </div>
            ))}

            <div className="summary-total">
              <span>Total</span>
              <strong>{formatearPrecio(carrito.total_general)}</strong>
            </div>

            <div className="summary-note">
              <span aria-hidden="true">🔒</span>
              <p>
                {plural(comercios.length, 'pedido')} · Tu dirección se usa solo para calcular la ruta y
                hacer la entrega.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
