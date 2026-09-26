const database = require("../database/database");
const { enviarNotificaciones } = require("./notificaciones.controller");

// Lista los pedidos disponibles para que un repartidor los tome.
const listarPedidos = async (req, res) => {

    let connection;

    try {

        connection = await database.getConnection();

        const idUsuario = req.usuario;

        if (idUsuario.rol !== 'repartidor') {
            return res.status(403).json({
                codigo: 403,
                estado: "Rol de usuario no permitido",
                datos: null
            });
        };

        // Validacion usuario activo
        const [usuarioActivo] = await connection.query(
            `SELECT activo FROM usuarios
             WHERE id = ?`,
            [idUsuario.id]
        );

        if (usuarioActivo.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "Usuario no registrado",
                datos: null
            });
        };

        const [{ activo }] = usuarioActivo;

        if (!activo) {
            return res.status(403).json({
                codigo: 403,
                estado: "Usuario inactivo",
                datos: null
            });
        };

        // Validacion de que el usuario tenga perfil de repartidor
        const [repartidor] = await connection.query(
            `SELECT id FROM repartidores
             WHERE usuario_id = ?`,
            [idUsuario.id]
        );

        if (repartidor.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "Repartidor no registrado",
                datos: null
            });
        };

        // Pedidos disponibles para tomar (sin repartidor asignado),
        // con datos del comercio (público) y cantidad de items,
        // SIN la direccion_entrega del cliente.
        const [datosPedido] = await connection.query(
            `SELECT pe.id,
                    pe.distancia_km,
                    pe.tiempo_estimado,
                    pe.comision,
                    co.nombre AS comercio,
                    co.direccion AS direccion_comercio,
                    COUNT(ipe.id) AS cantidad_items
             FROM pedidos pe
             INNER JOIN comercios co
                ON pe.comercio_id = co.id
             INNER JOIN items_pedido ipe
                ON ipe.pedido_id = pe.id
             WHERE pe.repartidor_id IS NULL
               AND pe.estado = 'preparado'
             GROUP BY pe.id, pe.distancia_km, pe.tiempo_estimado,
                      pe.comision, co.nombre, co.direccion`
        );

        if (datosPedido.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "No hay pedidos disponibles",
                datos: null
            });
        };

        return res.status(200).json({
            codigo: 200,
            estado: "Pedidos listados",
            datos: datosPedido
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "Error interno del servidor",
            datos: null
        });
    } finally {
        if (connection) connection.release();
    };
};

