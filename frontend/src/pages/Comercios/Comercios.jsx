import { useState } from 'react'
import Header from '../../components/Header/Header'
import Footer from '../../components/Footer/Footer'
import './Comercios.css'

const comerciosPrueba = [
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

const categorias = [
  'Todos',
  'Supermercado',
  'Ferretería',
  'Librería',
  'Indumentaria',
  'Farmacia',
]

export default function Comercios() {
    const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Todos')
    const [busqueda, setBusqueda] = useState('')
    const comerciosFiltrados = comerciosPrueba.filter((comercio) => {
        const coincideCategoria =
          categoriaSeleccionada === 'Todos' ||
          comercio.categoria === categoriaSeleccionada
      
        const texto = busqueda.toLowerCase()
      
        const coincideBusqueda =
          comercio.nombre.toLowerCase().includes(texto) ||
          comercio.descripcion.toLowerCase().includes(texto) ||
          comercio.categoria.toLowerCase().includes(texto)
      
        return coincideCategoria && coincideBusqueda
      })
  return (
    <>
      <Header />

      <main className="comercios-page">

        <section className="comercios-hero">
          <div className="comercios-hero-content">
            <p className="eyebrow">COMERCIOS LOCALES</p>

            <h1>
              Todo lo que necesitás,
              <br />
              <em>a tu puerta.</em>
            </h1>

            <p>
              Encontrá comercios de tu zona y pedí lo que necesitás
              sin complicaciones.
            </p>

                      <div className="comercios-search">
                          <span>🔍</span>

                          <input
                              type="text"
                              placeholder="Buscar comercios o productos..."
                              value={busqueda}
                              onChange={(e) => setBusqueda(e.target.value)}
                          />

                          <button type="button">
                              Buscar
                          </button>
                      </div>
          </div>
        </section>

              <section className="comercios-content">

                  <div className="category-filters">
                      {categorias.map((categoria) => (
                          <button
                              key={categoria}
                              className={
                                  categoriaSeleccionada === categoria ? 'active' : ''
                              }
                              onClick={() => setCategoriaSeleccionada(categoria)}
                          >
                              {categoria}
                          </button>
                      ))}
          </div>

          <div className="comercios-header">
            <div>
              <p className="eyebrow">CERCA TUYO</p>
              <h2>Comercios disponibles</h2>
            </div>

            <span className="comercios-count">
            {comerciosFiltrados.length} comercios
            </span>
          </div>

          <div className="comercios-grid">
          {comerciosFiltrados.map((comercio) => (
              <article className="comercio-card" key={comercio.id}>

                <div className="comercio-icon">
                  {comercio.icono}
                </div>

                <div className="comercio-info">
                  <span className="comercio-category">
                    {comercio.categoria}
                  </span>

                  <h3>{comercio.nombre}</h3>

                  <p>{comercio.descripcion}</p>

                  <a
  className="comercio-button"
  href={`/comercio?id=${comercio.id}`}
>
  Ver comercio →
</a>
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