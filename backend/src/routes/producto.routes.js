const express = require('express');
const router = express.Router();
const {
    buscarProductos,
    obtenerProducto,
    listarProductosPropios,
    crearProducto,
    actualizarProducto,
    actualizarStock,
    actualizarPrecio,
    eliminarProducto,
    subirImagenProducto,
    quitarImagenProducto,
    obtenerAuditoriaProducto
} = require('../controllers/producto.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverComercio } = require('../middlewares/comercio.middleware');
const { recibirImagen } = require('../middlewares/imagen.middleware');

// Cadena de middlewares de las rutas de gestion: token valido -> rol comercio ->
// req.comercioId resuelto contra la base
const soloComercio = [verificarToken, verificarRol('comercio'), resolverComercio];

// CU04 - Buscar productos (publicos)
router.get('/productos', buscarProductos);
router.get('/productos/:id', obtenerProducto);

// CU13 a CU16 - Gestion del catalogo (solo el comercio dueño)
//
// El listado de gestion va en singular, /comercio/..., como el perfil y las ventas: es
// lo del comercio autenticado, e incluye los productos dados de baja
router.get('/comercio/productos', soloComercio, listarProductosPropios);

// La foto es opcional al dar de alta: con multipart/form-data va en el campo imagen, y
// con JSON el producto se crea como siempre, sin foto. recibirImagen va despues de
// soloComercio: sin sesion valida no se lee ningun archivo.
router.post('/productos', soloComercio, recibirImagen, crearProducto);
router.put('/productos/:id', soloComercio, actualizarProducto);
router.patch('/productos/:id/stock', soloComercio, actualizarStock);
router.patch('/productos/:id/precio', soloComercio, actualizarPrecio);
router.delete('/productos/:id', soloComercio, eliminarProducto);

// Foto del producto: cambiarla (multipart/form-data, campo imagen) o quitarla
router.put('/productos/:id/imagen', soloComercio, recibirImagen, subirImagenProducto);
router.delete('/productos/:id/imagen', soloComercio, quitarImagenProducto);

// Trazabilidad de los cambios de un producto propio
router.get('/productos/:id/auditoria', soloComercio, obtenerAuditoriaProducto);

module.exports = router;
