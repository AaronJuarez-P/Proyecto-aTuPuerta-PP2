import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './RepartidorAdmin.css'

export default function RepartidorAdmin() {
  const usuarioGuardado = localStorage.getItem('usuario')
  const usuario = usuarioGuardado
    ? JSON.parse(usuarioGuardado)
    : null

  if (!usuario) {
    window.location.href = '/login'
    return null
  }

  if (usuario.rol !== 'repartidor') {
    window.location.href = '/'
    return null
  }

  const pedidosGuardados = localStorage.getItem('pedidos')

  const pedidosIniciales = pedidosGuardados
    ? JSON.parse(pedidosGuardados)
    : []

  const [pedidos, setPedidos] = useState(pedidosIniciales)

  function actualizarEstado(idPedido, nuevoEstado) {
    const pedidosActualizados = pedidos.map((pedido) =>
      pedido.id === idPedido
        ? {
            ...pedido,
            estado: nuevoEstado,
            repartidor: usuario.nombre,
          }
        : pedido
    )

    setPedidos(pedidosActualizados)

    localStorage.setItem(
      'pedidos',
      JSON.stringify(pedidosActualizados)
    )
  }

  function aceptarPedido(pedido) {
    actualizarEstado(pedido.id, 'en_camino')
  }

  function entregarPedido(pedido) {
    actualizarEstado(pedido.id, 'entregado')
  }

  const pedidosDisponibles = pedidos.filter(
    (pedido) => pedido.estado === 'listo'
  )

  const pedidosEnCamino = pedidos.filter(
    (pedido) =>
      pedido.estado === 'en_camino' &&
      pedido.repartidor === usuario.nombre
  )

  const pedidosEntregados = pedidos.filter(
    (pedido) =>
      pedido.estado === 'entregado' &&
      pedido.repartidor === usuario.nombre
  )

  return (
    <>
      <Header />

      <main className="repartidor-page">
        <section className="repartidor-container">

          <div className="repartidor-header">
            <div>
              <p className="repartidor-label">
                Panel de repartidor
              </p>

              <h1>Mis entregas</h1>

              <p>
                Gestioná los pedidos disponibles y tus entregas.
              </p>
            </div>

            <div className="repartidor-welcome">
              👋 {usuario.nombre}
            </div>
          </div>

          <section className="repartidor-stats">

            <div className="repartidor-stat">
              <strong>{pedidosDisponibles.length}</strong>
              <span>Disponibles</span>
            </div>

            <div className="repartidor-stat">
              <strong>{pedidosEnCamino.length}</strong>
              <span>En camino</span>
            </div>

            <div className="repartidor-stat">
              <strong>{pedidosEntregados.length}</strong>
              <span>Entregados</span>
            </div>

          </section>

          <section className="repartidor-section">

            <div className="section-title">
              <h2>Pedidos disponibles</h2>
              <span>{pedidosDisponibles.length}</span>
            </div>

            {pedidosDisponibles.length === 0 ? (
              <div className="repartidor-empty">
                <div className="empty-icon">🚲</div>

                <h3>No hay pedidos disponibles</h3>

                <p>
                  Cuando un comercio prepare un pedido,
                  aparecerá acá.
                </p>
              </div>
            ) : (
              <div className="repartidor-list">

                {pedidosDisponibles.map((pedido) => (
                  <article
                    className="repartidor-card"
                    key={pedido.id}
                  >

                    <div className="repartidor-card-top">
                      <div>
                        <span>Pedido</span>
                        <h3>#{pedido.id}</h3>
                        <small>{pedido.fecha}</small>
                      </div>

                      <span className="status-ready">
                        Listo para retirar
                      </span>
                    </div>

                    <div className="repartidor-card-info">

                      <div>
                        <span>📍 Dirección</span>
                        <strong>{pedido.direccion}</strong>
                      </div>

                      <div>
                        <span>📞 Teléfono</span>
                        <strong>{pedido.telefono}</strong>
                      </div>

                      <div>
                        <span>📦 Productos</span>
                        <strong>
                          {pedido.productos.reduce(
                            (total, producto) =>
                              total + producto.cantidad,
                            0
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>💰 Total</span>
                        <strong>
                          ${pedido.total.toLocaleString('es-AR')}
                        </strong>
                      </div>

                    </div>

                    <div className="repartidor-actions">

                      <button
                        className="accept-button"
                        onClick={() => aceptarPedido(pedido)}
                      >
                        Aceptar pedido →
                      </button>

                    </div>

                  </article>
                ))}

              </div>
            )}

          </section>

          <section className="repartidor-section">

            <div className="section-title">
              <h2>Mis pedidos en camino</h2>
              <span>{pedidosEnCamino.length}</span>
            </div>

            {pedidosEnCamino.length === 0 ? (
              <div className="repartidor-empty small">
                <p>No tenés pedidos en camino.</p>
              </div>
            ) : (
              <div className="repartidor-list">

                {pedidosEnCamino.map((pedido) => (
                  <article
                    className="repartidor-card"
                    key={pedido.id}
                  >

                    <div className="repartidor-card-top">

                      <div>
                        <span>Pedido</span>
                        <h3>#{pedido.id}</h3>
                      </div>

                      <span className="status-delivery">
                        En camino
                      </span>

                    </div>

                    <div className="repartidor-card-info">

                      <div>
                        <span>📍 Entrega</span>
                        <strong>{pedido.direccion}</strong>
                      </div>

                      <div>
                        <span>📞 Contacto</span>
                        <strong>{pedido.telefono}</strong>
                      </div>

                    </div>

                    <div className="repartidor-actions">

                      <button
                        className="deliver-button"
                        onClick={() => entregarPedido(pedido)}
                      >
                        Marcar como entregado ✓
                      </button>

                    </div>

                  </article>
                ))}

              </div>
            )}

          </section>

        </section>
      </main>

      <Footer />
    </>
  )
}