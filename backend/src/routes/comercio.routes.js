const express = require('express');
const router = express.Router();
const {
    listarComercios,
    obtenerComercio,
    listarProductosDeComercio,
    subirPedido
} = require('../controllers/comercio.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverComercio } = require('../middlewares/comercio.middleware');

// CU03 - Explorar comercios. Son publicos: el catalogo se puede mirar sin cuenta
router.get('/comercios', listarComercios);
router.get('/comercios/:id', obtenerComercio);
router.get('/comercios/:id/productos', listarProductosDeComercio);

// El comercio confirma que un pedido propio fue preparado.
router.patch(
    '/comercios/pedidos/:id/subir',
    verificarToken,
    verificarRol('comercio'),
    resolverComercio,
    subirPedido
);

module.exports = router;
