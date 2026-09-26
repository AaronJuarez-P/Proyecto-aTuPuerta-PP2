// Seguimiento del pedido (semana 10, CU08, CU26).
//
// Es el lado NEGOCIO del tiempo real: sabe que es un pedido, quien puede mirarlo y
// cuanto falta para que llegue. No sabe que existe Socket.IO, igual que
// ubicacion.service.js no sabe que existe Mapbox. El transporte vive en
// tiemporeal.service.js.
//
// Estan separados a proposito: el endpoint REST de CU08 y el ping del socket tienen
// que dar EL MISMO ETA. Si el calculo viviera en el modulo del socket, el controlador
// REST tendria que importar Socket.IO nada mas que para sacar un numero.
//
// OJO: a diferencia del resto de los servicios, estas funciones reciben el POOL y no
// una conexion. Es la misma excepcion que asegurarCoordenadas* en ubicacion.service.js
// y por el mismo motivo: adentro puede haber una llamada de red a Mapbox, y una
// llamada de red nunca tiene que correr con una transaccion abierta.

const { obtenerUltimaUbicacionPedido, asegurarDestinoPedido } = require('./ubicacion.service');
const { calcularRuta, distanciaHaversineKm, estimarMinutos } = require('./maps.service');

// Mismo helper que maps.service.js: se resuelve en cada llamada y no al importar el
// modulo, asi cambiar el .env no obliga a acordarse de que hay valores congelados.
const numeroDelEntorno = (nombre, porDefecto) => {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) ? valor : porDefecto;
};

const pingsRefresco = () => numeroDelEntorno('SEGUIMIENTO_PINGS_REFRESCO', 10);
const minutosRefresco = () => numeroDelEntorno('SEGUIMIENTO_MINUTOS_REFRESCO', 2);
const sesionesMax = () => numeroDelEntorno('SEGUIMIENTO_SESIONES_MAX', 200);

// Debajo de este umbral (50 metros) la distancia del tramo original se considera cero
// y no se puede dividir por ella: la fraccion daria Infinity y la hora_estimada
// terminaria siendo una fecha invalida.
const DISTANCIA_MINIMA_KM = 0.05;

// Lo que el cliente lee arriba del mapa. Es la traduccion del ENUM a algo que una
// persona entienda, y vive aca y no en el controlador porque el socket manda el mismo
// texto en estado_actualizado.
const MENSAJES_POR_ESTADO = {
    pendiente_pago:  "Todavía no pagaste este pedido.",
    en_preparacion:  "El comercio está preparando tu pedido.",
    en_camino:       "Tu pedido está en camino.",
    entregado:       "Tu pedido fue entregado.",
    cancelado:       "Este pedido fue cancelado."
};

// Caso aparte: el pedido esta en camino pero el repartidor todavia no mando ni un
// ping. No es un error, es una pantalla que el front tiene que poder dibujar igual.
const MENSAJE_SIN_UBICACION = "El repartidor todavía no compartió su ubicación.";

const mensajeDeEstado = (estado) => MENSAJES_POR_ESTADO[estado] || "Estado del pedido desconocido.";

// El seguimiento solo esta "vivo" mientras el repartidor se esta moviendo. Le dice al
// front cuando empezar y cuando dejar de esperar eventos de ubicacion.
const estaActivo = (estado) => estado === 'en_camino';

// ---------------------------------------------------------------------------
// Lectura y autorizacion
// ---------------------------------------------------------------------------

