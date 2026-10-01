import { Link } from 'react-router'
import { listarReclamosAdmin } from '../../api/admin'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useCarga } from '../../hooks/useCarga'
import { useFiltrosUrl } from '../../hooks/useFiltrosUrl'
import { ESTADOS_RECLAMO } from '../../utils/estados'
import { formatearFecha } from '../../utils/formato'
import './Admin.css'

const FILTROS = ['estado', 'asignado']

const VISTAS = [
  { valor: '', texto: 'Todos' },
  { valor: 'ninguno', texto: 'Sin asignar' },
  { valor: 'yo', texto: 'Asignados a mí' },
]

const resumir = (texto, largo = 90) => (texto.length > largo ? `${texto.slice(0, largo).trimEnd()}…` : texto)

// Cola de reclamos (CU25). El backend ordena como una cola de atención: los abiertos
// primero y, entre ellos, el que espera hace más tiempo va adelante.
export default function AdminReclamos() {
  const { filtros, pagina, cambiar, cambiarPagina } = useFiltrosUrl(FILTROS)

  const { datos, cargando, error, recargar } = useCarga(
    () => listarReclamosAdmin({ ...filtros, pagina, limite: 15 }),
    [...Object.values(filtros), pagina]
  )

  const resumen = datos?.resumen_por_estado

  return (
    <main className="admin-page">
      <section className="admin-container">
        <Link className="volver-link" to="/admin">← Panel</Link>

        <header className="admin-header">
          <div>
            <p className="admin-label">Atención</p>
            <h1>Reclamos</h1>
            <p>Tomá un reclamo para revisarlo: solo quien lo tiene asignado lo puede cerrar.</p>
          </div>
        </header>

        {resumen && (
          <div className="tablero" role="group" aria-label="Filtrar por estado">
            {Object.entries(ESTADOS_RECLAMO).map(([estado, { etiqueta }]) => (
              <button
                key={estado}
                type="button"
                className={`tablero-dato ${filtros.estado === estado ? 'activo' : ''}`}
                aria-pressed={filtros.estado === estado}
                onClick={() => cambiar({ estado: filtros.estado === estado ? '' : estado })}
              >
                <span>{etiqueta}</span>
                <strong>{resumen[estado]}</strong>
              </button>
            ))}
          </div>
        )}

        <div className="pestanas" role="tablist" aria-label="Asignación">
          {VISTAS.map(({ valor, texto }) => (
            <button
              key={valor || 'todos'}
              type="button"
              role="tab"
              aria-selected={filtros.asignado === valor}
              className={`pestana ${filtros.asignado === valor ? 'activa' : ''}`}
              onClick={() => cambiar({ asignado: valor })}
            >
              {texto}
            </button>
          ))}
        </div>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : datos?.reclamos.length === 0 ? (
          <EstadoVacio icono="📣" titulo="No hay reclamos con estos filtros" />
        ) : datos && (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Reclamo</th>
                  <th>Hecho por</th>
                  <th>Sobre</th>
                  <th>Qué pasó</th>
                  <th>Fecha</th>
                  <th>Lo atiende</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {datos.reclamos.map((reclamo) => (
                  <tr key={reclamo.id}>
                    <td><Link to={`/admin/reclamos/${reclamo.id}`}>#{reclamo.id}</Link></td>
                    <td>
                      {reclamo.usuario}
                      <small className="admin-celda-secundaria">{reclamo.usuario_email}</small>
                    </td>
                    <td>
                      {reclamo.pedido_id ? <Link to={`/admin/pedidos/${reclamo.pedido_id}`}>Pedido #{reclamo.pedido_id}</Link> : 'General'}
                    </td>
                    <td className="admin-celda-texto">{resumir(reclamo.descripcion)}</td>
                    <td>{formatearFecha(reclamo.created_at)}</td>
                    <td>{reclamo.admin_asignado ?? '—'}</td>
                    <td><EstadoBadge tipo="reclamo" estado={reclamo.estado} /></td>
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
