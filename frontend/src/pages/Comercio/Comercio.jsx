import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Comercio.css'

const comercios = [
  {
    id: 1,
    nombre: 'Supermercado La Esquina',
    categoria: 'Supermercado',
    descripcion: 'Todo lo que necesitás para tu día a día.',
    icono: '🛒',
  },
  {
    id: 2,
    nombre: 'Ferretería El Tornillo',
    categoria: 'Ferretería',
    descripcion: 'Herramientas y materiales para tus proyectos.',
    icono: '🔧',
  },
  {
    id: 3,
    nombre: 'Librería Central',
    categoria: 'Librería',
    descripcion: 'Libros, útiles y todo para estudiar.',
    icono: '📚',
  },
  {
    id: 4,
    nombre: 'Moda Urbana',
    categoria: 'Indumentaria',
    descripcion: 'Ropa para todos los días.',
    icono: '👕',
  },
  {
    id: 5,
    nombre: 'Farmacia San Martín',
    categoria: 'Farmacia',
    descripcion: 'Productos de farmacia y cuidado personal.',
    icono: '💊',
  },
]

const productosPrueba = [
  {
    id: 1,
    nombre: 'Producto de ejemplo 1',
    descripcion: 'Descripción del producto.',
    precio: 2500,
    icono: '📦',
  },
  {
    id: 2,
    nombre: 'Producto de ejemplo 2',
    descripcion: 'Otro producto disponible.',
    precio: 4500,
    icono: '🛍️',
  },
  {
    id: 3,
    nombre: 'Producto de ejemplo 3',
    descripcion: 'Un producto más para probar.',
    precio: 3200,
    icono: '📦',
  },
]

export default function Comercio() {
  const [cantidadCarrito, setCantidadCarrito] = useState(0)

  const id = Number(
    new URLSearchParams(window.location.search).get('id')
  )

  const comercio = comercios.find((item) => item.id === id)

  if (!comercio) {
    return (
      <>
        <Header />

        <main className="comercio-page">
          <section className="comercio-not-found">
            <h1>Comercio no encontrado</h1>
            <p>El comercio que buscás no existe.</p>
            <a href="/comercios">← Volver a comercios</a>
          </section>
        </main>

        <Footer />
      </>
    )
  }

  function agregarAlCarrito(producto) {
    const carritoGuardado = localStorage.getItem('carrito')
  
    const carrito = carritoGuardado
      ? JSON.parse(carritoGuardado)
      : []
  
    const productoExistente = carrito.find(
      (item) => item.id === producto.id
    )
  
    let nuevoCarrito
  
    if (productoExistente) {
      nuevoCarrito = carrito.map((item) =>
        item.id === producto.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      )
    } else {
      nuevoCarrito = [
        ...carrito,
        {
          ...producto,
          cantidad: 1,
        },
      ]
    }
  
    localStorage.setItem(
      'carrito',
      JSON.stringify(nuevoCarrito)
    )
  
    setCantidadCarrito(
      nuevoCarrito.reduce(
        (total, item) => total + item.cantidad,
        0
      )
    )
  }

  return (
    <>
      <Header />

      <main className="comercio-page">

        <section className="comercio-header">
          <a href="/comercios" className="back-link">
            ← Volver a comercios
          </a>

          <div className="comercio-header-content">
            <div className="comercio-large-icon">
              {comercio.icono}
            </div>

            <div>
              <span className="comercio-category">
                {comercio.categoria}
              </span>

              <h1>{comercio.nombre}</h1>

              <p>{comercio.descripcion}</p>
            </div>
          </div>
        </section>

        <section className="productos-section">

          <div className="productos-title">
            <div>
              <p className="eyebrow">PRODUCTOS</p>
              <h2>Lo que podés pedir</h2>
            </div>

            {cantidadCarrito > 0 && (
              <div className="cart-indicator">
                🛒 {cantidadCarrito} producto
                {cantidadCarrito !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div className="productos-grid">
            {productosPrueba.map((producto) => (
              <article className="producto-card" key={producto.id}>

                <div className="producto-icon">
                  {producto.icono}
                </div>

                <div className="producto-info">
                  <h3>{producto.nombre}</h3>

                  <p>{producto.descripcion}</p>

                  <strong>
                    ${producto.precio.toLocaleString('es-AR')}
                  </strong>

                  <button
                    className="add-cart-button"
                    onClick={() => agregarAlCarrito(producto)}
                  >
                    + Agregar al carrito
                  </button>
                </div>

              </article>
            ))}
          </div>

        </section>

      </main>

      <Footer />
    </>
  )
}