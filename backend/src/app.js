require("dotenv").config();

const express                 = require("express");
const morgan                  = require("morgan");
const cors                    = require("cors");
const helmet                  = require("helmet");
const pool                    = require("./database/database");
const { limitadorGeneral }    = require("./middlewares/limites.middleware");
const registroRoutes          = require("./routes/registro.routes");
const registroComercioRoutes  = require("./routes/registroComercio.routes");
const registroRepartidorRoutes= require("./routes/registroRepartidor.routes");
const comercioRoutes          = require("./routes/comercio.routes");
const productoRoutes          = require("./routes/producto.routes");
const carritoRoutes           = require("./routes/carrito.routes");
const pagoRoutes              = require("./routes/pago.routes");
const pedidoRoutes            = require("./routes/pedido.routes");
const repartidorRoutes        = require("./routes/repartidor.routes");
const notificacionRoutes      = require("./routes/notificacion.routes");
const seguimientoRoutes       = require("./routes/seguimiento.routes");
const notificacionesRoutes    = require("./routes/notificaciones.routes");
const perfilRoutes            = require("./routes/perfil.routes");
const pedidoClienteRoutes     = require("./routes/pedidoCliente.routes");
const administradorRoutes     = require("./routes/administrador.routes");
const reclamoRoutes           = require("./routes/reclamo.routes");

const app = express();

app.set("port", process.env.PORT || 4000);

// Detras de un proxy (ngrok para el webhook de MercadoPago, o un despliegue real) la IP
// del cliente viaja en X-Forwarded-For. Sin esto el limitador veria a todos con la IP
// del proxy y los contaria como uno solo. En local no hay proxy y queda apagado.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// ---------------------------------------------------------------------------
// Seguridad (semana 14)
// ---------------------------------------------------------------------------

// Cabeceras de seguridad: nosniff, frameguard, HSTS, sin X-Powered-By, etc.
app.use(helmet());

// Origenes que pueden llamar a la API desde un navegador, separados por coma. Sin
// definir se permite cualquiera, que es lo comodo en desarrollo pero no lo que tiene
// que quedar en un despliegue: por eso se avisa al arrancar.
const origenesPermitidos = (process.env.CORS_ORIGEN || "")
  .split(",")
  .map((origen) => origen.trim())
  .filter(Boolean);

if (origenesPermitidos.length === 0 || origenesPermitidos.includes("*")) {
  console.warn("CORS abierto a cualquier origen. Definí CORS_ORIGEN en el .env para restringirlo.");
  app.use(cors());
} else {
  app.use(cors({ origin: origenesPermitidos }));
}

app.use(morgan("dev"));

// 100 kb alcanza de sobra para cualquier body de esta API; el tope esta explicito para
// que un JSON gigante se corte con 413 antes de llegar a los controladores
app.use(express.json({ limit: "100kb" }));

// Diagnostico (semana 1). Ahora tambien dice si la base responde: "el servidor esta
// arriba" no sirve de mucho si MySQL esta apagado.
app.get("/health", async (req, res) => {
  let baseDeDatos = "ok";

  try {
    await pool.query("SELECT 1");
  } catch (error) {
    baseDeDatos = "error";
  }

  const codigo = baseDeDatos === "ok" ? 200 : 503;

  res.status(codigo).json({
    codigo,
    estado: baseDeDatos === "ok" ? "exito" : "error",
    datos: {
      mensaje: baseDeDatos === "ok" ? "Servidor activo" : "Servidor activo, pero la base de datos no responde",
      base_de_datos: baseDeDatos
    }
  });
});

app.use("/api", limitadorGeneral);

app.use("/api", registroRoutes);
app.use("/api", registroComercioRoutes);
app.use("/api", registroRepartidorRoutes);
app.use("/api", administradorRoutes);
app.use("/api", comercioRoutes);
app.use("/api", productoRoutes);
app.use("/api", carritoRoutes);
app.use("/api", pagoRoutes);
app.use("/api", pedidoRoutes);
app.use("/api", pedidoClienteRoutes);
app.use("/api", repartidorRoutes);
app.use("/api", notificacionRoutes);
app.use("/api", seguimientoRoutes);
app.use("/api", notificacionesRoutes);
app.use("/api", perfilRoutes);
app.use("/api", reclamoRoutes);

app.use((req, res) => {
  res.status(404).json({
    codigo: 404,
    estado: "error",
    datos: { mensaje: "Ruta no encontrada" }
  });
});

// Manejador de errores centralizado (semana 14). Los controladores atrapan sus propios
// errores; lo que llega aca es lo que falla ANTES de llegar a ellos, sobre todo el
// parser del body. Antes todo salia como 500, y un JSON mal escrito no es un error
// del servidor.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      codigo: 400,
      estado: "error",
      datos: { mensaje: "El cuerpo de la petición no es un JSON válido" }
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      codigo: 413,
      estado: "error",
      datos: { mensaje: "El cuerpo de la petición es demasiado grande" }
    });
  }

  console.error(err);
  res.status(500).json({
    codigo: 500,
    estado: "error",
    datos: { mensaje: "Error interno del servidor" }
  });
});

module.exports = app;
