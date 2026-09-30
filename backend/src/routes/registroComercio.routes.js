const express = require('express');
const router = express.Router();
const {
    registroComercio,
    iniciarSesionComercio,
    cerrarSesionComercio
} = require('../controllers/registroComercio.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { limitadorAutenticacion } = require('../middlewares/limites.middleware');

// El registro tambien lleva el limitador: compara la contraseña de una cuenta que ya
// existe, asi que sin limite serviria para adivinarla igual que el login
router.post('/registroComercio', limitadorAutenticacion, registroComercio);
router.post('/inicioSesionComercio', limitadorAutenticacion, iniciarSesionComercio);
router.post('/cerrarSesionComercio', verificarToken, verificarRol('comercio', 'administrador'), cerrarSesionComercio);

module.exports = router;
