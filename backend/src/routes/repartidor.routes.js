const express = require('express');
const router = express.Router();
const {
    consultarDisponibilidad,
    cambiarDisponibilidad,
    registrarUbicacionRepartidor
} = require('../controllers/repartidor.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverRepartidor } = require('../middlewares/repartidor.middleware');

// Cadena de middlewares: token valido -> rol repartidor -> req.repartidorId resuelto
// contra la base
const soloRepartidor = [verificarToken, verificarRol('repartidor'), resolverRepartidor];

// Disponibilidad del repartidor: si puede tomar pedidos nuevos (semana 8)
router.get('/repartidor/disponibilidad', soloRepartidor, consultarDisponibilidad);
router.patch('/repartidor/disponibilidad', soloRepartidor, cambiarDisponibilidad);

// CU21 - Registrar la posicion actual del repartidor (semana 9)
router.post('/repartidor/ubicacion', soloRepartidor, registrarUbicacionRepartidor);

module.exports = router;
