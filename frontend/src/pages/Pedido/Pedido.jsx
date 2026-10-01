import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  cancelarMiPedido,
  iniciarPago,
  obtenerMiPedido,
  obtenerSeguimiento,
  repetirPedido,
  simularPago,
} from '../../api/pedidos'
import { seguirPedidoEnVivo } from '../../api/tiempoReal'
import { Cargando, EstadoBadge, MensajeError, Modal } from '../../components/Comunes/Comunes'
import FormularioReclamo from '../../components/FormularioReclamo/FormularioReclamo'
import MapaSeguimiento from '../../components/MapaSeguimiento/MapaSeguimiento'
import { useAvisos } from '../../context/avisos'
import { useCarrito } from '../../context/carrito'
import { useCarga } from '../../hooks/useCarga'
import { ESTADOS_PEDIDO, ESTADOS_TERMINALES, METODOS_PAGO, RECORRIDO_PEDIDO, VEHICULOS } from '../../utils/estados'
import {
  formatearDistancia,
  formatearFecha,
  formatearHora,
  formatearMinutos,
  formatearPrecio,
} from '../../utils/formato'
import './Pedido.css'

// Estados en los que el endpoint de seguimiento tiene algo para mostrar en el mapa
const CON_SEGUIMIENTO = ['en_preparacion', 'preparado', 'en_camino', 'entregado']

const TEXTO_VUELTA_DE_PAGO = {
  approved: 'MercadoPago aprobó el pago. Estamos esperando la confirmación: el estado se actualiza solo.',
  pending: 'El pago quedó pendiente en MercadoPago. Cuando se acredite, el estado se actualiza solo.',
  in_process: 'El pago quedó pendiente en MercadoPago. Cuando se acredite, el estado se actualiza solo.',
  rejected: 'MercadoPago rechazó el pago.',
}

// Un ping nuevo del repartidor. Pueden llegar desordenados (el que recalculó la ruta
// tarda más), así que el id de la ubicación decide cuál es el último.
function aplicarPing(seguimiento, { ubicacion, eta, ruta, retirado }) {
  if (!seguimiento) {
    return seguimiento
  }

  if (seguimiento.ubicacion?.id && ubicacion.id <= seguimiento.ubicacion.id) {
    return seguimiento
  }

  return {
    ...seguimiento,
    ubicacion: { ...ubicacion, registrado_en: new Date().toISOString() },
    eta: eta ?? seguimiento.eta,
    // null cuando no hubo refresco: se conserva la polilínea anterior
    ruta: ruta ? { ...seguimiento.ruta, ...ruta } : seguimiento.ruta,
    retirado: retirado ?? seguimiento.retirado,
  }
}

function LineaDeTiempo({ estado }) {
  if (estado === 'cancelado') {
    return null
  }

  const actual = RECORRIDO_PEDIDO.indexOf(estado)

  return (
    <ol className="linea-tiempo" aria-label="Estado del pedido">
      {RECORRIDO_PEDIDO.map((paso, indice) => (
        <li
          key={paso}
          className={indice < actual ? 'hecho' : indice === actual ? 'actual' : ''}
          aria-current={indice === actual ? 'step' : undefined}
        >
          <span className="linea-tiempo-punto" aria-hidden="true">{indice < actual ? '✓' : indice + 1}</span>
          <span>{ESTADOS_PEDIDO[paso].etiqueta}</span>
        </li>
      ))}
    </ol>
  )
}