// Todo lo que el seguimiento necesita de un pedido, en una sola consulta.
//
// Mismo molde que buscarPedidoParaRuta (semana 9), con dos diferencias: trae los dos
// usuarios (el del cliente y el del repartidor) porque de eso depende quien puede
// mirar el pedido, y usa LEFT JOIN contra repartidores porque repartidor_id es NULL
// hasta que alguien lo acepta. Con INNER JOIN, un pedido recien pagado no existiria.
const buscarPedidoParaSeguimiento = async (conexion, pedidoId) => {
    const [pedidos] = await conexion.query(
        `SELECT pe.id,
                pe.estado,
                pe.total,
                pe.direccion_entrega,
                pe.destino_latitud,
                pe.destino_longitud,
                pe.distancia_km,
                pe.created_at,
                pe.updated_at,
                cl.usuario_id AS usuario_cliente,
                re.id AS repartidor_id,
                re.tipo_vehiculo,
                re.usuario_id AS usuario_repartidor,
                ur.nombre AS repartidor_nombre,
                co.id AS comercio_id,
                co.nombre AS comercio,
                co.direccion AS direccion_comercio,
                co.latitud AS comercio_latitud,
                co.longitud AS comercio_longitud
         FROM pedidos pe
         INNER JOIN clientes     cl ON cl.id = pe.cliente_id
         INNER JOIN comercios    co ON co.id = pe.comercio_id
         LEFT  JOIN repartidores re ON re.id = pe.repartidor_id
         LEFT  JOIN usuarios     ur ON ur.id = re.usuario_id
         WHERE pe.id = ?`,
        [pedidoId]
    );

    return pedidos[0];
};

// Devuelve { pedido } o { error: { codigo, mensaje } }.
//
// Compara contra usuarios.id y no contra clientes.id: el socket solo tiene el payload
// del JWT, que trae el id del USUARIO. Poder mirar un pedido no depende del rol a
// secas sino de ser parte de ese pedido, asi que el repartidor asignado tambien entra
// (es el que va a querer ver su propio recorrido).
//
// Los textos son identicos a los de pago.controller.js a proposito: el cliente ya
// conoce esos mensajes, no hace falta inventarle un vocabulario nuevo por modulo.
const autorizarSeguimiento = async (pool, pedidoId, usuario) => {
    const pedido = await buscarPedidoParaSeguimiento(pool, pedidoId);

    if (!pedido) {
        return { error: { codigo: 404, mensaje: "Pedido no encontrado" } };
    }

    const esCliente = usuario.rol === 'cliente' && pedido.usuario_cliente === usuario.id;
    const esRepartidor = usuario.rol === 'repartidor' && pedido.usuario_repartidor === usuario.id;

    if (!esCliente && !esRepartidor) {
        return { error: { codigo: 403, mensaje: "Ese pedido no es tuyo" } };
    }

    return { pedido };
};

// ---------------------------------------------------------------------------
// ETA
//
// El problema: el repartidor pingea cada pocos segundos y pedirle la ruta a Mapbox en
// cada ping seria una request de red por ping por repartidor. Pero calcular el ETA con
// Haversine crudo tampoco sirve: la linea recta ignora que la calle da vueltas y que
// el rio esta en el medio, asi que el numero se caeria cada vez que el repartidor
// dobla en una esquina.
//
// La solucion: pedir la ruta de verdad cada tanto y, entre medio, REESCALAR esa ruta
// por la fraccion de distancia que falta. Si Mapbox dijo 11 minutos y el repartidor ya
// recorrio un tercio de la distancia en linea recta, quedan ~7 minutos, no los 5 que
// daria la linea recta. Se conserva lo que Mapbox sabe y Haversine no.
//
// La cache es solo costo, nunca correccion: si se vacia (reinicio del servidor), el
// proximo ping simplemente paga un refresco. No hay nada que reconstruir.
// ---------------------------------------------------------------------------

const sesiones = new Map();

// El tope evita un leak lento: un pedido que nunca llega a un estado terminal (porque
// se abandono, o porque el servidor se reinicio justo antes) dejaria su entrada para
// siempre. Map conserva el orden de insercion, asi que la primera clave es la mas vieja.
const guardarSesion = (pedidoId, sesion) => {
    if (!sesiones.has(pedidoId) && sesiones.size >= sesionesMax()) {
        sesiones.delete(sesiones.keys().next().value);
    }

    sesiones.set(pedidoId, sesion);
};

