// Disponibilidad del repartidor (semana 8, CU19-CU20).
//
// disponible significa "puede tomar un pedido nuevo": pasa a FALSE al aceptar un
// pedido, vuelve a TRUE al entregarlo, y ademas el repartidor lo prende y apaga a mano.
//
// Igual que el resto de los servicios, las funciones reciben la CONEXION del
// controlador como primer parametro para participar de su transaccion.

// Lockea la fila del repartidor y devuelve { disponible }, o null si no existe.
//
// Tiene que ser lo PRIMERO que hace toda transaccion que toque al repartidor (aceptar,
// entregar, cambiar la disponibilidad a mano), por dos motivos:
// - Serializa las operaciones del mismo repartidor. Sin el lock, dos aceptaciones
//   simultaneas leerian las dos disponible = TRUE y se quedaria con dos pedidos.
// - Fija el orden de locks repartidores -> pagos -> pedidos -> productos. Si entregar
//   lockeara el pedido antes que el repartidor, seria el orden inverso al de aceptar y
//   las dos operaciones podrian deadlockearse.
const bloquearRepartidor = async (conexion, repartidorId) => {
    const [repartidores] = await conexion.query(
        `SELECT disponible FROM repartidores WHERE id = ? FOR UPDATE`,
        [repartidorId]
    );

    if (repartidores.length === 0) {
        return null;
    }

    return { disponible: Boolean(repartidores[0].disponible) };
};

const actualizarDisponibilidad = async (conexion, { repartidorId, disponible }) => {
    await conexion.query(
        `UPDATE repartidores SET disponible = ? WHERE id = ?`,
        [disponible, repartidorId]
    );
};

// Id del pedido que el repartidor tiene en camino, o null si no tiene ninguno.
//
// Sirve tanto con el pool como con una conexion de transaccion. Vivia como helper
// local en repartidor.controller.js hasta la semana 9, cuando registrar una ubicacion
// tambien necesito saber a que pedido asociarla.
const buscarPedidoEnCurso = async (conexion, repartidorId) => {
    const [pedidos] = await conexion.query(
        `SELECT id FROM pedidos
         WHERE repartidor_id = ? AND estado = 'en_camino'
         ORDER BY id ASC
         LIMIT 1`,
        [repartidorId]
    );

    return pedidos.length > 0 ? pedidos[0].id : null;
};

module.exports = { bloquearRepartidor, actualizarDisponibilidad, buscarPedidoEnCurso };
