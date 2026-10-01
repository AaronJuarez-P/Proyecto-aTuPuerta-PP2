const express = require('express');
const router = express.Router();
const {
    agregarAlCarrito,
    actualizarCantidadCarrito,
    listarProductosCarrito,
    eliminarProductoCarrito,
    confirmarCarrito
} = require('../controllers/carrito.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverCliente } = require('../middlewares/cliente.middleware');

// El carrito es siempre del cliente autenticado (se resuelve por req.usuario.id).
//
// Semana 14: antes solo pasaba por verificarToken, asi que un token de comercio o de
// repartidor tambien entraba, y ninguna ruta chequeaba que la cuenta siguiera activa.
// Ahora usa la misma cadena que pagos y seguimiento, los otros routers del cliente.
const soloCliente = [verificarToken, verificarRol('cliente'), resolverCliente];

// CU05 - Agregar producto al carrito
router.post('/carrito/agregar', soloCliente, agregarAlCarrito);

// Listar productos del carrito
router.get('/carrito/listar', soloCliente, listarProductosCarrito);

// Cambiar la cantidad de un producto que ya está en el carrito (los botones +/- del front)
router.patch('/carrito/:id_producto', soloCliente, actualizarCantidadCarrito);

// Quitar producto del carrito
router.delete('/carrito/:id_producto', soloCliente, eliminarProductoCarrito);

// CU06 - Confirmar carrito (crea el/los pedidos, descuenta stock, vacía el carrito)
router.post('/carrito/confirmar', soloCliente, confirmarCarrito);

module.exports = router;