// Se llama cuando el pedido llega a un estado terminal: ya no va a haber mas pings.
const olvidarSesion = (pedidoId) => {
    sesiones.delete(pedidoId);
};

// Mismo formato de ETA que devuelve CU21 en pedido.controller.js, para que el front no
// tenga que parsear dos formas distintas del mismo dato.
const armarEta = (minutos, calculadoEn, origenDatos) => ({
    minutos,
    hora_estimada: new Date(calculadoEn.getTime() + minutos * 60000).toISOString(),
    calculado_en: calculadoEn.toISOString(),
    origen_datos: origenDatos
});

// Se refresca contra Mapbox si no hay sesion (primer ping, o el servidor se reinicio),
// si ya pasaron suficientes pings, o si paso suficiente tiempo.
//
// Las dos condiciones son necesarias. Solo por pings: uno que pingea cada 30 segundos
// tardaria 5 minutos en refrescar. Solo por tiempo: uno que pingea una vez por minuto
// refrescaria en uno de cada dos pings.
const necesitaRefresco = (sesion) => {
    if (!sesion) {
        return true;
    }

    if (sesion.pings >= pingsRefresco()) {
        return true;
    }

    return (Date.now() - sesion.calculadoEn.getTime()) >= minutosRefresco() * 60000;
};

// Devuelve { eta, ruta, refrescada }.
//
// 'ruta' siempre viene con la ultima polilinea conocida; 'refrescada' dice si se
// acaba de recalcular. Quien llama decide que hacer con eso: el REST manda la ruta
// siempre (el front recien abre la pantalla y necesita algo que dibujar), el socket
// solo cuando cambio (los otros 9 de cada 10 eventos viajan livianos).
//
// contarPing distingue al repartidor moviendose del cliente mirando: solo el ping
// gasta credito del contador de refresco. Si el cliente refrescara la pantalla diez
// veces, no tendria por que disparar una llamada a Mapbox.
const resolverEta = async (pool, { pedidoId, origen, destino, vehiculo, contarPing = false }) => {
    const sesion = sesiones.get(pedidoId);

    if (necesitaRefresco(sesion)) {
        // Sin paradas: a diferencia de CU21, que manda al repartidor a pasar por el
        // comercio, aca la pregunta es "cuando me llega", no "que vuelta da el
        // repartidor". El tramo que importa es el que falta hasta la puerta.
        const ruta = await calcularRuta({ origen, destino, paradas: [], vehiculo });
        const calculadoEn = new Date();

        const nueva = {
            destino,
            vehiculo,
            ruta: {
                distanciaKm: ruta.distanciaKm,
                duracionMinutos: ruta.duracionMinutos,
                polilinea: ruta.polilinea,
                origenDatos: ruta.origenDatos
            },
            origenRuta: origen,
            distanciaOrigenRuta: distanciaHaversineKm(origen, destino),
            calculadoEn,
            pings: contarPing ? 1 : 0
        };

        guardarSesion(pedidoId, nueva);

        return {
            eta: armarEta(ruta.duracionMinutos, calculadoEn, ruta.origenDatos),
            ruta: nueva.ruta,
            refrescada: true
        };
    }

    if (contarPing) {
        sesion.pings += 1;
    }

    const restante = distanciaHaversineKm(origen, destino);
    const fraccion = sesion.distanciaOrigenRuta > DISTANCIA_MINIMA_KM
        ? restante / sesion.distanciaOrigenRuta
        : 1;

    const minutos = Math.max(1, Math.ceil(sesion.ruta.duracionMinutos * fraccion));

    // El numero salio de una cuenta local, no de Mapbox, y eso se dice. En modo mock
    // nunca hubo Mapbox de entrada, asi que ahi sigue siendo 'mock'. La degradacion
    // nunca tiene que ser silenciosa: mismo criterio que origen_datos en CU21.
    const origenDatos = sesion.ruta.origenDatos === 'mock' ? 'mock' : 'estimado';

    return {
        eta: armarEta(minutos, new Date(), origenDatos),
        ruta: sesion.ruta,
        refrescada: false
    };
};

