// Canal de tiempo real (semana 10, CU08, CU26).
//
// Es el UNICO archivo del proyecto que sabe que existe Socket.IO, igual que
// maps.service.js es el unico que sabe que existe Mapbox. El resto del backend avisa
// que paso algo llamando a emitirUbicacionDePedido / emitirEstadoDePedido, y no se
// entera de como viaja.
//
// Igual que maps.service.js y pago.service.js, este service NO recibe una conexion.
//
// REGLA IMPORTANTE: ninguna funcion de emision se awaitea desde un controlador que
// todavia tenga una conexion tomada del pool. Adentro puede haber una llamada a Mapbox
// de hasta 5 segundos, y el release de la conexion recien pasa en el finally del
// handler. Con 10 conexiones en el pool y un repartidor pingeando cada pocos segundos,
// esperar la emision es quedarse sin pool. Los controladores llaman asi:
//
//     emitirUbicacionDePedido({ ... }).catch(() => {});
//
// El .catch vacio no es opcional: sin el, una promesa rechazada sin manejar voltea el
// proceso de Node.
//
// El canal es best-effort. La fila en la base y la respuesta HTTP son la verdad; esto
// es un aviso que puede perderse sin que nada quede inconsistente.

const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const database = require("../database/database");
const { obtenerIdValido } = require("../utils/validacion");
const {
    buscarPedidoParaSeguimiento,
    autorizarSeguimiento,
    calcularEtaDePing,
    olvidarSesion,
    mensajeDeEstado,
    estaActivo
} = require("./seguimiento.service");

// Arranca en null y se llena en inicializarTiempoReal. Mientras sea null TODO es
// no-op, y eso es a proposito: app.js sigue exportando solo el app de Express y sigue
// siendo importable sin un servidor HTTP detras. Quien monte la API de otra forma
// (un test, un script) no queda obligado a levantar un socket.
let io = null;

// Los estados de los que ya no se vuelve: cuando el pedido llega a uno, no va a haber
// mas pings y la sesion de ETA en memoria no tiene por que seguir viva.
const ESTADOS_TERMINALES = ['entregado', 'cancelado'];

// Tope de pedidos que un mismo socket puede seguir a la vez. socket.rooms incluye la
// sala propia del socket (la de su id), de ahi el +1.
const MAX_SALAS = 10;

const salaDePedido = (pedidoId) => `pedido:${pedidoId}`;

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

const inicializarTiempoReal = (servidor) => {
    io = new Server(servidor, {
        // Socket.IO NO hereda el cors() de Express: son dos capas distintas. Sin esto,
        // un front servido desde otro puerto falla en el handshake con un error que ni
        // siquiera menciona CORS, y es la causa numero uno de "el socket no conecta".
        cors: {
            origin: process.env.SOCKET_ORIGEN || '*',
            credentials: false
        }
    });

    // Autenticacion del handshake. Mismo criterio que verificarToken: el token viaja
    // CRUDO, sin prefijo Bearer, porque asi lo lee la API y no tiene sentido que el
    // socket invente una convencion propia.
    //
    // Va por handshake.auth y no por query string para que el token no termine en los
    // logs del servidor ni en el historial del navegador.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;

        if (!token) {
            const error = new Error("Token no proporcionado");
            error.data = { codigo: 401 };
            return next(error);
        }

        try {
            socket.data.usuario = jwt.verify(token, process.env.JWT_SECRET);
            return next();
        } catch (errorToken) {
            // Socket.IO manda err.message y err.data al cliente en connect_error. El
            // codigo viaja en data para que el front pueda distinguir un 401 sin
            // tener que comparar textos.
            const error = new Error("Token inválido o expirado");
            error.data = { codigo: 401 };
            return next(error);
        }
    });

    io.on("connection", (socket) => {
        socket.on("seguir_pedido", (datos, ack) => manejarSeguirPedido(socket, datos, ack));
        socket.on("dejar_pedido", (datos, ack) => manejarDejarPedido(socket, datos, ack));
    });

    console.log("Canal de tiempo real activo (Socket.IO)");

    // El dia que el backend corra en mas de un proceso, cada instancia va a tener sus
    // propias salas y un evento emitido en una no va a llegar a los clientes conectados
    // a la otra. La solucion es @socket.io/redis-adapter. Hoy corre una sola instancia,
    // asi que queda anotado y no construido.
    return io;
};

const hayTiempoReal = () => io !== null;

// Hay alguien mirando este pedido ahora mismo?
//
// Es el cortocircuito que hace barato todo lo demas: si nadie tiene la pantalla de
// seguimiento abierta, el ping del repartidor no consulta la base ni calcula ETA ni le
// habla a Mapbox. Solo escribe su fila y contesta.
const haySeguidores = (pedidoId) => {
    if (!io) {
        return false;
    }

    const sala = io.sockets.adapter.rooms.get(salaDePedido(pedidoId));
    return Boolean(sala && sala.size > 0);
};

// No-op si el canal no esta levantado. Nunca lanza: un problema del canal no tiene que
// poder romper el flujo que lo origino.
const emitirEnPedido = (pedidoId, evento, payload) => {
    if (!io) {
        return;
    }

    io.to(salaDePedido(pedidoId)).emit(evento, payload);
};

// ---------------------------------------------------------------------------
// Handlers de sala
// ---------------------------------------------------------------------------

// Mismo envoltorio { codigo, estado, datos } que las respuestas HTTP.
//
// Los acks lo llevan porque son pregunta -> respuesta, igual que un request: tienen
// exito o fracaso y el front reusa el parser que ya escribio para la API. Los eventos
// que el servidor empuja (ubicacion_actualizada, estado_actualizado) NO lo llevan: no
// contestan ninguna pregunta, un codigo 200 ahi seria decorativo, y "estado: exito"
// chocaria con el estado del pedido, que es el campo que de verdad importa.
const responder = (ack, codigo, estado, datos) => {
    if (typeof ack === 'function') {
        ack({ codigo, estado, datos });
    }
};

