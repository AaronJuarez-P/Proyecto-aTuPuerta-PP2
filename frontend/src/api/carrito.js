import { pedir } from './cliente'

// El carrito vive en el backend (CU05, CU06), no en el navegador.

// -> { vacio, direccion_entrega_default, comercios: [{ comercio_id, comercio_nombre,
//      items: [{ producto_id, nombre, precio_unitario, cantidad, subtotal,
//      stock_disponible, disponible, ... }], subtotal_comercio }], total_general }
export const obtenerCarrito = () => pedir('/carrito/listar')

// Suma cantidad a lo que ya hubiera de ese producto
export const agregarAlCarrito = (idProducto, cantidad = 1) =>
  pedir('/carrito/agregar', { metodo: 'POST', body: { id_producto: idProducto, cantidad } })

// La cantidad nueva (mayor a 0), no un delta
export const cambiarCantidadEnCarrito = (idProducto, cantidad) =>
  pedir(`/carrito/${idProducto}`, { metodo: 'PATCH', body: { cantidad } })

export const quitarDelCarrito = (idProducto) =>
  pedir(`/carrito/${idProducto}`, { metodo: 'DELETE' })

// Crea un pedido por comercio. Sin dirección usa la del perfil del cliente.
// -> { pedidos: [{ pedidoId, comercioId, comercio, total, distancia_km, tiempo_estimado, ... }] }
export const confirmarCarrito = (direccionEntrega) =>
  pedir('/carrito/confirmar', {
    metodo: 'POST',
    body: direccionEntrega ? { direccion_entrega: direccionEntrega } : {},
  })
