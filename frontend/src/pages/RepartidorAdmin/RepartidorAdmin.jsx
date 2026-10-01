import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  cambiarDisponibilidad,
  confirmarEntrega,
  enviarUbicacion,
  listarMisEntregas,
  listarPedidosDisponibles,
  obtenerDisponibilidad,
  obtenerRuta,
  tomarPedido,
} from '../../api/repartidor'
import { seguirPedidoEnVivo } from '../../api/tiempoReal'
import { Cargando, EstadoBadge, EstadoVacio, MensajeError, Modal, Paginacion } from '../../components/Comunes/Comunes'
import FormularioReclamo from '../../components/FormularioReclamo/FormularioReclamo'
import MapaSeguimiento from '../../components/MapaSeguimiento/MapaSeguimiento'
import { useAvisos } from '../../context/avisos'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { formatearDistancia, formatearFecha, formatearHora, formatearMinutos, formatearPrecio, plural } from '../../utils/formato'
import './RepartidorAdmin.css'

// Los pedidos disponibles cambian cuando otros repartidores toman o cuando se pagan
// pedidos nuevos: la lista se vuelve a mirar sola
const ACTUALIZAR_DISPONIBLES_MS = 20000

// Con GPS, una posición cada 10 segundos como mínimo: más seguido no cambia nada y es
// una request por ping
const INTERVALO_UBICACION_MS = 10000

// "Simular avance" (demo): cuánto del camino que falta se recorre en cada clic, y desde
// dónde se arranca si todavía no hay ninguna posición. Es el mismo centro alrededor del
// cual el modo mock del backend ubica las direcciones (MAPS_CENTRO_LAT/LNG).
const FRACCION_POR_PASO = 0.35
const CENTRO_DEMO = { latitud: -31.6667, longitud: -60.7667 }

const distanciaKm = (a, b) => {
  const radianes = (grados) => (grados * Math.PI) / 180
  const dLat = radianes(b.latitud - a.latitud)
  const dLng = radianes(b.longitud - a.longitud)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radianes(a.latitud)) * Math.cos(radianes(b.latitud)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

const TEXTO_ORIGEN_RUTA = {
  mock: 'Ruta estimada: el backend está en modo de prueba, sin Mapbox.',
  estimado: 'Mapbox no respondió: la ruta es una estimación.',
}

function mensajeErrorGps(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'El navegador no tiene permiso para usar tu ubicación. Habilitalo para compartirla.'
  }

  return 'No se pudo obtener tu ubicación. Probá de nuevo en un momento.'
}

