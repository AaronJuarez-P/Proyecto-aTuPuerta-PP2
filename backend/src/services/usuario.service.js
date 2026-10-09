// Operaciones sobre la cuenta de un usuario (semanas 3 y 13).
//
// Las comparten el perfil propio (GET/PATCH/DELETE /api/perfil) y el panel de
// administracion (CU23), que tienen que aplicar exactamente las mismas reglas: una baja
// es una baja la pida el usuario o la haga un administrador.
//
// Igual que el resto de los servicios, las funciones reciben la CONEXION del
// controlador como primer parametro para participar de su transaccion.

const { cancelarPedido } = require('./pedido.service');

// La cuenta con todos sus perfiles, en una sola consulta. Cada perfil es 1 a 1 con el
// usuario (UNIQUE usuario_id en las cuatro tablas), asi que los LEFT JOIN no duplican.
//
// Devuelve null si el usuario no existe. Nunca devuelve la contraseña.
const buscarCuenta = async (conexion, usuarioId) => {
    const [filas] = await conexion.query(
        `SELECT u.id, u.nombre, u.email, u.telefono, u.rol, u.activo, u.created_at,
                cl.id AS cliente_id, cl.direccion_entrega,
                co.id AS comercio_id, co.nombre AS comercio_nombre, co.activo AS comercio_activo,
                re.id AS repartidor_id, re.tipo_vehiculo, re.disponible AS repartidor_disponible,
                ad.id AS administrador_id
         FROM usuarios u
         LEFT JOIN clientes       cl ON cl.usuario_id = u.id
         LEFT JOIN comercios      co ON co.usuario_id = u.id
         LEFT JOIN repartidores   re ON re.usuario_id = u.id
         LEFT JOIN administradores ad ON ad.usuario_id = u.id
         WHERE u.id = ?`,
        [usuarioId]
    );

    if (filas.length === 0) {
        return null;
    }

    const fila = filas[0];

    return {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        telefono: fila.telefono,
        activo: Boolean(fila.activo),
        // usuarios.rol es la sesion abierta, no "lo que el usuario es": lo que es,
        // lo dicen los perfiles de abajo
        sesion: fila.rol,
        created_at: fila.created_at,
        perfiles: {
            cliente: fila.cliente_id !== null
                ? { id: fila.cliente_id, direccion_entrega: fila.direccion_entrega }
                : null,
            comercio: fila.comercio_id !== null
                ? { id: fila.comercio_id, nombre: fila.comercio_nombre, activo: Boolean(fila.comercio_activo) }
                : null,
            repartidor: fila.repartidor_id !== null
                ? { id: fila.repartidor_id, tipo_vehiculo: fila.tipo_vehiculo, disponible: Boolean(fila.repartidor_disponible) }
                : null,
            administrador: fila.administrador_id !== null
                ? { id: fila.administrador_id }
                : null
        }
    };
};

// Pedidos que quedarian trabados si la cuenta se suspende o se da de baja: los pagados
// que todavia no terminaron y en los que este usuario tiene algo que hacer o que ver.
// - como cliente: pagados y sin entregar (perderia el seguimiento de algo que pago);
// - como comercio: pagados que todavia no salieron (los tiene que preparar);
// - como repartidor: el que lleva en camino.
//
// Primero resuelve los ids de los perfiles y despues filtra pedidos por las columnas
// con indice, en vez de un OR sobre tres JOIN que obligaria a recorrer la tabla entera.
const buscarPedidosEnCurso = async (conexion, usuarioId) => {
    const [perfiles] = await conexion.query(
        `SELECT (SELECT id FROM clientes     WHERE usuario_id = ?) AS cliente_id,
                (SELECT id FROM comercios    WHERE usuario_id = ?) AS comercio_id,
                (SELECT id FROM repartidores WHERE usuario_id = ?) AS repartidor_id`,
        [usuarioId, usuarioId, usuarioId]
    );

    const { cliente_id, comercio_id, repartidor_id } = perfiles[0];

    // Un id NULL no matchea nada (NULL = x nunca es verdadero): el perfil que el
    // usuario no tiene simplemente no suma pedidos
    const [pedidos] = await conexion.query(
        `SELECT id, estado
         FROM pedidos
         WHERE (cliente_id = ? AND estado IN ('en_preparacion', 'preparado', 'en_camino'))
            OR (comercio_id = ? AND estado IN ('en_preparacion', 'preparado'))
            OR (repartidor_id = ? AND estado = 'en_camino')
         ORDER BY id ASC`,
        [cliente_id, comercio_id, repartidor_id]
    );

    return pedidos;
};