export default function Pedido() {
  const { id } = useParams()
  const [parametros] = useSearchParams()
  const vueltaDePago = parametros.get('pago')
  const navigate = useNavigate()
  const avisar = useAvisos()
  const { recargar: recargarCarrito } = useCarrito()

  const detalle = useCarga(() => obtenerMiPedido(id), [id])
  const pedido = detalle.datos?.pedido
  const estado = pedido?.estado
  const activo = Boolean(estado) && !ESTADOS_TERMINALES.includes(estado)

  const seguimiento = useCarga(
    () => (CON_SEGUIMIENTO.includes(estado) ? obtenerSeguimiento(id) : Promise.resolve(null)),
    [id, estado]
  )

  const [enVivo, setEnVivo] = useState(false)
  const [pago, setPago] = useState({ procesando: false, simulador: false, error: null })
  const [modal, setModal] = useState(null)
  const [procesando, setProcesando] = useState(false)

  const { recargar: recargarDetalle } = detalle
  const { recargar: recargarSeguimiento, setDatos: setSeguimiento } = seguimiento

  // El primer ping se pide de nuevo por REST: mientras el repartidor no había mandado
  // ninguno, el backend no incluía el destino ni el ETA, y el mensaje era "todavía no
  // compartió su ubicación". Los siguientes se aplican acá, sin ir al servidor.
  const alMoverse = useEffectEvent((evento) => {
    if (!seguimiento.datos?.ubicacion || !seguimiento.datos?.destino) {
      recargarSeguimiento()
      return
    }

    setSeguimiento((actual) => aplicarPing(actual, evento))
  })

  const alCambiarEstado = useEffectEvent(() => recargarDetalle())

  // Canal en vivo mientras el pedido no terminó: el pago aprobado, el repartidor
  // asignado, cada movimiento y la entrega llegan sin refrescar la página
  useEffect(() => {
    if (!activo) {
      return
    }

    const cortar = seguirPedidoEnVivo(id, {
      alConectar: () => setEnVivo(true),
      alError: () => setEnVivo(false),
      alCambiarEstado: () => alCambiarEstado(),
      alMoverse: (evento) => alMoverse(evento),
    })

    return () => {
      cortar()
      setEnVivo(false)
    }
  }, [id, activo])

  const cerrarModal = useCallback(() => setModal(null), [])

  async function pagar() {
    setPago({ procesando: true, simulador: false, error: null })

    try {
      const respuesta = await iniciarPago(id)

      if (respuesta.modo === 'sandbox') {
        window.location.assign(respuesta.url_pago)
        return
      }

      // MP_MODO=mock: no hay MercadoPago de verdad, el resultado se elige a mano
      setPago({ procesando: false, simulador: true, error: null })
    } catch (error) {
      setPago({ procesando: false, simulador: false, error })
    }
  }

  async function simular(resultado) {
    setPago((actual) => ({ ...actual, procesando: true, error: null }))

    try {
      const respuesta = await simularPago(id, resultado)
      const aprobado = respuesta.resultado === 'aprobado'

      avisar(
        aprobado
          ? '¡Pago aprobado! El comercio ya puede preparar tu pedido.'
          : 'El pago fue rechazado: el pedido se canceló y el stock volvió al comercio.',
        aprobado ? 'exito' : 'error'
      )
      setPago({ procesando: false, simulador: false, error: null })
      recargarDetalle()
    } catch (error) {
      setPago((actual) => ({ ...actual, procesando: false, error }))
    }
  }

  async function cancelar() {
    setProcesando(true)

    try {
      await cancelarMiPedido(id)
      avisar('Cancelaste el pedido.')
      setModal(null)
      recargarDetalle()
    } catch (error) {
      avisar(error.message, 'error')
    } finally {
      setProcesando(false)
    }
  }

  async function repetir() {
    setProcesando(true)

    try {
      const resultado = await repetirPedido(id)
      await recargarCarrito().catch(() => {})
      setModal({ tipo: 'repetido', resultado })
    } catch (error) {
      if (error.datos?.omitidos) {
        setModal({ tipo: 'repetido', resultado: { agregados: [], omitidos: error.datos.omitidos, mensaje: error.message } })
      } else {
        avisar(error.message, 'error')
      }
    } finally {
      setProcesando(false)
    }
  }

  if (detalle.error && !pedido) {
    const noEsSuyo = detalle.error.codigo === 403 || detalle.error.codigo === 404

    return (
      <main className="pedido-page">
        <section className="pedido-container pedido-not-found">
          <h1>{noEsSuyo ? 'Pedido no encontrado' : 'No se pudo cargar el pedido'}</h1>
          <p>{detalle.error.message}</p>
          <Link to="/pedidos" className="pedido-button">← Volver a mis pedidos</Link>
        </section>
      </main>
    )
  }

  if (!pedido) {
    return (
      <main className="pedido-page">
        <section className="pedido-container"><Cargando texto="Cargando el pedido…" /></section>
      </main>
    )
  }

  const datosSeguimiento = seguimiento.datos

  return (
    <main className="pedido-page">
      <section className="pedido-container">
        <Link to="/pedidos" className="pedido-back">← Volver a mis pedidos</Link>

        <div className="pedido-header">
          <div>
            <p className="pedido-label">Pedido #{pedido.id}</p>
            <h1>{pedido.comercio}</h1>
            <p className="pedido-date">Realizado el {formatearFecha(pedido.created_at)}</p>
          </div>

          <div className="pedido-estado-actual">
            <EstadoBadge estado={estado} />
            {activo && (
              <span className={`en-vivo ${enVivo ? 'conectado' : ''}`}>
                {enVivo ? '● En vivo' : '○ Conectando…'}
              </span>
            )}
          </div>
        </div>

        <LineaDeTiempo estado={estado} />

        {vueltaDePago && estado === 'pago_espera' && TEXTO_VUELTA_DE_PAGO[vueltaDePago] && (
          <p className="aviso-form aviso-form-info pedido-aviso">{TEXTO_VUELTA_DE_PAGO[vueltaDePago]}</p>
        )}

        {estado === 'pago_espera' && (
          <section className="pedido-card pedido-accion">
            <h2>Falta el pago</h2>
            <p>
              Pagá {formatearPrecio(pedido.total)} para que {pedido.comercio} empiece a preparar tu pedido.
              Hasta que lo pagues, el stock queda reservado para vos.
            </p>

            <MensajeError error={pago.error} />

            {pago.simulador ? (
              <div className="simulador-pago">
                <p>
                  <strong>Modo de prueba.</strong> El backend tiene MercadoPago simulado
                  (<code>MP_MODO=mock</code>): elegí cómo sale el pago.
                </p>
                <div className="acciones">
                  <button type="button" className="boton boton-primario" disabled={pago.procesando} onClick={() => simular('approved')}>
                    ✓ Aprobar el pago
                  </button>
                  <button type="button" className="boton boton-peligro" disabled={pago.procesando} onClick={() => simular('rejected')}>
                    ✕ Rechazar el pago
                  </button>
                </div>
              </div>
            ) : (
              <div className="acciones">
                <button type="button" className="boton boton-primario" disabled={pago.procesando} onClick={pagar}>
                  {pago.procesando ? 'Abriendo MercadoPago…' : `💳 Pagar ${formatearPrecio(pedido.total)} con MercadoPago`}
                </button>
                <button type="button" className="boton boton-secundario" onClick={() => setModal({ tipo: 'cancelar' })}>
                  Cancelar pedido
                </button>
              </div>
            )}
          </section>
        )}

        {estado === 'en_camino' && pedido.codigo_entrega && (
          <section className="pedido-card codigo-entrega">
            <div>
              <h2>Tu código de entrega</h2>
              <p>Dáselo al repartidor cuando te entregue el pedido. Sin este código no puede confirmar la entrega.</p>
            </div>
            <strong aria-label={`Código ${pedido.codigo_entrega.split('').join(' ')}`}>{pedido.codigo_entrega}</strong>
          </section>
        )}

        {estado === 'cancelado' && (
          <section className="pedido-card pedido-cancelado">
            <h2>Pedido cancelado</h2>
            <p>{pedido.motivo_cancelacion || 'Este pedido se canceló.'}</p>
            {pedido.pago?.estado === 'aprobado' && (
              <p className="aviso-form aviso-form-info">
                El pago se había acreditado: la devolución del dinero la gestiona el equipo de ATuPuerta.
              </p>
            )}
          </section>
        )}

        {CON_SEGUIMIENTO.includes(estado) && (
          <section className="pedido-card seguimiento">
            <div className="seguimiento-encabezado">
              <h2>Seguimiento</h2>
              {datosSeguimiento?.eta && (
                <p className="seguimiento-eta">
                  Llega cerca de las <strong>{formatearHora(datosSeguimiento.eta.hora_estimada)}</strong>
                  {' '}· en {formatearMinutos(datosSeguimiento.eta.minutos)}
                </p>
              )}
            </div>

            {seguimiento.cargando && !datosSeguimiento ? (
              <Cargando texto="Buscando al repartidor…" />
            ) : (
              <>
                <p className="seguimiento-mensaje">{datosSeguimiento?.mensaje}</p>

                {datosSeguimiento?.repartidor && (
                  <p className="seguimiento-repartidor">
                    🛵 {datosSeguimiento.repartidor.nombre}
                    {datosSeguimiento.repartidor.tipo_vehiculo && ` · ${VEHICULOS[datosSeguimiento.repartidor.tipo_vehiculo] ?? datosSeguimiento.repartidor.tipo_vehiculo}`}
                    {datosSeguimiento.ubicacion?.registrado_en && ` · última posición a las ${formatearHora(datosSeguimiento.ubicacion.registrado_en)}`}
                  </p>
                )}

                <MapaSeguimiento
                  comercio={datosSeguimiento?.retirado ? null : datosSeguimiento?.pedido?.comercio}
                  destino={datosSeguimiento?.destino}
                  repartidor={datosSeguimiento?.ubicacion}
                  polilinea={datosSeguimiento?.ruta?.polilinea}
                  etiquetas={{
                    comercio: pedido.comercio,
                    destino: 'Tu dirección',
                    repartidor: datosSeguimiento?.repartidor?.nombre ?? 'Repartidor',
                  }}
                />
              </>
            )}
          </section>
        )}

        <div className="pedido-grid">
          <section className="pedido-card">
            <h2>Productos</h2>

            <div className="pedido-products">
              {pedido.items.map((item) => (
                <div className="pedido-product" key={item.producto_id}>
                  <div className="product-icon" aria-hidden="true">📦</div>
                  <div className="product-info">
                    <strong>{item.nombre}</strong>
                    <span>{item.cantidad} × {formatearPrecio(item.precio_unit)}</span>
                  </div>
                  <strong className="product-subtotal">{formatearPrecio(item.subtotal)}</strong>
                </div>
              ))}
            </div>

            <div className="pedido-total">
              <span>Total</span>
              <strong>{formatearPrecio(pedido.total)}</strong>
            </div>
          </section>

          <aside className="pedido-side">
            <div className="pedido-card">
              <h2>Entrega</h2>
              <div className="detail-row">
                <span>📍 Dirección</span>
                <strong>{pedido.direccion_entrega}</strong>
              </div>
              <div className="detail-row">
                <span>🏪 Sale de</span>
                <strong>{pedido.comercio} · {pedido.direccion_comercio}</strong>
              </div>
              <div className="detail-row">
                <span>⏱ Estimado al comprar</span>
                <strong>{formatearMinutos(pedido.tiempo_estimado)} · {formatearDistancia(pedido.distancia_km)}</strong>
              </div>
              {pedido.repartidor && (
                <div className="detail-row">
                  <span>🛵 Repartidor</span>
                  <strong>{pedido.repartidor}{pedido.tipo_vehiculo && ` · ${VEHICULOS[pedido.tipo_vehiculo] ?? pedido.tipo_vehiculo}`}</strong>
                </div>
              )}
            </div>

            <div className="pedido-card">
              <h2>Pago</h2>
              {pedido.pago ? (
                <>
                  <div className="detail-row">
                    <span>Estado</span>
                    <strong><EstadoBadge tipo="pago" estado={pedido.pago.estado} /></strong>
                  </div>
                  <div className="detail-row">
                    <span>Método</span>
                    <strong>{METODOS_PAGO[pedido.pago.metodo] ?? pedido.pago.metodo}</strong>
                  </div>
                  {pedido.pago.fecha_pago && (
                    <div className="detail-row">
                      <span>Fecha</span>
                      <strong>{formatearFecha(pedido.pago.fecha_pago)}</strong>
                    </div>
                  )}
                  {pedido.pago.motivo_rechazo && pedido.pago.estado !== 'aprobado' && (
                    <div className="detail-row">
                      <span>Motivo</span>
                      <strong>{pedido.pago.motivo_rechazo}</strong>
                    </div>
                  )}
                </>
              ) : (
                <p className="pedido-sin-pago">Todavía no hay ningún intento de pago.</p>
              )}
            </div>

            <div className="pedido-card pedido-mas-acciones">
              {ESTADOS_TERMINALES.includes(estado) && (
                <button type="button" className="boton boton-primario boton-bloque" disabled={procesando} onClick={repetir}>
                  ↻ Volver a pedir lo mismo
                </button>
              )}
              <button
                type="button"
                className="boton boton-secundario boton-bloque"
                onClick={() => setModal({ tipo: 'reclamo' })}
              >
                ¿Tuviste un problema? Hacé un reclamo
              </button>
            </div>
          </aside>
        </div>
      </section>

      <Modal abierto={modal?.tipo === 'cancelar'} titulo="¿Cancelar el pedido?" alCerrar={cerrarModal}>
        <p className="modal-texto">
          Todavía no lo pagaste, así que se cancela sin costo y el stock vuelve al comercio.
        </p>
        <div className="acciones">
          <button type="button" className="boton boton-peligro" disabled={procesando} onClick={cancelar}>
            Sí, cancelar
          </button>
          <button type="button" className="boton boton-secundario" onClick={cerrarModal}>
            No, volver
          </button>
        </div>
      </Modal>

      <Modal abierto={modal?.tipo === 'repetido'} titulo="Volver a pedir" alCerrar={cerrarModal}>
        {modal?.tipo === 'repetido' && (
          <ResultadoRepetir resultado={modal.resultado} alIrAlCarrito={() => navigate('/carrito')} alCerrar={cerrarModal} />
        )}
      </Modal>

      <Modal abierto={modal?.tipo === 'reclamo'} titulo={`Reclamo sobre el pedido #${pedido.id}`} alCerrar={cerrarModal}>
        <FormularioReclamo pedidoId={pedido.id} alTerminar={cerrarModal} />
      </Modal>
    </main>
  )
}

