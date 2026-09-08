const express = require('express');
const router = express.Router();
const {
    registroRepartidor,
    iniciarSesionRepartidor,
    cerrarSesionRepartidor
} = require('../controllers/registroRepartidor.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');

router.post('/registroRepartidor', registroRepartidor);
router.post('/inicioSesionRepartidor', iniciarSesionRepartidor);
router.post('/cerrarSesionRepartidor', verificarToken, verificarRol('repartidor', 'administrador'), cerrarSesionRepartidor);

module.exports = router;
