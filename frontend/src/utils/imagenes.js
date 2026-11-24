import { SERVIDOR_URL } from '../api/cliente'

// Logo de los comercios y fotos de los productos (ver "Imágenes" en backend/readme.md).

// Los tipos que acepta el backend, que igual los revisa por los primeros bytes del
// archivo: este control es para avisar antes de subir, no reemplaza al del backend.
export const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']

const PESO_MAXIMO_MB = 15
const LADO_MAXIMO = 800
const CALIDAD = 0.85

// El backend devuelve solo el nombre del archivo (logo, imagen) y lo sirve fuera de /api,
// en el mismo servidor que el socket. null si no hay imagen.
export const urlImagen = (nombre) => (nombre ? `${SERVIDOR_URL}/imagenes/${encodeURIComponent(nombre)}` : null)

// Achica la imagen antes de subirla: el lado mayor queda en LADO_MAXIMO px, sin agrandar
// nunca una más chica, y se vuelve a codificar como WebP. Una foto del celular de varios MB
// viaja en una fracción de eso, la grilla carga rápido y no se pasa el tope del backend.
// Volver a codificarla además borra el EXIF, donde puede estar la ubicación GPS de la foto.
//
// Safari no sabe generar WebP y devuelve PNG: el backend lo acepta igual.
//
// Devuelve { blob, previa }: blob es lo que se sube y previa, una data URL para mostrarla
// antes de guardar. Con una data URL no quedan object URLs que liberar.
export async function prepararImagen(archivo) {
  if (!TIPOS_IMAGEN.includes(archivo?.type)) {
    throw new Error('Elegí una imagen JPG, PNG o WebP.')
  }

  if (archivo.size > PESO_MAXIMO_MB * 1024 * 1024) {
    throw new Error(`La imagen pesa demasiado: elegí una de menos de ${PESO_MAXIMO_MB} MB.`)
  }

  let mapa

  try {
    // from-image respeta la orientación que trae la foto: sin esto, una foto vertical del
    // celular puede quedar acostada
    mapa = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo leer la imagen: probá con otra.')
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(mapa.width, mapa.height))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.max(1, Math.round(mapa.width * escala))
  lienzo.height = Math.max(1, Math.round(mapa.height * escala))

  const contexto = lienzo.getContext('2d')
  contexto.imageSmoothingQuality = 'high'
  contexto.drawImage(mapa, 0, 0, lienzo.width, lienzo.height)
  mapa.close()

  const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/webp', CALIDAD))

  if (!blob) {
    throw new Error('No se pudo leer la imagen: probá con otra.')
  }

  return { blob, previa: await leerComoDataUrl(blob) }
}

function leerComoDataUrl(blob) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader()
    lector.onload = () => resolver(lector.result)
    lector.onerror = () => rechazar(new Error('No se pudo leer la imagen: probá con otra.'))
    lector.readAsDataURL(blob)
  })
}

// El multipart/form-data que esperan los endpoints con imagen: los campos como texto y la
// imagen en el campo "imagen". Los campos sin valor (undefined, null) no viajan.
export function aFormulario(datos, imagen) {
  const formulario = new FormData()

  for (const [clave, valor] of Object.entries(datos ?? {})) {
    if (valor !== undefined && valor !== null) {
      formulario.append(clave, String(valor))
    }
  }

  if (imagen) {
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg' }[imagen.type] ?? 'webp'
    formulario.append('imagen', imagen, `imagen.${extension}`)
  }

  return formulario
}
