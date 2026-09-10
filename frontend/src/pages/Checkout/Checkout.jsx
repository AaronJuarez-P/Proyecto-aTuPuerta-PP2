import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Checkout.css'

export default function Checkout() {
  const [carrito] = useState(() => {
    const guardado = localStorage.getItem('carrito')
    return guardado ? JSON.parse(guardado) : []
  })

  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [metodoPago, setMetodoPago] = useState('')

  const [pedidoConfirmado, setPedidoConfirmado] = useState(false)

  const total = carrito.reduce(
    (acumulado, producto) =>
      acumulado + producto.precio * producto.cantidad,
    0
  )

  function confirmarPedido(e) {
    e.preventDefault()

    if (!direccion || !telefono || !metodoPago) {
      return
    }

    const pedido = {
      id: Date.now(),
      fecha: new Date().toLocaleString('es-AR'),
      estado: 'pendiente_pago',
      direccion,
      telefono,
      metodoPago,
      productos: carrito,
      total,
    }

    localStorage.setItem('pedidoActual', JSON.stringify(pedido))

    setPedidoConfirmado(true)

    localStorage.removeItem('carrito')
  }

  if (carrito.length === 0 && !pedidoConfirmado) {
    return (
      <>
        <Header />

        <main className="checkout-page">
          <section className="checkout-empty">
            <span>🛒</span>

            <h1>No hay productos para comprar</h1>

            <p>
              Primero agregá productos a tu carrito.
            </p>

            <a href="/comercios">
              Explorar comercios →
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

            <div className="success-icon">
              ✓
            </div>

            <p className="eyebrow">PEDIDO CREADO</p>

            <h1>
              ¡Tu pedido fue confirmado!
            </h1>

            <p>
              El pedido quedó registrado y está esperando
              el pago.
            </p>

            <div className="success-status">
              <strong>Estado</strong>
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
        <section className="checkout-container">

          <div className="checkout-title">
            <a href="/carrito">
              ← Volver al carrito
            </a>

            <p className="eyebrow">FINALIZAR PEDIDO</p>

            <h1>Confirmá tu pedido</h1>

            <p>
              Completá tus datos para recibir tu compra.
            </p>
          </div>

          <div className="checkout-layout">

            <form
              className="checkout-form"
              onSubmit={confirmarPedido}
            >
              <section className="checkout-card">
                <h2>Datos de entrega</h2>

                <div className="form-group">
                  <label htmlFor="direccion">
                    Dirección
                  </label>

                  <input
                    id="direccion"
                    type="text"
                    placeholder="Ej: Av. Santa Fe 1234"
                    value={direccion}
                    onChange={(e) =>
                      setDireccion(e.target.value)
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="telefono">
                    Teléfono
                  </label>

                  <input
                    id="telefono"
                    type="tel"
                    placeholder="Ej: 342 1234567"
                    value={telefono}
                    onChange={(e) =>
                      setTelefono(e.target.value)
                    }
                    required
                  />
                </div>
              </section>

              <section className="checkout-card">
                <h2>Método de pago</h2>

                <label className="payment-option">
                  <input
                    type="radio"
                    name="pago"
                    value="mercado_pago"
                    checked={metodoPago === 'mercado_pago'}
                    onChange={(e) =>
                      setMetodoPago(e.target.value)
                    }
                    required
                  />

                  <div>
                    <strong>Mercado Pago</strong>
                    <span>Pago online</span>
                  </div>
                </label>

                <label className="payment-option">
                  <input
                    type="radio"
                    name="pago"
                    value="efectivo"
                    checked={metodoPago === 'efectivo'}
                    onChange={(e) =>
                      setMetodoPago(e.target.value)
                    }
                  />

                  <div>
                    <strong>Efectivo</strong>
                    <span>Pagás al recibir</span>
                  </div>
                </label>
              </section>

              <button
                type="submit"
                className="confirm-order-button"
              >
                Confirmar pedido
              </button>
            </form>

            <aside className="checkout-summary">
              <h2>Resumen</h2>

              <div className="summary-products">
                {carrito.map((producto) => (
                  <div
                    className="summary-product"
                    key={producto.id}
                  >
                    <span>
                      {producto.nombre}
                      <small>
                        x{producto.cantidad}
                      </small>
                    </span>

                    <strong>
                      $
                      {(
                        producto.precio *
                        producto.cantidad
                      ).toLocaleString('es-AR')}
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
            </aside>

          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}