const database = require('../database/database');
const { autorizarSeguimiento, armarSeguimiento } = require('../services/seguimiento.service');
const { obtenerIdValido } = require('../utils/validacion');

// ---------------------------------------------------------------------------
// CU08 - Seguimiento del pedido (semana 10)
// ---------------------------------------------------------------------------

// mysql2 devuelve las columnas DECIMAL como STRING: total llega como "8450.00" y las
// coordenadas del comercio como "-31.6660000". Sin esta conversion el JSON saldria con
// numeros entre comillas y el front tendria que estar adivinando cuales convertir.
// ubicacion.service.js hace lo mismo con aPunto() para los pares de coordenadas.
const aNumero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

// GET /api/pedidos/:id/seguimiento
//
// Es el lado CLIENTE de lo que la semana 9 hizo para el repartidor. No reusa
// GET /api/pedido/ruta/:idPedido porque ese endpoint contesta otra pregunta: el
// repartidor quiere saber que vuelta tiene que dar (y por eso su ruta pasa por el
// comercio), el cliente quiere saber cuando le llega (y por eso la de aca va derecho
// del repartidor a la puerta).
//
// Sin transaccion: es una lectura mas el relleno perezoso de coordenadas, que es un
// calentamiento de cache y no un efecto de negocio. Mismo criterio que rutaPedido.
//
// NUNCA devuelve 409. A diferencia del repartidor, que puede arreglar un "todavia no
// registraste tu ubicacion" mandando un ping, el cliente no puede arreglar nada: si el
// repartidor no compartio su posicion, lo unico razonable es devolver 200 con la
// pantalla vacia y un mensaje que explique por que. Un error ahi seria echarle la culpa
// al cliente de algo que no depende de el.
const seguimientoPedido = async (req, res) => {
    try {
        const pedidoId = obtenerIdValido(req.params.id);

        if (pedidoId === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido no es válido" }
            });
        }

        const { pedido, error } = await autorizarSeguimiento(database, pedidoId, req.usuario);

        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        const seguimiento = await armarSeguimiento(database, pedido);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedido: {
                    id: pedido.id,
                    estado: pedido.estado,
                    total: aNumero(pedido.total),
                    direccion_entrega: pedido.direccion_entrega,
                    creado_en: pedido.created_at,
                    actualizado_en: pedido.updated_at,
                    comercio: {
                        id: pedido.comercio_id,
                        nombre: pedido.comercio,
                        direccion: pedido.direccion_comercio,
                        latitud: aNumero(pedido.comercio_latitud),
                        longitud: aNumero(pedido.comercio_longitud)
                    }
                },
                // Solo nombre y vehiculo. El telefono, el email y el usuario_id del
                // repartidor no hacen falta para ver donde esta el pedido, y lo que no
                // hace falta no se expone.
                repartidor: pedido.repartidor_id
                    ? { nombre: pedido.repartidor_nombre, tipo_vehiculo: pedido.tipo_vehiculo }
                    : null,
                ...seguimiento
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

module.exports = { seguimientoPedido };
