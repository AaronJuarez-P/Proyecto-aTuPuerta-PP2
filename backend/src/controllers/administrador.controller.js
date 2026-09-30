const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const {
    obtenerIdValido,
    obtenerTextoValido,
    obtenerTextoQuery,
    obtenerBooleanoQuery,
    esEmailValido,
    esTelefonoValido,
    esContrasenaValida
} = require('../utils/validacion');
const { geocodificarDireccion } = require('../services/maps.service');
const {
    buscarCuenta,
    buscarPedidosEnCurso,
    describirPedidosEnCurso,
    esUltimoAdministradorActivo,
    darDeBajaCuenta
} = require('../services/usuario.service');
const { enviarNotificaciones } = require('./notificaciones.controller');

// Panel de administracion - usuarios y comercios (semana 13, CU23).
//
// El administrador que opera sale de req.administradorId (resolverAdministrador) y el
// usuario sobre el que opera, de la ruta. Nunca al reves.

const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// ---------------------------------------------------------------------------
// Inicio de sesion del administrador (semana 3)
// ---------------------------------------------------------------------------

// POST /api/inicioSesionAdministrador
// Body: { "email": "admin@test.com", "contrasena": "Test1234!" }
//
// Mismo molde que iniciarSesionRepartidor: el INNER JOIN contra administradores hace
// que por aca solo entren administradores, y usuarios.rol queda como sesion abierta.
const inicioSesionAdministrador = async (req, res) => {
    try {
        const { email, contrasena } = req.body ?? {};

        if (typeof email !== "string" || typeof contrasena !== "string" ||
            !email || !contrasena) {
            return responderError(res, 400, "Email y contraseña son obligatorios");
        }

        if (!email.trim() || !contrasena.trim()) {
            return responderError(res, 400, "Ningún campo puede estar vacío");
        }

        const [usuarios] = await database.query(
            `SELECT u.id, u.nombre, u.email, u.contrasena, u.activo,
                    a.id AS administrador_id
             FROM usuarios u
             INNER JOIN administradores a ON a.usuario_id = u.id
             WHERE u.email = ?`,
            [email]
        );

        // Los dos casos de credenciales rechazadas contestan exactamente lo mismo, para
        // que nadie pueda averiguar que emails son de administradores probando de a uno.
        if (usuarios.length === 0) {
            return responderError(res, 401, "Email o contraseña incorrectos");
        }

        const usuario = usuarios[0];

        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!contrasenaValida) {
            return responderError(res, 401, "Email o contraseña incorrectos");
        }

        if (!usuario.activo) {
            return responderError(res, 403, "Usuario inactivo");
        }

        await database.query(
            `UPDATE usuarios SET rol = 'administrador' WHERE id = ? AND rol <> 'administrador'`,
            [usuario.id]
        );

        const token = jwt.sign(
            {
                id: usuario.id,
                rol: 'administrador',
                administradorId: usuario.administrador_id
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
                    email: usuario.email,
                    rol: "administrador",
                    administradorId: usuario.administrador_id
                },
                token
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// ---------------------------------------------------------------------------
// CU23 - Gestionar usuarios
// ---------------------------------------------------------------------------

// Filtro ?rol= del listado. Se filtra por los PERFILES que tiene el usuario y no por
// usuarios.rol, que es solo la sesion que tiene abierta ahora: un comercio que en este
// momento esta usando la app como cliente sigue siendo un comercio.
//
// Los fragmentos de SQL salen de este mapa, nunca de la query string.
const FILTRO_POR_ROL = {
    cliente: 'cl.id IS NOT NULL',
    comercio: 'co.id IS NOT NULL',
    repartidor: 're.id IS NOT NULL',
    administrador: 'ad.id IS NOT NULL'
};

const JOINS_PERFILES = `
    LEFT JOIN clientes        cl ON cl.usuario_id = u.id
    LEFT JOIN comercios       co ON co.usuario_id = u.id
    LEFT JOIN repartidores    re ON re.usuario_id = u.id
    LEFT JOIN administradores ad ON ad.usuario_id = u.id`;

// GET /api/admin/usuarios?rol=&activo=&buscar=&pagina=&limite=
const listarUsuarios = async (req, res) => {
    try {
        const rol = obtenerTextoQuery(req.query.rol);
        const activo = obtenerBooleanoQuery(req.query.activo);
        const buscar = obtenerTextoQuery(req.query.buscar);

        if (rol === null || (rol !== "" && !FILTRO_POR_ROL[rol])) {
            return responderError(res, 400, `El rol tiene que ser uno de: ${Object.keys(FILTRO_POR_ROL).join(', ')}`);
        }

        if (activo === null) {
            return responderError(res, 400, "activo tiene que ser true o false");
        }

        if (buscar === null) {
            return responderError(res, 400, "El filtro buscar tiene que ser texto");
        }

        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = [];
        const parametros = [];

        if (rol !== "") {
            condiciones.push(FILTRO_POR_ROL[rol]);
        }

        if (activo !== undefined) {
            condiciones.push('u.activo = ?');
            parametros.push(activo);
        }

        if (buscar !== "") {
            condiciones.push('(u.nombre LIKE ? OR u.email LIKE ?)');
            parametros.push(`%${buscar}%`, `%${buscar}%`);
        }

        const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM usuarios u ${JOINS_PERFILES} ${where}`,
            parametros
        );

        const [usuarios] = await database.query(
            `SELECT u.id, u.nombre, u.email, u.telefono, u.activo, u.rol AS sesion, u.created_at,
                    cl.id AS cliente_id, co.id AS comercio_id, co.nombre AS comercio_nombre,
                    co.activo AS comercio_activo, re.id AS repartidor_id, ad.id AS administrador_id
             FROM usuarios u
             ${JOINS_PERFILES}
             ${where}
             ORDER BY u.id ASC
             LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                usuarios: usuarios.map((usuario) => ({
                    id: usuario.id,
                    nombre: usuario.nombre,
                    email: usuario.email,
                    telefono: usuario.telefono,
                    activo: Boolean(usuario.activo),
                    sesion: usuario.sesion,
                    created_at: usuario.created_at,
                    perfiles: [
                        usuario.cliente_id !== null && 'cliente',
                        usuario.comercio_id !== null && 'comercio',
                        usuario.repartidor_id !== null && 'repartidor',
                        usuario.administrador_id !== null && 'administrador'
                    ].filter(Boolean),
                    comercio: usuario.comercio_id !== null
                        ? { id: usuario.comercio_id, nombre: usuario.comercio_nombre, activo: Boolean(usuario.comercio_activo) }
                        : null
                })),
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// GET /api/admin/usuarios/:id
const obtenerUsuario = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del usuario no es válido");
        }

        const cuenta = await buscarCuenta(database, id);

        if (!cuenta) {
            return responderError(res, 404, "Usuario no encontrado");
        }

        const [conteos] = await database.query(
            `SELECT (SELECT COUNT(*) FROM pedidos pe INNER JOIN clientes cl ON cl.id = pe.cliente_id
                     WHERE cl.usuario_id = ?) AS como_cliente,
                    (SELECT COUNT(*) FROM pedidos pe INNER JOIN comercios co ON co.id = pe.comercio_id
                     WHERE co.usuario_id = ?) AS como_comercio,
                    (SELECT COUNT(*) FROM pedidos pe INNER JOIN repartidores re ON re.id = pe.repartidor_id
                     WHERE re.usuario_id = ?) AS como_repartidor,
                    (SELECT COUNT(*) FROM reclamos WHERE usuario_id = ?) AS reclamos`,
            [id, id, id, id]
        );

        const pedidosEnCurso = await buscarPedidosEnCurso(database, id);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                usuario: cuenta,
                pedidos: {
                    como_cliente: conteos[0].como_cliente,
                    como_comercio: conteos[0].como_comercio,
                    como_repartidor: conteos[0].como_repartidor,
                    en_curso: pedidosEnCurso
                },
                reclamos: conteos[0].reclamos
            }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// Roles que se pueden dar de alta desde el panel. Comercio y repartidor no: se
// registran desde su propio formulario sobre una cuenta que ya existe, con datos que
// solo tiene la persona (CUIT, licencia, patente).
const ROLES_ALTA = ['cliente', 'administrador'];

// POST /api/admin/usuarios
// Body: { nombre, email, contrasena, telefono, rol: 'cliente' | 'administrador',
//         direccion_entrega (solo cliente) }
//
// Con rol 'administrador' es el alta de administradores (semana 3). No hay registro
// publico de administradores: si lo hubiera, cualquiera podria darse permisos. El
// primero viene en la semilla de aTuPuerta.sql.
const crearUsuario = async (req, res) => {
    let connection;
    try {
        const { email, contrasena, rol } = req.body ?? {};

        if (!ROLES_ALTA.includes(rol)) {
            return responderError(res, 400, "El rol tiene que ser cliente o administrador. Los comercios y repartidores se registran desde su propio formulario, sobre una cuenta que ya existe");
        }

        const nombre = obtenerTextoValido(req.body?.nombre, { max: 100 });
        if (nombre === null) {
            return responderError(res, 400, "El nombre tiene que tener entre 1 y 100 caracteres");
        }

        if (!esEmailValido(email)) {
            return responderError(res, 400, "El email no tiene un formato válido");
        }

        if (!esContrasenaValida(contrasena)) {
            return responderError(res, 400, "La contraseña tiene que tener entre 8 y 72 caracteres");
        }

        if (!esTelefonoValido(req.body?.telefono)) {
            return responderError(res, 400, "El teléfono tiene que tener entre 6 y 20 caracteres: números, espacios, +, - o paréntesis");
        }

        let direccion = null;

        if (rol === 'cliente') {
            direccion = obtenerTextoValido(req.body?.direccion_entrega, { max: 200 });
            if (direccion === null) {
                return responderError(res, 400, "Un cliente necesita direccion_entrega, de entre 1 y 200 caracteres");
            }
        }

        // Geocodificacion ANTES de la transaccion, igual que el registro publico
        const punto = direccion !== null ? await geocodificarDireccion(direccion) : null;

        connection = await database.getConnection();
        await connection.beginTransaction();

        const emailLimpio = email.trim();

        const [existentes] = await connection.query(
            `SELECT id FROM usuarios WHERE email = ? FOR UPDATE`,
            [emailLimpio]
        );

        if (existentes.length > 0) {
            await connection.rollback();
            return responderError(res, 409, "Ya existe un usuario con ese email");
        }

        const contrasenaHash = await bcrypt.hash(contrasena, 10);

        const [resultado] = await connection.query(
            `INSERT INTO usuarios (nombre, email, contrasena, telefono, rol) VALUES (?, ?, ?, ?, ?)`,
            [nombre, emailLimpio, contrasenaHash, req.body.telefono.trim(), rol]
        );
        const usuarioId = resultado.insertId;

        if (rol === 'cliente') {
            await connection.query(
                `INSERT INTO clientes (usuario_id, direccion_entrega, latitud, longitud) VALUES (?, ?, ?, ?)`,
                [usuarioId, direccion, punto?.latitud ?? null, punto?.longitud ?? null]
            );
        } else {
            await connection.query(
                `INSERT INTO administradores (usuario_id) VALUES (?)`,
                [usuarioId]
            );
        }

        await connection.commit();

        const cuenta = await buscarCuenta(database, usuarioId);

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: rol === 'administrador' ? "Administrador dado de alta" : "Cliente dado de alta",
                usuario: cuenta
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        if (error.code === 'ER_DUP_ENTRY') {
            return responderError(res, 409, "Ya existe un usuario con ese email");
        }

        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

// PATCH /api/admin/usuarios/:id
// Body: cualquier subconjunto de { nombre, telefono, email }
//
// El email se edita aca y no desde el perfil propio: es con lo que la persona entra, y
// un administrador lo cambia a pedido, despues de verificar que es quien dice ser.
const actualizarUsuario = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del usuario no es válido");
        }

        const { nombre, telefono, email } = req.body ?? {};
        const cambios = {};

        if (nombre !== undefined) {
            const valor = obtenerTextoValido(nombre, { max: 100 });
            if (valor === null) {
                return responderError(res, 400, "El nombre tiene que tener entre 1 y 100 caracteres");
            }
            cambios.nombre = valor;
        }

        if (telefono !== undefined) {
            if (!esTelefonoValido(telefono)) {
                return responderError(res, 400, "El teléfono tiene que tener entre 6 y 20 caracteres: números, espacios, +, - o paréntesis");
            }
            cambios.telefono = telefono.trim();
        }

        if (email !== undefined) {
            if (!esEmailValido(email)) {
                return responderError(res, 400, "El email no tiene un formato válido");
            }
            cambios.email = email.trim();
        }

        const columnas = Object.keys(cambios);

        if (columnas.length === 0) {
            return responderError(res, 400, "Mandá al menos un campo para actualizar: nombre, telefono, email");
        }

        const [existentes] = await database.query(`SELECT id FROM usuarios WHERE id = ?`, [id]);

        if (existentes.length === 0) {
            return responderError(res, 404, "Usuario no encontrado");
        }

        // Los nombres de columna salen de cambios, que solo puede tener nombre,
        // telefono y email. Un email repetido lo frena UNIQUE uq_usuarios_email.
        await database.query(
            `UPDATE usuarios SET ${columnas.map((columna) => `${columna} = ?`).join(', ')} WHERE id = ?`,
            [...columnas.map((columna) => cambios[columna]), id]
        );

        const cuenta = await buscarCuenta(database, id);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Usuario actualizado",
                usuario: cuenta
            }
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return responderError(res, 409, "Ya existe otro usuario con ese email");
        }

        return responderError(res, 500, "Error interno del servidor");
    }
};

