const express = require('express');
const router = express.Router();
const {
    listarComercios,
    obtenerComercio,
    listarProductosDeComercio,
    subirPedido,
    obtenerPerfilComercio,
    actualizarPerfilComercio,
    listarVentas,
    obtenerVenta
} = require('../controllers/comercio.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverComercio } = require('../middlewares/comercio.middleware');

// Cadena de middlewares: token valido -> rol comercio -> req.comercioId resuelto contra
// la base. Misma forma que en producto.routes.js.
const soloComercio = [verificarToken, verificarRol('comercio'), resolverComercio];

// CU03 - Explorar comercios. Son publicos: el catalogo se puede mirar sin cuenta
router.get('/comercios', listarComercios);
router.get('/comercios/:id', obtenerComercio);
router.get('/comercios/:id/productos', listarProductosDeComercio);

// Semana 7 - El comercio confirma que un pedido propio fue preparado
router.patch('/comercios/pedidos/:id/subir', soloComercio, subirPedido);

// Lo del comercio autenticado va en singular, /comercio/..., igual que /repartidor/...
// En plural chocaria con /comercios/:id, que es publico y se tragaria /comercios/ventas
// con "ventas" como id.

// Semana 3 (CU12) - Perfil del comercio
router.get('/comercio/perfil', soloComercio, obtenerPerfilComercio);
router.patch('/comercio/perfil', soloComercio, actualizarPerfilComercio);

// Semana 12 (CU17) - Historial de ventas
router.get('/comercio/ventas', soloComercio, listarVentas);
router.get('/comercio/ventas/:id', soloComercio, obtenerVenta);

module.exports = router;
