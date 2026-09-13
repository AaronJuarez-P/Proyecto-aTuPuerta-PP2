const database = require("../database/database");
const notificaciones = require("../services/PushService");

// Lista los pedidos disponibles para que un repartidor los tome.
const listarPedidos = async (req, res) => {

    let conection;

    try {

        conection = await database.getConection();

        const idUsuario = req.usuario;

        if (idUsuario.rol !== 'repartidor') {
            return res.status(401).json({
                codigo: 401,
                estado: "Rol de usuario no permitido",
                datos: null
            });
        };

        // Validacion usuario activo
        const [usuarioActivo] = await conection.query(
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
        const [repartidor] = await conection.query(
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
        const [datosPedido] = await conection.query(
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
               AND pe.estado = 'en_preparacion'
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
        if (conection) conection.release();
    };
};

const generarCodigo = async () => {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
};

const notificarClienteCodigo = async (usuarioId, codigo, pedidoId) => {
  await notificaciones.enviar({
    destinatario: usuarioId,
    titulo: "Tu repartidor está en camino",
    mensaje: `Tu código de entrega es: ${codigo}`,
    data: { pedidoId }
  });
};

const asignarPedido = async (req, res) => {

  let conection;

  try {

    conection = await database.getConection();

    const idUsuario = req.usuario;

    if (idUsuario.rol != 'repartidor') {
      return res.status(403).json({
        codigo: 403,
        estado: "Tipo de usuario no permitido",
        datos: null
      });
    };

    const [idRepartidor] = await conection.query(
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

    const codigo = await generarCodigo();

    const [pedidoAsignado] = await conection.query(
      `UPDATE pedidos
       SET repartidor_id = ?, estado = 'en_camino', codigo = ?
       WHERE id = ?
         AND repartidor_id IS NULL
         AND estado = 'en_preparacion'`,
      [idRepa, codigo, idPedido]
    );

    if (pedidoAsignado.affectedRows === 0) {
      return res.status(409).json({
        codigo: 409,
        estado: "El pedido ya no está disponible",
        datos: null
      });
    };

    // Buscar el usuario_id del cliente para notificar
    const [clienteInfo] = await conection.query(
      `SELECT c.usuario_id
       FROM pedidos p
       INNER JOIN clientes c ON c.id = p.cliente_id
       WHERE p.id = ?`,
      [idPedido]
    );

    if (clienteInfo.length > 0) {
      await notificarClienteCodigo(clienteInfo[0].usuario_id, codigo, idPedido);
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
    if (conection) conection.release();
  };
};

const entregaPedido = async (req, res) => {
  let conection;
  try {
    conection = await database.getConection();

    const idUsuario = req.usuario;

    if (idUsuario.rol !== 'repartidor') {
      return res.status(403).json({
        codigo: 403,
        estado: "Tipo de usuario no permitido",
        datos: null
      });
    };

    const [repartidor] = await conection.query(
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

    const [resultado] = await conection.query(
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
    if (conection) conection.release();
  };
};

module.exports = {
  listarPedidos,
  asignarPedido,
  entregaPedido
};