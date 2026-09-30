const express = require('express');
const router = express.Router();
const {
    listarMisPedidos,
    obtenerMiPedido,
    repetirPedido,
    cancelarMiPedido
} = require('../controllers/pedidoCliente.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverCliente } = require('../middlewares/cliente.middleware');

// Cadena de middlewares: token valido -> rol cliente -> req.clienteId resuelto contra
// la base. Misma forma que en pago.routes.js y seguimiento.routes.js, los otros
// routers del lado cliente, y en plural (/pedidos/...) como ellos.
const soloCliente = [verificarToken, verificarRol('cliente'), resolverCliente];

// CU09 - Historial de pedidos del cliente y detalle de uno (semana 12)
router.get('/pedidos', soloCliente, listarMisPedidos);
router.get('/pedidos/:id', soloCliente, obtenerMiPedido);

// CU10 - Repetir un pedido: vuelve a cargar sus productos en el carrito (semana 12)
router.post('/pedidos/:id/repetir', soloCliente, repetirPedido);

// Cancelar un pedido que todavia no se pago (semana 7)
router.patch('/pedidos/:id/cancelar', soloCliente, cancelarMiPedido);

module.exports = router;
