const express = require('express');
const router = express.Router();
const {
    registroRepartidor,
    iniciarSesionRepartidor,
    cerrarSesionRepartidor
} = require('../controllers/registroRepartidor.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { limitadorAutenticacion } = require('../middlewares/limites.middleware');

// El registro tambien lleva el limitador: compara la contraseña de una cuenta que ya
// existe, asi que sin limite serviria para adivinarla igual que el login
router.post('/registroRepartidor', limitadorAutenticacion, registroRepartidor);
router.post('/inicioSesionRepartidor', limitadorAutenticacion, iniciarSesionRepartidor);
router.post('/cerrarSesionRepartidor', verificarToken, verificarRol('repartidor', 'administrador'), cerrarSesionRepartidor);

module.exports = router;
