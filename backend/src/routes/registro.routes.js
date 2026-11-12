const express = require('express');
const router = express.Router();
const { registro, verificarRegistro, reenviarCodigo, inicioSesion } = require('../controllers/registro.controller');
const { limitadorAutenticacion, limitadorEnvioCodigos } = require('../middlewares/limites.middleware');

// Con limite de intentos fallidos (semana 14): son las puertas por donde se prueba
// una contraseña tras otra
//
// Verificacion del correo: /registro y /registro/reenviar mandan un codigo, asi que
// ademas llevan el limite de envios. /registro/verificar es donde se prueban los
// codigos: cada codigo incorrecto cuenta como intento fallido.
router.post('/registro', limitadorAutenticacion, limitadorEnvioCodigos, registro);
router.post('/registro/verificar', limitadorAutenticacion, verificarRegistro);
router.post('/registro/reenviar', limitadorAutenticacion, limitadorEnvioCodigos, reenviarCodigo);
router.post('/inicioSesion', limitadorAutenticacion, inicioSesion);

module.exports = router;
