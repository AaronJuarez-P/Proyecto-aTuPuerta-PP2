import { pedir } from './cliente'

// Lo del repartidor autenticado: disponibilidad, pedidos disponibles (CU19), tomar y
// entregar (CU20), ubicación y ruta (CU21, CU22), entregas y perfil (CU18)

// -> { disponible, pedido_en_curso }
export const obtenerDisponibilidad = () => pedir('/repartidor/disponibilidad')

export const cambiarDisponibilidad = (disponible) =>
  pedir('/repartidor/disponibilidad', { metodo: 'PATCH', body: { disponible } })

// Pagados y sin repartidor. Da 403 si no está disponible.
// -> { pedidos: [{ id, estado, comercio, direccion_comercio, distancia_km, tiempo_estimado, comision, cantidad_items }] }
export const listarPedidosDisponibles = (filtros = {}) => pedir('/pedido/listar', { query: filtros })

// -> { pedido: { id, direccion_entrega, comercio, direccion_comercio, ... } }. El código de
// entrega nunca viene acá: lo tiene el cliente.
export const tomarPedido = (id) => pedir(`/pedido/asignar/${id}`, { metodo: 'PATCH' })

// La posición es opcional: si viene, cierra el recorrido del pedido en el punto de entrega
export const confirmarEntrega = (id, { codigo, latitud, longitud }) =>
  pedir(`/pedido/entrega/${id}`, {
    metodo: 'PATCH',
    body: {
      codigoPedido: codigo,
      ...(Number.isFinite(latitud) && Number.isFinite(longitud) ? { latitud, longitud } : {}),
    },
  })

// Solo con un pedido en curso: la posición se asocia a ese pedido
export const enviarUbicacion = ({ latitud, longitud }) =>
  pedir('/repartidor/ubicacion', { metodo: 'POST', body: { latitud, longitud } })

// retirado: false pasa por el comercio; true va derecho al cliente.
// -> { pedido, retirado, ruta: { distancia_km, duracion_minutos, polilinea, tramos, puntos, origen_datos } }
export const obtenerRuta = (id, retirado) => pedir(`/pedido/ruta/${id}`, { query: { retirado } })

// -> { en_curso, entregas, resumen: { entregados, comisiones }, paginacion }
export const listarMisEntregas = (filtros = {}) => pedir('/repartidor/entregas', { query: filtros })

export const obtenerPerfilRepartidor = () => pedir('/repartidor/perfil')

// Cualquier subconjunto de { tipo_vehiculo, patente, numero_licencia }
export const actualizarPerfilRepartidor = (cambios) =>
  pedir('/repartidor/perfil', { metodo: 'PATCH', body: cambios })
