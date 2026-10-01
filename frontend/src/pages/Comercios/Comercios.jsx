import { Link, useSearchParams } from 'react-router'
import { buscarProductos, listarComercios } from '../../api/catalogo'
import { Cargando, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useCarga } from '../../hooks/useCarga'
import { iconoDeCategoria } from '../../utils/categorias'
import { formatearPrecio, plural } from '../../utils/formato'
import './Comercios.css'

const COMERCIOS_POR_PAGINA = 12

// Los filtros viven en la URL (?categoria=&buscar=&pagina=): así la landing puede
// linkear directo a un rubro y el botón "atrás" del navegador vuelve al filtro anterior.
export default function Comercios() {
  const [parametros, setParametros] = useSearchParams()
  const categoria = parametros.get('categoria') ?? ''
  const buscar = parametros.get('buscar') ?? ''
  const pagina = Number(parametros.get('pagina')) || 1

  // Las categorías salen de los comercios que existen, no de una lista fija
  const categorias = useCarga(async () => {
    const { comercios } = await listarComercios({ limite: 100 })
    return [...new Set(comercios.map((comercio) => comercio.categoria))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [])

  const comercios = useCarga(
    () => listarComercios({ categoria, buscar, pagina, limite: COMERCIOS_POR_PAGINA }),
    [categoria, buscar, pagina]
  )

  // CU04: el mismo texto también busca productos, de cualquier comercio
  const productos = useCarga(
    () => (buscar ? buscarProductos({ buscar, limite: 8 }) : Promise.resolve(null)),
    [buscar]
  )

  function cambiarFiltros(cambios) {
    const siguientes = { categoria, buscar, ...cambios }
    const limpios = Object.fromEntries(Object.entries(siguientes).filter(([, valor]) => valor))
    setParametros(limpios)
  }

  function manejarBusqueda(evento) {
    evento.preventDefault()
    const texto = String(new FormData(evento.currentTarget).get('buscar') ?? '')
    cambiarFiltros({ buscar: texto.trim(), pagina: undefined })
  }

  function limpiarFiltros() {
    setParametros({})
  }

  const lista = comercios.datos?.comercios ?? []
  const total = comercios.datos?.paginacion?.total ?? 0
  const productosEncontrados = productos.datos?.productos ?? []

  return (
    <main className="comercios-page">
      <section className="comercios-hero">
        <div className="comercios-hero-content">
          <p className="eyebrow">COMERCIOS LOCALES</p>

          <h1>
            Todo lo que necesitás,
            <br />
            <em>a tu puerta.</em>
          </h1>

          <p>Encontrá comercios de tu zona y pedí lo que necesitás sin complicaciones.</p>

          {/* key: si la búsqueda cambia desde la URL (atrás, un link), el campo se reinicia con ella */}
          <form className="comercios-search" role="search" onSubmit={manejarBusqueda} key={buscar}>
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              name="buscar"
              placeholder="Buscar comercios o productos..."
              defaultValue={buscar}
              aria-label="Buscar comercios o productos"
            />
            <button type="submit">Buscar</button>
          </form>
        </div>
      </section>

      <section className="comercios-content">
        {categorias.datos?.length > 0 && (
          <div className="category-filters" role="group" aria-label="Rubros">
            <button
              type="button"
              className={!categoria ? 'active' : ''}
              onClick={() => cambiarFiltros({ categoria: '', pagina: undefined })}
            >
              Todos
            </button>

            {categorias.datos.map((nombre) => (
              <button
                type="button"
                key={nombre}
                className={categoria === nombre ? 'active' : ''}
                onClick={() => cambiarFiltros({ categoria: nombre, pagina: undefined })}
              >
                {iconoDeCategoria(nombre)} {nombre}
              </button>
            ))}
          </div>
        )}

        {buscar && productosEncontrados.length > 0 && (
          <section className="productos-encontrados" aria-labelledby="titulo-productos">
            <div className="comercios-header">
              <div>
                <p className="eyebrow">PRODUCTOS</p>
                <h2 id="titulo-productos">Productos con “{buscar}”</h2>
              </div>
              <span className="comercios-count">
                {plural(productos.datos.paginacion.total, 'producto')}
              </span>
            </div>

            <div className="productos-encontrados-lista">
              {productosEncontrados.map((producto) => (
                <Link
                  key={producto.id}
                  className="producto-encontrado"
                  to={`/comercios/${producto.comercio_id}`}
                >
                  <span className="producto-encontrado-icono" aria-hidden="true">
                    {iconoDeCategoria(producto.categoria, '📦')}
                  </span>
                  <span className="producto-encontrado-info">
                    <strong>{producto.nombre}</strong>
                    <small>en {producto.comercio_nombre}</small>
                  </span>
                  <span className="producto-encontrado-precio">{formatearPrecio(producto.precio)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="comercios-header">
          <div>
            <p className="eyebrow">CERCA TUYO</p>
            <h2>{categoria || 'Comercios disponibles'}</h2>
          </div>

          {comercios.datos && <span className="comercios-count">{plural(total, 'comercio')}</span>}
        </div>

        <MensajeError error={comercios.error} alReintentar={comercios.recargar} />

        {comercios.cargando && !comercios.datos ? (
          <Cargando texto="Buscando comercios…" />
        ) : lista.length === 0 && !comercios.error ? (
          <EstadoVacio
            icono="🏪"
            titulo="No encontramos comercios"
            accion={
              (categoria || buscar) && (
                <button type="button" className="boton boton-secundario" onClick={limpiarFiltros}>
                  Ver todos los comercios
                </button>
              )
            }
          >
            {buscar || categoria
              ? 'Probá con otra búsqueda o sacá el filtro de rubro.'
              : 'Todavía no hay comercios activos en la plataforma.'}
          </EstadoVacio>
        ) : (
          <div className="comercios-grid">
            {lista.map((comercio) => (
              <article className="comercio-card" key={comercio.id}>
                <div className="comercio-icon" aria-hidden="true">
                  {iconoDeCategoria(comercio.categoria)}
                </div>

                <div className="comercio-info">
                  <span className="comercio-category">{comercio.categoria}</span>
                  <h3>{comercio.nombre}</h3>
                  <p>
                    📍 {comercio.direccion}
                    <br />
                    🕒 {comercio.horario_atencion}
                  </p>

                  <Link className="comercio-button" to={`/comercios/${comercio.id}`}>
                    Ver comercio →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <Paginacion
          paginacion={comercios.datos?.paginacion}
          alCambiar={(nueva) => cambiarFiltros({ pagina: nueva > 1 ? String(nueva) : undefined })}
        />
      </section>
    </main>
  )
}
