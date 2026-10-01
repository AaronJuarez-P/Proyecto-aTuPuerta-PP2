// Operaciones de dominio sobre el pedido (semana 6 CU07, semana 7, semana 8 CU20,
// semana 13 CU24).
//
// El modulo de pagos necesita mover el estado del pedido y devolver stock, pero eso
// es logica de PEDIDOS, no de pagos. Vive aca y no suelto en los controladores para
// que la maquina de estados este en un solo lugar en vez de tener UPDATEs
// desparramados.
//
// Igual que auditoria.service.js, todas las funciones reciben la CONEXION del
// controlador como primer parametro para participar de su transaccion.

const { registrarAuditoriaPedido } = require('./auditoria.service');
const { actualizarDisponibilidad } = require('./repartidor.service');

// El ENUM de la columna pedidos.estado
const ESTADOS_PEDIDO = ['pago_espera', 'en_preparacion', 'preparado', 'en_camino', 'entregado', 'cancelado'];

// ---------------------------------------------------------------------------
// Maquina de estados (semana 7)
//
//   pago_espera -> en_preparacion -> preparado -> en_camino -> entregado
//                       |                            ^
//                       +----------------------------+
//
//   y desde cualquier estado no terminal -> cancelado
//
// - pago_espera -> en_preparacion: se aprobo el pago (pago.controller.js).
// - en_preparacion -> preparado: el comercio avisa que esta listo (subirPedido).
// - en_preparacion | preparado -> en_camino: un repartidor lo toma. Puede tomarlo
//   antes de que el comercio lo marque listo; el listado le dice cual de los dos es.
// - en_camino -> entregado: el repartidor confirma con el codigo del cliente.
// - cualquiera no terminal -> cancelado: pago rechazado, el cliente antes de pagar
//   o un administrador (CU24).
//
// asignarPedidoARepartidor y confirmarEntregaPedido NO pasan por cambiarEstadoPedido
// (ver mas abajo por que), pero sus WHERE tienen que respetar este mapa.
// ---------------------------------------------------------------------------
const TRANSICIONES_PEDIDO = {
    pago_espera:    ['en_preparacion', 'cancelado'],
    en_preparacion: ['preparado', 'en_camino', 'cancelado'],
    preparado:      ['en_camino', 'cancelado'],
    en_camino:      ['entregado', 'cancelado'],
    entregado:      [],
    cancelado:      []
};

// Estados de los que ya no se vuelve
const ESTADOS_TERMINALES = ['entregado', 'cancelado'];

// Desde donde un repartidor puede tomar el pedido (CU19, CU20)
const ESTADOS_PARA_REPARTIR = ['en_preparacion', 'preparado'];

const esTransicionValida = (estadoActual, nuevoEstado) =>
    (TRANSICIONES_PEDIDO[estadoActual] || []).includes(nuevoEstado);

// Error de negocio con el codigo HTTP que le corresponde. El controlador lo traduce
// a la respuesta sin tener que comparar mensajes: si error.codigoHttp existe, es un
// error esperado y no un 500.
const crearErrorPedido = (codigoHttp, mensaje) => {
    const error = new Error(mensaje);
    error.codigoHttp = codigoHttp;
    return error;
};

