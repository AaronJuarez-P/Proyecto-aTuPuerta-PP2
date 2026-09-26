const http = require("http");
const app = require("./app");
const { inicializarTiempoReal } = require("./services/tiemporeal.service");

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
