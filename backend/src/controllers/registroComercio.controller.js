const database = require('../database/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Funcion para regitrar un comercio
const registroComercio = async (req, res) => {

    const connection = await database.getConnection();

    try {

        const { nombreComercio, cuil, categoria, direccion, horarioAtencion, email, contrasena, nombreResponsable, telefono } = req.body;

        // Validar que todos los campos requeridos estén presentes
        if (!nombreComercio || !cuil || !categoria || !direccion || !horarioAtencion || !email || !contrasena || !nombreResponsable || !telefono) {
            connection.release();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son requeridos" }
            });
        }

        // Validar cadenas de texto vacias
        if (nombreComercio.trim() === "" || categoria.trim() === "" || direccion.trim() === "" || horarioAtencion.trim() === "" || email.trim() === "" || contrasena.trim() === "" || nombreResponsable.trim() === "" || telefono.trim() === "") {
            connection.release();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        // Validar que el CUIL tenga el formato correcto (11 dígitos) y sea string
        if (typeof cuil !== "string" || !/^\d{11}$/.test(cuil)) {
            connection.release();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El CUIL debe tener 11 dígitos" }
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== "string" || !emailRegex.test(email)) {
            connection.release();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El email no tiene un formato válido" }
            });
        }

        const [usuarioExistente] = await connection.query(
            'SELECT id FROM usuarios WHERE email = ?',
            [email]
        );
        if (usuarioExistente.length > 0) {
            connection.release();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El email ya está registrado" }
            });
        }

        // Validar que el comercio no esté registrado previamente
        const [comercioExistente] = await connection.query(
            'SELECT * FROM comercios WHERE cuit_cuil = ?',
            [cuil]
        );
        // Si el comercio ya existe devolver error
        if (comercioExistente.length > 0) {
            connection.release();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El comercio ya está registrado" }
            });
        }

        await connection.beginTransaction();

        const contrasenaHash = await bcrypt.hash(contrasena, 10);

        const [resultadoUsuario] = await connection.query(
            'INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) VALUES (?, ?, ?, ?, ?)',
            [nombreResponsable, email, contrasenaHash, telefono, 'comercio']
        );
        const usuarioId = resultadoUsuario.insertId;

        const [resultadoComercio] = await connection.query(
            `INSERT INTO comercios (nombre, cuit_cuil, categoria, direccion, horario_atencion, usuario_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [nombreComercio, cuil, categoria, direccion, horarioAtencion, usuarioId]
        );

        await connection.commit();

        const [comercioCreado] = await connection.query(
            'SELECT id, nombre, cuit_cuil, categoria, direccion, horario_atencion, usuario_id FROM comercios WHERE id = ?',
            [resultadoComercio.insertId]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: `Comercio registrado exitosamente`,
                     comercio: comercioCreado[0]
                   }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

const iniciarSesionComercio = async (req, res) => {
    try {

        const { email, contrasena, cuil } = req.body;

        // Validar que todos los campos requeridos estén presentes
        if (!email || !contrasena || !cuil) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son requeridos" }
            });
        }

        // Validar cadenas de texto vacias
        if (email.trim() === "" || contrasena.trim() === "" || cuil.trim() === "") {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        // Validar que el CUIL tenga el formato correcto (11 dígitos) y sea string
        const cuilRegex = /^\d{11}$/;
        if (typeof cuil !== "string" || !cuilRegex.test(cuil)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El CUIL debe tener 11 dígitos" }
            });
        }

        // Validar que el comercio esté registrado previamente
        const [comercioExistente] = await database.query(
            `SELECT c.*, u.email, u.contrasena AS usuario_contrasena FROM comercios c
            INNER JOIN usuarios u ON
            c.usuario_id = u.id
            WHERE c.cuit_cuil = ? AND u.email = ?`,
            [cuil, email]
        );

        // Si el comercio no existe devolver error
        if (comercioExistente.length === 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Credenciales incorrectas o comercio no registrado" }
            });
        }

        // Comparacion de contrasena con la almacenada en la base de datos
        const passwordCorrecta = await bcrypt.compare(
            contrasena,
            comercioExistente[0].usuario_contrasena
            );

        // Validar que la contraseña sea correcta
        if (!passwordCorrecta) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Credenciales inválidas" }
            });
        }

        const { usuario_contrasena, ...comercioSinContrasena } = comercioExistente[0];

        const token = jwt.sign(
            { usuarioId: comercioSinContrasena.usuario_id, comercioId: comercioSinContrasena.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "Sesión iniciada correctamente",
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

module.exports = { registroComercio, iniciarSesionComercio };