export default function RepartidorAdmin() {
  const { usuario } = useSesion()
  const avisar = useAvisos()
  const [pagina, setPagina] = useState(1)
  const [cambiandoServicio, setCambiandoServicio] = useState(false)

  const disponibilidad = useCarga(() => obtenerDisponibilidad(), [])

  // Trae el pedido en curso y el resumen en cualquier página del historial
  const entregas = useCarga(() => listarMisEntregas({ estado: 'entregado', pagina, limite: 8 }), [pagina])

  const { recargar: recargarDisponibilidad } = disponibilidad
  const { recargar: recargarEntregas } = entregas

  const recargarTodo = useCallback(() => {
    recargarDisponibilidad()
    recargarEntregas()
  }, [recargarDisponibilidad, recargarEntregas])

  async function cambiarServicio(enServicio) {
    setCambiandoServicio(true)

    try {
      await cambiarDisponibilidad(enServicio)
      avisar(enServicio ? 'Estás en servicio: ya podés tomar pedidos.' : 'Saliste de servicio.')
      recargarDisponibilidad()
    } catch (error) {
      avisar(error.message, 'error')
    } finally {
      setCambiandoServicio(false)
    }
  }

  const enCurso = entregas.datos?.en_curso ?? null
  const disponible = disponibilidad.datos?.disponible ?? false
  const resumen = entregas.datos?.resumen
  const cargandoInicio = (disponibilidad.cargando && !disponibilidad.datos) || (entregas.cargando && !entregas.datos)

  return (
    <main className="repartidor-page">
      <section className="repartidor-container">
        <div className="repartidor-header">
          <div>
            <p className="repartidor-label">Panel de repartidor</p>
            <h1>Hola, {usuario.nombre.split(' ')[0]}</h1>
            <p>Tomá pedidos, retiralos en el comercio y entregalos con el código del cliente.</p>
          </div>

          <label className={`interruptor-servicio ${disponible || enCurso ? 'activo' : ''}`}>
            <input
              type="checkbox"
              checked={disponible || Boolean(enCurso)}
              disabled={cambiandoServicio || Boolean(enCurso) || !disponibilidad.datos}
              onChange={(evento) => cambiarServicio(evento.target.checked)}
            />
            <span className="interruptor-pista" aria-hidden="true" />
            <span>
              {enCurso ? 'Con un pedido en camino' : disponible ? 'En servicio' : 'Fuera de servicio'}
            </span>
          </label>
        </div>

        <MensajeError error={disponibilidad.error ?? entregas.error} alReintentar={recargarTodo} />

        {resumen && (
          <section className="repartidor-stats">
            <div className="repartidor-stat">
              <strong>{resumen.entregados}</strong>
              <span>Entregas hechas</span>
            </div>
            <div className="repartidor-stat">
              <strong>{formatearPrecio(resumen.comisiones)}</strong>
              <span>Ganado en comisiones</span>
            </div>
            <div className="repartidor-stat">
              <strong>{enCurso ? `#${enCurso.id}` : '—'}</strong>
              <span>Pedido en curso</span>
            </div>
          </section>
        )}

        {cargandoInicio ? (
          <Cargando />
        ) : enCurso ? (
          <PedidoEnCurso key={enCurso.id} pedido={enCurso} alTerminar={recargarTodo} />
        ) : disponible ? (
          <PedidosDisponibles alTomar={recargarTodo} />
        ) : (
          <EstadoVacio
            icono="🛵"
            titulo="Estás fuera de servicio"
            accion={
              <button type="button" className="boton boton-primario" disabled={cambiandoServicio} onClick={() => cambiarServicio(true)}>
                Ponerme en servicio
              </button>
            }
          >
            Cuando estés en servicio vas a ver los pedidos pagados que esperan un repartidor.
          </EstadoVacio>
        )}

        <Historial entregas={entregas} alCambiarPagina={setPagina} />
      </section>
    </main>
  )
}

