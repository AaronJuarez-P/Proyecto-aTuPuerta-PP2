import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { listarVentas, marcarPreparado, obtenerVenta } from '../../api/comercio'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { ESTADOS_PEDIDO } from '../../utils/estados'
import { formatearFecha, formatearHora, formatearPrecio, plural } from '../../utils/formato'
import './ComercioAdmin.css'

// Los pedidos le llegan al comercio cuando el cliente paga. No hay socket para el
// comercio (las salas son por pedido), así que la bandeja se vuelve a mirar sola.
const ACTUALIZAR_CADA_MS = 30000

// Lo que el backend considera una venta: un pedido sin pagar todavía no lo es
const ESTADOS_VENTA = ['en_preparacion', 'preparado', 'en_camino', 'entregado', 'cancelado']

const PESTANAS = [
  { clave: 'preparar', texto: 'Para preparar' },
  { clave: 'en-curso', texto: 'En curso' },
  { clave: 'ventas', texto: 'Ventas' },
]

export default function ComercioAdmin() {
  const { usuario } = useSesion()
  const [parametros, setParametros] = useSearchParams()
  const pestana = PESTANAS.some((p) => p.clave === parametros.get('ver')) ? parametros.get('ver') : 'preparar'

  // La bandeja se carga acá y no en su pestaña: el contador de la pestaña la necesita
  const bandeja = useCarga(async () => {
    const { ventas } = await listarVentas({ estado: 'en_preparacion', limite: 50 })
    const detalles = await Promise.all(ventas.map((venta) => obtenerVenta(venta.id).then((datos) => datos.venta)))
    // Los más viejos primero: se preparan en el orden en que se pagaron
    return detalles.reverse()
  }, [])

  const { recargar: recargarBandeja } = bandeja

  useEffect(() => {
    const intervalo = setInterval(recargarBandeja, ACTUALIZAR_CADA_MS)
    return () => clearInterval(intervalo)
  }, [recargarBandeja])

  const porPreparar = bandeja.datos?.length ?? 0

  return (
    <main className="comercio-admin-page">
      <section className="comercio-admin-container">
        <div className="comercio-admin-header">
          <div>
            <p className="comercio-admin-label">Panel de comercio</p>
            <h1>{usuario.nombre}</h1>
            <p>Prepará los pedidos que te llegan y seguí tus ventas.</p>
          </div>

          <div className="comercio-admin-acciones">
            <div className="pedidos-count">
              <strong>{porPreparar}</strong>
              <span>por preparar</span>
            </div>
            <Link className="boton boton-secundario" to="/comercio/productos">
              📦 Mis productos
            </Link>
          </div>
        </div>

        <div className="pestanas" role="tablist" aria-label="Secciones del panel">
          {PESTANAS.map(({ clave, texto }) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={pestana === clave}
              className={`pestana ${pestana === clave ? 'activa' : ''}`}
              onClick={() => setParametros(clave === 'preparar' ? {} : { ver: clave })}
            >
              {texto}
              {clave === 'preparar' && porPreparar > 0 && <span className="pestana-contador">{porPreparar}</span>}
            </button>
          ))}
        </div>

        {pestana === 'preparar' && <ParaPreparar bandeja={bandeja} />}
        {pestana === 'en-curso' && <EnCurso />}
        {pestana === 'ventas' && <Ventas />}
      </section>
    </main>
  )
}

