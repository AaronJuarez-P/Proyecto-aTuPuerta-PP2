const express = require("express");
const router = express.Router();
const { suscribir, obtenerClavePublica } = require("../controllers/notificaciones.controller");
const { verificarToken } = require("../middlewares/autenticacion.middleware");

// Web Push (semana 11). La clave publica es publica a proposito: el front la necesita
// para suscribirse, antes de saber quien es el usuario.
router.get("/notificaciones/clave-publica", obtenerClavePublica);
router.post("/notificaciones/suscribir", verificarToken, suscribir);

module.exports = router;
