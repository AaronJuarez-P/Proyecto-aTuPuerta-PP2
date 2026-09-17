const database = require('../database/database');
const { bloquearRepartidor, actualizarDisponibilidad } = require('../services/repartidor.service');

// Id del pedido que el repartidor tiene en camino, o null si no tiene ninguno.
// Sirve tanto con el pool como con una conexion de transaccion.
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

// GET /api/repartidor/disponibilidad
//
// Ademas de disponible devuelve el pedido en curso, que es lo que explica por que un
// repartidor puede estar no disponible sin haberse puesto fuera de servicio.
const consultarDisponibilidad = async (req, res) => {
    try {
        const pedidoEnCurso = await buscarPedidoEnCurso(database, req.repartidorId);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                disponible: req.repartidorDisponible,
                pedido_en_curso: pedidoEnCurso
            }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// PATCH /api/repartidor/disponibilidad
// Body: { "disponible": true | false }
//
// Entrar y salir de servicio a mano. Aceptar y entregar un pedido tambien cambian
// disponible, pero eso pasa solo en pedido.controller.js.
const cambiarDisponibilidad = async (req, res) => {
    let connection;
    try {
        const disponible = req.body?.disponible;

        // typeof y no truthy: el string "false" es truthy y dejaria al repartidor disponible
        if (typeof disponible !== "boolean") {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "disponible es obligatorio y tiene que ser true o false" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // Mismo lock que aceptar y entregar: si acepta un pedido mientras se pone
        // disponible, una operacion espera a la otra y nunca queda disponible con un
        // pedido en camino.
        await bloquearRepartidor(connection, req.repartidorId);

        // Salir de servicio se puede siempre. Volver, solo sin un pedido en camino: si no,
        // podria aceptar otro antes de entregar el que tiene.
        if (disponible) {
            const pedidoEnCurso = await buscarPedidoEnCurso(connection, req.repartidorId);

            if (pedidoEnCurso !== null) {
                await connection.rollback();
                return res.status(409).json({
                    codigo: 409,
                    estado: "error",
                    datos: { mensaje: `Tenés el pedido #${pedidoEnCurso} en camino. Vas a quedar disponible cuando confirmes la entrega` }
                });
            }
        }

        await actualizarDisponibilidad(connection, { repartidorId: req.repartidorId, disponible });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: disponible ? "Estás disponible para tomar pedidos" : "Quedaste fuera de servicio",
                disponible
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    consultarDisponibilidad,
    cambiarDisponibilidad
};
