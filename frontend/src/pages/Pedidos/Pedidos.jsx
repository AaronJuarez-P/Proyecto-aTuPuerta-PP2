import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Pedidos.css'

export default function Pedidos() {
    const [pedido] = useState(() => {
        const guardado = localStorage.getItem('pedidoActual')
        return guardado ? JSON.parse(guardado) : null
    })

    function obtenerTextoEstado(estado) {
        const estados = {
            pendiente_pago: 'Esperando pago',
            confirmado: 'Confirmado',
            preparando: 'En preparación',
            listo: 'Listo para retirar',
            en_camino: 'En camino',
            entregado: 'Entregado',
            cancelado: 'Cancelado',
        }

        return estados[estado] || 'Estado desconocido'
    }

    return (
        <>
            <Header />

            <main className="pedidos-page">
                <section className="pedidos-container">

                    <div className="pedidos-title">
                        <p className="eyebrow">ATUPUERTA</p>
                        <h1>Mis pedidos</h1>
                        <p>
                            Consultá el estado y los detalles de tus pedidos.
                        </p>
                    </div>

                    {!pedido ? (
                        <div className="pedidos-vacio">
                            <span>📋</span>

                            <h2>No tenés pedidos todavía</h2>

                            <p>
                                Cuando realices un pedido, vas a poder
                                consultar su estado desde esta sección.
                            </p>

                            <a href="/comercios">
                                Explorar comercios →
                            </a>
                        </div>
                    ) : (
                        <article className="pedido-card">

                            <div className="pedido-header">
                                <div>
                                    <p className="pedido-label">
                                        PEDIDO #{pedido.id}
                                    </p>

                                    <h2>Detalle del pedido</h2>

                                    <span className="pedido-fecha">
                                        {pedido.fecha}
                                    </span>
                                </div>

                                <span
                                    className={`pedido-estado estado-${pedido.estado}`}
                                >
                                    {obtenerTextoEstado(pedido.estado)}
                                </span>
                            </div>

                            <div className="pedido-separador" />

                            <div className="pedido-info">

                                <div>
                                    <span>📍 Dirección</span>
                                    <strong>{pedido.direccion}</strong>
                                </div>

                                <div>
                                    <span>📞 Teléfono</span>
                                    <strong>{pedido.telefono}</strong>
                                </div>

                                <div>
                                    <span>💳 Método de pago</span>
                                    <strong>
                                        {pedido.metodoPago === 'mercado_pago'
                                            ? 'Mercado Pago'
                                            : 'Efectivo'}
                                    </strong>
                                </div>

                            </div>

                            <div className="pedido-productos">

                                <h3>Productos</h3>

                                {pedido.productos.map((producto) => (
                                    <div
                                        className="pedido-producto"
                                        key={producto.id}
                                    >
                                        <div className="pedido-producto-icon">
                                            {producto.icono || '📦'}
                                        </div>

                                        <div className="pedido-producto-info">
                                            <strong>{producto.nombre}</strong>

                                            <span>
                                                {producto.cantidad} × $
                                                {producto.precio.toLocaleString(
                                                    'es-AR'
                                                )}
                                            </span>
                                        </div>

                                        <strong className="pedido-producto-total">
                                            $
                                            {(
                                                producto.precio *
                                                producto.cantidad
                                            ).toLocaleString('es-AR')}
                                        </strong>
                                    </div>
                                ))}

                            </div>

                            <div className="pedido-total">
                                <span>Total</span>

                                <strong>
                                    $
                                    {pedido.total.toLocaleString('es-AR')}
                                </strong>
                            </div>

                            <div className="pedido-acciones">
                                <a href="/comercios">
                                    Seguir comprando
                                </a>
                            </div>

                        </article>
                    )}

                </section>
            </main>

            <Footer />
        </>
    )
}