import { Link } from 'react-router'
import { listarPedidosAdmin, listarReclamosAdmin, listarUsuarios } from '../../api/admin'
import { Cargando, EstadoBadge, MensajeError } from '../../components/Comunes/Comunes'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { ESTADOS_PEDIDO } from '../../utils/estados'
import { formatearFecha, formatearPrecio } from '../../utils/formato'
import './Admin.css'

// Tablero del administrador: los números de todo el sistema y lo que necesita atención
export default function Admin() {
  const { usuario } = useSesion()

  const { datos, cargando, error, recargar } = useCarga(async () => {
    const [pedidos, reclamos, usuarios, sinAsignar] = await Promise.all([
      listarPedidosAdmin({ activos: 'true', limite: 6 }),
      listarReclamosAdmin({ limite: 1 }),
      listarUsuarios({ limite: 1 }),
      listarReclamosAdmin({ asignado: 'ninguno', estado: 'pendiente', limite: 5 }),
    ])

    return { pedidos, reclamos, usuarios, sinAsignar }
  }, [])

  const resumenPedidos = datos?.pedidos.resumen_por_estado
  const resumenReclamos = datos?.reclamos.resumen_por_estado

  return (
    <main className="admin-page">
      <section className="admin-container">
        <header className="admin-header">
          <div>
            <p className="admin-label">Administración</p>
            <h1>Panel de administrador</h1>
            <p>Supervisá el funcionamiento general de ATuPuerta.</p>
          </div>
          <div className="admin-welcome">⚙️ {usuario.nombre}</div>
        </header>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : datos && (
          <>
            <section className="admin-stats">
              <Link className="admin-stat" to="/admin/pedidos">
                <span>Pedidos en total</span>
                <strong>{resumenPedidos.total}</strong>
              </Link>
              <Link className="admin-stat" to="/admin/pedidos?activos=true">
                <span>Pedidos activos</span>
                <strong>{resumenPedidos.activos}</strong>
              </Link>
              <Link className="admin-stat" to="/admin/reclamos?estado=pendiente">
                <span>Reclamos pendientes</span>
                <strong>{resumenReclamos.pendiente}</strong>
              </Link>
              <Link className="admin-stat" to="/admin/usuarios">
                <span>Usuarios</span>
                <strong>{datos.usuarios.paginacion.total}</strong>
              </Link>
            </section>

            <section className="admin-section">
              <div className="admin-section-title">
                <div>
                  <p className="admin-label">Supervisión</p>
                  <h2>Pedidos por estado</h2>
                </div>
              </div>

              <div className="tablero">
                {Object.entries(ESTADOS_PEDIDO).map(([estado, { etiqueta }]) => (
                  <Link className="tablero-dato" key={estado} to={`/admin/pedidos?estado=${estado}`}>
                    <span>{etiqueta}</span>
                    <strong>{resumenPedidos[estado]}</strong>
                  </Link>
                ))}
              </div>
            </section>

            <div className="grilla-dos">
              <section className="tarjeta">
                <h2>Pedidos activos más recientes</h2>
                {datos.pedidos.pedidos.length === 0 ? (
                  <p className="texto-apagado">No hay pedidos activos.</p>
                ) : (
                  datos.pedidos.pedidos.map((pedido) => (
                    <Link className="fila-tablero" key={pedido.id} to={`/admin/pedidos/${pedido.id}`}>
                      <span>
                        <strong>#{pedido.id}</strong> {pedido.comercio} → {pedido.cliente}
                        <small>{formatearFecha(pedido.created_at)} · {formatearPrecio(pedido.total)}</small>
                      </span>
                      <EstadoBadge estado={pedido.estado} />
                    </Link>
                  ))
                )}
                <div className="acciones">
                  <Link className="boton boton-secundario" to="/admin/pedidos">Ver todos los pedidos →</Link>
                </div>
              </section>

              <section className="tarjeta">
                <h2>Reclamos sin asignar</h2>
                {datos.sinAsignar.reclamos.length === 0 ? (
                  <p className="texto-apagado">No hay reclamos esperando que alguien los tome.</p>
                ) : (
                  datos.sinAsignar.reclamos.map((reclamo) => (
                    <Link className="fila-tablero" key={reclamo.id} to={`/admin/reclamos/${reclamo.id}`}>
                      <span>
                        <strong>#{reclamo.id}</strong> {reclamo.usuario}
                        <small>{formatearFecha(reclamo.created_at)}{reclamo.pedido_id ? ` · pedido #${reclamo.pedido_id}` : ''}</small>
                      </span>
                      <EstadoBadge tipo="reclamo" estado={reclamo.estado} />
                    </Link>
                  ))
                )}
                <div className="acciones">
                  {/* La cola muestra primero los que esperan hace más: los nuevos pueden quedar afuera */}
                  {datos.sinAsignar.paginacion.total > datos.sinAsignar.reclamos.length ? (
                    <Link className="boton boton-secundario" to="/admin/reclamos?estado=pendiente&asignado=ninguno">
                      Ver los {datos.sinAsignar.paginacion.total} sin asignar →
                    </Link>
                  ) : (
                    <Link className="boton boton-secundario" to="/admin/reclamos">Ir a la cola de reclamos →</Link>
                  )}
                </div>
              </section>
            </div>

            <div className="acciones">
              <Link className="boton boton-secundario" to="/admin/usuarios">👥 Usuarios</Link>
              <Link className="boton boton-secundario" to="/admin/auditoria">🧾 Auditoría</Link>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
