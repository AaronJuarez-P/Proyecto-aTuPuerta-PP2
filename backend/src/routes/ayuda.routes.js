const express = require('express');
const router = express.Router();
const { obtenerEstado, preguntarAlPortero } = require('../controllers/ayuda.controller');
const { limitadorAyuda } = require('../middlewares/limites.middleware');

// El Portero, el asistente de ayuda. Publicas a proposito: puede preguntar cualquiera,
// tambien quien todavia no inicio sesion.
router.get('/ayuda/estado', obtenerEstado);

// Con su propio limite: en modo rag, cada pregunta gasta cupo de Gemini
router.post('/ayuda/preguntar', limitadorAyuda, preguntarAlPortero);

module.exports = router;
