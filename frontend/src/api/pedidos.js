import { pedir } from './cliente'

// Lado cliente de los pedidos: historial (CU09), detalle, pago (CU07), cancelación,
// repetición (CU10) y seguimiento (CU08)

// { estado, desde, hasta, pagina, limite } -> { pedidos, paginacion }
export const listarMisPedidos = (filtros = {}) => pedir('/pedidos', { query: filtros })

// -> { pedido: { ..., items, pago, codigo_entrega (solo en_camino), repartidor, ... } }
export const obtenerMiPedido = (id) => pedir(`/pedidos/${id}`)

// Solo en pago_espera: después de pagar la vía es un reclamo
export const cancelarMiPedido = (id) => pedir(`/pedidos/${id}/cancelar`, { metodo: 'PATCH' })

// Vuelve a cargar sus productos en el carrito -> { agregados, omitidos, mensaje }
export const repetirPedido = (id) => pedir(`/pedidos/${id}/repetir`, { metodo: 'POST' })

// -> { pago, url_pago, modo: 'mock' | 'sandbox' }
export const iniciarPago = (id) => pedir(`/pedidos/${id}/pagar`, { metodo: 'POST' })

export const consultarPago = (id) => pedir(`/pedidos/${id}/pago`)

// Solo con MP_MODO=mock en el backend. resultado: 'approved' | 'rejected'
export const simularPago = (id, resultado) =>
  pedir('/pagos/simular', { metodo: 'POST', body: { pedido_id: Number(id), resultado } })

// -> { pedido, repartidor, seguimiento_activo, ubicacion, destino, eta, ruta, mensaje }
export const obtenerSeguimiento = (id) => pedir(`/pedidos/${id}/seguimiento`)
