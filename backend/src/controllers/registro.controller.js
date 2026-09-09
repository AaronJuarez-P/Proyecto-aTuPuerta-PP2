const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');

const registro = async (req, res) => {
    let connection;
    try {
        const { nombre, correo, contrasena, telefono, direccion_entrega } = req.body;

        if (typeof nombre !== "string" || typeof correo !== "string" ||
            typeof contrasena !== "string" || typeof telefono !== "string" ||
            typeof direccion_entrega !== "string" ||
            !nombre || !correo || !contrasena || !telefono || !direccion_entrega) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son obligatorios" }
            });
        }

        if (!nombre.trim() || !correo.trim() || !contrasena.trim() ||
            !telefono.trim() || !direccion_entrega.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [existentes] = await connection.query(
            `SELECT id FROM usuarios WHERE email = ? FOR UPDATE`,
            [correo]
        );
        if (existentes.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Usuario ya registrado" }
            });
        }

        const salt = await bcrypt.genSalt(10);
        const contrasenaHash = await bcrypt.hash(contrasena, salt);

        const [resultado] = await connection.query(
            `INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) VALUES (?, ?, ?, ?, ?)`,
            [nombre, correo, contrasenaHash, telefono, 'cliente']
        );
        const usuarioId = resultado.insertId;

        // FIX: crear también el perfil de cliente, sin esto el usuario
        // nunca puede usar el carrito ni crear pedidos.
        await connection.query(
            `INSERT INTO clientes (usuario_id, direccion_entrega) VALUES (?, ?)`,
            [usuarioId, direccion_entrega]
        );

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Usuario registrado exitosamente ${nombre}, ${correo}, ${telefono}` }
        });

    } catch (error) {
        if (connection) await connection.rollback();
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
    } finally {
        if (connection) connection.release();
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