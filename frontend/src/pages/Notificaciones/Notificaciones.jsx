import { useState } from 'react'
import { Link } from 'react-router'
import { listarNotificaciones, marcarLeida, marcarTodasLeidas } from '../../api/notificaciones'
import { Cargando, EstadoVacio, MensajeError, Paginacion } from '../../components/Comunes/Comunes'
import { useAvisos } from '../../context/avisos'
import { useNotificaciones } from '../../context/notificaciones'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { formatearFecha, plural } from '../../utils/formato'
import { enlaceDeNotificacion, iconoDeNotificacion } from '../../utils/notificaciones'
import { activarPush, consultarEstadoPush } from '../../utils/push'
import { pluralDelRol } from '../../utils/roles'
import './Notificaciones.css'

// Notificaciones de la sesión (CU27): las propias y las generales de su rol
export default function Notificaciones() {
  const { usuario } = useSesion()
  const { recargar: recargarCampanita } = useNotificaciones()
  const avisar = useAvisos()
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const [pagina, setPagina] = useState(1)

  const { datos, cargando, error, recargar, setDatos } = useCarga(
    () => listarNotificaciones({ no_leidas: soloNoLeidas ? 'true' : '', pagina, limite: 15 }),
    [soloNoLeidas, pagina]
  )

  async function leer(notificacion) {
    if (notificacion.leida) {
      return
    }

    try {
      await marcarLeida(notificacion.id)
      setDatos((actuales) => ({
        ...actuales,
        notificaciones: actuales.notificaciones.map((n) => (n.id === notificacion.id ? { ...n, leida: true } : n)),
        no_leidas: Math.max(0, actuales.no_leidas - 1),
      }))
      recargarCampanita()
    } catch (errorLeer) {
      avisar(errorLeer.message, 'error')
    }
  }

  async function leerTodas() {
    try {
      const { marcadas } = await marcarTodasLeidas()
      avisar(marcadas > 0 ? `Marcaste ${plural(marcadas, 'notificación', 'notificaciones')} como leídas.` : 'No había notificaciones sin leer.')
      recargar()
      recargarCampanita()
    } catch (errorLeer) {
      avisar(errorLeer.message, 'error')
    }
  }

  function filtrar(valor) {
    setSoloNoLeidas(valor)
    setPagina(1)
  }

  const notificaciones = datos?.notificaciones ?? []
  const noLeidas = datos?.no_leidas ?? 0

  return (
    <main className="pagina notificaciones-pagina">
      <div className="pagina-angosta">
        <div className="pagina-encabezado">
          <div>
            <p className="etiqueta-seccion">Mi cuenta</p>
            <h1>Notificaciones</h1>
            <p>{noLeidas > 0 ? `Tenés ${plural(noLeidas, 'notificación sin leer', 'notificaciones sin leer')}.` : 'Estás al día.'}</p>
          </div>

          {noLeidas > 0 && (
            <button type="button" className="boton boton-secundario" onClick={leerTodas}>
              ✓ Marcar todas como leídas
            </button>
          )}
        </div>

        <div className="chips" role="group" aria-label="Filtro">
          <button type="button" className={`chip ${!soloNoLeidas ? 'activo' : ''}`} onClick={() => filtrar(false)}>Todas</button>
          <button type="button" className={`chip ${soloNoLeidas ? 'activo' : ''}`} onClick={() => filtrar(true)}>Sin leer</button>
        </div>

        <MensajeError error={error} alReintentar={recargar} />

        {cargando && !datos ? (
          <Cargando />
        ) : notificaciones.length === 0 && !error ? (
          <EstadoVacio icono="🔔" titulo={soloNoLeidas ? 'No tenés notificaciones sin leer' : 'Todavía no tenés notificaciones'}>
            Te avisamos acá cuando pase algo con tus pedidos o tus reclamos.
          </EstadoVacio>
        ) : (
          <ul className="lista-notificaciones">
            {notificaciones.map((notificacion) => {
              const enlace = enlaceDeNotificacion(notificacion, usuario.rol)

              return (
                <li key={notificacion.id} className={notificacion.leida ? '' : 'sin-leer'}>
                  <span className="notificacion-icono" aria-hidden="true">{iconoDeNotificacion(notificacion.tipo)}</span>

                  <div className="notificacion-cuerpo">
                    <p>{notificacion.mensaje}</p>
                    <small>
                      {formatearFecha(notificacion.created_at)}
                      {notificacion.general && ` · Para todos los ${pluralDelRol(usuario.rol)}`}
                    </small>
                  </div>

                  <div className="notificacion-acciones">
                    {enlace && (
                      <Link className="boton boton-secundario boton-chico" to={enlace} onClick={() => leer(notificacion)}>
                        Ver →
                      </Link>
                    )}
                    {!notificacion.leida && (
                      <button type="button" className="boton boton-secundario boton-chico" onClick={() => leer(notificacion)}>
                        Marcar leída
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <Paginacion paginacion={datos?.paginacion} alCambiar={setPagina} />

        <PanelPush />
      </div>
    </main>
  )
}

// Activar las notificaciones del navegador (Web Push), si el backend tiene claves VAPID
function PanelPush() {
  const avisar = useAvisos()
  const [activando, setActivando] = useState(false)
  const estado = useCarga(() => consultarEstadoPush(), [])

  async function activar() {
    setActivando(true)

    try {
      await activarPush(estado.datos.clave)
      avisar('Listo: vas a recibir las notificaciones aunque no tengas ATuPuerta abierto.')
      estado.recargar()
    } catch (errorPush) {
      avisar(errorPush.message, 'error')
    } finally {
      setActivando(false)
    }
  }

  if (!estado.datos) {
    return null
  }

  const { soportado, habilitado, activo } = estado.datos

  return (
    <section className="tarjeta panel-push">
      <h2>Notificaciones en el navegador</h2>

      {!soportado ? (
        <p className="texto-apagado">Este navegador no permite recibir notificaciones.</p>
      ) : !habilitado ? (
        <p className="texto-apagado">
          Por ahora no están disponibles: te avisamos por esta página.
          {import.meta.env.DEV && ' (El backend no tiene VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en su .env.)'}
        </p>
      ) : activo ? (
        <p className="aviso-form aviso-form-ok">Activadas en este navegador.</p>
      ) : (
        <>
          <p className="texto-apagado">Recibí los avisos de tus pedidos aunque no tengas ATuPuerta abierto.</p>
          <div className="acciones">
            <button type="button" className="boton boton-primario" disabled={activando} onClick={activar}>
              {activando ? 'Activando…' : '🔔 Activar en este navegador'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
