import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Pedido.css'

export default function Pedido() {
  const parametros = new URLSearchParams(window.location.search)
  const idPedido = Number(parametros.get('id'))

  const pedidosGuardados = localStorage.getItem('pedidos')
  const pedidos = pedidosGuardados
    ? JSON.parse(pedidosGuardados)
    : []

  const pedido = pedidos.find((item) => item.id === idPedido)

  if (!pedido) {
    return (
      <>
        <Header />

        <main className="pedido-page">
          <section className="pedido-container pedido-not-found">
            <h1>Pedido no encontrado</h1>

            <a href="/pedidos" className="pedido-button">
              ← Volver a mis pedidos
            </a>
          </section>
        </main>

        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />

      <main className="pedido-page">
        <section className="pedido-container">

          <a href="/pedidos" className="pedido-back">
            ← Volver a mis pedidos
          </a>

          <div className="pedido-header">
            <div>
              <p className="pedido-label">
                Detalle del pedido
              </p>

              <h1>Pedido #{pedido.id}</h1>

              <p className="pedido-date">
                Realizado el {pedido.fecha}
              </p>
            </div>

            <span className="pedido-status">
              {pedido.estado}
            </span>
          </div>

          <div className="pedido-grid">

            <section className="pedido-card">
              <h2>Productos</h2>

              {pedido.productos.map((producto) => (
                <div
                  className="pedido-product"
                  key={producto.id}
                >
                  <div className="product-icon">
                    {producto.icono || '📦'}
                  </div>

                  <div className="product-info">
                    <strong>{producto.nombre}</strong>

                    <span>
                      {producto.cantidad} × $
                      {producto.precio.toLocaleString('es-AR')}
                    </span>
                  </div>

                  <strong className="product-subtotal">
                    $
                    {(
                      producto.precio * producto.cantidad
                    ).toLocaleString('es-AR')}
                  </strong>
                </div>
              ))}

              <div className="pedido-total">
                <span>Total</span>

                <strong>
                  ${pedido.total.toLocaleString('es-AR')}
                </strong>
              </div>
            </section>

            <aside className="pedido-side">

              <div className="pedido-card">
                <h2>Entrega</h2>

                <div className="detail-row">
                  <span>📍 Dirección</span>
                  <strong>{pedido.direccion}</strong>
                </div>

                <div className="detail-row">
                  <span>📞 Teléfono</span>
                  <strong>{pedido.telefono}</strong>
                </div>
              </div>

              <div className="pedido-card">
                <h2>Pago</h2>

                <div className="detail-row">
                  <span>Método</span>

                  <strong>
                    {pedido.metodoPago === 'mercado_pago'
                      ? 'Mercado Pago'
                      : 'Efectivo'}
                  </strong>
                </div>
              </div>

            </aside>

          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}