import { useState } from 'react'
import { crearReclamo, LARGO_MINIMO_RECLAMO } from '../../api/reclamos'
import { useAvisos } from '../../context/avisos'

// Reclamo (CU25), sobre un pedido o general. Lo usan el cliente, el comercio y el
// repartidor: cualquiera que haya participado del pedido puede reclamar.
export default function FormularioReclamo({ pedidoId, alTerminar }) {
  const avisar = useAvisos()
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    evento.preventDefault()
    setError('')

    if (descripcion.trim().length < LARGO_MINIMO_RECLAMO) {
      setError(`Contanos un poco más: al menos ${LARGO_MINIMO_RECLAMO} caracteres.`)
      return
    }

    setEnviando(true)

    try {
      const { reclamo } = await crearReclamo({ pedidoId, descripcion: descripcion.trim() })
      avisar(`Registramos tu reclamo #${reclamo.id}. Te avisamos cuando lo revisen.`)
      alTerminar?.(reclamo)
    } catch (errorReclamo) {
      setError(errorReclamo.message)
      setEnviando(false)
    }
  }

  return (
    <form className="formulario" onSubmit={enviar}>
      <div className="campo-form">
        <label htmlFor="descripcion-reclamo">¿Qué pasó?</label>
        <textarea
          id="descripcion-reclamo"
          value={descripcion}
          onChange={(evento) => setDescripcion(evento.target.value)}
          placeholder="Por ejemplo: llegó un producto dañado, faltó algo, me cobraron dos veces…"
          maxLength={2000}
        />
        <small>Lo revisa el equipo de ATuPuerta y te responde por notificación.</small>
      </div>

      {error && <p className="aviso-form aviso-form-error">{error}</p>}

      <div className="acciones">
        <button type="submit" className="boton boton-primario" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar reclamo'}
        </button>
      </div>
    </form>
  )
}
