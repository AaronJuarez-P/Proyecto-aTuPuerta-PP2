const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database');

const registro = async (req, res) => {
    try {
        const { nombre, correo, contrasena, telefono } = req.body;

        // 1. Validación de campos vacíos
        if (!nombre || !correo || !contrasena || !telefono) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son obligatorios" }
            });
        }
        
        // Validacion de espacios en blanco
        if (!nombre.trim() || !correo.trim() || !contrasena.trim() || !telefono.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        // Validacion para usuario ya registrado
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

        // Hash de contraseña
        const salt = await bcrypt.genSalt(10);
        const contrasenaHash = await bcrypt.hash(contrasena, salt);

        // Inserción de usuario en la base de datos
        const [usuarios] = await database.query(
            `INSERT INTO usuarios (nombre, email, contrasena, telefono) VALUES (?, ?, ?, ?)`,
            [nombre, correo, contrasenaHash, telefono]
        );

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Usuario registrado exitosamente ${nombre}, ${correo}, ${telefono}` }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    };
};


const inicioSesion = async (req, res) => {
    try {

        const { correo, contrasena } = req.body;

        // Validacion de campos vacios
        if (!correo || !contrasena) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Correo y contraseña son obligatorios" }
            });
        }

        // Validacion de espacios en blanco
        if (!correo.trim() || !contrasena.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        // Validacion de usuario existente
        const [existentes]  = await database.query(
            `SELECT * FROM usuarios WHERE email = ?`,
            [correo]
        );
        if (existentes.length === 0) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Correo o contraseña incorrectos" }
            });
        }

        const [usuario] = existentes;

        // Validacion de datos correctos
        if (req.correo !== usuario.correo || req.contrasena !== usuario.contrasena) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Correo o contraseña incorrectos" }
            });
        }

        // Validacion de usuario activo
        if (!usuario.activo) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Usuario inactivo" }
            });
        }

        // Comparación de contraseñas
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({
                codigo: 401, estado: "error",
                datos: { mensaje: "Credenciales inválidas" }
            });
        }

        // Token expira en 8 horas
        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );


        // Inicio correcto, generacion de token
        return res.status(200).json({
            codigo: 200, estado: "exito",
            datos: { token, usuario: { id: usuario.id, nombre: usuario.nombre, correo: usuario.email, rol: usuario.rol } }
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