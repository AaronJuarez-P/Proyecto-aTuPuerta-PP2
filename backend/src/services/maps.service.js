// Adaptador de Mapbox (semana 9, CU21).
//
// Es el UNICO archivo del proyecto que sabe que existe Mapbox. El resto del backend
// habla contra esta interfaz, asi que cambiar de proveedor de mapas se hace tocando
// solo aca. La semana 9 se escribio contra Google Maps Platform y migrar a Mapbox
// costo reescribir dos funciones de este archivo: nada afuera se entero.
//
// Igual que pago.service.js, este service NO recibe una conexion: no escribe en la
// base, solo habla con la API externa.
//
// Dos modos, segun MAPS_MODO en el .env:
//   mock -> no llama a Mapbox. Geocodifica con un hash deterministico alrededor de
//           un centro configurable y calcula la distancia con Haversine. Sirve para
//           probar y demostrar el flujo completo sin access token ni facturacion.
//   real -> Directions API v5 + Geocoding API v6.
//
// Por que Mapbox y no Google: Google no habilita ninguna de sus APIs hasta que el
// proyecto de Google Cloud tenga una cuenta de facturacion con tarjeta de credito
// real cargada, aunque despues el consumo entre en el free tier y no cobre nada.
// Mapbox entrega un access token funcional apenas te registras.
//
// OJO con el orden de las coordenadas: Mapbox usa {longitud},{latitud}, al reves que
// Google. La interfaz interna sigue hablando de { latitud, longitud }; el orden se da
// vuelta en el borde, en comoCoordenada() y al leer el GeoJSON de la geocodificacion.

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox';
const GEOCODING_URL = 'https://api.mapbox.com/search/geocode/v6/forward';

// Mismo timeout que pago.service.js
const TIMEOUT_MS = 5000;

const RADIO_TIERRA_KM = 6371;

// Grados de latitud por kilometro. Los de longitud ademas se achican por cos(lat).
const KM_POR_GRADO = 111.32;

const esModoMock = () => (process.env.MAPS_MODO || 'mock').toLowerCase() !== 'real';

const numeroDelEntorno = (nombre, porDefecto) => {
    const valor = Number(process.env[nombre]);
    return Number.isFinite(valor) ? valor : porDefecto;
};

const centroLat = () => numeroDelEntorno('MAPS_CENTRO_LAT', -31.6667);
const centroLng = () => numeroDelEntorno('MAPS_CENTRO_LNG', -60.7667);
const radioMockKm = () => numeroDelEntorno('MAPS_RADIO_MOCK_KM', 5);
const velocidadKmh = () => numeroDelEntorno('MAPS_VELOCIDAD_KMH', 25) || 25;
const factorRuta = () => numeroDelEntorno('MAPS_FACTOR_RUTA', 1.3);

// El token se resuelve la primera vez que se lo necesita y no al importar el modulo:
// asi el servidor arranca igual en modo mock aunque no haya nada configurado.
const obtenerAccessToken = () => {
    if (!process.env.MAPS_ACCESS_TOKEN) {
        throw new Error('Falta MAPS_ACCESS_TOKEN en el .env para usar MAPS_MODO=real');
    }

    return process.env.MAPS_ACCESS_TOKEN;
};

// Mapbox distingue geocodificacion "temporary" (el default) de "permanent". Temporary
// PROHIBE guardar las coordenadas en una base de datos, y este proyecto las guarda en
// clientes, comercios y pedidos. Para tener derecho a persistirlas hay que mandar
// permanent=true, que cuesta mas por request y exige una tarjeta cargada en la cuenta
// de Mapbox.
//
// Queda apagado por defecto para que la demo funcione sin tarjeta. El dia que esto se
// despliegue de verdad, hay que prenderlo.
const geocodificacionPermanente = () =>
    (process.env.MAPS_GEOCODING_PERMANENT || 'false').toLowerCase() === 'true';

// ---------------------------------------------------------------------------
// Calculo local (sin red)
// ---------------------------------------------------------------------------

const aRadianes = (grados) => grados * Math.PI / 180;