// ETA para un ping del repartidor. Lo usa el emisor del socket.
//
// Devuelve { eta, ruta } con ruta = null cuando no se refresco, que es lo que hace que
// 9 de cada 10 eventos sean chicos. null y no ausente: la forma del payload no cambia
// entre eventos.
const calcularEtaDePing = async (pool, { pedido, punto }) => {
    const destino = await asegurarDestinoPedido(pool, pedido);

    if (!destino) {
        return { eta: null, ruta: null, destino: null };
    }

    const { eta, ruta, refrescada } = await resolverEta(pool, {
        pedidoId: pedido.id,
        origen: punto,
        destino,
        vehiculo: pedido.tipo_vehiculo,
        contarPing: true
    });

    return { eta, ruta: refrescada ? ruta : null, destino };
};

// ---------------------------------------------------------------------------
// Armado de la respuesta de CU08
// ---------------------------------------------------------------------------

const aIso = (fecha) => (fecha instanceof Date ? fecha.toISOString() : fecha);

// La parte variable del seguimiento: donde esta el repartidor, cuanto falta y por
// donde va. Devuelve { seguimiento_activo, ubicacion, destino, eta, ruta, mensaje }.
//
// Nunca falla por falta de datos. A diferencia de CU21, que le contesta 409 al
// repartidor que no registro su ubicacion (porque el repartidor PUEDE arreglarlo
// pingeando), el cliente no puede arreglar nada: necesita una pantalla que se dibuje
// igual, con un mensaje que explique que esta pasando.
const armarSeguimiento = async (pool, pedido) => {
    const activo = estaActivo(pedido.estado);

    const seguimiento = {
        seguimiento_activo: activo,
        ubicacion: null,
        destino: null,
        eta: null,
        ruta: null,
        mensaje: mensajeDeEstado(pedido.estado)
    };

    // En pendiente_pago, en_preparacion y cancelado no hay nadie moviendose y no tiene
    // sentido leer el historico. En entregado si: la ultima posicion registrada es el
    // punto donde se entrego, y es lo que cierra el recorrido en el mapa.
    if (!activo && pedido.estado !== 'entregado') {
        return seguimiento;
    }

    const ubicacion = await obtenerUltimaUbicacionPedido(pool, pedido.id);

    if (!ubicacion) {
        if (activo) {
            seguimiento.mensaje = MENSAJE_SIN_UBICACION;
        }

        return seguimiento;
    }

    seguimiento.ubicacion = {
        latitud: ubicacion.latitud,
        longitud: ubicacion.longitud,
        registrado_en: aIso(ubicacion.registrado_en)
    };

    seguimiento.destino = await asegurarDestinoPedido(pool, pedido);

    // Sin destino no hay ETA posible, y en un pedido ya entregado el ETA no significa
    // nada: lo que falta son cero minutos.
    if (!activo || !seguimiento.destino) {
        return seguimiento;
    }

    const { eta, ruta } = await resolverEta(pool, {
        pedidoId: pedido.id,
        origen: { latitud: ubicacion.latitud, longitud: ubicacion.longitud },
        destino: seguimiento.destino,
        vehiculo: pedido.tipo_vehiculo
    });

    seguimiento.eta = eta;
    seguimiento.ruta = {
        polilinea: ruta.polilinea,
        distancia_km: ruta.distanciaKm,
        duracion_minutos: ruta.duracionMinutos,
        origen_datos: ruta.origenDatos
    };

    return seguimiento;
};

module.exports = {
    buscarPedidoParaSeguimiento,
    autorizarSeguimiento,
    armarSeguimiento,
    calcularEtaDePing,
    olvidarSesion,
    mensajeDeEstado,
    estaActivo
};