// Genera un código de entrega de 8 dígitos.
// Se genera recién acá, cuando el repartidor acepta el pedido,
// porque es el momento en que el cliente realmente lo va a necesitar.
const generarCodigo = () => {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

// El repartidor acepta un pedido disponible y se le asigna.
// Transición de estado: 'preparado' -> 'en_camino'
// Efectos: genera código de entrega, notifica a cliente y comercio.
const asignarPedido = async (req, res) => {

  let connection;

  try {

    connection = await database.getConnection();

    const idUsuario = req.usuario;

    if (idUsuario.rol != 'repartidor') {
      return res.status(403).json({
        codigo: 403,
        estado: "Tipo de usuario no permitido",
        datos: null
      });
    };

    const [idRepartidor] = await connection.query(
      `SELECT id FROM repartidores WHERE usuario_id = ?`,
      [idUsuario.id]
    );

    if (idRepartidor.length === 0) {
      return res.status(401).json({
        codigo: 401,
        estado: "Repartidor no identificado",
        datos: null
      });
    };

    const [{ id: idRepa }] = idRepartidor;

    const { idPedido } = req.params;

    const codigo = generarCodigo();

    // UPDATE atómico: solo asigna si el pedido sigue 'preparado' y sin repartidor.
    // Esto evita que dos repartidores se queden con el mismo pedido en simultáneo,
    // sin necesidad de transacción explícita ni FOR UPDATE.
    const [pedidoAsignado] = await connection.query(
      `UPDATE pedidos
       SET repartidor_id = ?, estado = 'en_camino', codigo = ?
       WHERE id = ?
         AND repartidor_id IS NULL
         AND estado = 'preparado'`,
      [idRepa, codigo, idPedido]
    );

    if (pedidoAsignado.affectedRows === 0) {
      return res.status(409).json({
        codigo: 409,
        estado: "El pedido ya no está disponible",
        datos: null
      });
    };

    // Buscar usuario_id del cliente y del comercio para notificar a ambos
    const [datosPedido] = await connection.query(
      `SELECT c.usuario_id AS cliente_usuario_id,
              co.usuario_id AS comercio_usuario_id
       FROM pedidos p
       INNER JOIN clientes c ON c.id = p.cliente_id
       INNER JOIN comercios co ON co.id = p.comercio_id
       WHERE p.id = ?`,
      [idPedido]
    );

    if (datosPedido.length > 0) {
      const { cliente_usuario_id, comercio_usuario_id } = datosPedido[0];

      await enviarNotificaciones(cliente_usuario_id, {
        titulo: "Tu repartidor está en camino",
        mensaje: `Tu pedido fue aceptado. Código de entrega: ${codigo}`,
        url: `/cliente/pedidos/${idPedido}`
      });

      await enviarNotificaciones(comercio_usuario_id, {
        titulo: "Pedido aceptado",
        mensaje: `Un repartidor aceptó el pedido #${idPedido} y va en camino`,
        url: `/comercio/pedidos/${idPedido}`
      });
    }

    return res.status(200).json({
      codigo: 200,
      estado: "Pedido asignado exitosamente",
      datos: { idPedido: Number(idPedido), idRepartidor: idRepa }
    });

  } catch (error) {
    return res.status(500).json({
      codigo: 500,
      estado: "Error interno del servidor",
      datos: null
    });
  } finally {
    if (connection) connection.release();
  };
};

// El repartidor confirma la entrega ingresando el código que tiene el cliente.
// Transición de estado: 'en_camino' -> 'entregado'
// Efectos: notifica al comercio que el pedido se entregó correctamente.
const entregaPedido = async (req, res) => {
  let connection;
  try {
    connection = await database.getConnection();

    const idUsuario = req.usuario;

    if (idUsuario.rol !== 'repartidor') {
      return res.status(403).json({
        codigo: 403,
        estado: "Tipo de usuario no permitido",
        datos: null
      });
    };

    const [repartidor] = await connection.query(
      `SELECT id FROM repartidores WHERE usuario_id = ?`,
      [idUsuario.id]
    );

    if (repartidor.length === 0) {
      return res.status(404).json({
        codigo: 404,
        estado: "Cuenta de repartidor no registrada",
        datos: null
      });
    };

    const [{ id: idRepa }] = repartidor;

    const { idPedido } = req.params;
    const { codigoPedido } = req.body;

    if (!codigoPedido) {
      return res.status(400).json({
        codigo: 400,
        estado: "Falta el código de entrega",
        datos: null
      });
    };

    const [resultado] = await connection.query(
      `UPDATE pedidos
       SET estado = 'entregado', codigo = NULL
       WHERE id = ?
         AND repartidor_id = ?
         AND estado = 'en_camino'
         AND codigo = ?`,
      [idPedido, idRepa, codigoPedido]
    );

    if (resultado.affectedRows === 0) {
      return res.status(409).json({
        codigo: 409,
        estado: "No se pudo confirmar la entrega (código incorrecto o pedido no disponible)",
        datos: null
      });
    };

    // Buscar usuario_id del comercio para notificar la entrega
    const [datosPedido] = await connection.query(
      `SELECT co.usuario_id AS comercio_usuario_id
       FROM pedidos p
       INNER JOIN comercios co ON co.id = p.comercio_id
       WHERE p.id = ?`,
      [idPedido]
    );

    if (datosPedido.length > 0) {
      await enviarNotificaciones(datosPedido[0].comercio_usuario_id, {
        titulo: "Pedido entregado",
        mensaje: `El pedido #${idPedido} fue entregado correctamente`,
        url: `/comercio/pedidos/${idPedido}`
      });
    }

    return res.status(200).json({
      codigo: 200,
      estado: "Pedido entregado exitosamente",
      datos: { idPedido: Number(idPedido) }
    });

  } catch (error) {
    return res.status(500).json({
      codigo: 500,
      estado: "Error interno del servidor",
      datos: null
    });
  } finally {
    if (connection) connection.release();
  };
};

module.exports = {
  listarPedidos,
  asignarPedido,
  entregaPedido
};