import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './ComercioAdmin.css'

export default function ComercioAdmin() {
    const usuarioGuardado = localStorage.getItem('usuario')
    const usuario = usuarioGuardado
      ? JSON.parse(usuarioGuardado)
      : null
  
    if (!usuario) {
      window.location.href = '/login'
      return null
    }
  
    if (usuario.rol !== 'comercio') {
      window.location.href = '/'
      return null
    }
  
    const pedidosGuardados = localStorage.getItem('pedidos')
  
    const pedidosIniciales = pedidosGuardados
      ? JSON.parse(pedidosGuardados)
      : []
  
    const [pedidos, setPedidos] = useState(pedidosIniciales)

  const estados = {
    pendiente_pago: 'Esperando pago',
    confirmado: 'Confirmado',
    preparando: 'En preparación',
    listo: 'Listo para retirar',
    en_camino: 'En camino',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  }

  const siguienteEstado = {
    pendiente_pago: 'confirmado',
    confirmado: 'preparando',
    preparando: 'listo',
    listo: 'en_camino',
    en_camino: 'entregado',
  }

  function actualizarEstado(idPedido, nuevoEstado) {
    const pedidosActualizados = pedidos.map((pedido) =>
      pedido.id === idPedido
        ? { ...pedido, estado: nuevoEstado }
        : pedido
    )

    setPedidos(pedidosActualizados)
    localStorage.setItem('pedidos', JSON.stringify(pedidosActualizados))
  }

  function avanzarPedido(pedido) {
    const nuevoEstado = siguienteEstado[pedido.estado]

    if (!nuevoEstado) return

    actualizarEstado(pedido.id, nuevoEstado)
  }

  function cancelarPedido(pedido) {
    actualizarEstado(pedido.id, 'cancelado')
  }

  return (
    <>
      <Header />

      <main className="comercio-admin-page">
        <section className="comercio-admin-container">

          <div className="comercio-admin-header">
            <div>
              <p className="comercio-admin-label">
                Panel de comercio
              </p>

              <h1>Gestión de pedidos</h1>

              <p>
                Administrá los pedidos recibidos y actualizá su estado.
              </p>
            </div>

            <div className="pedidos-count">
              <strong>{pedidos.length}</strong>
              <span>pedidos</span>
            </div>
          </div>

          {pedidos.length === 0 ? (
            <section className="comercio-empty">
              <div className="empty-icon">📦</div>

              <h2>No hay pedidos</h2>

              <p>
                Cuando un cliente realice un pedido,
                aparecerá acá.
              </p>
            </section>
          ) : (
            <section className="pedidos-admin-list">

              {[...pedidos].reverse().map((pedido) => (

                <article
                  className="pedido-admin-card"
                  key={pedido.id}
                >

                  <div className="pedido-admin-top">

                    <div>
                      <span className="pedido-admin-label">
                        Pedido
                      </span>

                      <h2>#{pedido.id}</h2>

                      <p>{pedido.fecha}</p>
                    </div>

                    <span
                      className={`pedido-admin-status ${pedido.estado}`}
                    >
                      {estados[pedido.estado] || pedido.estado}
                    </span>

                  </div>

                  <div className="pedido-admin-content">

                    <div className="pedido-admin-info">

                      <h3>Productos</h3>

                      <div className="admin-products">

                        {pedido.productos.map((producto) => (
                          <div
                            className="admin-product"
                            key={producto.id}
                          >
                            <span className="admin-product-icon">
                              {producto.icono || '📦'}
                            </span>

                            <div>
                              <strong>
                                {producto.nombre}
                              </strong>

                              <span>
                                {producto.cantidad} × $
                                {producto.precio.toLocaleString('es-AR')}
                              </span>
                            </div>
                          </div>
                        ))}

                      </div>

                    </div>

                    <aside className="pedido-admin-details">

                      <div>
                        <span>Dirección</span>
                        <strong>{pedido.direccion}</strong>
                      </div>

                      <div>
                        <span>Teléfono</span>
                        <strong>{pedido.telefono}</strong>
                      </div>

                      <div>
                        <span>Método de pago</span>
                        <strong>
                          {pedido.metodoPago === 'mercado_pago'
                            ? 'Mercado Pago'
                            : 'Efectivo'}
                        </strong>
                      </div>

                      <div className="admin-total">
                        <span>Total</span>
                        <strong>
                          ${pedido.total.toLocaleString('es-AR')}
                        </strong>
                      </div>

                    </aside>

                  </div>

                  <div className="pedido-admin-actions">

                    {pedido.estado !== 'entregado' &&
                      pedido.estado !== 'cancelado' && (
                        <button
                          className="admin-next-button"
                          onClick={() => avanzarPedido(pedido)}
                        >
                          Avanzar pedido →
                        </button>
                      )}

                    {pedido.estado !== 'entregado' &&
                      pedido.estado !== 'cancelado' && (
                        <button
                          className="admin-cancel-button"
                          onClick={() => cancelarPedido(pedido)}
                        >
                          Cancelar pedido
                        </button>
                      )}

                  </div>

                </article>

              ))}

            </section>
          )}

        </section>
      </main>

      <Footer />
    </>
  )
}