require("dotenv").config();

const express                 = require("express");
const morgan                  = require("morgan");
const cors                    = require("cors");
const registroRoutes          = require("./routes/registro.routes");
const registroComercioRoutes        = require("./routes/registroComercio.routes");
const comercioRoutes          = require("./routes/comercio.routes");
const productoRoutes          = require("./routes/producto.routes");

const app = express();

app.set("port", process.env.PORT || 4000);

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
const pool = require("./database/database");

app.use("/api", registroRoutes);
app.use("/api", registroComercioRoutes);
app.use("/api", comercioRoutes);
app.use("/api", productoRoutes);
app.get("/health", (req, res) => {
  res.json({ codigo: 200, estado: "ok", datos: { mensaje: "Servidor activo" } });
});

app.use((req, res) => {
  res.status(404).json({ codigo: 404, estado: "Ruta no encontrada", datos: null });
});

// Manejador de errores centralizado
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    codigo: 500,
    estado: "error",
    datos: { mensaje: "Error interno del servidor" }
  });
});

module.exports = app;