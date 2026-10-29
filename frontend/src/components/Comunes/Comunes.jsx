import { createElement, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Package, X } from 'lucide-react'
import { iconoDeCategoria, tonoDeCategoria } from '../../utils/categorias'
import { infoEstado } from '../../utils/estados'
import './Comunes.css'

export function Cargando({ texto = 'Cargando…' }) {
  return (
    <div className="cargando" role="status">
      <span className="cargando-rueda" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  )
}

export function MensajeError({ error, alReintentar }) {
  if (!error) {
    return null
  }

  return (
    <div className="mensaje-error" role="alert">
      <p>{error.message ?? String(error)}</p>

      {alReintentar && (
        <button type="button" className="boton boton-secundario" onClick={alReintentar}>
          Reintentar
        </button>
      )}
    </div>
  )
}

// icono: un componente de lucide-react (Package, Store...), no el ícono armado.
// ilustracion: una imagen propia en lugar del pin con el ícono (la usa la página 404).
export function EstadoVacio({ icono = Package, ilustracion, titulo, children, accion }) {
  return (
    <div className="estado-vacio">
      {ilustracion ? (
        <img className="estado-vacio-ilustracion" src={ilustracion} alt="" width="220" height="150" />
      ) : (
        <IlustracionVacia icono={icono} />
      )}
      <h2>{titulo}</h2>
      {children && <p>{children}</p>}
      {accion}
    </div>
  )
}

// Ilustración de los estados vacíos, con el estilo del logo: el pin menta con el ícono
// en la cabeza y las líneas de velocidad (las dibuja Comunes.css)
export function IlustracionVacia({ icono: Icono = Package }) {
  return (
    <span className="ilustracion-vacia">
      <Icono size={34} />
    </span>
  )
}

// El ícono del rubro de una categoría (ver utils/categorias.js). El resto de las props
// (size, className...) van al ícono. Con createElement porque el componente sale de una
// lista fija: no se crea uno nuevo en cada render.
export function IconoRubro({ categoria, porDefecto, ...props }) {
  return createElement(iconoDeCategoria(categoria, porDefecto), props)
}

// Miniatura de un comercio o de un producto. El backend no guarda fotos: es un recuadro
// con el tono y el ícono del rubro. El tamaño lo pone el CSS de cada página (className);
// miniatura-chica saca el adorno en las que van en un renglón.
export function MiniaturaRubro({ categoria, porDefecto, className = '' }) {
  return (
    <div className={`miniatura-rubro rubro-${tonoDeCategoria(categoria)} ${className}`.trim()}>
      <IconoRubro categoria={categoria} porDefecto={porDefecto} />
    </div>
  )
}

// tipo: 'pedido' | 'pago' | 'reclamo' | 'auditoria'
export function EstadoBadge({ tipo = 'pedido', estado }) {
  const { etiqueta, tono } = infoEstado(tipo, estado)
  return <span className={`estado-badge tono-${tono}`}>{etiqueta}</span>
}

// paginacion: { pagina, limite, total }, tal cual la devuelve el backend
export function Paginacion({ paginacion, alCambiar }) {
  if (!paginacion) {
    return null
  }

  const { pagina, limite, total } = paginacion
  const paginas = Math.max(1, Math.ceil(total / limite))

  if (paginas <= 1) {
    return null
  }

  return (
    <nav className="paginacion" aria-label="Paginación">
      <button
        type="button"
        className="boton boton-secundario"
        disabled={pagina <= 1}
        onClick={() => alCambiar(pagina - 1)}
      >
        <ArrowLeft size={16} /> Anterior
      </button>

      <span>Página {pagina} de {paginas}</span>

      <button
        type="button"
        className="boton boton-secundario"
        disabled={pagina >= paginas}
        onClick={() => alCambiar(pagina + 1)}
      >
        Siguiente <ArrowRight size={16} />
      </button>
    </nav>
  )
}

// Ventana para formularios y confirmaciones. Se muestra si abierto es true y se cierra
// con Escape, con la cruz o haciendo clic afuera.
export function Modal({ abierto, titulo, children, alCerrar }) {
  useEffect(() => {
    if (!abierto) {
      return
    }

    const alTeclear = (evento) => {
      if (evento.key === 'Escape') {
        alCerrar()
      }
    }

    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, alCerrar])

  if (!abierto) {
    return null
  }

  return (
    <div className="modal-fondo" onClick={alCerrar}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="modal-encabezado">
          <h2>{titulo}</h2>
          <button type="button" className="modal-cerrar" onClick={alCerrar} aria-label="Cerrar">
            <X size={22} />
          </button>
        </header>

        {children}
      </section>
    </div>
  )
}

// Contenido de un Modal que pide confirmar una acción: explica qué va a pasar y muestra
// el error del backend ahí mismo si no se pudo (un 409 tiene que leerse antes de cerrar)
export function Confirmacion({ children, boton, peligro = false, alConfirmar }) {
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function confirmar() {
    setError('')
    setEnviando(true)

    try {
      await alConfirmar()
    } catch (errorAccion) {
      setError(errorAccion.message)
      setEnviando(false)
    }
  }

  return (
    <div className="formulario">
      <div className="texto-apagado">{children}</div>
      {error && <p className="aviso-form aviso-form-error" role="alert">{error}</p>}
      <div className="acciones">
        <button
          type="button"
          className={`boton ${peligro ? 'boton-peligro' : 'boton-primario'}`}
          disabled={enviando}
          onClick={confirmar}
        >
          {enviando ? 'Un momento…' : boton}
        </button>
      </div>
    </div>
  )
}
