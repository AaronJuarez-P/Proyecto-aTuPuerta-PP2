import {
  Ban,
  Bell,
  CircleCheck,
  CircleX,
  CreditCard,
  HandCoins,
  LockOpen,
  Megaphone,
  Motorbike,
  ReceiptText,
  ShoppingBasket,
  Store,
  TriangleAlert,
} from 'lucide-react'

// Ícono y link de cada notificación. El backend no guarda a dónde lleva cada una (eso
// viaja solo en el push), pero todos los mensajes nombran primero a su pedido o reclamo
// ("Tu pago del pedido #5 fue aprobado", "Tu reclamo #3 ya está en revisión").

// El componente de lucide de cada tipo
const ICONOS = {
  pedido_creado: ReceiptText,
  pago_aprobado: CreditCard,
  pago_rechazado: TriangleAlert,
  pago_a_devolver: HandCoins,
  pedido_preparado: ShoppingBasket,
  pedido_disponible: Motorbike,
  pedido_en_camino: Motorbike,
  pedido_entregado: CircleCheck,
  pedido_cancelado: CircleX,
  cuenta_reactivada: LockOpen,
  comercio_suspendido: Ban,
  comercio_reactivado: Store,
}

export const iconoDeNotificacion = (tipo) =>
  ICONOS[tipo] ?? (tipo?.startsWith('reclamo') ? Megaphone : Bell)

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
