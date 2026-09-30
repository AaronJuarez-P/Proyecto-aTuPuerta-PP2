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
