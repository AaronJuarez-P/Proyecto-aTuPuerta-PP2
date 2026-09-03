const express = require('express');
const router = express.Router();
const {
    listarComercios,
    obtenerComercio,
    listarProductosDeComercio
} = require('../controllers/comercio.controller');

// CU03 - Explorar comercios. Son publicos: el catalogo se puede mirar sin cuenta
router.get('/comercios', listarComercios);
router.get('/comercios/:id', obtenerComercio);
router.get('/comercios/:id/productos', listarProductosDeComercio);

module.exports = router;
