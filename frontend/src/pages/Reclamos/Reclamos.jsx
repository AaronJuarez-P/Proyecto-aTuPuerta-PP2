import { useState } from 'react'
import { Link } from 'react-router'
import { listarMisReclamos } from '../../api/reclamos'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Modal, Paginacion } from '../../components/Comunes/Comunes'
import FormularioReclamo from '../../components/FormularioReclamo/FormularioReclamo'
import { useCarga } from '../../hooks/useCarga'
import { ESTADOS_RECLAMO } from '../../utils/estados'
import { formatearFecha } from '../../utils/formato'
import './Reclamos.css'

// Mis reclamos (CU25): de cliente, comercio o repartidor. Los atiende un administrador.
export default function Reclamos() {
  const [estado, setEstado] = useState('')
  const [pagina, setPagina] = useState(1)
  const [nuevo, setNuevo] = useState(false)

  const { datos, cargando, error, recargar } = useCarga(
    () => listarMisReclamos({ estado, pagina, limite: 10 }),
    [estado, pagina]
  )

  const reclamos = datos?.reclamos ?? []

  return (
    <main className="pagina reclamos-pagina">
      <div className="pagina-angosta">
        <div className="pagina-encabezado">
          <div>
            <p className="etiqueta-seccion">Mi cuenta</p>
            <h1>Mis reclamos</h1>
            <p>Si algo salió mal, contanos y el equipo de ATuPuerta lo revisa.</p>
          </div>

          <button type="button" className="boton boton-primario" onClick={() => setNuevo(true)}>
            + Nuevo reclamo
          </button>
        </div>

        <div className="chips" role="group" aria-label="Filtrar por estado">
          <button type="button" className={`chip ${!estado ? 'activo' : ''}`} onClick={() => { setEstado(''); setPagina(1) }}>
            Todos
          </button>
          {Object.entries(ESTADOS_RECLAMO).map(([clave, { etiqueta }]) => (
            <button
              key={clave}
              type="button"
              className={`chip ${estado === clave ? 'activo' : ''}`}
              onClick={() => { setEstado(clave); setPagina(1) }}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : reclamos.length === 0 && !error ? (
          <EstadoVacio icono="📣" titulo={estado ? 'No hay reclamos en este estado' : 'No hiciste reclamos'}>
            Ojalá siga así. Si tenés un problema con un pedido, podés reclamar desde acá o desde el pedido.
          </EstadoVacio>
        ) : (
          <ul className="lista-reclamos">
            {reclamos.map((reclamo) => (
              <li key={reclamo.id}>
                <Link to={`/reclamos/${reclamo.id}`}>
                  <div className="reclamo-encabezado">
                    <strong>
                      Reclamo #{reclamo.id}
                      {reclamo.pedido_id && <small> · pedido #{reclamo.pedido_id}</small>}
                    </strong>
                    <EstadoBadge tipo="reclamo" estado={reclamo.estado} />
                  </div>
                  <p>{reclamo.descripcion}</p>
                  <small>{formatearFecha(reclamo.created_at)}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Paginacion paginacion={datos?.paginacion} alCambiar={setPagina} />
      </div>

      <Modal abierto={nuevo} titulo="Nuevo reclamo" alCerrar={() => setNuevo(false)}>
        <FormularioReclamo
          pedidoOpcional
          alTerminar={() => {
            setNuevo(false)
            recargar()
          }}
        />
      </Modal>
    </main>
  )
}