// Lo que dejó en el carrito "repetir pedido": el backend usa los precios de hoy y
// agrega lo que haya en stock
function ResultadoRepetir({ resultado, alIrAlCarrito, alCerrar }) {
  const { agregados = [], omitidos = [], mensaje } = resultado

  return (
    <div className="resultado-repetir">
      <p className="modal-texto">{mensaje}</p>

      {agregados.length > 0 && (
        <ul>
          {agregados.map((item) => (
            <li key={item.producto_id}>
              ✓ {item.cantidad} × {item.nombre}
              {item.parcial && <small> (pediste {item.cantidad_pedida}, había menos stock)</small>}
              {item.precio_actual !== item.precio_anterior && (
                <small> · antes {formatearPrecio(item.precio_anterior)}, hoy {formatearPrecio(item.precio_actual)}</small>
              )}
            </li>
          ))}
        </ul>
      )}

      {omitidos.length > 0 && (
        <ul className="omitidos">
          {omitidos.map((item) => (
            <li key={item.producto_id}>✕ {item.nombre ?? `Producto #${item.producto_id}`}: {item.motivo}</li>
          ))}
        </ul>
      )}

      <div className="acciones">
        {agregados.length > 0 && (
          <button type="button" className="boton boton-primario" onClick={alIrAlCarrito}>
            Revisar el carrito →
          </button>
        )}
        <button type="button" className="boton boton-secundario" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  )
}
