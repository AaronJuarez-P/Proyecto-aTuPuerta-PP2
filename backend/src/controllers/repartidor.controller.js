const database = require('../database/database');
const {
    bloquearRepartidor,
    actualizarDisponibilidad,
    buscarPedidoEnCurso
} = require('../services/repartidor.service');
const { registrarUbicacion } = require('../services/ubicacion.service');
const { obtenerLatitudValida, obtenerLongitudValida } = require('../utils/validacion');

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

// ---------------------------------------------------------------------------
// CU21 (semana 9) - Registrar la posicion del repartidor
// ---------------------------------------------------------------------------

// POST /api/repartidor/ubicacion
// Body: { "latitud": -31.6725, "longitud": -60.7825 }
//
// El pedido NO viene en el body: se infiere. ubicaciones_repartidor.pedido_id es NOT
// NULL y un repartidor puede tener un solo pedido en camino a la vez (lo garantiza
// disponible), asi que no hay ambiguedad. Y que el cliente no pueda elegir el
// pedido_id cierra de entrada la posibilidad de escribir en el historico de un pedido
// ajeno.
const registrarUbicacionRepartidor = async (req, res) => {
    let connection;
    try {
        const latitud = obtenerLatitudValida(req.body?.latitud);
        const longitud = obtenerLongitudValida(req.body?.longitud);

        if (latitud === null || longitud === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "latitud y longitud son obligatorias, tienen que ser números y estar dentro de rango (±90 y ±180)" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // El lock va primero aunque no se lea disponible, para respetar el orden
        // repartidores -> pedidos (ver repartidor.service.js). El costo real es cero:
        // el UPDATE de latitud_actual iba a tomar el lock de esa misma fila igual.
        await bloquearRepartidor(connection, req.repartidorId);

        const pedidoEnCurso = await buscarPedidoEnCurso(connection, req.repartidorId);

        if (pedidoEnCurso === null) {
            await connection.rollback();
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: "No tenés ningún pedido en curso al que asociar tu ubicación" }
            });
        }

        const ubicacionId = await registrarUbicacion(connection, {
            repartidorId: req.repartidorId,
            pedidoId: pedidoEnCurso,
            latitud,
            longitud
        });

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Ubicación registrada",
                ubicacion: { id: ubicacionId, pedido_id: pedidoEnCurso, latitud, longitud }
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
    cambiarDisponibilidad,
    registrarUbicacionRepartidor
};
