const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');

const registro = async (req, res) => {
    try {
        const { nombre, correo, contrasena, telefono } = req.body;

        if (typeof nombre !== "string" || typeof correo !== "string" ||
            typeof contrasena !== "string" || typeof telefono !== "string" ||
            !nombre || !correo || !contrasena || !telefono) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son obligatorios" }
            });
        }

        if (!nombre.trim() || !correo.trim() || !contrasena.trim() || !telefono.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        const [existentes] = await database.query(
            `SELECT id FROM usuarios WHERE email = ?`,
            [correo]
        );
        if (existentes.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Usuario ya registrado" }
            });
        }

        const salt = await bcrypt.genSalt(10);
        const contrasenaHash = await bcrypt.hash(contrasena, salt);

        await database.query(
            `INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) VALUES (?, ?, ?, ?, ?)`,
            [nombre, correo, contrasenaHash, telefono, 'cliente']
        );

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Usuario registrado exitosamente ${nombre}, ${correo}, ${telefono}` }
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Usuario ya registrado" }
            });
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};


const inicioSesion = async (req, res) => {
    try {

        const { correo, contrasena } = req.body;

        if (typeof correo !== "string" || typeof contrasena !== "string" ||
            !correo || !contrasena) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Correo y contraseña son obligatorios" }
            });
        }

        if (!correo.trim() || !contrasena.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        const [existentes] = await database.query(
            `SELECT * FROM usuarios WHERE email = ?`,
            [correo]
        );
        if (existentes.length === 0) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Usuario no encontrado" }
            });
        }

        const [usuario] = existentes;

        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({
                codigo: 401, estado: "error",
                datos: { mensaje: "Contraseña incorrecta" }
            });
        }

        if (!usuario.activo) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Usuario inactivo" }
            });
        }

        await database.query(
            `UPDATE usuarios SET rol = 'cliente' WHERE id = ?`,
            [usuario.id]
        );

        const token = jwt.sign(
            { id: usuario.id, rol: 'cliente' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        return res.status(200).json({
            codigo: 200, estado: "exito",
            datos: {
                token,
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    correo: usuario.email,
                    rol: 'cliente'
                }
            }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
}

module.exports = { registro, inicioSesion };