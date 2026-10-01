// Decodifica una polilínea codificada (el formato de geometries=polyline de la
// Directions API de Mapbox, precisión 5) a una lista de [latitud, longitud] para Leaflet.
// Algoritmo: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
export function decodificarPolilinea(codificada, precision = 5) {
  if (typeof codificada !== 'string' || !codificada) {
    return []
  }

  const factor = 10 ** precision
  const puntos = []
  let indice = 0
  let latitud = 0
  let longitud = 0

  const leerValor = () => {
    let resultado = 0
    let desplazamiento = 0
    let byte

    do {
      byte = codificada.charCodeAt(indice++) - 63
      resultado |= (byte & 0x1f) << desplazamiento
      desplazamiento += 5
    } while (byte >= 0x20)

    return resultado & 1 ? ~(resultado >> 1) : resultado >> 1
  }

  while (indice < codificada.length) {
    latitud += leerValor()
    longitud += leerValor()
    puntos.push([latitud / factor, longitud / factor])
  }

  return puntos
}

const KM_POR_GRADO = 111.32

// A menos de esto ya llegó a la parada. Es la misma distancia con la que el panel del
// repartidor avisa "Llegaste al comercio".
const LLEGADA_KM = 0.05

// Para "Simular avance": el punto que queda un tramo más adelante de `desde` siguiendo
// la ruta (la lista de [latitud, longitud] que devuelve decodificarPolilinea), sin
// pasarse de `hasta`, que es la próxima parada. El tramo es `fraccion` de lo que falta,
// con un mínimo de `minimoKm` para que el final no se haga eterno. Devuelve null si no
// hay ruta (modo mock del backend) y `hasta` tal cual al llegar.
export function avanzarSobreRuta(ruta, desde, hasta, { fraccion, minimoKm }) {
  if (ruta.length < 2) {
    return null
  }

  // Plano local en km: a la escala de una ciudad, la curvatura de la Tierra no se nota
  const escalaLongitud = KM_POR_GRADO * Math.cos((desde.latitud * Math.PI) / 180)
  const aPlano = ([latitud, longitud]) => [longitud * escalaLongitud, latitud * KM_POR_GRADO]
  const plano = ruta.map(aPlano)
  const llego = (punto) => {
    const [ax, ay] = aPlano([punto.latitud, punto.longitud])
    const [bx, by] = aPlano([hasta.latitud, hasta.longitud])
    return Math.hypot(bx - ax, by - ay) < LLEGADA_KM
  }

  // Camino recorrido desde el inicio de la ruta hasta cada vértice
  const acumulado = [0]
  for (let i = 1; i < plano.length; i++) {
    acumulado.push(acumulado[i - 1] + Math.hypot(plano[i][0] - plano[i - 1][0], plano[i][1] - plano[i - 1][1]))
  }

  // Cuánto camino hay desde el inicio hasta el punto de la ruta más cercano a `punto`.
  // Proyecta sobre cada tramo y no solo contra los vértices: si la ruta quedó vieja
  // (dos clics seguidos antes de que llegue la nueva), `desde` cae entre vértices.
  const posicionEnRuta = ({ latitud, longitud }) => {
    const [px, py] = aPlano([latitud, longitud])
    let masCerca = { distancia: Infinity, recorrido: 0 }

    for (let i = 0; i < plano.length - 1; i++) {
      const [ax, ay] = plano[i]
      const [bx, by] = plano[i + 1]
      const largo = Math.hypot(bx - ax, by - ay)
      const t = largo === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / largo ** 2))
      const distancia = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)))

      if (distancia < masCerca.distancia) {
        masCerca = { distancia, recorrido: acumulado[i] + t * largo }
      }
    }

    return masCerca.recorrido
  }

  const inicio = posicionEnRuta(desde)
  const falta = posicionEnRuta(hasta) - inicio

  if (falta <= 0 || llego(desde)) {
    return hasta
  }

  const objetivo = inicio + Math.min(falta, Math.max(falta * fraccion, minimoKm))

  let i = 0
  while (i < acumulado.length - 2 && acumulado[i + 1] < objetivo) {
    i++
  }

  const largoTramo = acumulado[i + 1] - acumulado[i]
  const t = largoTramo === 0 ? 0 : Math.min(1, (objetivo - acumulado[i]) / largoTramo)
  const [latitudA, longitudA] = ruta[i]
  const [latitudB, longitudB] = ruta[i + 1]
  const siguiente = {
    latitud: latitudA + t * (latitudB - latitudA),
    longitud: longitudA + t * (longitudB - longitudA),
  }

  // La ruta termina en la calle, a unos metros de la dirección exacta: si quedó ahí,
  // llega de una vez en vez de pedir un clic más para esos metros
  return llego(siguiente) ? hasta : siguiente
}
