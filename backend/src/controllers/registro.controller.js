const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');
const { geocodificarDireccion } = require('../services/maps.service');
const { esEmailValido } = require('../utils/validacion');

const registro = async (req, res) => {
    let connection;
    try {
        const { nombre, email, contrasena, telefono, direccion_entrega } = req.body;

        if (typeof nombre !== "string" || typeof email !== "string" ||
            typeof contrasena !== "string" || typeof telefono !== "string" ||
            typeof direccion_entrega !== "string" ||
            !nombre || !email || !contrasena || !telefono || !direccion_entrega) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Todos los campos son obligatorios" }
            });
        }

        if (!nombre.trim() || !email.trim() || !contrasena.trim() ||
            !telefono.trim() || !direccion_entrega.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        if (!esEmailValido(email)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El email no tiene un formato válido" }
            });
        }

        // Geocodificacion ANTES de abrir la transaccion (semana 9): es una llamada de
        // red y no puede quedar adentro. Si falla devuelve null y el usuario se crea
        // igual con las coordenadas en NULL; se completan solas la primera vez que
        // hagan falta (ver asegurarCoordenadasCliente en ubicacion.service.js).
        const punto = await geocodificarDireccion(direccion_entrega);

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [existentes] = await connection.query(
            `SELECT id FROM usuarios WHERE email = ? FOR UPDATE`,
            [email]
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
            [nombre, email, contrasenaHash, telefono, 'cliente']
        );
        const usuarioId = resultado.insertId;

        // FIX: crear también el perfil de cliente, sin esto el usuario
        // nunca puede usar el carrito ni crear pedidos.
        await connection.query(
            `INSERT INTO clientes (usuario_id, direccion_entrega, latitud, longitud) VALUES (?, ?, ?, ?)`,
            [usuarioId, direccion_entrega, punto?.latitud ?? null, punto?.longitud ?? null]
        );

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: `Usuario registrado exitosamente ${nombre}, ${email}, ${telefono}` }
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

        const { email, contrasena } = req.body;

        if (typeof email !== "string" || typeof contrasena !== "string" ||
            !email || !contrasena) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Email y contraseña son obligatorios" }
            });
        }

        if (!email.trim() || !contrasena.trim()) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Datos ingresados incompletos" }
            });
        }

        // El formato del email NO se valida aca a proposito: si no coincide con ninguna
        // fila hay que contestar el mismo mensaje generico igual, y un 400 de "formato
        // invalido" seria una forma mas de distinguir "mal escrito" de "no existe".

        // FIX: el INNER JOIN contra clientes. Antes esto era un SELECT * sobre usuarios,
        // asi que cualquier usuario podia entrar por aca -- incluidos los comercios y los
        // repartidores, que no tienen perfil de cliente. Como mas abajo el rol se fija en
        // 'cliente', entrar al login equivocado les pisaba el rol en la base y les dejaba
        // todos sus endpoints en 403 (resolverComercio y resolverRepartidor filtran por el
        // rol de la base, no por el del token).
        const [usuarios] = await database.query(
            `SELECT u.id, u.nombre, u.email, u.contrasena, u.activo
             FROM usuarios u
             INNER JOIN clientes c ON u.id = c.usuario_id
             WHERE u.email = ?`,
            [email]
        );

        // Los dos casos de credenciales rechazadas contestan exactamente lo mismo, para que
        // nadie pueda averiguar que emails estan registrados probando de a uno.
        if (usuarios.length === 0) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "Email o contraseña incorrectos" }
            });
        }

        const [usuario] = usuarios;

        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({
                codigo: 401, estado: "error",
                datos: { mensaje: "Email o contraseña incorrectos" }
            });
        }

        if (!usuario.activo) {
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Usuario inactivo" }
            });
        }

        // usuarios.rol guarda el rol de la SESION activa, no lo que el usuario es: por eso
        // cerrarSesionRepartidor y cerrarSesionComercio lo devuelven a 'cliente', y por eso
        // los middlewares lo consultan contra la base en vez de confiar en el token.
        // Consecuencia: si alguien es cliente y repartidor a la vez, entrar por aca cierra
        // de hecho su sesion de repartidor. Viene con el modelo; sacarlo implica dejar de
        // usar la columna como estado de sesion.
        // El WHERE extra evita reescribir una fila que ya esta en 'cliente', que es el caso
        // normal de todos los logins.
        await database.query(
            `UPDATE usuarios SET rol = 'cliente' WHERE id = ? AND rol <> 'cliente'`,
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
                    email: usuario.email,
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