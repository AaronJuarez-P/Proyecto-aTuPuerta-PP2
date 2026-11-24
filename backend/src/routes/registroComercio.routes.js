const express = require('express');
const router = express.Router();
const {
    registroComercio,
    iniciarSesionComercio,
    cerrarSesionComercio
} = require('../controllers/registroComercio.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { limitadorAutenticacion } = require('../middlewares/limites.middleware');
const { recibirImagen } = require('../middlewares/imagen.middleware');

// El registro tambien lleva el limitador: compara la contraseña de una cuenta que ya
// existe, asi que sin limite serviria para adivinarla igual que el login.
//
// El logo es opcional: si el formulario viene como multipart/form-data, va en el campo
// imagen. Con JSON se registra igual que siempre, sin logo.
router.post('/registroComercio', limitadorAutenticacion, recibirImagen, registroComercio);
router.post('/inicioSesionComercio', limitadorAutenticacion, iniciarSesionComercio);
router.post('/cerrarSesionComercio', verificarToken, verificarRol('comercio', 'administrador'), cerrarSesionComercio);

module.exports = router;
