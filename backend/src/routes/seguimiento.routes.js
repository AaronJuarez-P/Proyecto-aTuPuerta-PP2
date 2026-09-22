const express = require('express');
const router = express.Router();
const { seguimientoPedido } = require('../controllers/seguimiento.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverCliente } = require('../middlewares/cliente.middleware');

// Cadena de middlewares: token valido -> rol cliente -> req.clienteId resuelto contra
// la base. Misma forma que soloRepartidor en pedido.routes.js.
const soloCliente = [verificarToken, verificarRol('cliente'), resolverCliente];

// CU08 - El cliente sigue su pedido: estado, ubicacion del repartidor, ETA y ruta
//
// Router propio y no dentro de pedido.routes.js: ese archivo declara soloRepartidor a
// nivel de modulo y todo pedido.controller.js es del lado repartidor. Mezclar el lado
// cliente ahi volveria ambiguo de quien es cada endpoint del archivo.
//
// Va en plural, /pedidos/:id/..., igual que pago.routes.js, que es el otro router del
// lado cliente. El singular verb-first (/pedido/ruta/:idPedido) es la forma que quedo
// del lado repartidor.
router.get('/pedidos/:id/seguimiento', soloCliente, seguimientoPedido);

module.exports = router;
