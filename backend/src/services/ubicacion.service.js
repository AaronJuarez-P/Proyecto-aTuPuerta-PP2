// Ubicaciones y coordenadas (semana 9, CU21, CU22).
//
// Es el lado BASE DE DATOS de la geolocalizacion: maps.service.js habla con Mapbox y
// no toca la base, este habla con la base y casi no toca a Mapbox.
//
// Igual que el resto de los servicios, las funciones reciben la CONEXION del
// controlador como primer parametro para participar de su transaccion. Las tres
// asegurarCoordenadas* son la excepcion y estan marcadas una por una: hacen una
// llamada de red, asi que se les pasa el POOL y nunca una conexion con una
// transaccion abierta.

const { geocodificarDireccion } = require('./maps.service');

// mysql2 devuelve las columnas DECIMAL como STRING, no como numero: latitud_actual
// llega como "-31.6730000". Si no se convierte, las cuentas de Haversine terminan
// concatenando strings en vez de restando.
const aPunto = (latitud, longitud) => {
    if (latitud === null || latitud === undefined || longitud === null || longitud === undefined) {
        return null;
    }

    return { latitud: Number(latitud), longitud: Number(longitud) };
};

// Guarda una posicion del repartidor: la agrega al historico y actualiza el snapshot.
//
// Son las dos cosas a la vez a proposito. ubicaciones_repartidor es el recorrido
// completo (y tiene pedido_id NOT NULL, asi que solo existe mientras hay un pedido),
// mientras que repartidores.latitud_actual/longitud_actual es "donde esta ahora".
// Tener el snapshot evita que CU21 tenga que hacer un ORDER BY registrado_en DESC
// sobre el historico cada vez que quiere el origen de la ruta.
//
// Quien llama TIENE que haber lockeado antes al repartidor con bloquearRepartidor:
// esta funcion escribe en la tabla repartidores y el orden de locks del proyecto es
// repartidores -> pagos -> pedidos -> productos.
const registrarUbicacion = async (conexion, { repartidorId, pedidoId, latitud, longitud }) => {
    const [resultado] = await conexion.query(
        `INSERT INTO ubicaciones_repartidor (repartidor_id, pedido_id, latitud, longitud)
         VALUES (?, ?, ?, ?)`,
        [repartidorId, pedidoId, latitud, longitud]
    );

    await conexion.query(
        `UPDATE repartidores SET latitud_actual = ?, longitud_actual = ? WHERE id = ?`,
        [latitud, longitud, repartidorId]
    );

    return resultado.insertId;
};

// Ultima posicion conocida del repartidor, o null si nunca registro ninguna.
const obtenerUbicacionRepartidor = async (conexion, repartidorId) => {
    const [repartidores] = await conexion.query(
        `SELECT latitud_actual, longitud_actual FROM repartidores WHERE id = ?`,
        [repartidorId]
    );

    if (repartidores.length === 0) {
        return null;
    }

    return aPunto(repartidores[0].latitud_actual, repartidores[0].longitud_actual);
};

// Ultima posicion registrada para un pedido. Usa idx_ubicaciones_pedido.
//
// El desempate por id es necesario: registrado_en es un TIMESTAMP con precision de
// segundos, y dos pings del mismo segundo quedarian empatados.
const obtenerUltimaUbicacionPedido = async (conexion, pedidoId) => {
    const [ubicaciones] = await conexion.query(
        `SELECT latitud, longitud, registrado_en
         FROM ubicaciones_repartidor
         WHERE pedido_id = ?
         ORDER BY registrado_en DESC, id DESC
         LIMIT 1`,
        [pedidoId]
    );

    if (ubicaciones.length === 0) {
        return null;
    }

    const punto = aPunto(ubicaciones[0].latitud, ubicaciones[0].longitud);
    return punto && { ...punto, registrado_en: ubicaciones[0].registrado_en };
};

// ---------------------------------------------------------------------------
// Geocodificacion perezosa
//
// Las tres funciones de abajo devuelven las coordenadas de una fila. Si ya las tiene,
// las devuelven sin tocar la red. Si no, geocodifican la direccion de texto y las
// guardan, asi cada fila se geocodifica UNA sola vez en su vida.
//
// Esto es lo que hace que no haga falta ningun script de backfill: una base cargada
// antes de la semana 9 se autorepara fila por fila, a medida que cada punto se
// necesita de verdad.
//
// OJO: hacen una llamada de red. Se les pasa el POOL (database), NUNCA una conexion
// con una transaccion abierta.
//
// Son tres funciones casi iguales en vez de una sola con un parametro "tabla" para no
// tener que interpolar un nombre de tabla en el SQL, que es lo unico que el proyecto
// nunca hace: todos los valores van con placeholders ?. Son unas lineas de mas y no
// tienen superficie de inyeccion.
//
// El UPDATE es idempotente y no necesita lock: si dos requests geocodifican la misma
// direccion al mismo tiempo, las dos escriben exactamente el mismo valor.
// ---------------------------------------------------------------------------

const asegurarCoordenadasComercio = async (pool, comercio) => {
    const guardado = aPunto(comercio.latitud, comercio.longitud);
    if (guardado) {
        return guardado;
    }

    const punto = await geocodificarDireccion(comercio.direccion);
    if (!punto) {
        return null;
    }

    await pool.query(
        `UPDATE comercios SET latitud = ?, longitud = ? WHERE id = ?`,
        [punto.latitud, punto.longitud, comercio.id]
    );

    return { latitud: punto.latitud, longitud: punto.longitud };
};

const asegurarCoordenadasCliente = async (pool, cliente) => {
    const guardado = aPunto(cliente.latitud, cliente.longitud);
    if (guardado) {
        return guardado;
    }

    const punto = await geocodificarDireccion(cliente.direccion_entrega);
    if (!punto) {
        return null;
    }

    await pool.query(
        `UPDATE clientes SET latitud = ?, longitud = ? WHERE id = ?`,
        [punto.latitud, punto.longitud, cliente.id]
    );

    return { latitud: punto.latitud, longitud: punto.longitud };
};

// Rellena el destino de un pedido viejo, o de uno cuya direccion no se pudo
// geocodificar cuando se creo. Geocodifica pedidos.direccion_entrega y no la del
// perfil del cliente: el pedido pudo haberse hecho a una direccion distinta.
const asegurarDestinoPedido = async (pool, pedido) => {
    const guardado = aPunto(pedido.destino_latitud, pedido.destino_longitud);
    if (guardado) {
        return guardado;
    }

    const punto = await geocodificarDireccion(pedido.direccion_entrega);
    if (!punto) {
        return null;
    }

    await pool.query(
        `UPDATE pedidos SET destino_latitud = ?, destino_longitud = ? WHERE id = ?`,
        [punto.latitud, punto.longitud, pedido.id]
    );

    return { latitud: punto.latitud, longitud: punto.longitud };
};

module.exports = {
    registrarUbicacion,
    obtenerUbicacionRepartidor,
    obtenerUltimaUbicacionPedido,
    asegurarCoordenadasComercio,
    asegurarCoordenadasCliente,
    asegurarDestinoPedido
};
