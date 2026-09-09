const database = require('../database/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registra el perfil de comercio para un usuario que YA existe como cliente.
// Requiere email + contraseña real del usuario para autorizar la operación.
const registroComercio = async (req, res) => {
    let connection;
    try {
        const {
            nombre,
            email,
            contrasena,
            telefono,
            cuit_cuil,
            categoria,
            direccion,
            horario_atencion
        } = req.body;

        if (typeof nombre !== "string" || typeof email !== "string" ||
            typeof contrasena !== "string" || typeof telefono !== "string" ||
            typeof cuit_cuil !== "string" ||
            typeof categoria !== "string" || typeof direccion !== "string" ||
            typeof horario_atencion !== "string" ||
            !nombre || !email || !contrasena || !telefono || !cuit_cuil ||
            !categoria || !direccion || !horario_atencion) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son requeridos" }
            });
        }

        if (!nombre.trim() || !email.trim() || !contrasena.trim() ||
            !telefono.trim() || !cuit_cuil.trim() || !categoria.trim() ||
            !direccion.trim() || !horario_atencion.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        const cuilRegex = /^\d{11}$/;
        if (!cuilRegex.test(cuit_cuil)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El CUIL debe tener 11 dígitos" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // El usuario debe existir previamente (registrado como cliente)
        const [usuarios] = await connection.query(
            `SELECT id, contrasena, activo FROM usuarios WHERE email = ? FOR UPDATE`,
            [email]
        );

        if (usuarios.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Debés registrarte primero como usuario antes de crear un comercio" }
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

        // FIX: se verifica la contraseña real contra el hash guardado.
        // Antes se pedía "contrasena" en el body pero nunca se validaba.
        const contrasenaValida = await bcrypt.compare(contrasena, usuarios[0].contrasena);
        if (!contrasenaValida) {
            await connection.rollback();
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Contraseña incorrecta" }
            });
        }

        // Verifica que ese usuario no tenga ya un comercio, o que el CUIT no esté usado por otro
        const [comercioExistente] = await connection.query(
            `SELECT id FROM comercios WHERE usuario_id = ? OR cuit_cuil = ? FOR UPDATE`,
            [usuarios[0].id, cuit_cuil]
        );

        if (comercioExistente.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El comercio ya está registrado" }
            });
        }

        // FIX: antes NUNCA se insertaba la fila del comercio, solo se
        // pisaba el rol de un comercio que ya debía existir de antemano.
        // Ajustá las columnas de este INSERT a tu esquema real de "comercios".
        await connection.query(
            `INSERT INTO comercios
             (usuario_id, nombre, cuit_cuil, categoria, direccion, horario_atencion)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [usuarios[0].id, nombre, cuit_cuil, categoria, direccion, horario_atencion]
        );

        await connection.query(
            `UPDATE usuarios SET rol = 'comercio' WHERE id = ?`,
            [usuarios[0].id]
        );

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Comercio registrado exitosamente ${nombre}, ${email}, ${telefono}, ${cuit_cuil}` }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El comercio ya está registrado" }
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

const iniciarSesionComercio = async (req, res) => {
    try {

        const { email, contrasena, cuil } = req.body;

        if (typeof email !== "string" || typeof contrasena !== "string" ||
            typeof cuil !== "string" || !email || !contrasena || !cuil) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son requeridos" }
            });
        }

        if (email.trim() === "" || contrasena.trim() === "" || cuil.trim() === "") {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        const cuilRegex = /^\d{11}$/;
        if (!cuilRegex.test(cuil)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El CUIL debe tener 11 dígitos" }
            });
        }

        const [comercioExistente] = await database.query(
            `SELECT c.*, u.email, u.contrasena AS usuario_contrasena, u.activo AS usuario_activo FROM comercios c
            INNER JOIN usuarios u ON
            c.usuario_id = u.id
            WHERE c.cuit_cuil = ? AND u.email = ?`,
            [cuil, email]
        );

        if (comercioExistente.length === 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Credenciales incorrectas o comercio no registrado" }
            });
        }

        const passwordCorrecta = await bcrypt.compare(
            contrasena,
            comercioExistente[0].usuario_contrasena
        );

        if (!passwordCorrecta) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Credenciales inválidas" }
            });
        }

        if (!comercioExistente[0].usuario_activo) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Usuario inactivo" }
            });
        }

        await database.query(
            `UPDATE usuarios SET rol = 'comercio' WHERE id = ?`,
            [comercioExistente[0].usuario_id]
        );

        const { usuario_contrasena, usuario_activo, ...comercioSinContrasena } = comercioExistente[0];

        const token = jwt.sign(
            {
                id: comercioSinContrasena.usuario_id,
                rol: 'comercio',
                comercioId: comercioSinContrasena.id
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Sesión iniciada correctamente",
                comercio: comercioSinContrasena,
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

const cerrarSesionComercio = async (req, res) => {
    try {
        if (req.usuario.rol === 'administrador') {
            return res.status(200).json({
                codigo: 200,
                estado: "exito",
                datos: { mensaje: "Sesión cerrada correctamente" }
            });
        }

        // FIX: antes, si llegaba un token con rol distinto de 'comercio'
        // (ej: 'cliente' o 'repartidor'), ninguna condición de error se
        // cumplía y terminaba devolviendo 200 sin validar nada.
        if (req.usuario.rol !== 'comercio') {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "La sesión no corresponde a un comercio válido" }
            });
        }

        const [comercios] = await database.query(
            `SELECT c.id
             FROM comercios c
             INNER JOIN usuarios u ON u.id = c.usuario_id
             WHERE u.id = ? AND u.rol = 'comercio'`,
            [req.usuario.id]
        );

        if (comercios.length === 0) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "La sesión no corresponde a un comercio válido" }
            });
        }

        await database.query(
            `UPDATE usuarios SET rol = 'cliente'
             WHERE id = ? AND rol = 'comercio'`,
            [req.usuario.id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "Sesión de comercio cerrada correctamente" }
        });
    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = { registroComercio, iniciarSesionComercio, cerrarSesionComercio };