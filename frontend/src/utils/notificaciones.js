// Ícono y link de cada notificación. El backend no guarda a dónde lleva cada una (eso
// viaja solo en el push), pero todos los mensajes nombran primero a su pedido o reclamo
// ("Tu pago del pedido #5 fue aprobado", "Tu reclamo #3 ya está en revisión").

const ICONOS = {
  pedido_creado: '🧾',
  pago_aprobado: '💳',
  pago_rechazado: '⚠️',
  pago_a_devolver: '💸',
  pedido_preparado: '🧺',
  pedido_disponible: '🛵',
  pedido_en_camino: '🛵',
  pedido_entregado: '✅',
  pedido_cancelado: '✖️',
  cuenta_reactivada: '🔓',
}

export const iconoDeNotificacion = (tipo) =>
  ICONOS[tipo] ?? (tipo?.startsWith('reclamo') ? '📣' : '🔔')

const RUTAS_DE_PEDIDO = {
  cliente: (id) => `/pedidos/${id}`,
  comercio: (id) => `/comercio/ventas/${id}`,
  repartidor: () => '/repartidor',
  administrador: (id) => `/admin/pedidos/${id}`,
}

export function enlaceDeNotificacion({ tipo, mensaje }, rol) {
  const numero = mensaje?.match(/#(\d+)/)?.[1]

  if (!numero || !tipo) {
    return null
  }

  if (tipo.startsWith('reclamo')) {
    return rol === 'administrador' ? `/admin/reclamos/${numero}` : `/reclamos/${numero}`
  }

  if (tipo.startsWith('pedido') || tipo.startsWith('pago')) {
    return RUTAS_DE_PEDIDO[rol]?.(numero) ?? null
  }

  return null
}
