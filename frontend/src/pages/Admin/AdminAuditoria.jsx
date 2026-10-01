import { Link } from 'react-router'
import { listarAuditoriaPedidos, listarAuditoriaProductos, listarUsuarios } from '../../api/admin'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useCarga } from '../../hooks/useCarga'
import { useFiltrosUrl } from '../../hooks/useFiltrosUrl'
import { ACCIONES_AUDITORIA } from '../../utils/estados'
import { formatearFechaYHora } from '../../utils/formato'
import { autorDeAuditoria } from './auditoria'
import './Admin.css'

const PESTANAS = [
  { clave: 'pedidos', texto: 'Pedidos' },
  { clave: 'productos', texto: 'Productos' },
]

// ver es la pestaña. usuarioId y productoId no tienen control propio: llegan desde el
// detalle de un usuario o tocando un producto de la tabla.
const FILTROS = ['ver', 'accion', 'desde', 'hasta', 'usuarioId', 'pedidoId', 'productoId', 'comercioId']
const PROPIOS_DE_PESTANA = { pedidoId: '', productoId: '', comercioId: '' }

// Trazabilidad: cada alta, cambio y baja de pedidos y de productos, con quién la hizo
export default function AdminAuditoria() {
  const { filtros, pagina, cambiar, cambiarPagina, limpiar } = useFiltrosUrl(FILTROS)
  const ver = filtros.ver === 'productos' ? 'productos' : 'pedidos'
  const hayFiltros = FILTROS.some((clave) => clave !== 'ver' && filtros[clave])

  const { datos, cargando, error, recargar } = useCarga(() => {
    const comunes = { accion: filtros.accion, desde: filtros.desde, hasta: filtros.hasta, usuarioId: filtros.usuarioId, pagina, limite: 20 }

    return ver === 'productos'
      ? listarAuditoriaProductos({ ...comunes, productoId: filtros.productoId, comercioId: filtros.comercioId })
      : listarAuditoriaPedidos({ ...comunes, pedidoId: filtros.pedidoId })
  }, [ver, ...Object.values(filtros), pagina])

  // Para elegir comercio: el listado de usuarios trae el comercio de cada uno, también
  // los suspendidos, que el catálogo público no muestra
  const { datos: conComercio } = useCarga(
    () => (ver === 'productos' ? listarUsuarios({ rol: 'comercio', limite: 100 }) : Promise.resolve(null)),
    [ver]
  )
  const comercios = conComercio?.usuarios.map((usuario) => usuario.comercio).filter(Boolean) ?? []

  function filtrarPedido(evento) {
    evento.preventDefault()
    cambiar({ pedidoId: String(new FormData(evento.currentTarget).get('pedidoId') ?? '').trim() })
  }

  const chips = [
    filtros.usuarioId && { clave: 'usuarioId', texto: `Usuario #${filtros.usuarioId}` },
    ver === 'productos' && filtros.productoId && { clave: 'productoId', texto: `Producto #${filtros.productoId}` },
  ].filter(Boolean)

  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin">← Panel</Link>

        <header className="admin-header">
          <div>
            <p className="admin-label">Trazabilidad</p>
            <h1>Auditoría</h1>
            <p>Cada alta, cambio y baja de pedidos y productos, con la fecha y quién lo hizo.</p>
          </div>
        </header>

        <div className="pestanas" role="tablist" aria-label="Qué auditar">
          {PESTANAS.map(({ clave, texto }) => (
            <button
              key={clave}
              type="button"
              role="tab"
              aria-selected={ver === clave}
              className={`pestana ${ver === clave ? 'activa' : ''}`}
              onClick={() => cambiar({ ...PROPIOS_DE_PESTANA, ver: clave === 'pedidos' ? '' : clave })}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="barra-filtros">
          <div className="campo-form">
            <label htmlFor="filtro-accion">Acción</label>
            <select id="filtro-accion" value={filtros.accion} onChange={(evento) => cambiar({ accion: evento.target.value })}>
              <option value="">Todas</option>
              {Object.entries(ACCIONES_AUDITORIA).map(([accion, { etiqueta }]) => (
                <option key={accion} value={accion}>{etiqueta}</option>
              ))}
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

          {ver === 'pedidos' ? (
            <form className="admin-busqueda" onSubmit={filtrarPedido} key={filtros.pedidoId}>
              <div className="campo-form">
                <label htmlFor="filtro-pedido">N.º de pedido</label>
                <input id="filtro-pedido" name="pedidoId" type="number" min="1" defaultValue={filtros.pedidoId} />
              </div>
              <button type="submit" className="boton boton-secundario">Filtrar</button>
            </form>
          ) : (
            <div className="campo-form">
              <label htmlFor="filtro-comercio">Comercio</label>
              <select id="filtro-comercio" value={filtros.comercioId} onChange={(evento) => cambiar({ comercioId: evento.target.value })}>
                <option value="">Todos</option>
                {comercios.map((comercio) => (
                  <option key={comercio.id} value={comercio.id}>
                    {comercio.nombre}{comercio.activo ? '' : ' (suspendido)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hayFiltros && (
            <button type="button" className="boton boton-secundario" onClick={() => limpiar(ver === 'productos' ? { ver } : {})}>
              Limpiar filtros
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div className="chips">
            {chips.map(({ clave, texto }) => (
              <button key={clave} type="button" className="chip activo" onClick={() => cambiar({ [clave]: '' })} aria-label={`Quitar el filtro ${texto}`}>
                {texto} ×
              </button>
            ))}
          </div>
        )}

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : datos?.auditoria.length === 0 ? (
          <EstadoVacio icono="🧾" titulo="No hay registros con estos filtros" />
        ) : datos && (
          <div className="tabla-contenedor">
            {ver === 'pedidos' ? (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Pedido</th>
                    <th>Acción</th>
                    <th>Detalle</th>
                    <th>Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.auditoria.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatearFechaYHora(registro.fecha, registro.hora)}</td>
                      <td><Link to={`/admin/pedidos/${registro.pedido_id}`}>#{registro.pedido_id}</Link></td>
                      <td><EstadoBadge tipo="auditoria" estado={registro.accion} /></td>
                      <td className="admin-celda-texto">{registro.detalle ?? '—'}</td>
                      <td>{autorDeAuditoria(registro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th>Comercio</th>
                    <th>Acción</th>
                    <th>Quién</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.auditoria.map((registro) => (
                    <tr key={registro.id}>
                      <td>{formatearFechaYHora(registro.fecha, registro.hora)}</td>
                      <td>
                        <button
                          type="button"
                          className="boton-enlace"
                          title="Ver solo los cambios de este producto"
                          onClick={() => cambiar({ productoId: String(registro.producto_id) })}
                        >
                          {registro.producto}
                        </button>
                      </td>
                      <td>{registro.comercio}</td>
                      <td><EstadoBadge tipo="auditoria" estado={registro.accion} /></td>
                      <td>{autorDeAuditoria(registro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <Paginacion paginacion={datos?.paginacion} alCambiar={cambiarPagina} />
      </section>
    </main>
  )
}
