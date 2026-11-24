import { useId, useRef, useState } from 'react'
import { ImagePlus, Trash } from 'lucide-react'
import { MiniaturaRubro } from '../Comunes/Comunes'
import { prepararImagen, TIPOS_IMAGEN } from '../../utils/imagenes'
import './SelectorImagen.css'

// Elegir, cambiar o quitar una imagen: el logo del comercio o la foto de un producto.
//
// src es lo que se muestra: la imagen del servidor (urlImagen), la vista previa de una
// recién elegida, o null para el ícono del rubro. alElegir recibe { blob, previa } con la
// imagen ya achicada (ver prepararImagen) y alQuitar no recibe nada.
//
// No guarda nada por su cuenta: lo decide quien lo usa. El perfil sube el logo apenas se
// elige; los formularios de alta mandan la imagen junto con los demás datos. Por eso
// alElegir y alQuitar pueden ser async: mientras tanto los botones quedan deshabilitados,
// y si tiran un error se muestra acá abajo.
export default function SelectorImagen({ titulo, src, categoria, logo = false, alElegir, alQuitar }) {
  const idTitulo = useId()
  const entrada = useRef(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function ejecutar(accion) {
    setError('')
    setOcupado(true)

    try {
      await accion()
    } catch (errorAccion) {
      setError(errorAccion.message)
    } finally {
      setOcupado(false)
    }
  }

  function manejarArchivo(evento) {
    const archivo = evento.target.files?.[0]
    // Se vacía para que elegir otra vez el mismo archivo también avise el cambio
    evento.target.value = ''

    if (archivo) {
      ejecutar(async () => alElegir(await prepararImagen(archivo)))
    }
  }

  return (
    <div className="selector-imagen" role="group" aria-labelledby={idTitulo}>
      <MiniaturaRubro categoria={categoria} src={src} logo={logo} className="selector-imagen-vista" />

      <div className="selector-imagen-detalle">
        <span className="selector-imagen-titulo" id={idTitulo}>{titulo}</span>
        <small>JPG, PNG o WebP. La achicamos antes de subirla.</small>

        <div className="selector-imagen-botones">
          <button
            type="button"
            className="boton boton-secundario boton-chico"
            disabled={ocupado}
            onClick={() => entrada.current?.click()}
          >
            <ImagePlus size={16} /> {src ? 'Cambiar imagen' : 'Elegir imagen'}
          </button>

          {src && alQuitar && (
            <button
              type="button"
              className="boton boton-peligro boton-chico"
              disabled={ocupado}
              onClick={() => ejecutar(alQuitar)}
            >
              <Trash size={16} /> Quitar imagen
            </button>
          )}

          {ocupado && <span className="selector-imagen-estado" role="status">Guardando…</span>}
        </div>

        {error && <p className="aviso-form aviso-form-error">{error}</p>}
      </div>

      <input ref={entrada} type="file" accept={TIPOS_IMAGEN.join(',')} hidden onChange={manejarArchivo} />
    </div>
  )
}
