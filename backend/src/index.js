require("dotenv").config();

// Semana 14: si falta algo imprescindible, el servidor no arranca y dice que falta.
// Antes arrancaba igual y fallaba despues: sin JWT_SECRET, cada login contestaba un 500
// ("secretOrPrivateKey must have a value") sin ninguna pista en la respuesta.
const faltantes = [];

if (!process.env.JWT_SECRET) {
  faltantes.push("JWT_SECRET");
}

if (!(process.env.DB_NAME || process.env.DATABASE)) {
  faltantes.push("DB_NAME (o DATABASE)");
}

if (faltantes.length > 0) {
  console.error(`Faltan variables de entorno: ${faltantes.join(", ")}. Copiá .env.example a .env y completalas.`);
  process.exit(1);
}

const http = require("http");
const app = require("./app");
const { inicializarTiempoReal } = require("./services/tiemporeal.service");

// Una promesa rechazada que nadie atrapa voltea el proceso de Node. Todas las emisiones
// y pushes ya llevan su .catch, pero si se escapa una, que quede en el log con su causa
// en vez de tirar la API entera.
process.on("unhandledRejection", (motivo) => {
  console.error("Promesa rechazada sin manejar:", motivo);
});

// app.js sigue exportando solo el app de Express: el servidor HTTP se arma aca para que
// Socket.IO pueda colgarse del MISMO puerto que la API.
//
// Por que no app.listen(): app.listen crea su propio servidor HTTP por adentro y no lo
// devuelve de una forma a la que Socket.IO se pueda enganchar. Y separar el socket en
// otro puerto le daria al front dos origenes para configurar y dos cosas para romper.
const servidor = http.createServer(app);

inicializarTiempoReal(servidor);

servidor.listen(app.get("port"), () => {
  console.log(`Servidor corriendo en puerto ${app.get("port")}`);
});
