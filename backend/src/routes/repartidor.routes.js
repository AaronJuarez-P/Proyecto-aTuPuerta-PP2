const express = require('express');
const router = express.Router();
const {
    consultarDisponibilidad,
    cambiarDisponibilidad,
    registrarUbicacionRepartidor,
    obtenerPerfilRepartidor,
    actualizarPerfilRepartidor
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

// CU18 - Perfil del repartidor: vehiculo, patente y licencia (semana 3)
router.get('/repartidor/perfil', soloRepartidor, obtenerPerfilRepartidor);
router.patch('/repartidor/perfil', soloRepartidor, actualizarPerfilRepartidor);

module.exports = router;
