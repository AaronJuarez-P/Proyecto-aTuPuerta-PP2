const express = require('express');
const router = express.Router();
const {
    crearReclamo,
    listarMisReclamos,
    obtenerMiReclamo,
    listarReclamosAdmin,
    obtenerReclamoAdmin,
    asignarReclamo,
    resolverReclamo
} = require('../controllers/reclamo.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverAdministrador } = require('../middlewares/administrador.middleware');

// Reclaman los que participan de un pedido: cliente, comercio y repartidor. El
// administrador los atiende, no los crea.
const soloUsuario = [verificarToken, verificarRol('cliente', 'comercio', 'repartidor')];
const soloAdministrador = [verificarToken, verificarRol('administrador'), resolverAdministrador];

// CU25 - Lado usuario
router.post('/reclamos', soloUsuario, crearReclamo);
router.get('/reclamos', soloUsuario, listarMisReclamos);
router.get('/reclamos/:id', soloUsuario, obtenerMiReclamo);

// CU25 - Lado administrador
router.get('/admin/reclamos', soloAdministrador, listarReclamosAdmin);
router.get('/admin/reclamos/:id', soloAdministrador, obtenerReclamoAdmin);
router.patch('/admin/reclamos/:id/asignar', soloAdministrador, asignarReclamo);
router.patch('/admin/reclamos/:id/resolver', soloAdministrador, resolverReclamo);

module.exports = router;
