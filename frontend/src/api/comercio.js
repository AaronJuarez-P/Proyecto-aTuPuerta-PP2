import { pedir } from './cliente'

// Lo del comercio autenticado (rol comercio): pedidos por preparar, ventas (CU17),
// catálogo (CU13 a CU16) y perfil (CU12)

// { estado, desde, hasta, pagina, limite } -> { ventas, resumen, paginacion }
// Con estado=en_preparacion es la bandeja de pedidos por preparar.
export const listarVentas = (filtros = {}) => pedir('/comercio/ventas', { query: filtros })

// -> { venta: { id, estado, total, cliente, repartidor, items, ... } }
export const obtenerVenta = (id) => pedir(`/comercio/ventas/${id}`)

// en_preparacion -> preparado: lo único del ciclo del pedido que le toca al comercio
export const marcarPreparado = (id) => pedir(`/comercios/pedidos/${id}/subir`, { metodo: 'PATCH' })

// Catálogo propio, incluidos los dados de baja
// { buscar, categoria, activo, pagina, limite } -> { productos, categorias, paginacion }
export const listarMisProductos = (filtros = {}) => pedir('/comercio/productos', { query: filtros })

// { nombre, descripcion, categoria, precio, stock }
export const crearProducto = (datos) => pedir('/productos', { metodo: 'POST', body: datos })

// Edición completa: hay que mandar todos los campos, y activo para dar de alta de nuevo
export const editarProducto = (id, datos) => pedir(`/productos/${id}`, { metodo: 'PUT', body: datos })

// { stock } fija el valor; { ajuste } suma o resta
export const actualizarStock = (id, cambio) => pedir(`/productos/${id}/stock`, { metodo: 'PATCH', body: cambio })

export const actualizarPrecio = (id, precio) =>
  pedir(`/productos/${id}/precio`, { metodo: 'PATCH', body: { precio } })

// Baja lógica: el producto deja de estar a la venta pero conserva su historia
export const darDeBajaProducto = (id) => pedir(`/productos/${id}`, { metodo: 'DELETE' })

// -> { auditoria: [{ accion, fecha, hora, usuario_nombre, ... }] }
export const obtenerAuditoriaProducto = (id) => pedir(`/productos/${id}/auditoria`)

export const obtenerPerfilComercio = () => pedir('/comercio/perfil')

// Cualquier subconjunto de { nombre, categoria, direccion, horario_atencion }
export const actualizarPerfilComercio = (cambios) =>
  pedir('/comercio/perfil', { metodo: 'PATCH', body: cambios })