// Distancia en linea recta entre dos puntos sobre la superficie de la Tierra.
//
// Se exporta porque no es solo cosa del modo mock: tambien es el fallback del modo
// real cuando Mapbox no contesta.
const distanciaHaversineKm = (origen, destino) => {
    const dLat = aRadianes(destino.latitud - origen.latitud);
    const dLon = aRadianes(destino.longitud - origen.longitud);
    const lat1 = aRadianes(origen.latitud);
    const lat2 = aRadianes(destino.latitud);

    const h = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    // asin(min(1, sqrt(h))) y no atan2: evita un NaN por error de redondeo si h > 1
    return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

// Minutos de viaje para una distancia, a la velocidad promedio configurada.
const estimarMinutos = (distanciaKm) => Math.max(1, Math.ceil(distanciaKm / velocidadKmh() * 60));

const redondear2 = (numero) => Math.round(numero * 100) / 100;

// Las coordenadas se guardan en DECIMAL(10,7). MySQL redondearia solo, pero conviene
// que el valor que se devuelve en el JSON sea el mismo que quedo en la base.
const redondear7 = (numero) => Math.round(numero * 1e7) / 1e7;

// Arma una ruta sumando Haversine tramo por tramo, con el factor de callejero.
//
// Es lo que devuelve el modo mock y tambien a lo que degrada el modo real cuando
// Mapbox falla. origenDatos distingue un caso del otro.
const rutaLocal = (puntos, origenDatos) => {
    const tramos = [];

    for (let i = 0; i < puntos.length - 1; i++) {
        const distanciaKm = redondear2(distanciaHaversineKm(puntos[i], puntos[i + 1]) * factorRuta());
        tramos.push({ distanciaKm, duracionMinutos: estimarMinutos(distanciaKm) });
    }

    return {
        distanciaKm: redondear2(tramos.reduce((total, tramo) => total + tramo.distanciaKm, 0)),
        duracionMinutos: tramos.reduce((total, tramo) => total + tramo.duracionMinutos, 0),
        polilinea: null,
        tramos,
        origenDatos
    };
};

// ---------------------------------------------------------------------------
// Modo mock
// ---------------------------------------------------------------------------

// FNV-1a de 32 bits. No es criptografico ni tiene que serlo: lo unico que importa
// es que la misma direccion de siempre el mismo numero.
const hash = (texto) => {
    let h = 2166136261;

    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }

    return h >>> 0;
};

// Pseudo-geocodificador deterministico: reparte las direcciones en coordenadas
// polares alrededor del centro configurado, con angulo y radio sacados del hash.
//
// Deterministico a proposito: la misma direccion cae SIEMPRE en el mismo punto, asi
// las distancias y los ETAs no bailan entre corridas y la guia de Postman puede
// esperar numeros concretos. Si devolviera null, las coordenadas quedarian en NULL y
// la demo mostraria siempre la distancia de fallback, que es justo lo que no
// queremos poder mostrar.
const geocodificarMock = (direccion) => {
    const semilla = hash(direccion.trim().toLowerCase());

    const angulo = (semilla % 360) * Math.PI / 180;
    const radioKm = ((semilla >>> 9) % 1000) / 1000 * radioMockKm();

    const latitud = centroLat() + (radioKm * Math.cos(angulo)) / KM_POR_GRADO;
    const longitud = centroLng() +
        (radioKm * Math.sin(angulo)) / (KM_POR_GRADO * Math.cos(aRadianes(centroLat())));

    return { latitud: redondear7(latitud), longitud: redondear7(longitud), origenDatos: 'mock' };
};

// ---------------------------------------------------------------------------
// Modo real
// ---------------------------------------------------------------------------

// El ENUM repartidores.tipo_vehiculo mapeado a los perfiles de Mapbox.
//
// No hay perfil de moto: van por driving-traffic igual que los autos. Es una perdida
// menor frente al TWO_WHEELER que tenia Google, y a cambio desaparece la restriccion
// de routingPreference que obligaba a tratar la bicicleta como un caso aparte.
//
// driving-traffic cae solo a driving en las zonas donde Mapbox no tiene datos de
// trafico, sin devolver error.
const perfilDeRuta = (vehiculo) => (vehiculo === 'bicicleta' ? 'cycling' : 'driving-traffic');

// ACA se da vuelta el orden. Mapbox espera {longitud},{latitud} en el path.
const comoCoordenada = (punto) => `${punto.longitud},${punto.latitud}`;

const metrosAKm = (metros) => redondear2((Number(metros) || 0) / 1000);

// Segundos -> minutos, siempre para arriba y nunca menos de 1: un ETA de "0 minutos"
// no le sirve a nadie.
const aMinutos = (segundos) => Math.max(1, Math.ceil((Number(segundos) || 0) / 60));

