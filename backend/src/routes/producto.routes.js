const express = require('express');
const router = express.Router();
const {
    buscarProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    actualizarStock,
    actualizarPrecio,
    eliminarProducto,
    obtenerAuditoriaProducto
} = require('../controllers/producto.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverComercio } = require('../middlewares/comercio.middleware');

// Cadena de middlewares de las rutas de gestion: token valido -> rol comercio ->
// req.comercioId resuelto contra la base
const soloComercio = [verificarToken, verificarRol('comercio'), resolverComercio];

// CU04 - Buscar productos (publicos)
router.get('/productos', buscarProductos);
router.get('/productos/:id', obtenerProducto);

// CU13 a CU16 - Gestion del catalogo (solo el comercio dueño)
router.post('/productos', soloComercio, crearProducto);
router.put('/productos/:id', soloComercio, actualizarProducto);
router.patch('/productos/:id/stock', soloComercio, actualizarStock);
router.patch('/productos/:id/precio', soloComercio, actualizarPrecio);
router.delete('/productos/:id', soloComercio, eliminarProducto);

// Trazabilidad de los cambios de un producto propio
router.get('/productos/:id/auditoria', soloComercio, obtenerAuditoriaProducto);

module.exports = router;
