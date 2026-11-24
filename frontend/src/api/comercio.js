import { pedir } from './cliente'
import { aFormulario } from '../utils/imagenes'

// Lo del comercio autenticado (rol comercio): pedidos por preparar, ventas (CU17),
// catálogo (CU13 a CU16), perfil (CU12), logo y fotos de los productos.
//
// Las imágenes que reciben estas funciones son Blob ya achicados por prepararImagen
// (utils/imagenes.js), y viajan como multipart/form-data en el campo imagen.

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

// { nombre, descripcion, categoria, precio, stock }. Con imagen, el producto nace con su
// foto en el mismo pedido (multipart); sin imagen viaja como JSON, igual que siempre.
export const crearProducto = (datos, imagen) =>
  pedir('/productos', { metodo: 'POST', body: imagen ? aFormulario(datos, imagen) : datos })

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

// Foto de un producto propio -> { producto }. Cambiarla o quitarla queda en el historial.
export const subirImagenProducto = (id, imagen) =>
  pedir(`/productos/${id}/imagen`, { metodo: 'PUT', body: aFormulario({}, imagen) })

export const quitarImagenProducto = (id) => pedir(`/productos/${id}/imagen`, { metodo: 'DELETE' })

export const obtenerPerfilComercio = () => pedir('/comercio/perfil')

// Cualquier subconjunto de { nombre, categoria, direccion, horario_atencion }
export const actualizarPerfilComercio = (cambios) =>
  pedir('/comercio/perfil', { metodo: 'PATCH', body: cambios })

// Logo del comercio -> { comercio } (el perfil, con logo)
export const subirLogo = (imagen) => pedir('/comercio/logo', { metodo: 'PUT', body: aFormulario({}, imagen) })

export const quitarLogo = () => pedir('/comercio/logo', { metodo: 'DELETE' })
