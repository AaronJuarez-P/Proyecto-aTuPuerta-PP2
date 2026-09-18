const express = require('express');
const router = express.Router();
const {
    iniciarPago,
    recibirWebhook,
    consultarPagoPedido,
    simularPago,
    retornoPago
} = require('../controllers/pago.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');

// El pago siempre lo inicia el cliente dueño del pedido, que se resuelve por
// req.usuario.id contra la tabla clientes.
const soloCliente = [verificarToken, verificarRol('cliente')];

// CU07 - Realizar pago
router.post('/pedidos/:id/pagar', soloCliente, iniciarPago);

// Consultar como salio el pago. Hace falta porque el webhook es asincronico.
router.get('/pedidos/:id/pago', soloCliente, consultarPagoPedido);

// Webhook de MercadoPago. Publico a proposito: MercadoPago no tiene nuestro JWT y no
// puede pasar por verificarToken, asi que lo autentica la firma x-signature.
router.post('/pagos/webhook', recibirWebhook);

// A donde vuelve el navegador despues de pagar (back_urls de la preferencia)
router.get('/pagos/retorno', retornoPago);

// Simulador para probar aprobado y rechazado sin ngrok. Solo responde con MP_MODO=mock.
router.post('/pagos/simular', soloCliente, simularPago);

module.exports = router;
