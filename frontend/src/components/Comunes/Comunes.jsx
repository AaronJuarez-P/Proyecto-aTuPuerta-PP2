import { useEffect } from 'react'
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

export function EstadoVacio({ icono = '📦', titulo, children, accion }) {
  return (
    <div className="estado-vacio">
      <span className="estado-vacio-icono" aria-hidden="true">{icono}</span>
      <h2>{titulo}</h2>
      {children && <p>{children}</p>}
      {accion}
    </div>
  )
}

// tipo: 'pedido' | 'pago' | 'reclamo'
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
        ← Anterior
      </button>

      <span>Página {pagina} de {paginas}</span>

      <button
        type="button"
        className="boton boton-secundario"
        disabled={pagina >= paginas}
        onClick={() => alCambiar(pagina + 1)}
      >
        Siguiente →
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
            ×
          </button>
        </header>

        {children}
      </section>
    </div>
  )
}
