import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Pedidos.css'

export default function Pedidos() {
  const pedidosGuardados = localStorage.getItem('pedidos')

  const pedidos = pedidosGuardados
    ? JSON.parse(pedidosGuardados)
    : []

  const estados = {
    pendiente_pago: 'Esperando pago',
    confirmado: 'Confirmado',
    preparando: 'En preparación',
    listo: 'Listo para retirar',
    en_camino: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  }

  return (
    <>
      <Header />

      <main className="pedidos-page">
        <section className="pedidos-container">

          <div className="pedidos-header">
            <p className="pedidos-label">
              Mi cuenta
            </p>

            <h1>Mis pedidos</h1>

            <p>
              Consultá el estado y los detalles de tus pedidos.
            </p>
          </div>

          {pedidos.length === 0 ? (
            <div className="pedidos-empty">
              <div className="empty-icon">📦</div>

              <h2>Todavía no tenés pedidos</h2>

              <p>
                Cuando realices una compra, tus pedidos
                aparecerán acá.
              </p>

              <a
                href="/comercios"
                className="pedidos-button"
              >
                Ver comercios
              </a>
            </div>
          ) : (
            <div className="pedidos-list">

              {[...pedidos].reverse().map((pedido) => (
                <article
                  className="pedido-card"
                  key={pedido.id}
                >
                  <div className="pedido-top">

                    <div>
                      <span className="pedido-label">
                        Pedido #{pedido.id}
                      </span>

                      <p className="pedido-fecha">
                        {pedido.fecha}
                      </p>
                    </div>

                    <span className="pedido-estado">
                      {estados[pedido.estado] || pedido.estado}
                    </span>

                  </div>

                  <div className="pedido-info">

                    <div>
                      <span>Productos</span>

                      <strong>
                        {pedido.productos.reduce(
                          (total, producto) =>
                            total + producto.cantidad,
                          0
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Pago</span>

                      <strong>
                        {pedido.metodoPago === 'mercado_pago'
                          ? 'Mercado Pago'
                          : 'Efectivo'}
                      </strong>
                    </div>

                    <div>
                      <span>Total</span>

                      <strong>
                        $
                        {pedido.total.toLocaleString('es-AR')}
                      </strong>
                    </div>

                  </div>

                  <div className="pedido-bottom">
                    <span>
                      📍 {pedido.direccion}
                    </span>

                    <a
                      href={`/pedido?id=${pedido.id}`}
                      className="pedido-detail-button"
                    >
                      Ver detalle →
                    </a>
                  </div>
                </article>
              ))}

            </div>
          )}

        </section>
      </main>

      <Footer />
    </>
  )
}