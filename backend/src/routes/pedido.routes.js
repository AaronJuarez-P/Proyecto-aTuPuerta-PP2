const express = require('express');
const router = express.Router();

const {
    listarPedidos,
    asignarPedido,
    entregaPedido
} = require ("../controllers/pedido.controller");

const { verificarToken } = require('../middlewares/autenticacion.middleware');

router.get('/pedido/listar', verificarToken, listarPedidos);
router.patch('/pedido/asignar/:idPedido', verificarToken, asignarPedido);
router.patch('/pedido/entrega/:idPedido', verificarToken, entregaPedido);

module.exports = router;