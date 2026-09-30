const express = require('express');
const router = express.Router();
const { registro, inicioSesion } = require('../controllers/registro.controller');
const { limitadorAutenticacion } = require('../middlewares/limites.middleware');

// Con limite de intentos fallidos (semana 14): son las puertas por donde se prueba
// una contraseña tras otra
router.post('/registro', limitadorAutenticacion, registro);
router.post('/inicioSesion', limitadorAutenticacion, inicioSesion);

module.exports = router;
