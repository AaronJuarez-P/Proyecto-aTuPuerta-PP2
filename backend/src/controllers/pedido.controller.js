const crypto = require('crypto');
const database = require('../database/database');
const { asignarPedidoARepartidor, confirmarEntregaPedido } = require('../services/pedido.service');
const { bloquearRepartidor, actualizarDisponibilidad } = require('../services/repartidor.service');
const { registrarNotificacion } = require('../services/notificacion.service');
const { emitirEstadoDePedido } = require('../services/tiemporeal.service');
const { calcularRuta } = require('../services/maps.service');
const {
    registrarUbicacion,
    obtenerUbicacionRepartidor,
    asegurarCoordenadasComercio,
    asegurarDestinoPedido
} = require('../services/ubicacion.service');
const { obtenerPaginacion } = require('../utils/paginacion');
const { obtenerIdValido, obtenerLatitudValida, obtenerLongitudValida } = require('../utils/validacion');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Codigo de entrega de 8 digitos (pedidos.codigo es VARCHAR(8)). Es lo que autoriza la
// entrega, asi que sale de crypto y no de Math.random: no tiene que poder predecirse.
const generarCodigo = () => {
    return crypto.randomInt(10000000, 100000000).toString();
};

// Coordenadas OPCIONALES del cuerpo de la entrega (semana 9, CU22).
//
// Devuelve el punto, null si no vinieron, o el string 'invalidas' si vinieron mal.
// Distinguir "no las mandaste" de "las mandaste mal" es el punto: lo primero es el
// comportamiento de la semana 8 y tiene que seguir andando exactamente igual, lo
// segundo es un error que conviene avisar en vez de descartar en silencio.
const obtenerPuntoOpcional = (cuerpo) => {
    if (cuerpo?.latitud === undefined && cuerpo?.longitud === undefined) {
        return null;
    }

    const latitud = obtenerLatitudValida(cuerpo?.latitud);
    const longitud = obtenerLongitudValida(cuerpo?.longitud);

    if (latitud === null || longitud === null) {
        return 'invalidas';
    }

    return { latitud, longitud };
};

// Acepta el codigo como string o como numero y devuelve el string de 8 digitos listo
// para comparar, o null si no sirve.
const normalizarCodigo = (valor) => {
    if (typeof valor !== "string" && typeof valor !== "number") {
        return null;
    }

    const codigo = String(valor).trim();
    return /^\d{8}$/.test(codigo) ? codigo : null;
};

// Detalle del pedido para el repartidor que lo tomo: recien aca aparece la
// direccion_entrega, que el listado no muestra. Trae tambien el usuario del cliente
// para notificarlo, pero ese dato no se devuelve en las respuestas.
const buscarDetallePedido = async (conexion, pedidoId) => {
    const [pedidos] = await conexion.query(
        `SELECT pe.id,
                pe.estado,
                pe.direccion_entrega,
                pe.distancia_km,
                pe.tiempo_estimado,
                pe.comision,
                co.nombre AS comercio,
                co.direccion AS direccion_comercio,
                cl.usuario_id AS usuario_cliente
         FROM pedidos pe
         INNER JOIN comercios co ON co.id = pe.comercio_id
         INNER JOIN clientes cl ON cl.id = pe.cliente_id
         WHERE pe.id = ?`,
        [pedidoId]
    );

    return pedidos[0];
};

// Los UPDATE condicionales de pedido.service.js solo dicen si pudieron o no. Cuando no
// pudieron, estas funciones averiguan el motivo para contestar algo util. Corren
// unicamente en el camino de error. Devuelven { codigo, mensaje }.
const explicarAsignacionRechazada = async (conexion, pedidoId) => {
    const [pedidos] = await conexion.query(
        `SELECT repartidor_id, estado FROM pedidos WHERE id = ?`,
        [pedidoId]
    );

    if (pedidos.length === 0) {
        return { codigo: 404, mensaje: "Pedido no encontrado" };
    }

    if (pedidos[0].repartidor_id !== null) {
        return { codigo: 409, mensaje: "El pedido ya no está disponible: lo tomó otro repartidor" };
    }

    return { codigo: 409, mensaje: `El pedido está en estado "${pedidos[0].estado}" y no se puede asignar` };
};

