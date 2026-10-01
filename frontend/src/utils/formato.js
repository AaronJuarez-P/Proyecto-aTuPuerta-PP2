// mysql2 devuelve los DECIMAL como string ("4500.00"), así que todo pasa por Number
const formatoPrecio = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export const formatearPrecio = (valor) => formatoPrecio.format(Number(valor) || 0)

// Las fechas llegan en ISO (UTC) y se muestran en la hora local del navegador
export function formatearFecha(valor, { conHora = true } = {}) {
  if (!valor) {
    return '—'
  }

  const fecha = new Date(valor)

  if (Number.isNaN(fecha.getTime())) {
    return String(valor)
  }

  return fecha.toLocaleString('es-AR', conHora
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'short' })
}

// La auditoría guarda la fecha y la hora por separado (CURDATE y CURTIME del servidor), y
// el panel de administración recibe la fecha como texto AAAA-MM-DD. new Date('2026-09-30')
// la tomaría como medianoche UTC, que en Argentina es el día anterior: con la hora pegada
// y sin zona se lee como hora local.
export function formatearFechaYHora(fecha, hora) {
  if (!fecha) {
    return '—'
  }

  return formatearFecha(`${fecha}T${hora ?? '00:00:00'}`, { conHora: Boolean(hora) })
}

export const formatearHora = (valor) =>
  valor ? new Date(valor).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'

export const formatearDistancia = (km) =>
  `${Number(km || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`

export function formatearMinutos(minutos) {
  const total = Math.round(Number(minutos) || 0)

  if (total < 60) {
    return `${total} min`
  }

  const horas = Math.floor(total / 60)
  const resto = total % 60
  return resto ? `${horas} h ${resto} min` : `${horas} h`
}

// "2 productos", "1 producto"
export const plural = (cantidad, singular, pluralTexto = `${singular}s`) =>
  `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`
