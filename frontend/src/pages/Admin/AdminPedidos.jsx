import { Link } from 'react-router'
import { listarPedidosAdmin } from '../../api/admin'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useCarga } from '../../hooks/useCarga'
import { useFiltrosUrl } from '../../hooks/useFiltrosUrl'
import { ESTADOS_PEDIDO } from '../../utils/estados'
import { formatearFecha, formatearPrecio } from '../../utils/formato'
import './Admin.css'

// Los de actor no tienen control propio: llegan desde el detalle de un usuario
const FILTROS_ACTOR = [
  { clave: 'clienteId', texto: 'Cliente' },
  { clave: 'comercioId', texto: 'Comercio' },
  { clave: 'repartidorId', texto: 'Repartidor' },
]

const FILTROS = ['estado', 'activos', 'desde', 'hasta', ...FILTROS_ACTOR.map(({ clave }) => clave)]

// Supervisión de pedidos (CU24): todos los pedidos del sistema, activos e históricos.
// Los filtros van en la URL: el tablero linkea directo a /admin/pedidos?estado=en_camino.
export default function AdminPedidos() {
  const { filtros, pagina, hayFiltros, cambiar, cambiarPagina, limpiar } = useFiltrosUrl(FILTROS)

  const { datos, cargando, error, recargar } = useCarga(
    () => listarPedidosAdmin({ ...filtros, pagina, limite: 15 }),
    [...Object.values(filtros), pagina]
  )

  const actores = FILTROS_ACTOR.filter(({ clave }) => filtros[clave])

  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin">← Panel</Link>

        <header className="admin-header">
          <div>
            <p className="admin-label">Supervisión</p>
            <h1>Pedidos</h1>
            <p>Todos los pedidos de la plataforma, con su estado, su pago y quiénes participan.</p>
          </div>
        </header>

        <div className="barra-filtros">
          <div className="campo-form">
            <label htmlFor="filtro-estado">Estado</label>
            <select id="filtro-estado" value={filtros.estado} onChange={(evento) => cambiar({ estado: evento.target.value })}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS_PEDIDO).map(([estado, { etiqueta }]) => (
                <option key={estado} value={estado}>{etiqueta}</option>
              ))}
            </select>
          </div>

          <div className="campo-form">
            <label htmlFor="filtro-activos">Situación</label>
            <select id="filtro-activos" value={filtros.activos} onChange={(evento) => cambiar({ activos: evento.target.value })}>
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Terminados</option>
            </select>
          </div>

          <div className="campo-form">
            <label htmlFor="filtro-desde">Desde</label>
            <input id="filtro-desde" type="date" value={filtros.desde} onChange={(evento) => cambiar({ desde: evento.target.value })} />
          </div>

          <div className="campo-form">
            <label htmlFor="filtro-hasta">Hasta</label>
            <input id="filtro-hasta" type="date" value={filtros.hasta} onChange={(evento) => cambiar({ hasta: evento.target.value })} />
          </div>

          {hayFiltros && (
            <button type="button" className="boton boton-secundario" onClick={() => limpiar()}>
              Limpiar filtros
            </button>
          )}
        </div>

        {actores.length > 0 && (
          <div className="chips">
            {actores.map(({ clave, texto }) => (
              <button key={clave} type="button" className="chip activo" onClick={() => cambiar({ [clave]: '' })} aria-label={`Quitar el filtro ${texto} #${filtros[clave]}`}>
                {texto} #{filtros[clave]} ×
              </button>
            ))}
          </div>
        )}

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : datos?.pedidos.length === 0 ? (
          <EstadoVacio icono="📦" titulo="No hay pedidos con estos filtros" />
        ) : datos && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Comercio</th>
                  <th>Repartidor</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.pedidos.map((pedido) => (
                  <tr key={pedido.id}>
                    <td><Link to={`/admin/pedidos/${pedido.id}`}>#{pedido.id}</Link></td>
                    <td>{formatearFecha(pedido.created_at)}</td>
                    <td>{pedido.cliente}</td>
                    <td>{pedido.comercio}</td>
                    <td>{pedido.repartidor ?? '—'}</td>
                    <td>{formatearPrecio(pedido.total)}</td>
                    <td>{pedido.pago ? <EstadoBadge tipo="pago" estado={pedido.pago} /> : '—'}</td>
                    <td><EstadoBadge estado={pedido.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Paginacion paginacion={datos?.paginacion} alCambiar={cambiarPagina} />
      </section>
    </main>
  )
}
