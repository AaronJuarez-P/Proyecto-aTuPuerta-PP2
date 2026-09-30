const express = require('express');
const router = express.Router();
const {
    obtenerPerfil,
    actualizarPerfil,
    cambiarContrasena,
    darDeBajaPerfil
} = require('../controllers/perfil.controller');
const { verificarToken } = require('../middlewares/autenticacion.middleware');
const { limitadorAutenticacion } = require('../middlewares/limites.middleware');

// CU11 - Perfil propio (semana 3). Cualquier rol: la cuenta es la misma para todos y
// el usuario sale siempre del token, nunca de la ruta.
router.get('/perfil', verificarToken, obtenerPerfil);
router.patch('/perfil', verificarToken, actualizarPerfil);

// Estas dos verifican la contraseña actual, asi que llevan el limitador de intentos
// fallidos. Va despues de verificarToken para que solo cuenten los intentos de una
// sesion valida y no cualquier request sin token.
router.patch('/perfil/contrasena', verificarToken, limitadorAutenticacion, cambiarContrasena);
router.delete('/perfil', verificarToken, limitadorAutenticacion, darDeBajaPerfil);

module.exports = router;
