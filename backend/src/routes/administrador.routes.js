const express = require('express');
const router = express.Router();
const {
    inicioSesionAdministrador,
    listarUsuarios,
    obtenerUsuario,
    crearUsuario,
    actualizarUsuario,
    cambiarEstadoUsuario,
    darDeBajaUsuario,
    cambiarEstadoComercio
} = require('../controllers/administrador.controller');
const {
    listarPedidosAdmin,
    obtenerPedidoAdmin,
    cancelarPedidoAdmin,
    listarAuditoriaProductos,
    listarAuditoriaPedidos
} = require('../controllers/supervision.controller');
const { verificarToken, verificarRol } = require('../middlewares/autenticacion.middleware');
const { resolverAdministrador } = require('../middlewares/administrador.middleware');
const { limitadorAutenticacion } = require('../middlewares/limites.middleware');

// Cadena de middlewares: token valido -> rol administrador -> req.administradorId
// resuelto contra la base. Misma forma que soloComercio y soloRepartidor.
const soloAdministrador = [verificarToken, verificarRol('administrador'), resolverAdministrador];

// Inicio de sesion del administrador (semana 3). Publico, con limite de intentos
router.post('/inicioSesionAdministrador', limitadorAutenticacion, inicioSesionAdministrador);

// CU23 - Gestionar usuarios (semana 13). El alta con rol 'administrador' es el alta
// de administradores.
router.get('/admin/usuarios', soloAdministrador, listarUsuarios);
router.post('/admin/usuarios', soloAdministrador, crearUsuario);
router.get('/admin/usuarios/:id', soloAdministrador, obtenerUsuario);
router.patch('/admin/usuarios/:id', soloAdministrador, actualizarUsuario);
router.patch('/admin/usuarios/:id/estado', soloAdministrador, cambiarEstadoUsuario);
router.delete('/admin/usuarios/:id', soloAdministrador, darDeBajaUsuario);

// Suspension por rol: el comercio solo, sin tocar la cuenta
router.patch('/admin/comercios/:id/estado', soloAdministrador, cambiarEstadoComercio);

// CU24 - Supervisar pedidos, activos e historicos
router.get('/admin/pedidos', soloAdministrador, listarPedidosAdmin);
router.get('/admin/pedidos/:id', soloAdministrador, obtenerPedidoAdmin);
router.patch('/admin/pedidos/:id/cancelar', soloAdministrador, cancelarPedidoAdmin);

// Trazabilidad: consultas sobre auditoria_productos y auditoria_pedidos
router.get('/admin/auditoria/productos', soloAdministrador, listarAuditoriaProductos);
router.get('/admin/auditoria/pedidos', soloAdministrador, listarAuditoriaPedidos);

module.exports = router;