// Mueve el pedido a nuevoEstado y lo deja registrado en auditoria_pedidos, con la
// transicion en el detalle. Devuelve el estado anterior.
//
// Lee el estado con FOR UPDATE y recien ahi valida la transicion: si dos operaciones
// quieren mover el mismo pedido a la vez, la segunda espera y evalua contra el estado
// que dejo la primera. Tira un error con codigoHttp 409 si la transicion no es legal
// y 404 si el pedido no existe.
const cambiarEstadoPedido = async (conexion, { pedidoId, nuevoEstado, usuarioId = null, administradorId = null, detalle = null }) => {
    if (!ESTADOS_PEDIDO.includes(nuevoEstado)) {
        throw new Error(`Estado de pedido invalido: ${nuevoEstado}`);
    }

    const [pedidos] = await conexion.query(
        `SELECT estado FROM pedidos WHERE id = ? FOR UPDATE`,
        [pedidoId]
    );

    if (pedidos.length === 0) {
        throw crearErrorPedido(404, "Pedido no encontrado");
    }

    const estadoActual = pedidos[0].estado;

    if (!esTransicionValida(estadoActual, nuevoEstado)) {
        throw crearErrorPedido(409, `El pedido está en estado "${estadoActual}" y no puede pasar a "${nuevoEstado}"`);
    }

    await conexion.query(
        `UPDATE pedidos SET estado = ? WHERE id = ? AND estado = ?`,
        [nuevoEstado, pedidoId, estadoActual]
    );

    const transicion = `${estadoActual} -> ${nuevoEstado}`;

    await registrarAuditoriaPedido(conexion, {
        pedidoId,
        usuarioId,
        administradorId,
        accion: 'UPDATE',
        detalle: detalle ? `${transicion}: ${detalle}` : transicion
    });

    return estadoActual;
};

// Devuelve al catalogo el stock que el pedido tenia reservado.
//
// El stock se descuenta al confirmar el carrito (confirmarCarrito, semana 5), no al
// pagar. Entonces si el pedido se cancela, ese stock quedaria descontado para siempre
// si nadie lo devuelve. Esta funcion es ese "nadie".
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

// Cancela un pedido desde cualquier estado no terminal (semanas 7 y 13): lo pasa a
// cancelado, guarda el motivo, borra el codigo de entrega, devuelve el stock y, si
// estaba en camino, deja al repartidor disponible otra vez.
//
// PRECONDICION: si el pedido tiene repartidor, quien llama ya lo bloqueo con
// bloquearRepartidor y pasa su id en repartidorBloqueadoId. Es el orden de locks del
// proyecto (repartidores -> pedidos -> productos): si esta funcion lockeara al
// repartidor despues del pedido, seria el orden inverso al de aceptar y las dos
// operaciones podrian deadlockearse.
//
// Como quien llama leyo repartidor_id SIN lock para saber a quien bloquear, aca se
// relee con lock: si en el medio un repartidor tomo el pedido, se corta con 409 en vez
// de tocar una fila de repartidores que no esta bloqueada.
//
// No toca la tabla pagos: si el pedido ya estaba pagado, la devolucion del dinero es
// manual y el pago sigue diciendo 'aprobado', que es lo que paso.
const cancelarPedido = async (conexion, { pedidoId, usuarioId = null, administradorId = null, motivo, repartidorBloqueadoId = null }) => {
    const [pedidos] = await conexion.query(
        `SELECT estado, repartidor_id FROM pedidos WHERE id = ? FOR UPDATE`,
        [pedidoId]
    );

    if (pedidos.length === 0) {
        throw crearErrorPedido(404, "Pedido no encontrado");
    }

    const repartidorId = pedidos[0].repartidor_id;

    if (repartidorId !== null && repartidorId !== repartidorBloqueadoId) {
        throw crearErrorPedido(409, "El pedido cambió mientras se cancelaba. Volvé a intentarlo");
    }

    const estadoAnterior = await cambiarEstadoPedido(conexion, {
        pedidoId,
        nuevoEstado: 'cancelado',
        usuarioId,
        administradorId,
        detalle: motivo
    });

    await conexion.query(
        `UPDATE pedidos SET motivo_cancelacion = ?, codigo = NULL WHERE id = ?`,
        [String(motivo).slice(0, 255), pedidoId]
    );

    await restaurarStockPedido(conexion, pedidoId);

    // Solo en_camino ocupa al repartidor: al aceptar pasa a no disponible
    const repartidorLiberado = (repartidorId !== null && estadoAnterior === 'en_camino');

    if (repartidorLiberado) {
        await actualizarDisponibilidad(conexion, { repartidorId, disponible: true });
    }

    return { estadoAnterior, repartidorId, repartidorLiberado };
};

// ---------------------------------------------------------------------------
// Asignacion y entrega (semana 8, CU20)
//
// No pasan por cambiarEstadoPedido a proposito: aca lo que importa es justamente la
// condicion. Con el WHERE extendido, "verificar que el pedido sigue disponible" y
// "tomarlo" son una sola operacion atomica en la base.
// ---------------------------------------------------------------------------

