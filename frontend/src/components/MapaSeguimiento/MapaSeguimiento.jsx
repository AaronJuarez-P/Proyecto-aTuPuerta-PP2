import { useEffect, useEffectEvent } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { decodificarPolilinea } from '../../utils/polilinea'
import './MapaSeguimiento.css'

// Mapa del seguimiento con OpenStreetMap, que no pide token (Mapbox se usa en el backend
// para calcular rutas, no para dibujar).
//
// Los marcadores son emojis en un divIcon: los íconos por defecto de Leaflet son
// imágenes que Vite no resuelve sin configuración extra.
const icono = (emoji, clase = '') =>
  L.divIcon({
    html: `<span>${emoji}</span>`,
    className: `marcador-emoji ${clase}`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })

const ICONOS = {
  comercio: icono('🏪'),
  destino: icono('🏠'),
  repartidor: icono('🛵', 'marcador-repartidor'),
}

const esPunto = (punto) =>
  punto && Number.isFinite(Number(punto.latitud)) && Number.isFinite(Number(punto.longitud))

const aLatLng = (punto) => [Number(punto.latitud), Number(punto.longitud)]

// Encuadra el mapa cuando aparecen puntos nuevos. No en cada movimiento del repartidor:
// el mapa saltaría con cada ping y no se podría mirar tranquilo.
function Encuadrar({ puntos, clave }) {
  const mapa = useMap()

  const encuadrar = useEffectEvent(() => {
    if (puntos.length === 1) {
      mapa.setView(puntos[0], 15)
    } else if (puntos.length > 1) {
      mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 16 })
    }
  })

  // Solo cuando cambia qué puntos hay (clave), no dónde está cada uno
  useEffect(() => {
    encuadrar()
  }, [mapa, clave])

  return null
}

// puntos: { comercio?, destino?, repartidor? } con { latitud, longitud }
// polilinea: la ruta codificada que manda el backend (null en modo mock)
export default function MapaSeguimiento({ comercio, destino, repartidor, polilinea, etiquetas = {} }) {
  const marcadores = [
    ['comercio', comercio],
    ['destino', destino],
    ['repartidor', repartidor],
  ].filter(([, punto]) => esPunto(punto))

  if (marcadores.length === 0) {
    return (
      <div className="mapa-seguimiento mapa-vacio">
        <p>Todavía no hay ubicaciones para mostrar en el mapa.</p>
      </div>
    )
  }

  const puntos = marcadores.map(([, punto]) => aLatLng(punto))
  const ruta = decodificarPolilinea(polilinea)

  // Sin ruta real (modo mock del backend o Mapbox sin contestar), una línea recta
  // punteada entre el repartidor, o el comercio, y el destino
  const desde = esPunto(repartidor) ? repartidor : comercio
  const lineaRecta = ruta.length === 0 && esPunto(desde) && esPunto(destino) ? [aLatLng(desde), aLatLng(destino)] : null

  return (
    <div className="mapa-seguimiento">
      <MapContainer center={puntos[0]} zoom={14} scrollWheelZoom={false} className="mapa-leaflet">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Encuadrar puntos={puntos} clave={marcadores.map(([tipo]) => tipo).join(',')} />

        {ruta.length > 1 && <Polyline positions={ruta} pathOptions={{ color: '#1d6a3a', weight: 5, opacity: 0.8 }} />}

        {lineaRecta && (
          <Polyline positions={lineaRecta} pathOptions={{ color: '#1d6a3a', weight: 3, dashArray: '8 8', opacity: 0.7 }} />
        )}

        {marcadores.map(([tipo, punto]) => (
          <Marker key={tipo} position={aLatLng(punto)} icon={ICONOS[tipo]}>
            {etiquetas[tipo] && <Tooltip direction="top" offset={[0, -16]}>{etiquetas[tipo]}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
