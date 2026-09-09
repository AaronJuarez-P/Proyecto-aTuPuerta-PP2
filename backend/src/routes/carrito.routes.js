const express = require('express');
const router = express.Router();
const {
    agregarAlCarrito,
    listarProductosCarrito,
    eliminarProductoCarrito,
    confirmarCarrito
} = require('../controllers/carrito.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

// El carrito es siempre del cliente autenticado (se resuelve por req.usuario.id),
// por eso todas las rutas pasan primero por verificarToken.

// CU07 - Agregar producto al carrito
router.post('/carrito/agregar', verificarToken, agregarAlCarrito);

// Listar productos del carrito
router.get('/carrito/listar', verificarToken, listarProductosCarrito);

// CU08 - Quitar producto del carrito
router.delete('/carrito/:id_producto', verificarToken, eliminarProductoCarrito);

// CU09 - Confirmar carrito (crea el/los pedidos, descuenta stock, vacía el carrito)
router.post('/carrito/confirmar', verificarToken, confirmarCarrito);

module.exports = router;