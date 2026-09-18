const express = require('express');
const router = express.Router();
const { listarNotificaciones } = require('../controllers/notificacion.controller');
const { verificarToken } = require('../middlewares/autenticacion.middleware');

// Cualquier usuario logueado ve sus propias notificaciones, sin importar el rol
router.get('/notificaciones', verificarToken, listarNotificaciones);

module.exports = router;
