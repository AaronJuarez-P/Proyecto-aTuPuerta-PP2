// Operaciones de dominio sobre el pedido (semana 6 CU07, semana 8 CU20).
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

// ---------------------------------------------------------------------------
// Asignacion y entrega (semana 8, CU20)
//
// No pasan por cambiarEstadoPedido a proposito: ese UPDATE es incondicional
// (WHERE id = ?), y aca lo que importa es justamente la condicion. Con el WHERE
// extendido, "verificar que el pedido sigue disponible" y "tomarlo" son una sola
// operacion atomica en la base.
// ---------------------------------------------------------------------------

// Asigna el pedido al repartidor y lo pasa a en_camino con su codigo de entrega.
//
// Devuelve false si el pedido ya no estaba disponible. Es la defensa contra la doble
// asignacion: si dos repartidores aceptan el mismo pedido a la vez, InnoDB hace esperar
// al segundo UPDATE hasta que termine el primero, y cuando le toca evalua el WHERE
// contra la fila ya asignada. Afecta 0 filas y no pisa al primero. Por eso no hace
// falta un SELECT ... FOR UPDATE previo.
const asignarPedidoARepartidor = async (conexion, { pedidoId, repartidorId, codigo, usuarioId }) => {
    const [resultado] = await conexion.query(
        `UPDATE pedidos
         SET repartidor_id = ?, estado = 'en_camino', codigo = ?
         WHERE id = ?
           AND repartidor_id IS NULL
           AND estado = 'en_preparacion'`,
        [repartidorId, codigo, pedidoId]
    );

    if (resultado.affectedRows === 0) {
        return false;
    }

    await registrarAuditoriaPedido(conexion, { pedidoId, usuarioId, accion: 'UPDATE' });
    return true;
};

// Marca el pedido como entregado y borra el codigo, que ya no sirve para nada.
//
// Devuelve false si el pedido no es de ese repartidor, no esta en camino o el codigo
// no coincide. El por que lo averigua quien llama, solo cuando hace falta.
const confirmarEntregaPedido = async (conexion, { pedidoId, repartidorId, codigo, usuarioId }) => {
    const [resultado] = await conexion.query(
        `UPDATE pedidos
         SET estado = 'entregado', codigo = NULL
         WHERE id = ?
           AND repartidor_id = ?
           AND estado = 'en_camino'
           AND codigo = ?`,
        [pedidoId, repartidorId, codigo]
    );

    if (resultado.affectedRows === 0) {
        return false;
    }

    await registrarAuditoriaPedido(conexion, { pedidoId, usuarioId, accion: 'UPDATE' });
    return true;
};

// ---------------------------------------------------------------------------
// Tarifa (semana 9)
// ---------------------------------------------------------------------------

// Lo que cobra el repartidor por el viaje: una base fija mas un adicional por km.
//
// Vive aca y no en maps.service.js porque es una regla de negocio del pedido, no algo
// que sepa el proveedor de mapas. Y es una funcion pura: no recibe conexion porque no
// toca la base.
const calcularComision = (distanciaKm) => {
    const base = Number(process.env.COMISION_BASE);
    const porKm = Number(process.env.COMISION_POR_KM);

    const comision = (Number.isFinite(base) ? base : 500) +
                     (Number.isFinite(porKm) ? porKm : 80) * distanciaKm;

    return Math.round(comision * 100) / 100;
};

module.exports = {
    ESTADOS_PEDIDO,
    cambiarEstadoPedido,
    restaurarStockPedido,
    asignarPedidoARepartidor,
    confirmarEntregaPedido,
    calcularComision
};
