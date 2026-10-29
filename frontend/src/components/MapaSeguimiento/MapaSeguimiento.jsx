import { useEffect, useEffectEvent } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { decodificarPolilinea } from '../../utils/polilinea'
import './MapaSeguimiento.css'

// Mapa del seguimiento con OpenStreetMap, que no pide token (Mapbox se usa en el backend
// para calcular rutas, no para dibujar).
//
// Los marcadores son pines SVG en un divIcon: los íconos por defecto de Leaflet son
// imágenes que Vite no resuelve sin configuración extra. El pin tiene la forma del del
// logo y el color sale del CSS (currentColor), con las variables de la marca.
const PIN = 'M1 16A15 15 0 0 1 31 16C31 24.21 22.19 34.56 16.67 39.92Q16 40.56 15.33 39.92C9.81 34.56 1 24.21 1 16Z'

// Dibujos de trazo, centrados en la cabeza del pin (16, 16)
const GLIFOS = {
  // Un local con su toldo
  comercio: 'M9.5 13.5h13M11 13.5l1.5-4h7l1.5 4M11 13.5V21h10v-7.5M14.75 21v-3.5h2.5V21',
  // La casa del logo
  destino: 'M9.5 16.5 16 11l6.5 5.5M11 15.5V21h10v-5.5M14.6 21v-3.4h2.8V21',
  // La caja del logo, con su cinta
  repartidor: 'M16 10.5l5.5 2.5v6l-5.5 2.5-5.5-2.5v-6zM10.5 13l5.5 2.5 5.5-2.5M16 15.5v6M13.25 11.75l5.5 2.5',
}

const icono = (tipo) =>
  L.divIcon({
    html: `<svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true"><path class="marcador-pin" d="${PIN}"/><path class="marcador-glifo" d="${GLIFOS[tipo]}"/></svg>`,
    className: `marcador marcador-${tipo}`,
    iconSize: [32, 42],
    // La punta del pin marca el lugar; el cartel queda arriba de la cabeza
    iconAnchor: [16, 41],
    tooltipAnchor: [0, -26],
  })

const ICONOS = {
  comercio: icono('comercio'),
  destino: icono('destino'),
  repartidor: icono('repartidor'),
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

        {/* El color de las líneas sale del CSS (.mapa-ruta), con las variables de la marca */}
        {ruta.length > 1 && <Polyline positions={ruta} pathOptions={{ className: 'mapa-ruta', weight: 5, opacity: 0.8 }} />}

        {lineaRecta && (
          <Polyline positions={lineaRecta} pathOptions={{ className: 'mapa-ruta', weight: 3, dashArray: '8 8', opacity: 0.7 }} />
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
