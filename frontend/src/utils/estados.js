// Los estados reales del backend (los ENUM de pedidos, pagos y reclamos). El prototipo
// usaba estados inventados (pendiente_pago, confirmado, preparando, listo) que no existen.
//
// tono decide el color del cartelito (ver .estado-badge en Comunes.css)
export const ESTADOS_PEDIDO = {
  pago_espera: { etiqueta: 'Esperando pago', tono: 'espera' },
  en_preparacion: { etiqueta: 'En preparación', tono: 'proceso' },
  preparado: { etiqueta: 'Listo para retirar', tono: 'listo' },
  en_camino: { etiqueta: 'En camino', tono: 'camino' },
  entregado: { etiqueta: 'Entregado', tono: 'ok' },
  cancelado: { etiqueta: 'Cancelado', tono: 'error' },
}

// El recorrido normal de un pedido, para la línea de tiempo del detalle
// (ver "Ciclo de vida del pedido" en backend/readme.md)
export const RECORRIDO_PEDIDO = ['pago_espera', 'en_preparacion', 'preparado', 'en_camino', 'entregado']

export const ESTADOS_TERMINALES = ['entregado', 'cancelado']

export const ESTADOS_PAGO = {
  pendiente: { etiqueta: 'Pendiente', tono: 'espera' },
  aprobado: { etiqueta: 'Aprobado', tono: 'ok' },
  rechazado: { etiqueta: 'Rechazado', tono: 'error' },
  fallido: { etiqueta: 'Fallido', tono: 'error' },
}

export const METODOS_PAGO = {
  mercadopago: 'MercadoPago',
  tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito',
}

export const ESTADOS_RECLAMO = {
  pendiente: { etiqueta: 'Pendiente', tono: 'espera' },
  en_revision: { etiqueta: 'En revisión', tono: 'proceso' },
  resuelto: { etiqueta: 'Resuelto', tono: 'ok' },
  rechazado: { etiqueta: 'Rechazado', tono: 'error' },
}

export const VEHICULOS = {
  moto: 'Moto',
  bicicleta: 'Bicicleta',
  auto: 'Auto',
  otro: 'Otro',
}

// auditoria_productos y auditoria_pedidos guardan la acción con el nombre del SQL
export const ACCIONES_AUDITORIA = {
  INSERT: { etiqueta: 'Alta', tono: 'ok' },
  UPDATE: { etiqueta: 'Cambio', tono: 'proceso' },
  DELETE: { etiqueta: 'Baja', tono: 'error' },
}

const TABLAS = { pedido: ESTADOS_PEDIDO, pago: ESTADOS_PAGO, reclamo: ESTADOS_RECLAMO, auditoria: ACCIONES_AUDITORIA }

export const infoEstado = (tipo, estado) =>
  TABLAS[tipo]?.[estado] ?? { etiqueta: estado ?? '—', tono: 'neutro' }
