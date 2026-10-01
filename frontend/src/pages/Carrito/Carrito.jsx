import { useState } from 'react'
import { Link } from 'react-router'
import { Cargando, MensajeError } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useCarrito } from '../../context/carrito'
import { iconoDeCategoria } from '../../utils/categorias'
import { formatearPrecio, plural } from '../../utils/formato'
import './Carrito.css'

// Por qué un ítem no se puede comprar, según lo que marca GET /carrito/listar
function motivoNoDisponible(item, comercioActivo) {
  if (!comercioActivo) {
    return 'El comercio no está disponible en este momento.'
  }

  if (!item.producto_activo) {
    return 'Este producto ya no está a la venta.'
  }

  if (item.stock_disponible <= 0) {
    return 'Se quedó sin stock.'
  }

  return `Solo quedan ${plural(item.stock_disponible, 'unidad', 'unidades')}.`
}

export default function Carrito() {
  const { carrito, cantidad, error, recargar, cambiarCantidad, quitar } = useCarrito()
  const avisar = useAvisos()
  const [ocupado, setOcupado] = useState(null)

  async function ejecutar(idProducto, accion, mensajeExito) {
    setOcupado(idProducto)

    try {
      await accion()
      if (mensajeExito) {
        avisar(mensajeExito)
      }
    } catch (errorAccion) {
      avisar(errorAccion.message, 'error')
    } finally {
      setOcupado(null)
    }
  }

  const restar = (item) =>
    item.cantidad <= 1
      ? ejecutar(item.producto_id, () => quitar(item.producto_id), `Sacaste ${item.nombre} del carrito.`)
      : ejecutar(item.producto_id, () => cambiarCantidad(item.producto_id, item.cantidad - 1))

  const sumar = (item) => ejecutar(item.producto_id, () => cambiarCantidad(item.producto_id, item.cantidad + 1))

  const eliminar = (item) =>
    ejecutar(item.producto_id, () => quitar(item.producto_id), `Sacaste ${item.nombre} del carrito.`)

  const ajustarAlStock = (item) =>
    ejecutar(item.producto_id, () => cambiarCantidad(item.producto_id, item.stock_disponible))

  const comercios = carrito?.comercios ?? []
  const hayNoDisponibles = comercios.some((grupo) => grupo.items.some((item) => !item.disponible))

  return (
    <main className="carrito-page">
      <section className="carrito-container">
        <div className="carrito-title">
          <p className="eyebrow">TU PEDIDO</p>
          <h1>Carrito</h1>
          <p>
            {cantidad === 0
              ? 'Todavía no agregaste productos.'
              : `${plural(cantidad, 'producto')} en tu carrito.`}
          </p>
        </div>

        {!carrito ? (
          error ? <MensajeError error={error} alReintentar={() => recargar().catch(() => {})} /> : <Cargando />
        ) : comercios.length === 0 ? (
          <div className="carrito-vacio">
            <span aria-hidden="true">🛒</span>
            <h2>Tu carrito está vacío</h2>
            <p>Explorá los comercios y agregá productos para empezar tu pedido.</p>
            <Link to="/comercios">Explorar comercios →</Link>
          </div>
        ) : (
          <div className="carrito-layout">
            <div className="carrito-productos">
              {comercios.map((grupo) => (
                <section className="carrito-comercio" key={grupo.comercio_id}>
                  <header className="carrito-comercio-encabezado">
                    <h2>🏪 {grupo.comercio_nombre}</h2>
                    <Link to={`/comercios/${grupo.comercio_id}`}>Agregar más →</Link>
                  </header>

                  {grupo.items.map((item) => (
                    <article
                      className={`carrito-producto ${item.disponible ? '' : 'no-disponible'}`}
                      key={item.producto_id}
                    >
                      <div className="carrito-producto-icon" aria-hidden="true">
                        {iconoDeCategoria(item.categoria, '📦')}
                      </div>

                      <div className="carrito-producto-info">
                        <h3>{item.nombre}</h3>
                        {item.descripcion && <p>{item.descripcion}</p>}
                        <strong>{formatearPrecio(item.precio_unitario)}</strong>

                        {!item.disponible && (
                          <p className="carrito-alerta">
                            ⚠ {motivoNoDisponible(item, grupo.comercio_activo)}
                            {grupo.comercio_activo && item.producto_activo && item.stock_disponible > 0 && (
                              <button
                                type="button"
                                disabled={ocupado === item.producto_id}
                                onClick={() => ajustarAlStock(item)}
                              >
                                Llevar {item.stock_disponible}
                              </button>
                            )}
                          </p>
                        )}
                      </div>

                      <div className="cantidad-control">
                        <button
                          type="button"
                          aria-label={`Restar una unidad de ${item.nombre}`}
                          disabled={ocupado === item.producto_id}
                          onClick={() => restar(item)}
                        >
                          −
                        </button>

                        <span>{item.cantidad}</span>

                        <button
                          type="button"
                          aria-label={`Sumar una unidad de ${item.nombre}`}
                          disabled={ocupado === item.producto_id || item.cantidad >= item.stock_disponible}
                          onClick={() => sumar(item)}
                        >
                          +
                        </button>
                      </div>

                      <div className="producto-subtotal">
                        <strong>{formatearPrecio(item.subtotal)}</strong>
                        <button
                          type="button"
                          className="eliminar-button"
                          disabled={ocupado === item.producto_id}
                          onClick={() => eliminar(item)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>

            <aside className="carrito-resumen">
              <h2>Resumen del pedido</h2>

              {comercios.map((grupo) => (
                <div className="resumen-linea" key={grupo.comercio_id}>
                  <span>{grupo.comercio_nombre}</span>
                  <span>{formatearPrecio(grupo.subtotal_comercio)}</span>
                </div>
              ))}

              <div className="resumen-total">
                <span>Total</span>
                <strong>{formatearPrecio(carrito.total_general)}</strong>
              </div>

              {comercios.length > 1 && (
                <p className="resumen-nota">
                  Tu carrito tiene productos de {comercios.length} comercios: se genera un pedido
                  por cada uno, y cada uno se paga por separado.
                </p>
              )}

              {hayNoDisponibles && (
                <p className="resumen-nota resumen-nota-alerta">
                  Sacá o ajustá los productos marcados para poder continuar.
                </p>
              )}

              {hayNoDisponibles ? (
                <span className="confirmar-button deshabilitado" aria-disabled="true">
                  Continuar con el pedido
                </span>
              ) : (
                <Link to="/checkout" className="confirmar-button">
                  Continuar con el pedido
                </Link>
              )}

              <Link className="seguir-comprando" to="/comercios">
                ← Seguir comprando
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  )
}