const pedirRutaAMapbox = async ({ origen, destino, paradas, vehiculo }) => {
    // Las paradas no se reordenan a proposito. El comercio tiene que venir antes que
    // el cliente porque no se puede entregar antes de retirar: "ruta optimizada" en
    // CU21 es el mejor camino segun el trafico, no cambiar el orden de las paradas.
    // Mapbox respeta el orden del path salvo que se use el servicio de Optimization,
    // que es otro endpoint y no es el que queremos.
    const coordenadas = [origen, ...paradas, destino].map(comoCoordenada).join(';');

    const parametros = new URLSearchParams({
        geometries: 'polyline',
        overview: 'full',
        alternatives: 'false',
        language: 'es',
        access_token: obtenerAccessToken()
    });

    const respuesta = await fetch(
        `${DIRECTIONS_URL}/${perfilDeRuta(vehiculo)}/${coordenadas}?${parametros}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );

    const cuerpo = await respuesta.json();

    // code trae el estado de la API aunque el HTTP sea 200: 'Ok', 'NoRoute',
    // 'InvalidInput', 'ProfileNotFound'. Un 'NoRoute' significa que no hay camino
    // posible entre esos puntos (por ejemplo, separados por agua sin puente).
    if (!respuesta.ok || cuerpo.code !== 'Ok') {
        throw new Error(`Directions API ${cuerpo?.code || respuesta.status}: ${cuerpo?.message || 'sin detalle'}`);
    }

    const ruta = cuerpo.routes?.[0];

    if (!ruta) {
        throw new Error('Directions API no devolvio ninguna ruta para esos puntos');
    }

    // distance viene en metros y duration en segundos, los dos como numeros.
    //
    // legs trae un tramo por cada par de puntos consecutivos, igual que Google, asi
    // que pedido.controller.js los sigue etiquetando comercio y cliente sin cambios.
    return {
        distanciaKm: metrosAKm(ruta.distance),
        duracionMinutos: aMinutos(ruta.duration),
        // Con geometries=polyline es el mismo formato de polilinea codificada que
        // devolvia Google (precision 5), asi que el campo no cambia de forma.
        polilinea: ruta.geometry ?? null,
        tramos: (ruta.legs ?? []).map((tramo) => ({
            distanciaKm: metrosAKm(tramo.distance),
            duracionMinutos: aMinutos(tramo.duration)
        })),
        origenDatos: 'mapbox'
    };
};

// ---------------------------------------------------------------------------
// Interfaz publica
// ---------------------------------------------------------------------------

// Convierte una direccion de texto en { latitud, longitud, origenDatos }.
//
// Devuelve null si no se pudo ubicar, por el motivo que sea: la direccion no existe,
// Mapbox no contesto, expiro el timeout o falta el access token. NUNCA tira. Quien
// llama guarda NULL y sigue, porque nadie se tiene que quedar sin poder registrarse ni
// sin poder hacer un pedido porque un tercero se cayo.
const geocodificarDireccion = async (direccion) => {
    if (typeof direccion !== 'string' || !direccion.trim()) {
        return null;
    }

    if (esModoMock()) {
        return geocodificarMock(direccion);
    }

    try {
        const parametros = new URLSearchParams({
            q: direccion.trim(),
            // "San Martin 1234" existe en cada ciudad del pais: acotar a Argentina es
            // precision gratis.
            country: 'ar',
            limit: '1',
            language: 'es',
            access_token: obtenerAccessToken()
        });

        if (geocodificacionPermanente()) {
            parametros.set('permanent', 'true');
        }

        const respuesta = await fetch(`${GEOCODING_URL}?${parametros}`, {
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });

        const cuerpo = await respuesta.json();

        if (!respuesta.ok) {
            // Este console.error NO es opcional: ningun controller del proyecto
            // loguea y el handler de errores de app.js nunca se alcanza. Sin esto,
            // un token vencido deja coordenadas en NULL para siempre y nadie se
            // entera nunca de por que.
            console.error('[maps] Geocoding API', respuesta.status, cuerpo?.message || '');
            return null;
        }

        // La respuesta es GeoJSON. Sin resultados, features viene vacio: no es un
        // error, la direccion simplemente no existe.
        const rasgo = cuerpo.features?.[0];

        if (!rasgo) {
            return null;
        }

        // GeoJSON manda coordinates como [longitud, latitud], en ese orden.
        const [longitud, latitud] = rasgo.geometry.coordinates;

        return {
            latitud: redondear7(latitud),
            longitud: redondear7(longitud),
            origenDatos: 'mapbox'
        };

    } catch (error) {
        console.error('[maps] No se pudo geocodificar:', error.message);
        return null;
    }
};

// Calcula la ruta origen -> paradas -> destino.
//
// Devuelve { distanciaKm, duracionMinutos, polilinea, tramos, origenDatos }, donde
// tramos sigue el mismo orden que [...paradas, destino] y origenDatos vale 'mapbox',
// 'mock' o 'estimado'.
//
// NUNCA tira por culpa de Mapbox ni del .env: si la red falla, expira el timeout, la
// API devuelve un error, no hay ruta posible o falta el access token, degrada a
// Haversine sobre los mismos puntos y marca origenDatos: 'estimado'. Tira solo por
// error de programacion: que no le pasen origen o destino.
//
// La degradacion vive aca y no en cada controller a proposito: todos los que llaman
// quieren exactamente el mismo comportamiento, y duplicar el try/catch adentro de un
// for en carrito.controller.js y otra vez en pedido.controller.js es justo lo que un
// adaptador existe para evitar. Nunca es silenciosa: origenDatos viaja hasta el JSON
// de la respuesta.
const calcularRuta = async ({ origen, destino, paradas = [], vehiculo = null }) => {
    if (!origen || !destino) {
        throw new Error('calcularRuta necesita origen y destino');
    }

    const puntos = [origen, ...paradas, destino];

    if (esModoMock()) {
        return rutaLocal(puntos, 'mock');
    }

    try {
        return await pedirRutaAMapbox({ origen, destino, paradas, vehiculo });
    } catch (error) {
        console.error('[maps] Directions API fallo, se estima la ruta localmente:', error.message);
        return rutaLocal(puntos, 'estimado');
    }
};

module.exports = {
    esModoMock,
    geocodificarDireccion,
    calcularRuta,
    distanciaHaversineKm,
    estimarMinutos
};