// Asigna el pedido al repartidor y lo pasa a en_camino con su codigo de entrega.
//
// Devuelve false si el pedido ya no estaba disponible. Es la defensa contra la doble
// asignacion: si dos repartidores aceptan el mismo pedido a la vez, InnoDB hace esperar
// al segundo UPDATE hasta que termine el primero, y cuando le toca evalua el WHERE
// contra la fila ya asignada. Afecta 0 filas y no pisa al primero. Por eso no hace
// falta un SELECT ... FOR UPDATE previo.
//
// Se puede tomar en en_preparacion o en preparado (ESTADOS_PARA_REPARTIR).
const asignarPedidoARepartidor = async (conexion, { pedidoId, repartidorId, codigo, usuarioId }) => {
    // Solo para el detalle de la auditoria (si venia de en_preparacion o de
    // preparado). No es la defensa contra la doble asignacion: esa es el WHERE del
    // UPDATE de abajo, y por eso esta lectura no lleva lock.
    const [previos] = await conexion.query(
        `SELECT estado FROM pedidos WHERE id = ?`,
        [pedidoId]
    );

    const [resultado] = await conexion.query(
        `UPDATE pedidos
         SET repartidor_id = ?, estado = 'en_camino', codigo = ?
         WHERE id = ?
           AND repartidor_id IS NULL
           AND estado IN (?)`,
        [repartidorId, codigo, pedidoId, ESTADOS_PARA_REPARTIR]
    );

    if (resultado.affectedRows === 0) {
        return false;
    }

    await registrarAuditoriaPedido(conexion, {
        pedidoId,
        usuarioId,
        accion: 'UPDATE',
        detalle: `${previos[0]?.estado ?? '?'} -> en_camino: lo tomó el repartidor #${repartidorId}`
    });
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

    await registrarAuditoriaPedido(conexion, {
        pedidoId,
        usuarioId,
        accion: 'UPDATE',
        detalle: 'en_camino -> entregado'
    });
    return true;
};

// "Ya retire" del repartidor: el pedido salio del comercio. No es un estado nuevo (sigue
// en_camino), pero desde aca la ruta deja de pasar por la tienda, tanto la que ve el
// repartidor (CU21) como la del seguimiento del cliente (CU08). Se puede deshacer con
// retirado false, por si lo marco sin querer. Marcarlo dos veces conserva la hora del
// primero y no se audita de nuevo.
//
// Devuelve { registrado: false } si el pedido no es de ese repartidor o no esta en
// camino (el por que lo averigua quien llama), o { registrado: true, retiradoEn }.
const registrarRetiroPedido = async (conexion, { pedidoId, repartidorId, retirado, usuarioId }) => {
    const [resultado] = await conexion.query(
        `UPDATE pedidos
         SET retirado_en = IF(?, COALESCE(retirado_en, NOW()), NULL)
         WHERE id = ?
           AND repartidor_id = ?
           AND estado = 'en_camino'`,
        [retirado, pedidoId, repartidorId]
    );

    if (resultado.affectedRows === 0) {
        return { registrado: false };
    }

    if (resultado.changedRows > 0) {
        await registrarAuditoriaPedido(conexion, {
            pedidoId,
            usuarioId,
            accion: 'UPDATE',
            detalle: retirado ? 'retirado del comercio' : 'retiro deshecho'
        });
    }

    const [pedidos] = await conexion.query(
        `SELECT retirado_en FROM pedidos WHERE id = ?`,
        [pedidoId]
    );

    return { registrado: true, retiradoEn: pedidos[0].retirado_en };
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
    TRANSICIONES_PEDIDO,
    ESTADOS_TERMINALES,
    ESTADOS_PARA_REPARTIR,
    esTransicionValida,
    crearErrorPedido,
    cambiarEstadoPedido,
    restaurarStockPedido,
    cancelarPedido,
    asignarPedidoARepartidor,
    confirmarEntregaPedido,
    registrarRetiroPedido,
    calcularComision
};
