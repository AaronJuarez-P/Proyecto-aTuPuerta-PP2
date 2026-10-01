import { Link, useSearchParams } from 'react-router'
import { listarMisPedidos } from '../../api/pedidos'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useCarga } from '../../hooks/useCarga'
import { ESTADOS_PEDIDO } from '../../utils/estados'
import { formatearFecha, formatearPrecio, plural } from '../../utils/formato'
import './Pedidos.css'

const PEDIDOS_POR_PAGINA = 10

// Historial del cliente (CU09). El filtro va en la URL: ?estado=en_camino
export default function Pedidos() {
  const [parametros, setParametros] = useSearchParams()
  const estado = parametros.get('estado') ?? ''
  const pagina = Number(parametros.get('pagina')) || 1

  const { datos, cargando, error, recargar } = useCarga(
    () => listarMisPedidos({ estado, pagina, limite: PEDIDOS_POR_PAGINA }),
    [estado, pagina]
  )

  const pedidos = datos?.pedidos ?? []

  function filtrar(nuevoEstado) {
    setParametros(nuevoEstado ? { estado: nuevoEstado } : {})
  }

  return (
    <main className="pedidos-page">
      <section className="pedidos-container">
        <div className="pedidos-title">
          <p className="eyebrow">MI CUENTA</p>
          <h1>Mis pedidos</h1>
          <p>Consultá el estado y los detalles de tus pedidos.</p>
        </div>

        <div className="chips" role="group" aria-label="Filtrar por estado">
          <button type="button" className={`chip ${!estado ? 'activo' : ''}`} onClick={() => filtrar('')}>
            Todos
          </button>
          {Object.entries(ESTADOS_PEDIDO).map(([clave, { etiqueta }]) => (
            <button
              type="button"
              key={clave}
              className={`chip ${estado === clave ? 'activo' : ''}`}
              onClick={() => filtrar(clave)}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando texto="Cargando tus pedidos…" />
        ) : pedidos.length === 0 && !error ? (
          <EstadoVacio
            icono="📦"
            titulo={estado ? 'No hay pedidos en este estado' : 'Todavía no tenés pedidos'}
            accion={
              <Link className="boton boton-primario" to={estado ? '/pedidos' : '/comercios'}>
                {estado ? 'Ver todos mis pedidos' : 'Ver comercios'}
              </Link>
            }
          >
            {estado ? '' : 'Cuando hagas una compra, tus pedidos van a aparecer acá.'}
          </EstadoVacio>
        ) : (
          <div className="pedidos-list">
            {pedidos.map((pedido) => (
              <article className="pedido-card" key={pedido.id}>
                <div className="pedido-top">
                  <div>
                    <span className="pedido-label">
                      Pedido #{pedido.id} · {pedido.comercio}
                    </span>
                    <p className="pedido-fecha">{formatearFecha(pedido.created_at)}</p>
                  </div>

                  <EstadoBadge estado={pedido.estado} />
                </div>

                <div className="pedido-info">
                  <div>
                    <span>Productos</span>
                    <strong>{plural(pedido.cantidad_productos, 'unidad', 'unidades')}</strong>
                  </div>

                  <div>
                    <span>Total</span>
                    <strong>{formatearPrecio(pedido.total)}</strong>
                  </div>

                  <div>
                    <span>{pedido.estado === 'cancelado' ? 'Motivo' : 'Última novedad'}</span>
                    <strong>
                      {pedido.estado === 'cancelado'
                        ? pedido.motivo_cancelacion || 'Cancelado'
                        : formatearFecha(pedido.updated_at)}
                    </strong>
                  </div>
                </div>

                <div className="pedido-bottom">
                  <span>📍 {pedido.direccion_entrega}</span>

                  {pedido.estado === 'pago_espera' ? (
                    <Link to={`/pedidos/${pedido.id}`} className="boton boton-primario boton-chico">
                      Pagar →
                    </Link>
                  ) : (
                    <Link to={`/pedidos/${pedido.id}`} className="pedido-detail-button">
                      {pedido.estado === 'en_camino' ? 'Seguir en vivo →' : 'Ver detalle →'}
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <Paginacion
          paginacion={datos?.paginacion}
          alCambiar={(nueva) => setParametros({ ...(estado && { estado }), ...(nueva > 1 && { pagina: String(nueva) }) })}
        />
      </section>
    </main>
  )
}
