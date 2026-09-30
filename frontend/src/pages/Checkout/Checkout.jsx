import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Checkout.css'

export default function Checkout() {
  const carrito = JSON.parse(localStorage.getItem('carrito')) || []

  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [pedidoConfirmado, setPedidoConfirmado] = useState(false)

  const total = carrito.reduce(
    (suma, producto) => suma + producto.precio * producto.cantidad,
    0
  )

  function confirmarPedido(e) {
    e.preventDefault()

    if (!direccion.trim() || !telefono.trim()) {
      alert('Completá la dirección y el teléfono.')
      return
    }

    const pedido = {
      id: Date.now(),
      fecha: new Date().toLocaleString('es-AR'),
      estado: 'pendiente_pago',
      direccion: direccion.trim(),
      telefono: telefono.trim(),
      metodoPago,
      productos: carrito,
      total,
    }

    const pedidosGuardados =
      JSON.parse(localStorage.getItem('pedidos')) || []

    pedidosGuardados.push(pedido)

    localStorage.setItem(
      'pedidos',
      JSON.stringify(pedidosGuardados)
    )

    localStorage.setItem(
      'pedidoActual',
      JSON.stringify(pedido)
    )

    localStorage.removeItem('carrito')

    setPedidoConfirmado(true)
  }

  if (carrito.length === 0 && !pedidoConfirmado) {
    return (
      <>
        <Header />

        <main className="checkout-page">
          <section className="checkout-empty">

            <div className="checkout-empty-icon" aria-hidden="true">
              🛒
            </div>

            <p className="eyebrow">CHECKOUT</p>

            <h1>Tu carrito está vacío</h1>

            <p>
              Agregá algunos productos antes de continuar con tu pedido.
            </p>

            <a href="/comercios">
              Explorar comercios
            </a>

          </section>
        </main>

        <Footer />
      </>
    )
  }

  if (pedidoConfirmado) {
    return (
      <>
        <Header />

        <main className="checkout-page">
          <section className="order-success">

            <div className="success-icon" aria-hidden="true">
              ✓
            </div>

            <p className="eyebrow">PEDIDO CONFIRMADO</p>

            <h1>¡Listo! Tu pedido está en camino.</h1>

            <p>
              Recibimos tu pedido correctamente. Podés consultar su estado
              desde la sección de pedidos.
            </p>

            <div className="success-status">
              <small>ESTADO ACTUAL</small>
              <span>Esperando pago</span>
            </div>

            <div className="success-actions">
              <a href="/pedidos">
                Ver mis pedidos
              </a>

              <a
                href="/comercios"
                className="secondary-action"
              >
                Seguir comprando
              </a>
            </div>

          </section>
        </main>

        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />

      <main className="checkout-page">

        <div className="checkout-container">

          <div className="checkout-title">

            <a href="/carrito" className="back-link">
              <span aria-hidden="true">🡰</span>
              Volver al carrito
            </a>

            <p className="eyebrow">CHECKOUT</p>

            <h1>Finalizá tu pedido</h1>

            <p>
              Completá tus datos de entrega y elegí cómo querés pagar.
            </p>

          </div>

          <div className="checkout-layout">

            <form
              className="checkout-form"
              onSubmit={confirmarPedido}
            >

              {/* DATOS DE ENTREGA */}

              <section className="checkout-card">

                <div className="card-heading">
                  <span className="card-number">01</span>

                  <div>
                    <h2>Datos de entrega</h2>
                    <p>
                      ¿Dónde querés recibir tu pedido?
                    </p>
                  </div>
                </div>

                <div className="form-fields">

                  <div className="form-group">

                    <label htmlFor="direccion">
                      Dirección de entrega
                    </label>

                    <div className="input-wrapper">

                      <span
                        className="input-icon"
                        aria-hidden="true"
                      >
                        📍
                      </span>

                      <input
                        id="direccion"
                        type="text"
                        value={direccion}
                        onChange={(e) => setDireccion(e.target.value)}
                        placeholder="Ej. Av. Siempre Viva 123"
                        autoComplete="street-address"
                      />

                    </div>

                  </div>

                  <div className="form-group">

                    <label htmlFor="telefono">
                      Teléfono de contacto
                    </label>

                    <div className="input-wrapper">

                      <span
                        className="input-icon"
                        aria-hidden="true"
                      >
                        ☎
                      </span>

                      <input
                        id="telefono"
                        type="tel"
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="Ej. 342 555 1234"
                        autoComplete="tel"
                      />

                    </div>

                    <small className="input-help">
                      El repartidor podrá contactarte si es necesario.
                    </small>

                  </div>

                </div>

              </section>

              {/* MÉTODO DE PAGO */}

              <section className="checkout-card">

                <div className="card-heading">
                  <span className="card-number">02</span>

                  <div>
                    <h2>Método de pago</h2>
                    <p>
                      Elegí cómo vas a pagar tu pedido.
                    </p>
                  </div>
                </div>

                <div className="payment-options">

                  <label className="payment-option">

                    <input
                      type="radio"
                      name="metodoPago"
                      value="efectivo"
                      checked={metodoPago === 'efectivo'}
                      onChange={(e) => setMetodoPago(e.target.value)}
                    />

                    <span className="payment-icon">
                      💵
                    </span>

                    <span className="payment-content">
                      <strong>Efectivo</strong>
                      <small>Pagás al recibir tu pedido.</small>
                    </span>

                  </label>

                  <label className="payment-option">

                    <input
                      type="radio"
                      name="metodoPago"
                      value="transferencia"
                      checked={metodoPago === 'transferencia'}
                      onChange={(e) => setMetodoPago(e.target.value)}
                    />

                    <span className="payment-icon">
                      💳
                    </span>

                    <span className="payment-content">
                      <strong>Transferencia</strong>
                      <small>Transferí antes de recibir el pedido.</small>
                    </span>

                  </label>

                </div>

              </section>

              <button
                type="submit"
                className="confirm-order-button"
              >
                Confirmar pedido
                <span aria-hidden="true">→</span>
              </button>

            </form>

            {/* RESUMEN */}

            <aside className="checkout-summary">

              <div className="summary-heading">
                <p className="eyebrow">TU PEDIDO</p>
                <h2>Resumen</h2>
              </div>

              <div className="summary-products">

                {carrito.map((producto) => (

                  <div
                    className="summary-product"
                    key={producto.id}
                  >

                    <div className="summary-product-info">

                      <strong>
                        {producto.nombre}
                      </strong>

                      <small>
                        {producto.cantidad} × $
                        {producto.precio.toLocaleString('es-AR')}
                      </small>

                    </div>

                    <strong>
                      $
                      {(producto.precio * producto.cantidad)
                        .toLocaleString('es-AR')}
                    </strong>

                  </div>

                ))}

              </div>

              <div className="summary-total">

                <span>Total</span>

                <strong>
                  ${total.toLocaleString('es-AR')}
                </strong>

              </div>

              <div className="summary-note">
                <span aria-hidden="true">🔒</span>
                <p>
                  Tu información se utiliza únicamente para procesar
                  la entrega.
                </p>
              </div>

            </aside>

          </div>

        </div>

      </main>

      <Footer />
    </>
  )
}