// Primero se fija si el pedido es suyo y recien al final el codigo: a un repartidor al
// que no le toca el pedido nunca se le dice si el codigo que probo era el correcto.
const explicarEntregaRechazada = async (conexion, pedidoId, repartidorId) => {
    const [pedidos] = await conexion.query(
        `SELECT repartidor_id, estado FROM pedidos WHERE id = ?`,
        [pedidoId]
    );

    if (pedidos.length === 0) {
        return { codigo: 404, mensaje: "Pedido no encontrado" };
    }

    if (pedidos[0].repartidor_id !== repartidorId) {
        return { codigo: 403, mensaje: "Ese pedido no está asignado a vos" };
    }

    if (pedidos[0].estado !== 'en_camino') {
        return { codigo: 409, mensaje: `El pedido está en estado "${pedidos[0].estado}" y no se puede entregar` };
    }

    return { codigo: 400, mensaje: "El código de entrega no es correcto" };
};

// Todo lo que CU21 necesita para armar la ruta: el pedido con su punto de destino y
// el comercio con el suyo. Trae tambien las direcciones de texto porque son lo que se
// geocodifica cuando alguna de las dos filas todavia no tiene coordenadas.
const buscarPedidoParaRuta = async (conexion, pedidoId) => {
    const [pedidos] = await conexion.query(
        `SELECT pe.id,
                pe.estado,
                pe.repartidor_id,
                pe.direccion_entrega,
                pe.destino_latitud,
                pe.destino_longitud,
                co.id AS comercio_id,
                co.nombre AS comercio,
                co.direccion AS direccion_comercio,
                co.latitud AS comercio_latitud,
                co.longitud AS comercio_longitud
         FROM pedidos pe
         INNER JOIN comercios co ON co.id = pe.comercio_id
         WHERE pe.id = ?`,
        [pedidoId]
    );

    return pedidos[0];
};

// ---------------------------------------------------------------------------
// CU19 - Ver pedidos disponibles para repartir
// ---------------------------------------------------------------------------

// GET /api/pedido/listar?pagina=&limite=
//
// Disponible = pagado (en_preparacion) y sin repartidor. Muestra lo que el repartidor
// necesita para decidir si le conviene (comercio, distancia, tiempo, comision), pero
// NO la direccion_entrega del cliente: esa la ve solo quien toma el pedido.
const listarPedidos = async (req, res) => {
    try {
        if (!req.repartidorDisponible) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "No estás disponible para tomar pedidos: tenés uno en curso o estás fuera de servicio" }
            });
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad
             FROM pedidos
             WHERE repartidor_id IS NULL
               AND estado = 'en_preparacion'`
        );

        // Los que esperan hace mas tiempo primero
        const [pedidos] = await database.query(
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
                      pe.comision, co.nombre, co.direccion
             ORDER BY pe.id ASC
             LIMIT ? OFFSET ?`,
            [limite, offset]
        );

        // Que no haya pedidos para repartir es una respuesta valida, no un 404: la lista
        // existe, solo que ahora esta vacia.
        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedidos,
                paginacion: { pagina, limite, total: total[0].cantidad }
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

// ---------------------------------------------------------------------------
// CU20 - Aceptar pedido y confirmar la entrega
// ---------------------------------------------------------------------------

