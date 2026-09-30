import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Admin.css'

export default function Admin() {
  const usuarioGuardado = localStorage.getItem('usuario')
  const usuario = usuarioGuardado
    ? JSON.parse(usuarioGuardado)
    : null

  if (!usuario) {
    window.location.href = '/login'
    return null
  }

  if (usuario.rol !== 'administrador') {
    window.location.href = '/'
    return null
  }

  const pedidosGuardados = localStorage.getItem('pedidos')
  const pedidosIniciales = pedidosGuardados
    ? JSON.parse(pedidosGuardados)
    : []

  const usuariosGuardados = localStorage.getItem('usuarios')
  const usuariosIniciales = usuariosGuardados
    ? JSON.parse(usuariosGuardados)
    : []

  const [pedidos] = useState(pedidosIniciales)
  const [usuarios] = useState(usuariosIniciales)

  const pedidosPendientes = pedidos.filter(
    (pedido) =>
      pedido.estado !== 'entregado' &&
      pedido.estado !== 'cancelado'
  )

  const pedidosEnCamino = pedidos.filter(
    (pedido) => pedido.estado === 'en_camino'
  )

  const pedidosEntregados = pedidos.filter(
    (pedido) => pedido.estado === 'entregado'
  )

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

      <main className="admin-page">
        <section className="admin-container">

          <header className="admin-header">
            <div>
              <p className="admin-label">
                Administración
              </p>

              <h1>Panel de administrador</h1>

              <p>
                Supervisá el funcionamiento general de ATuPuerta.
              </p>
            </div>

            <div className="admin-welcome">
              ⚙️ {usuario.nombre}
            </div>
          </header>

          {/* ESTADÍSTICAS */}

          <section className="admin-stats">

            <div className="admin-stat">
              <span>Total de pedidos</span>
              <strong>{pedidos.length}</strong>
            </div>

            <div className="admin-stat">
              <span>Pedidos activos</span>
              <strong>{pedidosPendientes.length}</strong>
            </div>

            <div className="admin-stat">
              <span>En camino</span>
              <strong>{pedidosEnCamino.length}</strong>
            </div>

            <div className="admin-stat">
              <span>Entregados</span>
              <strong>{pedidosEntregados.length}</strong>
            </div>

          </section>

          {/* PEDIDOS */}

          <section className="admin-section">

            <div className="admin-section-title">
              <div>
                <p className="admin-label">
                  Supervisión
                </p>

                <h2>Pedidos</h2>
              </div>

              <span>{pedidos.length}</span>
            </div>

            {pedidos.length === 0 ? (
              <div className="admin-empty">
                <div>📦</div>
                <h3>No hay pedidos</h3>
                <p>
                  Todavía no se registraron pedidos.
                </p>
              </div>
            ) : (
              <div className="admin-orders">

                {[...pedidos].reverse().map((pedido) => (

                  <article
                    className="admin-order"
                    key={pedido.id}
                  >

                    <div className="admin-order-main">

                      <div>
                        <span>Pedido</span>

                        <h3>
                          #{pedido.id}
                        </h3>

                        <small>
                          {pedido.fecha}
                        </small>
                      </div>

                      <span
                        className={`admin-status ${pedido.estado}`}
                      >
                        {estados[pedido.estado] || pedido.estado}
                      </span>

                    </div>

                    <div className="admin-order-info">

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
                        <span>Dirección</span>
                        <strong>
                          {pedido.direccion}
                        </strong>
                      </div>

                      <div>
                        <span>Total</span>
                        <strong>
                          ${pedido.total.toLocaleString('es-AR')}
                        </strong>
                      </div>

                      <div>
                        <span>Repartidor</span>
                        <strong>
                          {pedido.repartidor || 'Sin asignar'}
                        </strong>
                      </div>

                    </div>

                  </article>

                ))}

              </div>
            )}

          </section>

          {/* USUARIOS */}

          <section className="admin-section">

            <div className="admin-section-title">

              <div>
                <p className="admin-label">
                  Sistema
                </p>

                <h2>Usuarios registrados</h2>
              </div>

              <span>{usuarios.length}</span>

            </div>

            {usuarios.length === 0 ? (
              <div className="admin-empty">
                <div>👥</div>

                <h3>No hay usuarios registrados</h3>

                <p>
                  Los usuarios registrados aparecerán acá.
                </p>
              </div>
            ) : (
              <div className="admin-users">

                {usuarios.map((item, index) => (

                  <article
                    className="admin-user"
                    key={item.id || index}
                  >

                    <div className="admin-user-avatar">
                      👤
                    </div>

                    <div className="admin-user-info">
                      <strong>
                        {item.nombre}
                      </strong>

                      <span>
                        {item.correo}
                      </span>
                    </div>

                    <span className="admin-user-role">
                      {item.rol || 'cliente'}
                    </span>

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