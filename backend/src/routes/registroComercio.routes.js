const express = require('express');
const router = express.Router();
const { registroComercio, iniciarSesionComercio } = require('../controllers/registroComercio.controller');

router.post('/registroComercio', registroComercio);
router.post('/inicioSesionComercio', iniciarSesionComercio);
 
module.exports = router;