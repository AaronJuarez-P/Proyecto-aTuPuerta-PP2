import { Link } from 'react-router'
import { obtenerEstadisticasAdmin } from '../../api/admin'
import { Cargando, MensajeError } from '../../components/Comunes/Comunes'
import { useCarga } from '../../hooks/useCarga'
import { formatearPrecio } from '../../utils/formato'
import './Admin.css'

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

function ListaTop({ titulo, filas, claveValor, formatoValor, detalle }) {
  const maximo = Math.max(...filas.map((fila) => Number(fila[claveValor]) || 0), 1)

  return (
    <section className="tarjeta">
      <h2>{titulo}</h2>
      {filas.length === 0 ? (
        <p className="texto-apagado">Todavía no hay datos para mostrar.</p>
      ) : (
        <ol className="admin-ranking">
          {filas.map((fila) => {
            const valor = Number(fila[claveValor]) || 0
            const proporcion = Math.min((valor / maximo) * 100, 100)

            return (
              <li className="admin-ranking-fila" key={fila.id}>
                <div className="admin-ranking-encabezado">
                  <strong>{fila.nombre}</strong>
                  <span>{formatoValor(valor)}</span>
                </div>
                <div className="admin-ranking-barra" aria-hidden="true">
                  <span style={{ width: `${proporcion}%` }} />
                </div>
                {detalle && <small>{detalle(fila)}</small>}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function PorcentajeEstado({ etiqueta, cantidad, total, porcentaje, clase }) {
  return (
    <article className="admin-porcentaje">
      <div className="admin-porcentaje-encabezado">
        <span>{etiqueta}</span>
        <strong>{numero.format(porcentaje)}%</strong>
      </div>
      <div
        className="admin-porcentaje-barra"
        role="progressbar"
        aria-label={`${etiqueta}: ${numero.format(porcentaje)} por ciento`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
      >
        <span className={clase} style={{ width: `${porcentaje}%` }} />
      </div>
      <small>{numero.format(cantidad)} de {numero.format(total)} pedidos</small>
    </article>
  )
}

export default function AdminEstadisticas() {
  const { datos, cargando, error, recargar } = useCarga(obtenerEstadisticasAdmin, [])
  const periodo = datos?.mes.periodo
  const fechaPeriodo = periodo
    ? new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)) - 1, 1)
        .toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    : ''

  return (
    <main className="admin-page">
      <section className="admin-container">
        <header className="admin-header">
          <div>
            <p className="admin-label">Administración</p>
            <h1>Estadísticas</h1>
            <p>Rendimiento de pedidos, comercios, clientes y repartidores.</p>
          </div>
          <Link className="boton boton-secundario" to="/admin">Volver al panel</Link>
        </header>

        <MensajeError error={error} alReintentar={recargar} />
        {cargando && !datos ? (
          <Cargando />
        ) : datos && (
          <>
            <section className="admin-estadisticas-resumen" aria-label="Resumen de pedidos">
              <article className="admin-stat">
                <span>Pedidos en {fechaPeriodo}</span>
                <strong>{numero.format(datos.mes.pedidos)}</strong>
              </article>
              <article className="admin-stat">
                <span>Promedio diario del mes</span>
                <strong>{numero.format(datos.mes.promedio_diario)}</strong>
                <small>En {datos.mes.dias_transcurridos} {datos.mes.dias_transcurridos === 1 ? 'día' : 'días'} transcurridos</small>
              </article>
              <article className="admin-stat">
                <span>Pedidos históricos</span>
                <strong>{numero.format(datos.pedidos.total)}</strong>
              </article>
            </section>

            <section className="admin-section">
              <div className="admin-section-title">
                <div>
                  <p className="admin-label">Estados</p>
                  <h2>Pedidos entregados y cancelados</h2>
                </div>
              </div>
              <div className="admin-porcentajes">
                <PorcentajeEstado
                  etiqueta="Entregados"
                  cantidad={datos.pedidos.entregados}
                  total={datos.pedidos.total}
                  porcentaje={datos.pedidos.porcentaje_entregados}
                  clase="admin-barra-entregados"
                />
                <PorcentajeEstado
                  etiqueta="Cancelados"
                  cantidad={datos.pedidos.cancelados}
                  total={datos.pedidos.total}
                  porcentaje={datos.pedidos.porcentaje_cancelados}
                  clase="admin-barra-cancelados"
                />
              </div>
              <p className="admin-estadisticas-nota">
                Porcentaje calculado sobre los {numero.format(datos.pedidos.total)} pedidos registrados.
              </p>
            </section>

            <div className="admin-estadisticas-top">
              <ListaTop
                titulo="Comercios con más ventas"
                filas={datos.comercios}
                claveValor="ventas"
                formatoValor={formatearPrecio}
                detalle={(comercio) => `${numero.format(comercio.pedidos)} pedidos entregados`}
              />
              <ListaTop
                titulo="Clientes con más pedidos"
                filas={datos.clientes}
                claveValor="pedidos"
                formatoValor={(valor) => numero.format(valor)}
                detalle={(cliente) => `${numero.format(cliente.pedidos)} pedidos`}
              />
              <ListaTop
                titulo="Repartidores con más repartos"
                filas={datos.repartidores}
                claveValor="repartos"
                formatoValor={(valor) => numero.format(valor)}
                detalle={(repartidor) => `${numero.format(repartidor.repartos)} entregas completadas`}
              />
            </div>
          </>
        )}
      </section>
    </main>
  )
}
