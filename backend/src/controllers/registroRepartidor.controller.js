const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');

// Registra el perfil de repartidor para un usuario que YA existe como cliente.
const registroRepartidor = async (req, res) => {
    let connection;
    try {
        const {
            nombre,
            email,
            contrasena,
            telefono,
            dni,
            tipo_vehiculo,
            patente,
            numero_licencia
        } = req.body;

        if (typeof nombre !== "string" || typeof email !== "string" ||
            typeof contrasena !== "string" || typeof telefono !== "string" ||
            typeof dni !== "string" || typeof tipo_vehiculo !== "string" ||
            typeof patente !== "string" || typeof numero_licencia !== "string" ||
            !nombre || !email || !contrasena || !telefono || !dni ||
            !tipo_vehiculo || !patente || !numero_licencia) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son obligatorios" }
            });
        }

        if (!nombre.trim() || !email.trim() || !contrasena.trim() ||
            !telefono.trim() || !dni.trim() || !tipo_vehiculo.trim() ||
            !patente.trim() || !numero_licencia.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        const dniRegex = /^\d{8}$/;
        if (!dniRegex.test(dni)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El DNI debe tener 8 dígitos" }
            });
        }

        if (!['moto', 'bicicleta', 'auto', 'otro'].includes(tipo_vehiculo)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El tipo de vehículo no es válido" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [usuarios] = await connection.query(
            `SELECT id, contrasena, activo FROM usuarios WHERE email = ? FOR UPDATE`,
            [email]
        );

        if (usuarios.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Debés registrarte primero como usuario antes de ser repartidor" }
            });
        }

        if (!usuarios[0].activo) {
            await connection.rollback();
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Usuario inactivo" }
            });
        }

        // FIX: verificación real de contraseña, antes no se comparaba nunca
        const contrasenaValida = await bcrypt.compare(contrasena, usuarios[0].contrasena);
        if (!contrasenaValida) {
            await connection.rollback();
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Contraseña incorrecta" }
            });
        }

        const [repartidorExistente] = await connection.query(
            `SELECT id FROM repartidores WHERE usuario_id = ? OR dni = ? FOR UPDATE`,
            [usuarios[0].id, dni]
        );

        if (repartidorExistente.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El repartidor ya está registrado" }
            });
        }

        // FIX: antes nunca se insertaba la fila del repartidor.
        // Ajustá las columnas a tu esquema real de "repartidores".
        await connection.query(
            `INSERT INTO repartidores
             (usuario_id, dni, tipo_vehiculo, patente, numero_licencia)
             VALUES (?, ?, ?, ?, ?)`,
            [usuarios[0].id, dni, tipo_vehiculo, patente, numero_licencia]
        );

        await connection.query(
            `UPDATE usuarios SET rol = 'repartidor' WHERE id = ?`,
            [usuarios[0].id]
        );

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Repartidor registrado exitosamente ${nombre}, ${email}, ${telefono}, ${dni}` }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El repartidor ya está registrado" }
            });
        }
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

const iniciarSesionRepartidor = async (req, res) => {
    try {
        const { email, contrasena } = req.body;

        if (typeof email !== "string" || typeof contrasena !== "string" ||
            !email || !contrasena) {
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

        const [usuarios] = await database.query(
            `SELECT u.id, u.nombre, u.email, u.contrasena, u.activo,
                    r.id AS repartidor_id
            FROM usuarios u
            INNER JOIN repartidores r ON u.id = r.usuario_id
            WHERE u.email = ?`,
            [email]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Usuario no encontrado" }
            });
        }

        const usuario = usuarios[0];
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
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
            `UPDATE usuarios SET rol = 'repartidor' WHERE id = ?`,
            [usuario.id]
        );

        const token = jwt.sign(
            {
                id: usuario.id,
                rol: 'repartidor',
                repartidorId: usuario.repartidor_id
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Sesión iniciada correctamente",
                usuario: {
                    id: usuario.id,
                    nombre: usuario.nombre,
                    correo: usuario.email,
                    rol: "repartidor",
                    repartidorId: usuario.repartidor_id
                },
                token
            }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

const cerrarSesionRepartidor = async (req, res) => {
    try {
        if (req.usuario.rol === 'administrador') {
            return res.status(200).json({
                codigo: 200,
                estado: "exito",
                datos: { mensaje: "Sesión cerrada correctamente" }
            });
        }

        // FIX: mismo problema que en comercio — sin este chequeo,
        // un token con rol distinto de 'repartidor' pasaba de largo
        // y devolvía 200 sin validar nada.
        if (req.usuario.rol !== 'repartidor') {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "La sesión no corresponde a un repartidor válido" }
            });
        }

        const [repartidores] = await database.query(
            `SELECT r.id
             FROM repartidores r
             INNER JOIN usuarios u ON u.id = r.usuario_id
             WHERE u.id = ? AND u.rol = 'repartidor'`,
            [req.usuario.id]
        );

        if (repartidores.length === 0) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "La sesión no corresponde a un repartidor válido" }
            });
        }

        await database.query(
            `UPDATE usuarios SET rol = 'cliente'
             WHERE id = ? AND rol = 'repartidor'`,
            [req.usuario.id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "Sesión de repartidor cerrada correctamente" }
        });
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
    iniciarSesionRepartidor,
    cerrarSesionRepartidor
};