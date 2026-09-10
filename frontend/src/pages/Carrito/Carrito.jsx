import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Carrito.css'

export default function Carrito() {
    const [carrito, setCarrito] = useState(() => {
        const guardado = localStorage.getItem('carrito')
        return guardado ? JSON.parse(guardado) : []
    })

    function actualizarCarrito(nuevoCarrito) {
        setCarrito(nuevoCarrito)
        localStorage.setItem('carrito', JSON.stringify(nuevoCarrito))
    }

    function cambiarCantidad(id, cambio) {
        const nuevoCarrito = carrito
            .map((producto) => {
                if (producto.id !== id) {
                    return producto
                }

                return {
                    ...producto,
                    cantidad: producto.cantidad + cambio,
                }
            })
            .filter((producto) => producto.cantidad > 0)

        actualizarCarrito(nuevoCarrito)
    }

    function eliminarProducto(id) {
        const nuevoCarrito = carrito.filter(
            (producto) => producto.id !== id
        )

        actualizarCarrito(nuevoCarrito)
    }

    const total = carrito.reduce(
        (acumulado, producto) =>
            acumulado + producto.precio * producto.cantidad,
        0
    )

    const cantidadProductos = carrito.reduce(
        (acumulado, producto) => acumulado + producto.cantidad,
        0
    )

    return (
        <>
            <Header />

            <main className="carrito-page">
                <section className="carrito-container">

                    <div className="carrito-title">
                        <p className="eyebrow">TU PEDIDO</p>
                        <h1>Carrito</h1>
                        <p>
                            {cantidadProductos === 0
                                ? 'Todavía no agregaste productos.'
                                : `${cantidadProductos} producto${cantidadProductos !== 1 ? 's' : ''} en tu carrito.`}
                        </p>
                    </div>

                    {carrito.length === 0 ? (
                        <div className="carrito-vacio">
                            <span>🛒</span>

                            <h2>Tu carrito está vacío</h2>

                            <p>
                                Explorá nuestros comercios y agregá productos
                                para comenzar tu pedido.
                            </p>

                            <a href="/comercios">
                                Explorar comercios →
                            </a>
                        </div>
                    ) : (
                        <div className="carrito-layout">

                            <div className="carrito-productos">
                                {carrito.map((producto) => (
                                    <article
                                        className="carrito-producto"
                                        key={producto.id}
                                    >
                                        <div className="carrito-producto-icon">
                                            {producto.icono || '📦'}
                                        </div>

                                        <div className="carrito-producto-info">
                                            <h2>{producto.nombre}</h2>

                                            <p>{producto.descripcion}</p>

                                            <strong>
                                                ${producto.precio.toLocaleString('es-AR')}
                                            </strong>
                                        </div>

                                        <div className="cantidad-control">
                                            <button
                                                onClick={() =>
                                                    cambiarCantidad(producto.id, -1)
                                                }
                                            >
                                                −
                                            </button>

                                            <span>{producto.cantidad}</span>

                                            <button
                                                onClick={() =>
                                                    cambiarCantidad(producto.id, 1)
                                                }
                                            >
                                                +
                                            </button>
                                        </div>

                                        <div className="producto-subtotal">
                                            <strong>
                                                $
                                                {(
                                                    producto.precio * producto.cantidad
                                                ).toLocaleString('es-AR')}
                                            </strong>

                                            <button
                                                className="eliminar-button"
                                                onClick={() =>
                                                    eliminarProducto(producto.id)
                                                }
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            <aside className="carrito-resumen">
                                <h2>Resumen del pedido</h2>

                                <div className="resumen-linea">
                                    <span>Productos</span>
                                    <span>${total.toLocaleString('es-AR')}</span>
                                </div>

                                <div className="resumen-linea">
                                    <span>Envío</span>
                                    <span>A calcular</span>
                                </div>

                                <div className="resumen-total">
                                    <span>Total</span>
                                    <strong>${total.toLocaleString('es-AR')}</strong>
                                </div>

                                <a
                                    href="/checkout"
                                    className="confirmar-button"
                                >
                                    Continuar con el pedido
                                </a>

                                <a
                                    className="seguir-comprando"
                                    href="/comercios"
                                >
                                    ← Seguir comprando
                                </a>
                            </aside>

                        </div>
                    )}

                </section>
            </main>

            <Footer />
        </>
    )
}