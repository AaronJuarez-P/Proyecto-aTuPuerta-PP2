const express = require('express');
const router = express.Router();
const {
    listarNotificaciones,
    marcarLeida,
    marcarTodasLeidas
} = require('../controllers/notificacion.controller');
const { verificarToken } = require('../middlewares/autenticacion.middleware');

// Cualquier usuario logueado ve sus propias notificaciones y las generales de su rol,
// sin importar cual sea (semana 11, CU27)
router.get('/notificaciones', verificarToken, listarNotificaciones);

// Marcar como leidas: una o todas
router.patch('/notificaciones/leidas', verificarToken, marcarTodasLeidas);
router.patch('/notificaciones/:id/leida', verificarToken, marcarLeida);

module.exports = router;
