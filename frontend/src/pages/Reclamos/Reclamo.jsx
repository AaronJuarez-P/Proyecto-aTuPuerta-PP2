import { Link, useParams } from 'react-router'
import { obtenerMiReclamo } from '../../api/reclamos'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError } from '../../components/Comunes/Comunes'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { formatearFecha } from '../../utils/formato'
import './Reclamos.css'

// A dónde lleva el pedido de un reclamo, según quién lo mira
const RUTA_DEL_PEDIDO = {
  cliente: (id) => `/pedidos/${id}`,
  comercio: (id) => `/comercio/ventas/${id}`,
}

const EXPLICACION = {
  pendiente: 'Todavía no lo tomó nadie del equipo. Te avisamos cuando empiecen a revisarlo.',
  en_revision: 'Un administrador lo está revisando. Te avisamos cuando haya una respuesta.',
}

export default function Reclamo() {
  const { id } = useParams()
  const { usuario } = useSesion()
  const { datos, cargando, error, recargar } = useCarga(() => obtenerMiReclamo(id), [id])
  const reclamo = datos?.reclamo
  const rutaPedido = reclamo?.pedido_id ? RUTA_DEL_PEDIDO[usuario.rol]?.(reclamo.pedido_id) : null

  return (
    <main className="pagina reclamos-pagina">
      <div className="pagina-angosta">
        <Link className="volver-link" to="/reclamos">← Mis reclamos</Link>

        {error && !reclamo ? (
          error.codigo === 404 ? (
            <EstadoVacio icono="📣" titulo="Reclamo no encontrado">No existe o no es tuyo.</EstadoVacio>
          ) : (
            <MensajeError error={error} alReintentar={recargar} />
          )
        ) : cargando && !reclamo ? (
          <Cargando />
        ) : (
          <>
            <div className="pagina-encabezado">
              <div>
                <p className="etiqueta-seccion">Reclamo #{reclamo.id}</p>
                <h1>{reclamo.pedido_id ? `Sobre el pedido #${reclamo.pedido_id}` : 'Reclamo general'}</h1>
                <p>Hecho el {formatearFecha(reclamo.created_at)}</p>
              </div>
              <EstadoBadge tipo="reclamo" estado={reclamo.estado} />
            </div>

            <section className="tarjeta">
              <h2>Lo que contaste</h2>
              <p className="reclamo-texto">{reclamo.descripcion}</p>
              {rutaPedido && (
                <div className="acciones">
                  <Link className="boton boton-secundario" to={rutaPedido}>Ver el pedido #{reclamo.pedido_id}</Link>
                </div>
              )}
            </section>

            <section className="tarjeta">
              <h2>Respuesta</h2>
              {reclamo.resolucion ? (
                <>
                  <p className="reclamo-texto">{reclamo.resolucion}</p>
                  <p className="texto-apagado">Respondido el {formatearFecha(reclamo.updated_at)}</p>
                </>
              ) : (
                <p className="texto-apagado">{EXPLICACION[reclamo.estado] ?? 'Todavía sin respuesta.'}</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
