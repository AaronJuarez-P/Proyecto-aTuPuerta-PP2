import { pedir } from './cliente'

// Administración (rol administrador): usuarios (CU23), supervisión de pedidos (CU24),
// reclamos (CU25) y auditoría

// ---- Usuarios ----

// { rol, activo, buscar, pagina, limite } -> { usuarios, paginacion }
export const listarUsuarios = (filtros = {}) => pedir('/admin/usuarios', { query: filtros })

// -> { usuario, pedidos: { como_cliente, como_comercio, como_repartidor, en_curso }, reclamos }
export const obtenerUsuario = (id) => pedir(`/admin/usuarios/${id}`)

// Alta de un cliente o de un administrador.
// { nombre, email, contrasena, telefono, rol: 'cliente' | 'administrador', direccion_entrega? }
export const crearUsuario = (datos) => pedir('/admin/usuarios', { metodo: 'POST', body: datos })

// Cualquier subconjunto de { nombre, telefono, email }
export const editarUsuario = (id, cambios) => pedir(`/admin/usuarios/${id}`, { metodo: 'PATCH', body: cambios })

// Suspender (false) o reactivar (true) la cuenta entera
export const cambiarEstadoUsuario = (id, activo) =>
  pedir(`/admin/usuarios/${id}/estado`, { metodo: 'PATCH', body: { activo } })

export const darDeBajaUsuario = (id) => pedir(`/admin/usuarios/${id}`, { metodo: 'DELETE' })

// Suspende o reactiva solo el comercio: la persona sigue pudiendo comprar
export const cambiarEstadoComercio = (id, activo) =>
  pedir(`/admin/comercios/${id}/estado`, { metodo: 'PATCH', body: { activo } })

// ---- Pedidos ----

// { estado, activos, comercioId, clienteId, repartidorId, desde, hasta, pagina, limite }
// -> { pedidos, resumen_por_estado, paginacion }
export const listarPedidosAdmin = (filtros = {}) => pedir('/admin/pedidos', { query: filtros })

// -> { pedido: { ..., cliente, comercio, repartidor, items, pago, ultima_ubicacion, auditoria, reclamos } }
export const obtenerPedidoAdmin = (id) => pedir(`/admin/pedidos/${id}`)

// -> { pedido, stock_restaurado, repartidor_liberado, reembolso_manual }
export const cancelarPedidoAdmin = (id, motivo) =>
  pedir(`/admin/pedidos/${id}/cancelar`, { metodo: 'PATCH', body: { motivo } })

// ---- Reclamos ----

// { estado, asignado: 'yo' | 'ninguno', pagina, limite } -> { reclamos, resumen_por_estado, paginacion }
export const listarReclamosAdmin = (filtros = {}) => pedir('/admin/reclamos', { query: filtros })

// -> { reclamo: { ..., usuario, usuario_email, admin_asignado, pedido } }
export const obtenerReclamoAdmin = (id) => pedir(`/admin/reclamos/${id}`)

// Sin administradorId se lo asigna quien lo pide. Pasa a en_revision.
export const asignarReclamo = (id, administradorId) =>
  pedir(`/admin/reclamos/${id}/asignar`, {
    metodo: 'PATCH',
    body: administradorId ? { administrador_id: administradorId } : {},
  })

// estado: 'resuelto' | 'rechazado'. Solo lo puede cerrar el administrador asignado.
export const resolverReclamo = (id, estado, resolucion) =>
  pedir(`/admin/reclamos/${id}/resolver`, { metodo: 'PATCH', body: { estado, resolucion } })

// ---- Auditoría ----

// { productoId, comercioId, usuarioId, accion, desde, hasta, pagina, limite } -> { auditoria, paginacion }
export const listarAuditoriaProductos = (filtros = {}) => pedir('/admin/auditoria/productos', { query: filtros })

// { pedidoId, usuarioId, accion, desde, hasta, pagina, limite } -> { auditoria, paginacion }
export const listarAuditoriaPedidos = (filtros = {}) => pedir('/admin/auditoria/pedidos', { query: filtros })