const responderError = (ack, codigo, mensaje) => responder(ack, codigo, "error", { mensaje });

const manejarSeguirPedido = async (socket, datos, ack) => {
    try {
        const pedidoId = obtenerIdValido(datos?.pedidoId);

        if (pedidoId === null) {
            return responderError(ack, 400, "El id del pedido no es válido");
        }

        // Si ya esta en la sala, se contesta sin tocar la base. Evita que un front con
        // un bug de reintentos convierta cada reconexion en una consulta.
        if (socket.rooms.has(salaDePedido(pedidoId))) {
            return responder(ack, 200, "exito", {
                pedido_id: pedidoId,
                sala: salaDePedido(pedidoId),
                ya_seguido: true
            });
        }

        if (socket.rooms.size > MAX_SALAS) {
            return responderError(ack, 409, "Estás siguiendo demasiados pedidos a la vez");
        }

        const { pedido, error } = await autorizarSeguimiento(database, pedidoId, socket.data.usuario);

        if (error) {
            return responderError(ack, error.codigo, error.mensaje);
        }

        // No se exige estado en_camino para entrar. Si se exigiera, el cliente que abre
        // la pantalla mientras el comercio prepara el pedido nunca recibiria el evento
        // que lo lleva a en_camino, que es justamente el que esta esperando.
        socket.join(salaDePedido(pedidoId));

        return responder(ack, 200, "exito", {
            pedido_id: pedidoId,
            sala: salaDePedido(pedidoId),
            estado: pedido.estado,
            seguimiento_activo: estaActivo(pedido.estado),
            mensaje: mensajeDeEstado(pedido.estado)
        });

    } catch (errorInterno) {
        return responderError(ack, 500, "Error interno del servidor");
    }
};

const manejarDejarPedido = (socket, datos, ack) => {
    const pedidoId = obtenerIdValido(datos?.pedidoId);

    if (pedidoId === null) {
        return responderError(ack, 400, "El id del pedido no es válido");
    }

    // No hace falta autorizar para salir: irse de una sala en la que no estabas no
    // hace nada, y no filtra si el pedido existe o no.
    socket.leave(salaDePedido(pedidoId));

    return responder(ack, 200, "exito", { pedido_id: pedidoId });
};

// ---------------------------------------------------------------------------
// Emisores
//
// Son las funciones que llaman los controladores, SIEMPRE despues del commit y sin
// await (ver la regla del encabezado). Usan el POOL, nunca la conexion del handler:
// para cuando esto corre, esa conexion ya volvio al pool.
// ---------------------------------------------------------------------------

// Un ping del repartidor: posicion nueva, ETA recalculado y, cuando toca refresco,
// tambien la ruta.
const emitirUbicacionDePedido = async ({ pedidoId, ubicacionId, latitud, longitud }) => {
    if (!haySeguidores(pedidoId)) {
        return;
    }

    // Esta consulta corre solo si alguien esta mirando. Trae el destino del pedido y
    // el vehiculo del repartidor, que son lo que el calculo del ETA necesita.
    const pedido = await buscarPedidoParaSeguimiento(database, pedidoId);

    if (!pedido) {
        return;
    }

    const { eta, ruta } = await calcularEtaDePing(database, {
        pedido,
        punto: { latitud, longitud }
    });

    emitirEnPedido(pedidoId, "ubicacion_actualizada", {
        pedido_id: pedidoId,
        // El id es la clave de orden del front. registrado_en es un TIMESTAMP con
        // precision de segundos: dos pings del mismo segundo quedarian empatados, y
        // con la emision sin await pueden ademas salir desordenados (el que refresco
        // Mapbox tarda mas que el siguiente, que se calculo local). Con el id, el
        // front descarta cualquier evento mas viejo que el ultimo que dibujo y el
        // mapa nunca salta para atras.
        ubicacion: { id: ubicacionId, latitud, longitud },
        eta,
        // null y no ausente cuando no hubo refresco: la forma del payload no cambia
        // entre eventos y el front conserva la polilinea que ya tenia.
        ruta: ruta
            ? {
                polilinea: ruta.polilinea,
                distancia_km: ruta.distanciaKm,
                origen_datos: ruta.origenDatos
            }
            : null,
        emitido_en: new Date().toISOString()
    });
};

// El pedido cambio de estado: pago aprobado, repartidor asignado, entregado, cancelado.
//
// Nunca lleva el codigo de entrega. La sala tiene al cliente Y al repartidor, asi que
// el motivo por el que el codigo no viaja en la respuesta de asignarPedido (el
// repartidor podria confirmar una entrega que nunca hizo) vale multiplicado aca.
const emitirEstadoDePedido = async ({ pedidoId, estado }) => {
    // El olvido va primero y fuera del cortocircuito de seguidores: la sesion en
    // memoria hay que limpiarla haya alguien mirando o no.
    if (ESTADOS_TERMINALES.includes(estado)) {
        olvidarSesion(pedidoId);
    }

    if (!haySeguidores(pedidoId)) {
        return;
    }

    emitirEnPedido(pedidoId, "estado_actualizado", {
        pedido_id: pedidoId,
        estado,
        seguimiento_activo: estaActivo(estado),
        mensaje: mensajeDeEstado(estado),
        ocurrido_en: new Date().toISOString()
    });
};

module.exports = {
    inicializarTiempoReal,
    hayTiempoReal,
    haySeguidores,
    emitirEnPedido,
    emitirUbicacionDePedido,
    emitirEstadoDePedido
};