function ParaPreparar({ bandeja }) {
  const avisar = useAvisos()
  const [marcando, setMarcando] = useState(null)

  async function marcar(venta) {
    setMarcando(venta.id)

    try {
      await marcarPreparado(venta.id)
      avisar(`Pedido #${venta.id} listo: ya lo puede retirar un repartidor.`)
      bandeja.recargar()
    } catch (error) {
      avisar(error.message, 'error')
    } finally {
      setMarcando(null)
    }
  }

  if (bandeja.cargando && !bandeja.datos) {
    return <Cargando texto="Buscando pedidos para preparar…" />
  }

  if (bandeja.error && !bandeja.datos) {
    return <MensajeError error={bandeja.error} alReintentar={bandeja.recargar} />
  }

  if (bandeja.datos.length === 0) {
    return (
      <EstadoVacio icono="🧺" titulo="No hay pedidos para preparar">
        Cuando un cliente pague un pedido, aparece acá con sus productos. La lista se actualiza sola.
      </EstadoVacio>
    )
  }

  return (
    <div className="pedidos-admin-list">
      {bandeja.datos.map((venta) => (
        <article className="pedido-admin-card" key={venta.id}>
          <div className="pedido-admin-top">
            <div>
              <span className="pedido-admin-label">Pedido</span>
              <h2>#{venta.id}</h2>
              <p>Pagado a las {formatearHora(venta.updated_at)} · {formatearFecha(venta.created_at, { conHora: false })}</p>
            </div>
            <EstadoBadge estado={venta.estado} />
          </div>

          <div className="pedido-admin-content">
            <div className="pedido-admin-info">
              <h3>Productos a preparar</h3>
              <div className="admin-products">
                {venta.items.map((item) => (
                  <div className="admin-product" key={item.producto_id}>
                    <span className="admin-product-icon">{item.cantidad}×</span>
                    <div>
                      <strong>{item.nombre}</strong>
                      <span>{formatearPrecio(item.precio_unit)} c/u</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="pedido-admin-details">
              <div>
                <span>Cliente</span>
                <strong>{venta.cliente}</strong>
              </div>
              <div className="admin-total">
                <span>Total</span>
                <strong>{formatearPrecio(venta.total)}</strong>
              </div>
            </aside>
          </div>

          <div className="pedido-admin-actions">
            <Link className="boton boton-secundario" to={`/comercio/ventas/${venta.id}`}>
              Ver detalle
            </Link>
            <button
              type="button"
              className="admin-next-button"
              disabled={marcando === venta.id}
              onClick={() => marcar(venta)}
            >
              {marcando === venta.id ? 'Marcando…' : '✓ Está listo para retirar'}
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

// Lo que ya salió de la cocina: esperando repartidor o en camino
function EnCurso() {
  const { datos, cargando, error, recargar } = useCarga(async () => {
    const [preparados, enCamino] = await Promise.all([
      listarVentas({ estado: 'preparado', limite: 50 }),
      listarVentas({ estado: 'en_camino', limite: 50 }),
    ])
    return [...preparados.ventas, ...enCamino.ventas]
  }, [])

  useEffect(() => {
    const intervalo = setInterval(recargar, ACTUALIZAR_CADA_MS)
    return () => clearInterval(intervalo)
  }, [recargar])

  if (cargando && !datos) {
    return <Cargando />
  }

  if (error && !datos) {
    return <MensajeError error={error} alReintentar={recargar} />
  }

  if (datos.length === 0) {
    return (
      <EstadoVacio icono="🛵" titulo="No hay pedidos en curso">
        Acá aparecen los pedidos listos que esperan a un repartidor y los que ya van en camino.
      </EstadoVacio>
    )
  }

  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Cliente</th>
            <th>Productos</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Repartidor</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {datos.map((venta) => (
            <tr key={venta.id}>
              <td>#{venta.id}</td>
              <td>{venta.cliente}</td>
              <td>{venta.cantidad_productos}</td>
              <td>{formatearPrecio(venta.total)}</td>
              <td><EstadoBadge estado={venta.estado} /></td>
              <td>{venta.repartidor ?? 'Esperando repartidor'}</td>
              <td><Link to={`/comercio/ventas/${venta.id}`}>Ver</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Historial de ventas con su resumen (CU17)
function Ventas() {
  const [filtros, setFiltros] = useState({ estado: '', desde: '', hasta: '' })
  const [pagina, setPagina] = useState(1)

  const { datos, cargando, error, recargar } = useCarga(
    () => listarVentas({ ...filtros, pagina, limite: 15 }),
    [filtros.estado, filtros.desde, filtros.hasta, pagina]
  )

  function cambiarFiltro(campo, valor) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }))
    setPagina(1)
  }

  const resumen = datos?.resumen

  return (
    <>
      <div className="barra-filtros">
        <div className="campo-form">
          <label htmlFor="filtro-estado">Estado</label>
          <select id="filtro-estado" value={filtros.estado} onChange={(evento) => cambiarFiltro('estado', evento.target.value)}>
            <option value="">Todos</option>
            {ESTADOS_VENTA.map((estado) => (
              <option key={estado} value={estado}>{ESTADOS_PEDIDO[estado].etiqueta}</option>
            ))}
          </select>
        </div>

        <div className="campo-form">
          <label htmlFor="filtro-desde">Desde</label>
          <input id="filtro-desde" type="date" value={filtros.desde} onChange={(evento) => cambiarFiltro('desde', evento.target.value)} />
        </div>

        <div className="campo-form">
          <label htmlFor="filtro-hasta">Hasta</label>
          <input id="filtro-hasta" type="date" value={filtros.hasta} onChange={(evento) => cambiarFiltro('hasta', evento.target.value)} />
        </div>

        {(filtros.estado || filtros.desde || filtros.hasta) && (
          <button type="button" className="boton boton-secundario" onClick={() => { setFiltros({ estado: '', desde: '', hasta: '' }); setPagina(1) }}>
            Limpiar filtros
          </button>
        )}
      </div>

      <MensajeError error={error} alReintentar={recargar} />

      {resumen && (
        <div className="tablero">
          <div className="tablero-dato"><span>Pedidos</span><strong>{resumen.pedidos}</strong></div>
          <div className="tablero-dato"><span>Entregados</span><strong>{resumen.entregados}</strong></div>
          <div className="tablero-dato"><span>En curso</span><strong>{resumen.en_curso}</strong></div>
          <div className="tablero-dato"><span>Cancelados</span><strong>{resumen.cancelados}</strong></div>
          <div className="tablero-dato"><span>Total vendido</span><strong>{formatearPrecio(resumen.total_vendido)}</strong></div>
          <div className="tablero-dato"><span>Ticket promedio</span><strong>{formatearPrecio(resumen.ticket_promedio)}</strong></div>
        </div>
      )}

      {cargando && !datos ? (
        <Cargando texto="Cargando ventas…" />
      ) : datos?.ventas.length === 0 ? (
        <EstadoVacio icono="🧾" titulo="No hay ventas con estos filtros">
          Una venta es un pedido pagado: los que esperan el pago todavía no aparecen.
        </EstadoVacio>
      ) : datos && (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Productos</th>
                <th>Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {datos.ventas.map((venta) => (
                <tr key={venta.id}>
                  <td>#{venta.id}</td>
                  <td>{formatearFecha(venta.created_at)}</td>
                  <td>{venta.cliente}</td>
                  <td>{plural(venta.cantidad_productos, 'unidad', 'unidades')}</td>
                  <td>{formatearPrecio(venta.total)}</td>
                  <td><EstadoBadge estado={venta.estado} /></td>
                  <td><Link to={`/comercio/ventas/${venta.id}`}>Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion paginacion={datos?.paginacion} alCambiar={setPagina} />
    </>
  )
}