function PedidosDisponibles({ alTomar }) {
  const avisar = useAvisos()
  const [tomando, setTomando] = useState(null)
  const { datos, cargando, error, recargar } = useCarga(() => listarPedidosDisponibles({ limite: 30 }), [])

  useEffect(() => {
    const intervalo = setInterval(recargar, ACTUALIZAR_DISPONIBLES_MS)
    return () => clearInterval(intervalo)
  }, [recargar])

  async function tomar(pedido) {
    setTomando(pedido.id)

    try {
      await tomarPedido(pedido.id)
      avisar(`Tomaste el pedido #${pedido.id}. Pasá a retirarlo por ${pedido.comercio}.`)
      alTomar()
    } catch (errorTomar) {
      // 409 si otro repartidor lo tomó un instante antes
      avisar(errorTomar.message, 'error')
      recargar()
    } finally {
      setTomando(null)
    }
  }

  const pedidos = datos?.pedidos ?? []

  return (
    <section className="repartidor-section">
      <div className="section-title">
        <h2>Pedidos disponibles</h2>
        <span>{pedidos.length}</span>
        <button type="button" className="boton boton-secundario boton-chico" onClick={recargar}>
          Actualizar
        </button>
      </div>

      <MensajeError error={error} alReintentar={recargar} />

      {cargando && !datos ? (
        <Cargando texto="Buscando pedidos…" />
      ) : pedidos.length === 0 ? (
        <EstadoVacio icono="🚲" titulo="No hay pedidos para repartir">
          Cuando un cliente pague un pedido, aparece acá. La lista se actualiza sola.
        </EstadoVacio>
      ) : (
        <div className="repartidor-list">
          {pedidos.map((pedido) => (
            <article className="repartidor-card" key={pedido.id}>
              <div className="repartidor-card-top">
                <div>
                  <span>Pedido</span>
                  <h3>#{pedido.id} · {pedido.comercio}</h3>
                  <small>{plural(Number(pedido.cantidad_items), 'producto')}</small>
                </div>
                {pedido.estado === 'preparado' ? (
                  <span className="status-ready">Listo para retirar</span>
                ) : (
                  <span className="status-delivery">El comercio lo está preparando</span>
                )}
              </div>

              <div className="repartidor-card-info">
                <div>
                  <span>🏪 Retirás en</span>
                  <strong>{pedido.direccion_comercio}</strong>
                </div>
                <div>
                  <span>📍 Entregás en</span>
                  <strong>La dirección la ves al tomarlo</strong>
                </div>
                <div>
                  <span>🛣 Recorrido</span>
                  <strong>{formatearDistancia(pedido.distancia_km)} · {formatearMinutos(pedido.tiempo_estimado)}</strong>
                </div>
                <div>
                  <span>💰 Ganás</span>
                  <strong>{formatearPrecio(pedido.comision)}</strong>
                </div>
              </div>

              <div className="repartidor-actions">
                <button type="button" className="accept-button" disabled={tomando !== null} onClick={() => tomar(pedido)}>
                  {tomando === pedido.id ? 'Tomando…' : 'Tomar pedido →'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function PedidoEnCurso({ pedido, alTerminar }) {
  const avisar = useAvisos()
  const claveRetirado = `atupuerta:retirado:${pedido.id}`

  // "Ya retiré" no lo guarda el backend (es solo el parámetro de la ruta): se recuerda
  // en el navegador para que una recarga no vuelva a mandar al comercio
  const [retirado, setRetirado] = useState(() => {
    try {
      return localStorage.getItem(claveRetirado) === 'si'
    } catch {
      return false
    }
  })
  const [compartiendo, setCompartiendo] = useState(false)
  const [ultimoEnvio, setUltimoEnvio] = useState(null)
  const [errorUbicacion, setErrorUbicacion] = useState('')
  const [codigo, setCodigo] = useState('')
  const [errorEntrega, setErrorEntrega] = useState('')
  const [entregando, setEntregando] = useState(false)
  const [reclamando, setReclamando] = useState(false)
  const [enVivo, setEnVivo] = useState(false)
  const ultimaPosicion = useRef(null)

  const ruta = useCarga(() => obtenerRuta(pedido.id, retirado), [pedido.id, retirado])
  const { recargar: recargarRuta } = ruta
  const puntos = ruta.datos?.ruta?.puntos

  const enviar = useCallback(async (posicion) => {
    try {
      await enviarUbicacion(posicion)
      ultimaPosicion.current = posicion
      setUltimoEnvio(new Date())
      setErrorUbicacion('')
      recargarRuta()
    } catch (error) {
      setErrorUbicacion(error.message)
    }
  }, [recargarRuta])

  // GPS del dispositivo mientras está activado
  useEffect(() => {
    if (!compartiendo) {
      return
    }

    let ultimo = 0

    const vigilancia = navigator.geolocation.watchPosition(
      (posicion) => {
        const ahora = Date.now()

        if (ahora - ultimo < INTERVALO_UBICACION_MS) {
          return
        }

        ultimo = ahora
        enviar({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude })
      },
      (error) => {
        setErrorUbicacion(mensajeErrorGps(error))
        setCompartiendo(false)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )

    return () => navigator.geolocation.clearWatch(vigilancia)
  }, [compartiendo, enviar])

  // Si un administrador cancela el pedido mientras va en camino, el repartidor se entera
  // por la misma sala del socket que usa el cliente
  const alCambiarEstado = useEffectEvent((evento) => {
    if (evento.estado === 'cancelado') {
      avisar('Un administrador canceló este pedido. Ya quedaste disponible de nuevo.', 'error')
      alTerminar()
    }
  })

  useEffect(() => {
    const cortar = seguirPedidoEnVivo(pedido.id, {
      alConectar: () => setEnVivo(true),
      alError: () => setEnVivo(false),
      alCambiarEstado: (evento) => alCambiarEstado(evento),
    })

    return () => {
      cortar()
      setEnVivo(false)
    }
  }, [pedido.id])

  function alternarGps() {
    if (compartiendo) {
      setCompartiendo(false)
      return
    }

    if (!('geolocation' in navigator)) {
      setErrorUbicacion('Este navegador no puede compartir la ubicación.')
      return
    }

    setErrorUbicacion('')
    setCompartiendo(true)
  }

  function marcarRetirado(valor) {
    setRetirado(valor)

    try {
      if (valor) {
        localStorage.setItem(claveRetirado, 'si')
      } else {
        localStorage.removeItem(claveRetirado)
      }
    } catch {
      // Sin localStorage solo se pierde el recordatorio al recargar
    }
  }

  // Modo demo: avanza un tramo hacia la próxima parada (el comercio si todavía no
  // retiró, si no el cliente). Sirve para mostrar el seguimiento en vivo sin moverse.
  function simularAvance() {
    const desde = ultimaPosicion.current ?? puntos?.origen ?? CENTRO_DEMO
    const hacia = retirado ? puntos?.destino : puntos?.comercio ?? puntos?.destino

    if (!hacia) {
      enviar(desde)
      return
    }

    const siguiente = distanciaKm(desde, hacia) < 0.05
      ? hacia
      : {
          latitud: desde.latitud + (hacia.latitud - desde.latitud) * FRACCION_POR_PASO,
          longitud: desde.longitud + (hacia.longitud - desde.longitud) * FRACCION_POR_PASO,
        }

    enviar(siguiente)
  }

  async function entregar(evento) {
    evento.preventDefault()
    setErrorEntrega('')

    if (!/^\d{8}$/.test(codigo)) {
      setErrorEntrega('El código tiene 8 dígitos. Pedíselo al cliente.')
      return
    }

    setEntregando(true)

    try {
      await confirmarEntrega(pedido.id, { codigo, ...(ultimaPosicion.current ?? {}) })
      try {
        localStorage.removeItem(claveRetirado)
      } catch {
        // nada que limpiar
      }
      avisar(`¡Entregado! Sumaste ${formatearPrecio(pedido.comision)}.`)
      alTerminar()
    } catch (error) {
      setErrorEntrega(error.message)
      setEntregando(false)
    }
  }

  const datosRuta = ruta.datos?.ruta
  const origenDatos = datosRuta?.origen_datos
  const mostrarSimulador = import.meta.env.DEV || origenDatos === 'mock'
  const llegoAlComercio = !retirado && puntos?.comercio && puntos?.origen && distanciaKm(puntos.origen, puntos.comercio) < 0.05

  return (
    <section className="repartidor-section">
      <div className="section-title">
        <h2>Pedido en curso</h2>
      </div>

      <article className="repartidor-card pedido-en-curso">
        <div className="repartidor-card-top">
          <div>
            <span>Pedido</span>
            <h3>#{pedido.id} · {pedido.comercio}</h3>
            <small>Para {pedido.cliente} · {plural(pedido.cantidad_productos, 'producto')}</small>
          </div>
          <div className="en-curso-estado">
            <EstadoBadge estado="en_camino" />
            <span className={`en-vivo ${enVivo ? 'conectado' : ''}`}>{enVivo ? '● En vivo' : '○ Conectando…'}</span>
          </div>
        </div>

        <div className="repartidor-card-info">
          <div className={retirado ? 'parada-hecha' : 'parada-actual'}>
            <span>1 · Retirás en</span>
            <strong>{pedido.comercio} · {pedido.direccion_comercio}</strong>
          </div>
          <div className={retirado ? 'parada-actual' : ''}>
            <span>2 · Entregás en</span>
            <strong>{pedido.direccion_entrega}</strong>
          </div>
          <div>
            <span>💰 Ganás</span>
            <strong>{formatearPrecio(pedido.comision)}</strong>
          </div>
          <div>
            <span>📦 Llevás</span>
            <strong>{pedido.items.map((item) => `${item.cantidad}× ${item.nombre}`).join(', ')}</strong>
          </div>
        </div>

        <div className="en-curso-cuerpo">
          <div className="en-curso-controles">
            <label className="casilla">
              <input type="checkbox" checked={retirado} onChange={(evento) => marcarRetirado(evento.target.checked)} />
              Ya retiré el pedido del comercio
            </label>

            {llegoAlComercio && <p className="aviso-form aviso-form-info">Llegaste al comercio: marcá que lo retiraste.</p>}

            <div className="acciones">
              <button type="button" className={`boton ${compartiendo ? 'boton-acento' : 'boton-secundario'}`} onClick={alternarGps}>
                {compartiendo ? '📡 Compartiendo ubicación' : '📍 Compartir mi ubicación'}
              </button>
              {mostrarSimulador && (
                <button type="button" className="boton boton-secundario" onClick={simularAvance}>
                  ▶ Simular avance (demo)
                </button>
              )}
            </div>

            {ultimoEnvio && <p className="texto-apagado">Última ubicación enviada a las {formatearHora(ultimoEnvio)}</p>}
            {errorUbicacion && <p className="aviso-form aviso-form-error">{errorUbicacion}</p>}

            <form className="formulario-entrega" onSubmit={entregar}>
              <label htmlFor="codigo-entrega">Código de entrega</label>
              <div>
                <input
                  id="codigo-entrega"
                  inputMode="numeric"
                  value={codigo}
                  onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Te lo dicta el cliente"
                />
                <button type="submit" className="deliver-button" disabled={entregando}>
                  {entregando ? 'Confirmando…' : 'Confirmar entrega ✓'}
                </button>
              </div>
              {errorEntrega && <p className="aviso-form aviso-form-error">{errorEntrega}</p>}
            </form>

            <button type="button" className="enlace-reclamo" onClick={() => setReclamando(true)}>
              ¿Hubo un problema con este pedido?
            </button>
          </div>

          <div className="en-curso-ruta">
            {ruta.error && !datosRuta ? (
              <div className="ruta-sin-ubicacion">
                <p>
                  {ruta.error.codigo === 409
                    ? 'Compartí tu ubicación para ver la ruta y el tiempo de llegada.'
                    : ruta.error.message}
                </p>
              </div>
            ) : ruta.cargando && !datosRuta ? (
              <Cargando texto="Calculando la ruta…" />
            ) : datosRuta && (
              <>
                <p className="ruta-resumen">
                  <strong>{formatearDistancia(datosRuta.distancia_km)}</strong> · {formatearMinutos(datosRuta.duracion_minutos)}
                  {datosRuta.tramos?.length > 1 && (
                    <small>
                      {datosRuta.tramos.map((tramo) => `${tramo.hasta === 'comercio' ? 'al comercio' : 'al cliente'} ${formatearDistancia(tramo.distancia_km)}`).join(' · ')}
                    </small>
                  )}
                </p>
                <MapaSeguimiento
                  comercio={retirado ? null : puntos?.comercio}
                  destino={puntos?.destino}
                  repartidor={puntos?.origen}
                  polilinea={datosRuta.polilinea}
                  etiquetas={{ comercio: pedido.comercio, destino: pedido.cliente, repartidor: 'Vos' }}
                />
                {TEXTO_ORIGEN_RUTA[origenDatos] && <p className="texto-apagado">{TEXTO_ORIGEN_RUTA[origenDatos]}</p>}
              </>
            )}
          </div>
        </div>
      </article>

      <Modal abierto={reclamando} titulo={`Reclamo sobre el pedido #${pedido.id}`} alCerrar={() => setReclamando(false)}>
        <FormularioReclamo pedidoId={pedido.id} alTerminar={() => setReclamando(false)} />
      </Modal>
    </section>
  )
}

function Historial({ entregas, alCambiarPagina }) {
  const [reclamo, setReclamo] = useState(null)
  const lista = entregas.datos?.entregas ?? []

  return (
    <section className="repartidor-section">
      <div className="section-title">
        <h2>Mis entregas</h2>
      </div>

      {entregas.cargando && !entregas.datos ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <EstadoVacio icono="📦" titulo="Todavía no hiciste entregas">
          Cuando entregues tu primer pedido, lo vas a ver acá con lo que ganaste.
        </EstadoVacio>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Entregado</th>
                <th>Comercio</th>
                <th>Cliente</th>
                <th>Recorrido</th>
                <th>Ganaste</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((entrega) => (
                <tr key={entrega.id}>
                  <td>#{entrega.id}</td>
                  <td>{formatearFecha(entrega.updated_at)}</td>
                  <td>{entrega.comercio}</td>
                  <td>{entrega.cliente}</td>
                  <td>{formatearDistancia(entrega.distancia_km)}</td>
                  <td>{formatearPrecio(entrega.comision)}</td>
                  <td>
                    <button type="button" className="boton boton-secundario boton-chico" onClick={() => setReclamo(entrega.id)}>
                      Reclamar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginacion paginacion={entregas.datos?.paginacion} alCambiar={alCambiarPagina} />

      <Modal abierto={reclamo !== null} titulo={`Reclamo sobre el pedido #${reclamo}`} alCerrar={() => setReclamo(null)}>
        <FormularioReclamo pedidoId={reclamo} alTerminar={() => setReclamo(null)} />
      </Modal>
    </section>
  )
}