// Mensaje para el 409 de buscarPedidosEnCurso, igual desde el perfil y desde el panel
const describirPedidosEnCurso = (pedidos) =>
    `Hay pedidos en curso que dependen de esta cuenta (${pedidos.map((pedido) => `#${pedido.id} ${pedido.estado}`).join(', ')}). Primero tienen que entregarse o cancelarse`;

// true si este usuario es hoy el unico administrador activo, o sea que suspenderlo o
// darlo de baja dejaria el sistema sin nadie que pueda administrarlo.
//
// Con FOR UPDATE sobre los administradores activos: sin el lock, dos administradores
// que se suspenden el uno al otro al mismo tiempo pasarian los dos el chequeo.
const esUltimoAdministradorActivo = async (conexion, usuarioId) => {
    const [administradores] = await conexion.query(
        `SELECT a.usuario_id
         FROM administradores a
         INNER JOIN usuarios u ON u.id = a.usuario_id
         WHERE u.activo = TRUE
         FOR UPDATE`
    );

    const esAdministrador = administradores.some((fila) => fila.usuario_id === usuarioId);
    return esAdministrador && administradores.length === 1;
};

// Eliminacion definitiva de una cuenta y sus perfiles. Antes se quitan los pedidos
// propios como cliente o comercio porque sus FK son RESTRICT. Si solo participo como
// repartidor, el pedido conserva el historial y queda sin repartidor por ON DELETE SET NULL.
// - pedidos sin pagar del cliente: se cancelan y devuelven el stock, que si no quedaria
//   reservado para siempre.
// - pedidos donde fue cliente o comercio: se eliminan con sus pagos, items y auditoria.
// - usuario y perfiles: se eliminan al final, liberando email, CUIT, DNI y patente.
//   Los reclamos del usuario y otros datos con FK CASCADE tambien se eliminan; las
//   referencias a pedidos eliminados desde reclamos ajenos quedan en NULL.
//
// Quien llama ya verifico que no haya pedidos en curso (buscarPedidosEnCurso) ni que
// sea el ultimo administrador.
const eliminarCuentaDefinitivamente = async (conexion, { usuarioId, actorUsuarioId = null, administradorId = null, motivo }) => {
    const [perfiles] = await conexion.query(
        `SELECT (SELECT id FROM clientes WHERE usuario_id = ?) AS cliente_id,
                (SELECT id FROM comercios WHERE usuario_id = ?) AS comercio_id`,
        [usuarioId, usuarioId]
    );
    const { cliente_id, comercio_id } = perfiles[0];

    const [sinPagar] = await conexion.query(
        `SELECT pe.id
         FROM pedidos pe
         INNER JOIN clientes cl ON cl.id = pe.cliente_id
         WHERE cl.usuario_id = ? AND pe.estado = 'pago_espera'
         ORDER BY pe.id ASC`,
        [usuarioId]
    );

    for (const pedido of sinPagar) {
        await cancelarPedido(conexion, {
            pedidoId: pedido.id,
            usuarioId: actorUsuarioId,
            administradorId,
            motivo
        });
    }

    const [pedidosEliminados] = await conexion.query(
        `DELETE FROM pedidos WHERE cliente_id = ? OR comercio_id = ?`,
        [cliente_id, comercio_id]
    );

    const [usuarioEliminado] = await conexion.query(
        `DELETE FROM usuarios WHERE id = ?`,
        [usuarioId]
    );

    if (usuarioEliminado.affectedRows !== 1) {
        throw new Error(`No se pudo eliminar el usuario ${usuarioId}`);
    }

    return {
        pedidosCancelados: sinPagar.map((pedido) => pedido.id),
        pedidosEliminados: pedidosEliminados.affectedRows
    };
};

module.exports = {
    buscarCuenta,
    buscarPedidosEnCurso,
    describirPedidosEnCurso,
    esUltimoAdministradorActivo,
    eliminarCuentaDefinitivamente
};
