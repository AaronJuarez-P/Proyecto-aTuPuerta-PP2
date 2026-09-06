const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');

// Función para registrar un repartidor
const registroRepartidor = async (req, res) => {
    try {
        const { nombre, email, contrasena, telefono, dni } = req.body;

        if (!nombre || !email || !contrasena || !telefono || !dni) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son obligatorios" }
            });
        }

        if (!nombre.trim() || !email.trim() || !contrasena.trim() || !telefono.trim() || !dni.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        const dniRegex = /^\d{8}$/;
        if (typeof dni !== "string" || !dniRegex.test(dni)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El DNI debe tener 8 dígitos" }
            });
        }
        const [repartidorExistente] = await database.query(
            `SELECT r.id FROM repartidores r
            INNER JOIN usuarios u ON r.usuario_id = u.id
            WHERE r.dni = ? OR u.email = ?`,
            [dni, email]
        );

        if (repartidorExistente.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El repartidor ya está registrado" }
            });
        }

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

const iniciarSesionRepartidor = async (req, res) => {
    try {
        const { email, contrasena } = req.body;

        if (!email || !contrasena) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Correo y contraseña son obligatorios" }
            });
        }

        if (!email.trim() || !contrasena.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        } 

        // Validación de usuario existente
        const [usuario] = await database.query(
            `SELECT u.id, u.contrasena, r.id AS repartidor_id
            FROM usuarios u
            INNER JOIN repartidores r ON u.id = r.usuario_id
            WHERE u.email = ?`,
            [email]
        );

        if (usuario.length === 0) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Usuario no encontrado" }
            });
        }


    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = {
    registroRepartidor,
    iniciarSesionRepartidor
};