import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { BrushCleaning, FileText, X } from 'lucide-react'
import { LARGO_MAXIMO_PREGUNTA, LARGO_MINIMO_PREGUNTA, estadoAyuda, preguntarAlPortero } from '../../api/ayuda'
import { useSesion } from '../../context/sesion'
import { useCarga } from '../../hooks/useCarga'
import { NO_LO_ENCUENTRO, esNoLoEncuentro, etiqueta, fuentesDeLaRespuesta, sinFuente } from '../../utils/portero'
import fotoPortero from './portero.png'
import './Portero.css'

// El Portero, el asistente de ayuda (Desarrollo con IA). Contesta con lo que dice el
// Centro de ayuda (backend/rag/corpus): el backend busca las partes que más se parecen a
// la pregunta y el modelo redacta la respuesta con ellas.
//
// La respuesta se muestra como en un chat, con la fuente al pie (archivo y sección). Los
// fragmentos y su similitud llegan del backend, pero no se muestran (ver DECISIONES.md).
//
// Si el backend lo tiene apagado (AYUDA_MODO=off) o no contesta, no se muestra nada: la
// app queda igual que sin el asistente.

// Según quién pregunta, y siempre al final de la charla. Cada una trae primero su parte
// del Centro de ayuda, con similitud de 0.70 a 0.79 (ver backend/rag/DECISIONES.md).
const SUGERIDAS = {
  anonimo: ['¿Cómo hago un pedido?', '¿Cómo pago mi pedido?', '¿Cómo registro mi comercio?', '¿Cómo me registro como repartidor?'],
  cliente: ['¿Cómo pago mi pedido?', '¿Puedo cancelar un pedido?', '¿Qué es el código de entrega?'],
  comercio: ['¿Cómo cargo un producto nuevo?', '¿Cuándo tengo que preparar un pedido?'],
  repartidor: ['¿Cómo tomo un pedido para repartir?', '¿Cuánto gano por cada entrega?'],
  administrador: ['¿Qué significa cada estado de un pedido?', '¿Cómo se hace un reclamo?', '¿Me devuelven la plata si se cancela un pedido?'],
}

// Los que pueden reclamar: los mismos roles que la ruta /reclamos de App.jsx
const ROLES_CON_RECLAMOS = ['cliente', 'comercio', 'repartidor']

// Las últimas 20 preguntas alcanzan para volver a leer una respuesta sin llenar el
// sessionStorage
const MAXIMO_HISTORIAL = 20

// Una sola charla por pestaña, guardada junto con quién la hizo: una sesión o SIN_SESION
const CLAVE_HISTORIAL = 'atupuerta:portero'
const SIN_SESION = 'anonimo'

// Sin sesión no hay un "cerrar sesión" que la borre: vence a los 30 minutos de la
// última pregunta
const VENCE_SIN_SESION_MS = 30 * 60 * 1000

const faltaParaVencer = (mensajes) => (mensajes.at(-1)?.cuando ?? 0) + VENCE_SIN_SESION_MS - Date.now()

// El historial vive en sessionStorage, que es de la pestaña y se borra al cerrarla.
// Nunca se le manda al backend: cada pregunta viaja sola.
function leerHistorial(quien) {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_HISTORIAL))

    // Es de otra sesión (se cerró, venció o entró otra cuenta) o ya venció: se arranca de
    // cero, y guardarHistorial la borra
    if (guardado?.quien !== quien || (quien === SIN_SESION && faltaParaVencer(guardado.mensajes) <= 0)) {
      return []
    }

    // Una pregunta que esperaba cuando se recargó la página ya no va a tener respuesta
    return guardado.mensajes.filter((mensaje) => mensaje.estado !== 'esperando')
  } catch {
    return []
  }
}

function guardarHistorial(quien, mensajes) {
  try {
    if (mensajes.length === 0) {
      sessionStorage.removeItem(CLAVE_HISTORIAL)
    } else {
      sessionStorage.setItem(CLAVE_HISTORIAL, JSON.stringify({ quien, mensajes }))
    }
  } catch {
    // Sin sessionStorage (navegación privada, cuota llena) el historial queda solo en memoria
  }
}

