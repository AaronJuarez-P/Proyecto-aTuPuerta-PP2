const express = require('express');
const router = express.Router();
const {
    registroComercio,
    iniciarSesionComercio,
    cerrarSesionComercio
} = require('../controllers/registroComercio.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');

router.post('/registroComercio', registroComercio);
router.post('/inicioSesionComercio', iniciarSesionComercio);
router.post('/cerrarSesionComercio', verificarToken, verificarRol('comercio', 'administrador'), cerrarSesionComercio);
 
module.exports = router;