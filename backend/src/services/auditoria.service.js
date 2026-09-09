// Registra un cambio de producto en auditoria_productos (semana 4, CU13-CU16).
//
// Recibe la CONEXION del controlador (no el pool) para que el insert participe de
// la misma transaccion que el cambio sobre productos: o se guardan los dos, o ninguno.
//
// accion: 'INSERT' | 'UPDATE' | 'DELETE' (el ENUM de la tabla, en mayusculas)
// usuarioId: quien hizo el cambio, sea comercio o administrador
// administradorId: solo cuando el cambio lo hace un administrador (panel, semana 13)
//
// fecha y hora son dos columnas separadas en el esquema, de ahi CURDATE() y CURTIME()
const registrarAuditoriaProducto = async (conexion, { productoId, usuarioId, administradorId = null, accion }) => {
    await conexion.query(
        `INSERT INTO auditoria_productos (producto_id, usuario_id, administrador_id, accion, fecha, hora)
        VALUES (?, ?, ?, ?, CURDATE(), CURTIME())`,
        [productoId, usuarioId, administradorId, accion]
    );
};

// Registra un cambio de pedido en auditoria_pedidos (semana 6, CU07).
//
// Misma idea que la de productos: recibe la CONEXION para que quede en la misma
// transaccion que el UPDATE sobre pedidos.
//
// OJO: auditoria_pedidos NO tiene columna usuario_id, a diferencia de
// auditoria_productos. Solo guarda administrador_id, que queda en null cuando el
// cambio lo dispara el flujo normal (un pago aprobado, por ejemplo) y no una persona.
const registrarAuditoriaPedido = async (conexion, { pedidoId, administradorId = null, accion }) => {
    await conexion.query(
        `INSERT INTO auditoria_pedidos (pedido_id, administrador_id, accion, fecha, hora)
        VALUES (?, ?, ?, CURDATE(), CURTIME())`,
        [pedidoId, administradorId, accion]
    );
};

module.exports = { registrarAuditoriaProducto, registrarAuditoriaPedido };