export default function Portero() {
  const { datos: estado } = useCarga(estadoAyuda)
  const { sesion, usuario } = useSesion()

  if (!estado?.activo) {
    return null
  }

  // La charla es de la sesión que la hizo. El token cambia cada vez que alguien inicia
  // sesión, así que su final alcanza para reconocerla. Si cambia (se cerró la sesión,
  // venció o entró otra cuenta), el panel se vuelve a montar, con las sugeridas del rol
  // nuevo, y la charla de antes se borra: aunque se haya salido desde el login, donde el
  // Portero no está, al volver no la reconoce
  const quien = sesion ? `sesion:${sesion.token.slice(-12)}` : SIN_SESION
  return <Porteria key={quien} quien={quien} rol={usuario?.rol} />
}

// La portería: el botón flotante y el panel de la charla
function Porteria({ quien, rol }) {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState(() => leerHistorial(quien))
  const [texto, setTexto] = useState('')
  const botonRef = useRef(null)
  const campoRef = useRef(null)
  const listaRef = useRef(null)
  const estuvoAbierto = useRef(false)

  const esperando = mensajes.some((mensaje) => mensaje.estado === 'esperando')
  const sugeridas = SUGERIDAS[rol] ?? SUGERIDAS.anonimo
  const puedeReclamar = ROLES_CON_RECLAMOS.includes(rol)

  useEffect(() => {
    guardarHistorial(quien, mensajes)
  }, [quien, mensajes])

  // Sin sesión, la charla también vence si la página queda abierta
  useEffect(() => {
    if (quien !== SIN_SESION || mensajes.length === 0) {
      return
    }

    const temporizador = setTimeout(() => setMensajes([]), faltaParaVencer(mensajes))
    return () => clearTimeout(temporizador)
  }, [quien, mensajes])

  // Al abrir, el foco va al campo de la pregunta; al cerrar, vuelve al botón flotante
  useEffect(() => {
    if (abierto) {
      campoRef.current?.focus()
    } else if (estuvoAbierto.current) {
      botonRef.current?.focus()
    }

    estuvoAbierto.current = abierto
  }, [abierto])

  // Siempre a la vista lo último de la charla
  useEffect(() => {
    if (abierto && listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight
    }
  }, [abierto, mensajes])

  const cerrar = () => setAbierto(false)

  function alTeclear(evento) {
    if (evento.key === 'Escape') {
      cerrar()
    }
  }

  function actualizar(id, cambios) {
    setMensajes((previos) => previos.map((mensaje) => (mensaje.id === id ? { ...mensaje, ...cambios } : mensaje)))
  }

  // cuando: la hora de la pregunta, para saber cuándo vence una charla sin sesión. La
  // toman el clic y el envío del formulario: acá adentro, oxlint avisa react/purity
  // porque no puede asegurar que preguntar() no corra mientras se dibuja
  async function preguntar(textoPregunta, cuando) {
    const pregunta = textoPregunta.trim()

    if (esperando || pregunta.length < LARGO_MINIMO_PREGUNTA) {
      return
    }

    // Cada pregunta nueva va al final, así que la última tiene el número más alto
    const id = (mensajes.at(-1)?.id ?? 0) + 1
    setMensajes((previos) => [...previos, { id, pregunta, estado: 'esperando', cuando }].slice(-MAXIMO_HISTORIAL))
    setTexto('')

    try {
      const datos = await preguntarAlPortero(pregunta)
      actualizar(id, { estado: 'respondida', datos })
    } catch (error) {
      actualizar(id, { estado: 'error', error: error.message })
    }
  }

  function alEnviar(evento) {
    evento.preventDefault()
    preguntar(texto, Date.now())
  }

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        className="portero-lanzador"
        hidden={abierto}
        aria-expanded={abierto}
        aria-controls="portero-panel"
        aria-label="¿Dudas? Preguntale al Portero"
        onClick={() => setAbierto(true)}
      >
        <img className="portero-lanzador-icono" src={fotoPortero} alt="" />
        <span>
          ¿Dudas?<span className="portero-lanzador-resto"> Preguntale al Portero</span>
        </span>
      </button>

      <section
        id="portero-panel"
        className="portero-panel"
        role="dialog"
        aria-labelledby="portero-titulo"
        hidden={!abierto}
        onKeyDown={alTeclear}
      >
        <header className="portero-encabezado">
          <img className="portero-avatar" src={fotoPortero} alt="" />

          <div className="portero-encabezado-textos">
            <h2 id="portero-titulo">El Portero de ATuPuerta</h2>
            <p>Responde con el Centro de ayuda</p>
          </div>

          {mensajes.length > 0 && (
            <button
              type="button"
              disabled={esperando}
              onClick={() => setMensajes([])}
              aria-label="Borrar la charla"
              title="Borrar la charla"
            >
              <BrushCleaning size={18} />
            </button>
          )}

          <button type="button" onClick={cerrar} aria-label="Cerrar el Portero" title="Cerrar">
            <X size={20} />
          </button>
        </header>

        <div ref={listaRef} className="portero-mensajes" role="log" aria-live="polite">
          <p className="portero-burbuja portero-burbuja-portero">¡Buenas! Soy el Portero. ¿En qué te doy una mano?</p>

          {mensajes.map((mensaje) => (
            <Intercambio key={mensaje.id} mensaje={mensaje} puedeReclamar={puedeReclamar} alIrAReclamos={cerrar} />
          ))}

          {/* Siempre debajo de lo último, y siempre montadas: si se sacaran y volvieran con
              cada pregunta, el lector de pantalla las leería otra vez después de cada respuesta */}
          <div className="portero-sugeridas">
            {sugeridas.map((sugerida) => (
              <button
                key={sugerida}
                type="button"
                className="chip"
                disabled={esperando}
                onClick={() => preguntar(sugerida, Date.now())}
              >
                {sugerida}
              </button>
            ))}
          </div>
        </div>

        <form className="portero-formulario" onSubmit={alEnviar}>
          <label htmlFor="portero-pregunta" className="portero-oculto">
            Tu pregunta para el Portero
          </label>
          <input
            ref={campoRef}
            id="portero-pregunta"
            type="text"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            maxLength={LARGO_MAXIMO_PREGUNTA}
            placeholder="Escribí tu duda…"
            autoComplete="off"
          />
          <button
            type="submit"
            className="boton boton-primario"
            disabled={esperando || texto.trim().length < LARGO_MINIMO_PREGUNTA}
          >
            Preguntar
          </button>
        </form>
      </section>
    </>
  )
}