// Chequeos comunes de suspender y dar de baja. Devuelve { codigo, mensaje } si no se
// puede, o null si se puede. Corre adentro de la transaccion de quien llama.
const verificarQueSePuedeDesactivar = async (conexion, usuarioId, administradorUsuarioId) => {
    if (usuarioId === administradorUsuarioId) {
        return { codigo: 409, mensaje: "No podés suspender ni dar de baja tu propia cuenta desde el panel" };
    }

    if (await esUltimoAdministradorActivo(conexion, usuarioId)) {
        return { codigo: 409, mensaje: "Es el único administrador activo: el sistema no puede quedarse sin administradores" };
    }

    const pedidosEnCurso = await buscarPedidosEnCurso(conexion, usuarioId);

    if (pedidosEnCurso.length > 0) {
        return { codigo: 409, mensaje: describirPedidosEnCurso(pedidosEnCurso) };
    }

    return null;
};

// PATCH /api/admin/usuarios/:id/estado
// Body: { "activo": false } para suspender, { "activo": true } para reactivar
//
// Suspender corta el acceso al instante: verificarToken consulta usuarios.activo en
// cada request, asi que el token que la persona ya tiene deja de servir. No toca los
// perfiles, y por eso es reversible tal cual: reactivar deja todo como estaba.
const cambiarEstadoUsuario = async (req, res) => {
    let connection;
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del usuario no es válido");
        }

        const activo = req.body?.activo;

        // typeof y no truthy: el string "false" es truthy y reactivaria la cuenta
        if (typeof activo !== "boolean") {
            return responderError(res, 400, "activo es obligatorio y tiene que ser true o false");
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [usuarios] = await connection.query(
            `SELECT id, activo FROM usuarios WHERE id = ? FOR UPDATE`,
            [id]
        );

        if (usuarios.length === 0) {
            await connection.rollback();
            return responderError(res, 404, "Usuario no encontrado");
        }

        if (!activo) {
            const impedimento = await verificarQueSePuedeDesactivar(connection, id, req.usuario.id);

            if (impedimento) {
                await connection.rollback();
                return responderError(res, impedimento.codigo, impedimento.mensaje);
            }

            // Un repartidor suspendido no puede quedar "disponible": cuando lo
            // reactiven, vuelve fuera de servicio y se pone disponible cuando quiera
            await connection.query(
                `UPDATE repartidores SET disponible = FALSE WHERE usuario_id = ?`,
                [id]
            );
        }

        await connection.query(
            `UPDATE usuarios SET activo = ? WHERE id = ?`,
            [activo, id]
        );

        await connection.commit();

        if (activo && !usuarios[0].activo) {
            await enviarNotificaciones(id, {
                tipo: "cuenta_reactivada",
                titulo: "Cuenta reactivada",
                mensaje: "Un administrador reactivó tu cuenta. Ya podés volver a usar ATuPuerta.",
                url: "/"
            });
        }

        const cuenta = await buscarCuenta(database, id);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: activo ? "Usuario reactivado" : "Usuario suspendido",
                usuario: cuenta
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

// DELETE /api/admin/usuarios/:id
//
// Baja logica (ver darDeBajaCuenta en usuario.service.js): ademas de desactivar la
// cuenta, saca el comercio del catalogo, deja al repartidor fuera de servicio, cancela
// los pedidos que el cliente nunca pago y borra sus suscripciones push. Se puede
// revertir la cuenta con PATCH .../estado, pero el comercio hay que reactivarlo aparte.
const darDeBajaUsuario = async (req, res) => {
    let connection;
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del usuario no es válido");
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [usuarios] = await connection.query(
            `SELECT id FROM usuarios WHERE id = ? FOR UPDATE`,
            [id]
        );

        if (usuarios.length === 0) {
            await connection.rollback();
            return responderError(res, 404, "Usuario no encontrado");
        }

        const impedimento = await verificarQueSePuedeDesactivar(connection, id, req.usuario.id);

        if (impedimento) {
            await connection.rollback();
            return responderError(res, impedimento.codigo, impedimento.mensaje);
        }

        const { pedidosCancelados } = await darDeBajaCuenta(connection, {
            usuarioId: id,
            actorUsuarioId: req.usuario.id,
            administradorId: req.administradorId,
            motivo: "La cuenta fue dada de baja por un administrador"
        });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Usuario dado de baja",
                pedidos_cancelados: pedidosCancelados
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

// PATCH /api/admin/comercios/:id/estado
// Body: { "activo": false } para suspender el comercio, { "activo": true } para
// reactivarlo
//
// Suspende solo el comercio y no la cuenta: la persona sigue pudiendo comprar como
// cliente, pero su comercio sale del catalogo y resolverComercio le corta la gestion.
const cambiarEstadoComercio = async (req, res) => {
    let connection;
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return responderError(res, 400, "El id del comercio no es válido");
        }

        const activo = req.body?.activo;

        if (typeof activo !== "boolean") {
            return responderError(res, 400, "activo es obligatorio y tiene que ser true o false");
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [comercios] = await connection.query(
            `SELECT id, nombre, usuario_id, activo FROM comercios WHERE id = ? FOR UPDATE`,
            [id]
        );

        if (comercios.length === 0) {
            await connection.rollback();
            return responderError(res, 404, "Comercio no encontrado");
        }

        const comercio = comercios[0];

        // Mismo criterio que la suspension de una cuenta: un comercio con pedidos
        // pagados sin preparar los dejaria trabados, porque ya no los podria marcar
        if (!activo) {
            const [pendientes] = await connection.query(
                `SELECT id, estado FROM pedidos
                 WHERE comercio_id = ? AND estado IN ('en_preparacion', 'preparado')
                 ORDER BY id ASC`,
                [id]
            );

            if (pendientes.length > 0) {
                await connection.rollback();
                return responderError(res, 409, describirPedidosEnCurso(pendientes));
            }
        }

        await connection.query(
            `UPDATE comercios SET activo = ? WHERE id = ?`,
            [activo, id]
        );

        await connection.commit();

        if (Boolean(comercio.activo) !== activo) {
            await enviarNotificaciones(comercio.usuario_id, {
                tipo: activo ? "comercio_reactivado" : "comercio_suspendido",
                titulo: activo ? "Comercio reactivado" : "Comercio suspendido",
                mensaje: activo
                    ? `Un administrador reactivó ${comercio.nombre}. Ya vuelve a aparecer en el catálogo.`
                    : `Un administrador suspendió ${comercio.nombre}. Mientras tanto no aparece en el catálogo.`,
                url: "/comercio"
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: activo ? "Comercio reactivado" : "Comercio suspendido",
                comercio: { id: comercio.id, nombre: comercio.nombre, activo }
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    inicioSesionAdministrador,
    listarUsuarios,
    obtenerUsuario,
    crearUsuario,
    actualizarUsuario,
    cambiarEstadoUsuario,
    darDeBajaUsuario,
    cambiarEstadoComercio
};
