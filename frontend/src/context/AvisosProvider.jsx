import { useCallback, useRef, useState } from 'react'
import { AvisosContext } from './avisos'

const DURACION_MS = 4000

export default function AvisosProvider({ children }) {
  const [avisos, setAvisos] = useState([])
  const siguienteId = useRef(0)

  const avisar = useCallback((mensaje, tipo = 'exito') => {
    siguienteId.current += 1
    const id = siguienteId.current

    setAvisos((actuales) => [...actuales, { id, mensaje, tipo }])
    setTimeout(() => {
      setAvisos((actuales) => actuales.filter((aviso) => aviso.id !== id))
    }, DURACION_MS)
  }, [])

  return (
    <AvisosContext.Provider value={avisar}>
      {children}

      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((aviso) => (
          <p className={`aviso aviso-${aviso.tipo}`} key={aviso.id}>
            {aviso.mensaje}
          </p>
        ))}
      </div>
    </AvisosContext.Provider>
  )
}
