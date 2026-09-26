const express = require("express");
const router = express.Router();
const { suscribir } = require("../controllers/notificaciones.controller");
const { verificarToken } = require("../middlewares/autenticacion.middleware");

router.post("/notificaciones/suscribir", verificarToken, suscribir);

module.exports = router;