// PATCH /api/pedido/asignar/:idPedido
const asignarPedido = async (req, res) => {
    let connection;
    try {
        const pedidoId = obtenerIdValido(req.params.idPedido);
        if (pedidoId === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido no es válido" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // Se relee con lock: req.repartidorDisponible salio del middleware, fuera de esta
        // transaccion, y no alcanza para frenar dos aceptaciones simultaneas.
        const repartidor = await bloquearRepartidor(connection, req.repartidorId);

        if (!repartidor || !repartidor.disponible) {
            await connection.rollback();
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: "Ya tenés un pedido en curso o estás fuera de servicio" }
            });
        }

        const codigo = generarCodigo();

        const asignado = await asignarPedidoARepartidor(connection, {
            pedidoId,
            repartidorId: req.repartidorId,
            codigo,
            usuarioId: req.usuario.id
        });

        if (!asignado) {
            await connection.rollback();

            const error = await explicarAsignacionRechazada(connection, pedidoId);
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        await actualizarDisponibilidad(connection, { repartidorId: req.repartidorId, disponible: false });

        const { usuario_cliente, ...pedido } = await buscarDetallePedido(connection, pedidoId);

        // Dentro de la transaccion a proposito: si no se puede avisar al cliente, el
        // pedido no queda asignado con un codigo de entrega que nadie conoce.
        await registrarNotificacion(connection, {
            usuarioId: usuario_cliente,
            tipo: 'pedido_en_camino',
            mensaje: `Un repartidor tomó tu pedido #${pedidoId} de ${pedido.comercio}. Tu código de entrega es ${codigo}: dáselo cuando te lo entregue.`
        });

        await connection.commit();

        // CU26 (semana 10): el cliente que tenga la pantalla de seguimiento abierta ve
        // el cambio sin tener que refrescar. Despues del commit y sin await, igual que
        // el ping de ubicacion (ver tiemporeal.service.js).
        //
        // El evento NO lleva el codigo de entrega, por el mismo motivo que la respuesta
        // de abajo tampoco: en la sala del pedido esta el cliente Y el repartidor.
        emitirEstadoDePedido({ pedidoId, estado: 'en_camino' }).catch(() => {});

        // El codigo NO va en la respuesta: lo tiene que dictar el cliente. Si el
        // repartidor lo recibiera aca, podria confirmar una entrega que nunca hizo.
        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Pedido asignado correctamente",
                pedido
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

// PATCH /api/pedido/entrega/:idPedido
// Body: { "codigoPedido": "12345678" }
// Body con la posicion de la entrega (opcional, semana 9):
//      { "codigoPedido": "12345678", "latitud": -31.6760, "longitud": -60.7735 }
const entregaPedido = async (req, res) => {
    let connection;
    try {
        const pedidoId = obtenerIdValido(req.params.idPedido);
        if (pedidoId === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido no es válido" }
            });
        }

        const codigo = normalizarCodigo(req.body?.codigoPedido);
        if (codigo === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El código de entrega es obligatorio y tiene que tener 8 dígitos" }
            });
        }

        const punto = obtenerPuntoOpcional(req.body);
        if (punto === 'invalidas') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Si mandás la ubicación de la entrega tenés que mandar latitud y longitud, las dos, como números dentro de rango" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // Aca no hace falta leer disponible, pero el lock del repartidor va primero igual
        // para respetar el orden repartidores -> pedidos (ver repartidor.service.js)
        await bloquearRepartidor(connection, req.repartidorId);

        const entregado = await confirmarEntregaPedido(connection, {
            pedidoId,
            repartidorId: req.repartidorId,
            codigo,
            usuarioId: req.usuario.id
        });

        if (!entregado) {
            await connection.rollback();

            const error = await explicarEntregaRechazada(connection, pedidoId, req.repartidorId);
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        // Con el pedido entregado, el repartidor puede volver a tomar otro
        await actualizarDisponibilidad(connection, { repartidorId: req.repartidorId, disponible: true });

        // La posicion final cierra el rastro del pedido en el punto donde se entrego.
        // Va en la MISMA transaccion que la entrega, y es seguro: es una operacion de
        // base pura, sin red. El orden de locks se respeta solo, porque
        // bloquearRepartidor ya corrio mas arriba.
        if (punto) {
            await registrarUbicacion(connection, {
                repartidorId: req.repartidorId,
                pedidoId,
                latitud: punto.latitud,
                longitud: punto.longitud
            });
        }

        const { usuario_cliente, comercio } = await buscarDetallePedido(connection, pedidoId);

        await registrarNotificacion(connection, {
            usuarioId: usuario_cliente,
            tipo: 'pedido_entregado',
            mensaje: `Tu pedido #${pedidoId} de ${comercio} fue entregado.`
        });

        await connection.commit();

        // Ultimo evento del pedido. El emisor se encarga ademas de olvidar la sesion de
        // ETA en memoria: entregado es terminal, no va a haber mas pings.
        emitirEstadoDePedido({ pedidoId, estado: 'entregado' }).catch(() => {});

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Pedido entregado correctamente",
                pedido: { id: pedidoId, estado: "entregado" },
                disponible: true,
                ubicacion_registrada: Boolean(punto)
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
// CU21 - Ver la ruta optimizada hacia el destino (semana 9)
// ---------------------------------------------------------------------------

// GET /api/pedido/ruta/:idPedido?retirado=true|false
//
// La ruta por defecto es "donde estoy -> comercio -> domicilio del cliente", con el
// comercio como parada: cuando el repartidor acepta, el pedido pasa directo a
// en_camino pero todavia NO retiro la mercaderia. Con ?retirado=true la ruta va
// derecho al cliente; sin ese parametro, despues de pasar por el comercio la ruta lo
// mandaria de vuelta a la tienda.
//
// Sin transaccion: es una lectura, y ademas la llamada a Mapbox no puede quedar
// adentro de una. Lo unico que escribe es el relleno perezoso de coordenadas, que es
// un calentamiento de cache y no un efecto de negocio: el GET sigue siendo idempotente
// visto desde afuera.
const rutaPedido = async (req, res) => {
    try {
        const pedidoId = obtenerIdValido(req.params.idPedido);
        if (pedidoId === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido no es válido" }
            });
        }

        const pedido = await buscarPedidoParaRuta(database, pedidoId);

        if (!pedido) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Pedido no encontrado" }
            });
        }

        // La pertenencia se chequea antes que el estado, mismo criterio que
        // explicarEntregaRechazada: a quien no le toca el pedido no se le cuenta nada
        // de como viene.
        if (pedido.repartidor_id !== req.repartidorId) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Ese pedido no está asignado a vos" }
            });
        }

        if (pedido.estado !== 'en_camino') {
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: `El pedido está en estado "${pedido.estado}" y no tiene una ruta que calcular` }
            });
        }

        const origen = await obtenerUbicacionRepartidor(database, req.repartidorId);

        if (!origen) {
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: "Todavía no registraste tu ubicación. Mandá POST /api/repartidor/ubicacion antes de pedir la ruta" }
            });
        }

        const destino = await asegurarDestinoPedido(database, pedido);

        if (!destino) {
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: "No pudimos ubicar la dirección de entrega en el mapa" }
            });
        }

        // Los query params siempre llegan como string: "false" a secas seria truthy
        const retirado = req.query.retirado === 'true';
        const paradas = [];

        if (!retirado) {
            const comercio = await asegurarCoordenadasComercio(database, {
                id: pedido.comercio_id,
                direccion: pedido.direccion_comercio,
                latitud: pedido.comercio_latitud,
                longitud: pedido.comercio_longitud
            });

            // Se corta en vez de seguir sin la parada: una ruta que saltea el comercio
            // no es la ruta que el repartidor tiene que hacer, y devolverla como si
            // nada seria peor que no devolver nada.
            if (!comercio) {
                return res.status(409).json({
                    codigo: 409,
                    estado: "error",
                    datos: { mensaje: "No pudimos ubicar la dirección del comercio en el mapa" }
                });
            }

            paradas.push(comercio);
        }

        const ruta = await calcularRuta({
            origen,
            destino,
            paradas,
            vehiculo: req.repartidorVehiculo
        });

        // Los tramos vuelven en el mismo orden que [...paradas, destino]
        const etiquetas = retirado ? ['cliente'] : ['comercio', 'cliente'];
        const calculadoEn = new Date();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                pedido: {
                    id: pedido.id,
                    estado: pedido.estado,
                    comercio: pedido.comercio,
                    direccion_comercio: pedido.direccion_comercio,
                    direccion_entrega: pedido.direccion_entrega
                },
                retirado,
                ruta: {
                    distancia_km: ruta.distanciaKm,
                    duracion_minutos: ruta.duracionMinutos,
                    polilinea: ruta.polilinea,
                    tramos: ruta.tramos.map((tramo, indice) => ({
                        hasta: etiquetas[indice] ?? 'cliente',
                        distancia_km: tramo.distanciaKm,
                        duracion_minutos: tramo.duracionMinutos
                    })),
                    puntos: {
                        origen,
                        ...(retirado ? {} : { comercio: paradas[0] }),
                        destino
                    },
                    // 'mapbox' = ruta real. 'mock' = modo de prueba. 'estimado' = Mapbox
                    // no contesto y se calculo localmente. Viaja hasta aca a proposito:
                    // la degradacion nunca tiene que ser silenciosa.
                    origen_datos: ruta.origenDatos
                },
                eta: {
                    minutos: ruta.duracionMinutos,
                    hora_estimada: new Date(calculadoEn.getTime() + ruta.duracionMinutos * 60000).toISOString(),
                    calculado_en: calculadoEn.toISOString()
                }
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

module.exports = {
    listarPedidos,
    asignarPedido,
    entregaPedido,
    rutaPedido
};
