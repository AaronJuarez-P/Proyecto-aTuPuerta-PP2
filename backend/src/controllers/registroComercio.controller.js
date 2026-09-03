const database = require('../database/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Funcion para regitrar un comercio
const registroComercio = async (req, res) => {

    const connection = await database.getConnection();

    try {

        const { nombreComercio, cuil, categoria, direccion, horarioAtencion, email, contrasena, telefono } = req.body;

        // Validar que todos los campos requeridos estén presentes
        if (!nombreComercio || !cuil || !categoria || !direccion || !horarioAtencion || !email || !contrasena || !telefono) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son requeridos" }
            });
        }

        // Validar cadenas de texto vacias
        if (nombreComercio.trim() === "" || categoria.trim() === "" || direccion.trim() === "" || horarioAtencion.trim() === "" || email.trim() === "" || contrasena.trim() === "" || telefono.trim() === "") {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        // Validar que el CUIL tenga el formato correcto (11 dígitos) y sea string
        if (typeof cuil !== "string" || !/^\d{11}$/.test(cuil)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El CUIL debe tener 11 dígitos" }
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== "string" || !emailRegex.test(email)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El email no tiene un formato válido" }
            });
        }

        // Buscar el usuario existente por email (ya NO se crea un usuario nuevo)
        const [usuariosExistentes] = await connection.query(
            'SELECT id, contrasena, rol FROM usuarios WHERE email = ?',
            [email]
        );

        if (usuariosExistentes.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe una cuenta con ese email. Registrate primero como usuario" }
            });
        }

        const usuarioExistente = usuariosExistentes[0];

        // Validar que la contraseña coincida con la cuenta existente
        const contrasenaValida = await bcrypt.compare(contrasena, usuarioExistente.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Contraseña incorrecta" }
            });
        }

        // Validar que el usuario todavía sea 'cliente' (no ya comercio, no admin, etc.)
        if (usuarioExistente.rol !== 'cliente') {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Esta cuenta no puede registrar un comercio" }
            });
        }

        // Validar que el comercio no esté registrado previamente
        const [comercioExistente] = await connection.query(
            'SELECT id FROM comercios WHERE cuit_cuil = ?',
            [cuil]
        );
        if (comercioExistente.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El comercio ya está registrado" }
            });
        }

        await connection.beginTransaction();

        const usuarioId = usuarioExistente.id;

        // Actualiza el usuario existente a rol 'comercio' en vez de crear uno nuevo
        await connection.query(
            'UPDATE usuarios SET rol = ?, telefono = ? WHERE id = ?',
            ['comercio', telefono, usuarioId]
        );

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

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: `Comercio registrado exitosamente`,
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
            `SELECT c.*, u.email, u.contrasena AS usuario_contrasena, u.activo AS usuario_activo FROM comercios c
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

        // Validacion de usuario activo
        // Va despues del chequeo de contraseña para no revelarle a un usuario
        // no autenticado si la cuenta existe o en qué estado está
        if (!comercioExistente[0].usuario_activo) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Usuario inactivo" }
            });
        }

        const { usuario_contrasena, usuario_activo, ...comercioSinContrasena } = comercioExistente[0];

        // El payload tiene que ser igual al de inicioSesion para que verificarRol
        // y los middlewares que leen req.usuario.id funcionen con este token
        // Token expira en 8 horas, igual que inicioSesion, para que el comportamiento
        // de sesión sea consistente entre clientes y comercios
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