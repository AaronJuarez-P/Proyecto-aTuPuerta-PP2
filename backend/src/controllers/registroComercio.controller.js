const database = require('../database/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Funcion para regitrar un comercio
const registroComercio = async (req, res) => {
    try {
        const { nombre, email, contrasena, telefono, cuit_cuil } = req.body;

        if (!nombre || !email || !contrasena || !telefono || !cuit_cuil) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son requeridos" }
            });
        }

        if (!nombre.trim() || !email.trim() || !contrasena.trim() || !telefono.trim() || !cuit_cuil.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ningún campo puede estar vacío" }
            });
        }

        const cuilRegex = /^\d{11}$/;
        if (typeof cuit_cuil !== "string" || !cuilRegex.test(cuit_cuil)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El CUIL debe tener 11 dígitos" }
            });
        }

        const [comercioExistente] = await database.query(
            `SELECT c.id FROM comercios c
            INNER JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.cuit_cuil = ? OR u.email = ?`,
            [cuit_cuil, email]
        );

        if (comercioExistente.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El comercio ya está registrado" }
            });
        }

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Comercio registrado exitosamente ${nombre}, ${email}, ${telefono}, ${cuit_cuil}` }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
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
module.exports = { registroComercio, iniciarSesionComercio };