import { useState } from 'react'
import './Checkout.css'

export default function Checkout() {
  const carritoGuardado = localStorage.getItem('carrito')
  const carrito = carritoGuardado ? JSON.parse(carritoGuardado) : []

  const [direccion, setDireccion] = useState('')
  const [telefono, setTelefono] = useState('')
  const [metodoPago, setMetodoPago] = useState('mercado_pago')
  const [error, setError] = useState('')
  const [pedidoConfirmado, setPedidoConfirmado] = useState(false)

  const total = carrito.reduce(
    (acumulado, producto) =>
      acumulado + producto.precio * producto.cantidad,
    0
  )

  function confirmarPedido(e) {
    e.preventDefault()
    setError('')

    if (!direccion.trim()) {
      setError('Ingresá una dirección de entrega.')
      return
    }

    if (!telefono.trim()) {
      setError('Ingresá un teléfono de contacto.')
      return
    }

    if (carrito.length === 0) {
      setError('No hay productos en el carrito.')
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

    // Obtener pedidos anteriores
    const pedidosGuardados = localStorage.getItem('pedidos')
    const pedidos = pedidosGuardados
      ? JSON.parse(pedidosGuardados)
      : []

    // Agregar el nuevo pedido al historial
    pedidos.push(pedido)

    localStorage.setItem('pedidos', JSON.stringify(pedidos))

    // Lo dejamos también como pedido actual
    localStorage.setItem('pedidoActual', JSON.stringify(pedido))

    // Vaciar carrito
    localStorage.removeItem('carrito')

    setPedidoConfirmado(true)
  }

  if (pedidoConfirmado) {
    return (
      <main className="checkout-page">
        <section className="checkout-success">
          <div className="success-icon">✓</div>

          <h1>¡Pedido creado!</h1>

          <p>
            Tu pedido fue creado correctamente y está
            esperando el pago.
          </p>

          <div className="success-actions">
            <a href="/pedidos" className="checkout-button">
              Ver mis pedidos
            </a>

            <a
              href="/comercios"
              className="checkout-button secondary"
            >
              Seguir comprando
            </a>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="checkout-page">
      <section className="checkout-container">

        <div className="checkout-header">
          <a href="/carrito" className="back-link">
            ← Volver al carrito
          </a>

          <h1>Confirmar pedido</h1>
          <p>Completá tus datos para realizar el pedido.</p>
        </div>

        <div className="checkout-content">

          <form
            className="checkout-form"
            onSubmit={confirmarPedido}
          >
            <div className="form-section">
              <h2>Datos de entrega</h2>

              <label>
                Dirección
                <input
                  type="text"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej: Av. Santa Fe 1234"
                />
              </label>

              <label>
                Teléfono
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej: 342 1234567"
                />
              </label>
            </div>

            <div className="form-section">
              <h2>Método de pago</h2>

              <label className="payment-option">
                <input
                  type="radio"
                  name="metodoPago"
                  value="mercado_pago"
                  checked={metodoPago === 'mercado_pago'}
                  onChange={(e) => setMetodoPago(e.target.value)}
                />

                <span>
                  <strong>Mercado Pago</strong>
                  <small>Pago online</small>
                </span>
              </label>

              <label className="payment-option">
                <input
                  type="radio"
                  name="metodoPago"
                  value="efectivo"
                  checked={metodoPago === 'efectivo'}
                  onChange={(e) => setMetodoPago(e.target.value)}
                />

                <span>
                  <strong>Efectivo</strong>
                  <small>Pagás al recibir</small>
                </span>
              </label>
            </div>

            {error && (
              <p className="checkout-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="checkout-submit"
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
                  <div>
                    <strong>{producto.nombre}</strong>
                    <span>
                      {producto.cantidad} × $
                      {producto.precio.toLocaleString('es-AR')}
                    </span>
                  </div>

                  <strong>
                    $
                    {(
                      producto.precio * producto.cantidad
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
  )
}
