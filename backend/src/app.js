require("dotenv").config();

const express                 = require("express");
const morgan                  = require("morgan");
const cors                    = require("cors");
const registroRoutes          = require("./routes/registro.routes");

const app = express();

app.set("port", process.env.PORT || 4000);

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
const pool = require("./database/database");

app.use("/api", registroRoutes);

app.get("/health", (req, res) => {
  res.json({ codigo: 200, estado: "ok", datos: { mensaje: "Servidor activo" } });
});

app.use((req, res) => {
  res.status(404).json({ codigo: 404, estado: "Ruta no encontrada", datos: null });
});

module.exports = app;
