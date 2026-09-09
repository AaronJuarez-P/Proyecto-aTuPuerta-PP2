// Operaciones de dominio sobre el pedido (semana 6, CU07).
//
// El modulo de pagos necesita mover el estado del pedido y devolver stock, pero eso
// es logica de PEDIDOS, no de pagos. Vive aca y no suelto en pago.controller.js para
// que la semana 7 (maquina de estados + auditoria) lo reemplace en un solo lugar en
// vez de tener que ir a buscar UPDATEs desparramados por los controladores.
//
// Igual que auditoria.service.js, todas las funciones reciben la CONEXION del
// controlador como primer parametro para participar de su transaccion.

const { registrarAuditoriaPedido } = require('./auditoria.service');

// El ENUM de la columna pedidos.estado
const ESTADOS_PEDIDO = ['pendiente_pago', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'];

// Mueve el pedido a nuevoEstado y lo deja registrado en auditoria_pedidos.
//
// No valida todavia que la transicion sea legal (que de pendiente_pago solo se pueda
// ir a en_preparacion o cancelado): eso es el entregable de la semana 7. Por ahora
// solo verifica que el estado exista en el ENUM, para que un typo falle aca y no con
// un error de MySQL a mitad de una transaccion.
const cambiarEstadoPedido = async (conexion, { pedidoId, nuevoEstado, administradorId = null }) => {
    if (!ESTADOS_PEDIDO.includes(nuevoEstado)) {
        throw new Error(`Estado de pedido invalido: ${nuevoEstado}`);
    }

    await conexion.query(
        `UPDATE pedidos SET estado = ? WHERE id = ?`,
        [nuevoEstado, pedidoId]
    );

    await registrarAuditoriaPedido(conexion, { pedidoId, administradorId, accion: 'UPDATE' });
};

// Devuelve al catalogo el stock que el pedido tenia reservado.
//
// El stock se descuenta al confirmar el carrito (confirmarCarrito, semana 5), no al
// pagar. Entonces si el pago se rechaza y el pedido se cancela, ese stock quedaria
// descontado para siempre si nadie lo devuelve. Esta funcion es ese "nadie".
//
// Los UPDATE van ordenados por producto_id para que dos transacciones que tocan los
// mismos productos tomen los locks en el mismo orden y no se deadlockeen entre si
// (ni contra el SELECT ... FOR UPDATE del carrito).
const restaurarStockPedido = async (conexion, pedidoId) => {
    const [items] = await conexion.query(
        `SELECT producto_id, cantidad
         FROM items_pedido
         WHERE pedido_id = ?
         ORDER BY producto_id ASC`,
        [pedidoId]
    );

    for (const item of items) {
        await conexion.query(
            `UPDATE productos SET stock = stock + ? WHERE id = ?`,
            [item.cantidad, item.producto_id]
        );
    }

    return items.length;
};

module.exports = { ESTADOS_PEDIDO, cambiarEstadoPedido, restaurarStockPedido };
