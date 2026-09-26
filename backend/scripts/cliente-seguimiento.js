// Cliente de prueba del canal de tiempo real (semana 10, CU08, CU26).
//
//   node scripts/cliente-seguimiento.js <token> <pedidoId>
//
// Hace de front mientras el front no existe: se conecta al socket con el token de un
// cliente (o del repartidor asignado), se suscribe a un pedido y va imprimiendo lo que
// llega. Se deja corriendo en una terminal aparte mientras se prueba el flujo con
// Postman en otra.
//
// Es un script de prueba manual, no un test automatizado: no afirma nada ni devuelve
// un exit code distinto de cero. Lo que valida es que un humano mire la salida.

const { io } = require("socket.io-client");

const [, , token, pedidoIdCrudo] = process.argv;

if (!token || !pedidoIdCrudo) {
    console.error("Uso: node scripts/cliente-seguimiento.js <token> <pedidoId>");
    process.exit(1);
}

const pedidoId = Number(pedidoIdCrudo);
const URL = process.env.URL_SOCKET || "http://localhost:4000";

const hora = () => new Date().toLocaleTimeString("es-AR");

// El token va por auth del handshake, no por query string ni por header: el header no
// se puede mandar en el handshake de websocket desde el navegador, y la query string
// deja el token escrito en los logs del servidor.
const socket = io(URL, { auth: { token } });

// Se suscribe en CADA connect, no solo en el primero.
//
// Socket.IO reconecta solo cuando se cae la red o se reinicia el servidor, pero NO
// vuelve a entrar a las salas: eso es estado del servidor y el servidor lo perdio. Si
// el front se suscribiera una sola vez, despues de la primera reconexion quedaria
// "conectado" y mudo para siempre, que es el bug mas facil de escribir con esta
// libreria y el mas dificil de encontrar mirando la pantalla.
socket.on("connect", () => {
    console.log(`[${hora()}] conectado (${socket.id})`);

    socket.emit("seguir_pedido", { pedidoId }, (respuesta) => {
        console.log(`[${hora()}] seguir_pedido ->`, JSON.stringify(respuesta, null, 2));

        if (respuesta?.estado !== "exito") {
            socket.close();
        }
    });
});

socket.on("connect_error", (error) => {
    console.error(`[${hora()}] connect_error: ${error.message} (codigo ${error.data?.codigo ?? "?"})`);
});

socket.on("disconnect", (motivo) => {
    console.log(`[${hora()}] desconectado: ${motivo}`);
});

socket.on("ubicacion_actualizada", (evento) => {
    const { ubicacion, eta, ruta } = evento;

    console.log(
        `[${hora()}] UBICACION #${ubicacion.id}  ${ubicacion.latitud}, ${ubicacion.longitud}` +
        `  |  ETA ${eta?.minutos ?? "?"} min (${eta?.origen_datos ?? "-"})` +
        `  |  ruta ${ruta ? `refrescada, ${ruta.distancia_km} km` : "sin cambios"}`
    );
});

socket.on("estado_actualizado", (evento) => {
    console.log(
        `[${hora()}] ESTADO -> ${evento.estado}` +
        `  |  seguimiento_activo: ${evento.seguimiento_activo}` +
        `  |  ${evento.mensaje}`
    );
});

console.log(`Siguiendo el pedido ${pedidoId} en ${URL}. Ctrl+C para salir.`);
