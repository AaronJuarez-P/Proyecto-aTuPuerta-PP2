const express = require('express');
const router = express.Router();
const {
    listarPedidos,
    asignarPedido,
    entregaPedido,
    rutaPedido
} = require('../controllers/pedido.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverRepartidor } = require('../middlewares/repartidor.middleware');

// Cadena de middlewares: token valido -> rol repartidor -> req.repartidorId resuelto
// contra la base
const soloRepartidor = [verificarToken, verificarRol('repartidor'), resolverRepartidor];

// CU19 - Ver pedidos disponibles para repartir
router.get('/pedido/listar', soloRepartidor, listarPedidos);

// CU20 - Aceptar un pedido y confirmar su entrega con el codigo del cliente
router.patch('/pedido/asignar/:idPedido', soloRepartidor, asignarPedido);
router.patch('/pedido/entrega/:idPedido', soloRepartidor, entregaPedido);

// CU21 - Ver la ruta optimizada hacia el destino, con el ETA (semana 9)
router.get('/pedido/ruta/:idPedido', soloRepartidor, rutaPedido);

module.exports = router;