// Una pregunta y lo que contestó el Portero
function Intercambio({ mensaje, puedeReclamar, alIrAReclamos }) {
  return (
    <>
      <p className="portero-burbuja portero-burbuja-persona">{mensaje.pregunta}</p>

      {mensaje.estado === 'esperando' && (
        <p className="portero-burbuja portero-burbuja-portero portero-buscando">
          <span className="cargando-rueda" aria-hidden="true" />
          El Portero está buscando en sus papeles…
        </p>
      )}

      {mensaje.estado === 'error' && <p className="portero-burbuja portero-burbuja-error">{mensaje.error}</p>}

      {mensaje.estado === 'respondida' && (
        <Respuesta datos={mensaje.datos} puedeReclamar={puedeReclamar} alIrAReclamos={alIrAReclamos} />
      )}
    </>
  )
}

function Respuesta({ datos, puedeReclamar, alIrAReclamos }) {
  const { respuesta, fuentes = [] } = datos

  // Distinta a una respuesta, para que no se lea como una
  if (esNoLoEncuentro(respuesta)) {
    return (
      <div className="portero-burbuja portero-burbuja-no-esta">
        <p className="portero-no-esta-titulo">{NO_LO_ENCUENTRO}</p>
        <p>Probá preguntarlo con otras palabras, por ejemplo con el nombre de la pantalla o del botón.</p>

        {puedeReclamar && (
          <p>
            ¿Seguís con la duda?{' '}
            <Link to="/reclamos" onClick={alIrAReclamos}>
              Hacé un reclamo
            </Link>{' '}
            y lo revisa un administrador.
          </p>
        )}
      </div>
    )
  }

  // Como en un chat: el texto, sin el renglón "Fuente:" que agrega el modelo. La fuente va
  // al pie, con archivo y sección, como pide la consigna de la expo
  const deDonde = fuentesDeLaRespuesta(respuesta, fuentes)

  return (
    <div className="portero-burbuja portero-burbuja-portero">
      <p className="portero-texto">{sinFuente(respuesta)}</p>

      {deDonde.length > 0 && (
        <p className="portero-fuente">
          <FileText size={14} aria-hidden="true" />
          <span>
            {deDonde.length > 1 ? 'Fuentes' : 'Fuente'}: {deDonde.map(etiqueta).join('; ')}
          </span>
        </p>
      )}
    </div>
  )
}
