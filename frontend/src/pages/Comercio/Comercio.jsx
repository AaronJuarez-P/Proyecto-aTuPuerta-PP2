import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { listarProductosDeComercio, obtenerComercio } from '../../api/catalogo'
import { Cargando, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useCarrito } from '../../context/carrito'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { iconoDeCategoria } from '../../utils/categorias'
import { formatearPrecio, plural } from '../../utils/formato'
import './Comercio.css'

const PRODUCTOS_POR_PAGINA = 24
const POCAS_UNIDADES = 5

export default function Comercio() {
  const { id } = useParams()
  const [parametros, setParametros] = useSearchParams()
  const categoria = parametros.get('categoria') ?? ''
  const pagina = Number(parametros.get('pagina')) || 1

  const { usuario } = useSesion()
  const { carrito, cantidad: cantidadCarrito, agregar } = useCarrito()
  const avisar = useAvisos()
  const navigate = useNavigate()
  const ubicacion = useLocation()
  const [agregando, setAgregando] = useState(null)

  const comercio = useCarga(() => obtenerComercio(id), [id])

  // Las categorías de los productos de este comercio, para los filtros
  const categorias = useCarga(async () => {
    const { productos } = await listarProductosDeComercio(id, { limite: 100 })
    return [...new Set(productos.map((producto) => producto.categoria))].sort((a, b) => a.localeCompare(b, 'es'))
  }, [id])

  const productos = useCarga(
    () => listarProductosDeComercio(id, { categoria, pagina, limite: PRODUCTOS_POR_PAGINA }),
    [id, categoria, pagina]
  )

  // Cuántas unidades de cada producto ya tiene el cliente en el carrito
  const enCarrito = new Map(
    (carrito?.comercios ?? []).flatMap((grupo) => grupo.items.map((item) => [item.producto_id, item.cantidad]))
  )

  async function manejarAgregar(producto) {
    if (!usuario) {
      avisar('Iniciá sesión como cliente para armar tu pedido.', 'info')
      navigate(`/login?volver=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`)
      return
    }

    if (usuario.rol !== 'cliente') {
      avisar('Para comprar tenés que entrar como cliente.', 'error')
      return
    }

    setAgregando(producto.id)

    try {
      await agregar(producto.id, 1)
      avisar(`Agregaste ${producto.nombre} al carrito.`)
    } catch (error) {
      avisar(error.message, 'error')
    } finally {
      setAgregando(null)
    }
  }

  function cambiarCategoria(nueva) {
    setParametros(nueva ? { categoria: nueva } : {})
  }

  if (comercio.error?.codigo === 404) {
    return (
      <main className="comercio-page">
        <section className="comercio-not-found">
          <h1>Comercio no encontrado</h1>
          <p>El comercio que buscás no existe o no está disponible en este momento.</p>
          <Link to="/comercios">← Volver a comercios</Link>
        </section>
      </main>
    )
  }

  const datosComercio = comercio.datos?.comercio
  const lista = productos.datos?.productos ?? []

  return (
    <main className="comercio-page">
      <section className="comercio-header">
        <Link to="/comercios" className="back-link">
          ← Volver a comercios
        </Link>

        {datosComercio ? (
          <div className="comercio-header-content">
            <div className="comercio-large-icon" aria-hidden="true">
              {iconoDeCategoria(datosComercio.categoria)}
            </div>

            <div>
              <span className="comercio-category">{datosComercio.categoria}</span>
              <h1>{datosComercio.nombre}</h1>
              <p>📍 {datosComercio.direccion}</p>
              <p>🕒 {datosComercio.horario_atencion}</p>
            </div>
          </div>
        ) : (
          <div className="comercio-header-content">
            {comercio.error ? <MensajeError error={comercio.error} alReintentar={comercio.recargar} /> : <Cargando />}
          </div>
        )}
      </section>

      <section className="productos-section">
        <div className="productos-title">
          <div>
            <p className="eyebrow">PRODUCTOS</p>
            <h2>Lo que podés pedir</h2>
          </div>

          {cantidadCarrito > 0 && (
            <Link to="/carrito" className="cart-indicator">
              🛒 {plural(cantidadCarrito, 'producto')} en tu carrito · Ver carrito →
            </Link>
          )}
        </div>

        {categorias.datos?.length > 1 && (
          <div className="chips" role="group" aria-label="Categorías de productos">
            <button type="button" className={`chip ${!categoria ? 'activo' : ''}`} onClick={() => cambiarCategoria('')}>
              Todo
            </button>
            {categorias.datos.map((nombre) => (
              <button
                type="button"
                key={nombre}
                className={`chip ${categoria === nombre ? 'activo' : ''}`}
                onClick={() => cambiarCategoria(nombre)}
              >
                {nombre}
              </button>
            ))}
          </div>
        )}

        <MensajeError error={productos.error} alReintentar={productos.recargar} />

        {productos.cargando && !productos.datos ? (
          <Cargando texto="Cargando productos…" />
        ) : lista.length === 0 && !productos.error ? (
          <EstadoVacio icono="📦" titulo="Todavía no hay productos">
            Este comercio no tiene productos cargados{categoria ? ' en esta categoría' : ''}.
          </EstadoVacio>
        ) : (
          <div className="productos-grid">
            {lista.map((producto) => {
              const stock = Number(producto.stock)
              const yaEnCarrito = enCarrito.get(producto.id) ?? 0
              const sinStock = stock <= 0 || yaEnCarrito >= stock

              return (
                <article className="producto-card" key={producto.id}>
                  <div className="producto-icon" aria-hidden="true">
                    {iconoDeCategoria(producto.categoria, '📦')}
                  </div>

                  <div className="producto-info">
                    <span className="producto-categoria">{producto.categoria}</span>
                    <h3>{producto.nombre}</h3>
                    <p>{producto.descripcion || 'Sin descripción.'}</p>
                    <strong>{formatearPrecio(producto.precio)}</strong>

                    <p className="producto-stock">
                      {stock <= 0
                        ? 'Sin stock'
                        : stock <= POCAS_UNIDADES
                          ? `¡Quedan ${plural(stock, 'unidad', 'unidades')}!`
                          : `${stock} disponibles`}
                      {yaEnCarrito > 0 && ` · ${yaEnCarrito} en tu carrito`}
                    </p>

                    <button
                      type="button"
                      className="add-cart-button"
                      disabled={sinStock || agregando === producto.id}
                      onClick={() => manejarAgregar(producto)}
                    >
                      {agregando === producto.id
                        ? 'Agregando…'
                        : stock <= 0
                          ? 'Sin stock'
                          : yaEnCarrito >= stock
                            ? 'Ya tenés todo el stock'
                            : '+ Agregar al carrito'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <Paginacion
          paginacion={productos.datos?.paginacion}
          alCambiar={(nueva) => setParametros({ ...(categoria && { categoria }), ...(nueva > 1 && { pagina: String(nueva) }) })}
        />
      </section>
    </main>
  )
}
