const bcrypt = require('bcryptjs');
const database = require('../database/database');
const { geocodificarDireccion } = require('../services/maps.service');
const {
    buscarCuenta,
    buscarPedidosEnCurso,
    describirPedidosEnCurso,
    esUltimoAdministradorActivo,
    darDeBajaCuenta
} = require('../services/usuario.service');
const { obtenerTextoValido, esTelefonoValido, esContrasenaValida } = require('../utils/validacion');

// Perfil propio (semana 3, CU11). Sirve para cualquier rol: la cuenta (nombre, email,
// telefono) es la misma, y los datos de cada perfil se editan en su propio endpoint
// (/api/comercio/perfil, /api/repartidor/perfil). La direccion de entrega es del
// perfil de cliente pero vive aca porque es lo unico que el cliente tiene para editar.
//
// El usuario sale siempre del token (req.usuario.id), nunca del body ni de la ruta: no
// hay forma de pedir o tocar el perfil de otro.

const responderError = (res, codigo, mensaje) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje }
    });
};

// GET /api/perfil
const obtenerPerfil = async (req, res) => {
    try {
        const cuenta = await buscarCuenta(database, req.usuario.id);

        if (!cuenta) {
            return responderError(res, 404, "Usuario no encontrado");
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { usuario: cuenta }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// PATCH /api/perfil
// Body: cualquier subconjunto de { nombre, telefono, direccion_entrega }
const actualizarPerfil = async (req, res) => {
    let connection;
    try {
        const { nombre, telefono, direccion_entrega, email } = req.body ?? {};

        // El email es con lo que se inicia sesion y lo que usan registroComercio y
        // registroRepartidor para encontrar la cuenta. Cambiarlo sin verificar la
        // casilla nueva es una forma facil de quedarse afuera, asi que lo hace un
        // administrador (PATCH /api/admin/usuarios/:id).
        if (email !== undefined) {
            return responderError(res, 400, "El email no se puede cambiar desde el perfil. Pedíselo a un administrador");
        }

        const cambiosUsuario = {};

        if (nombre !== undefined) {
            const valor = obtenerTextoValido(nombre, { max: 100 });
            if (valor === null) {
                return responderError(res, 400, "El nombre tiene que tener entre 1 y 100 caracteres");
            }
            cambiosUsuario.nombre = valor;
        }

        if (telefono !== undefined) {
            if (!esTelefonoValido(telefono)) {
                return responderError(res, 400, "El teléfono tiene que tener entre 6 y 20 caracteres: números, espacios, +, - o paréntesis");
            }
            cambiosUsuario.telefono = telefono.trim();
        }

        let direccionNueva = null;

        if (direccion_entrega !== undefined) {
            direccionNueva = obtenerTextoValido(direccion_entrega, { max: 200 });
            if (direccionNueva === null) {
                return responderError(res, 400, "La dirección de entrega tiene que tener entre 1 y 200 caracteres");
            }
        }

        if (Object.keys(cambiosUsuario).length === 0 && direccionNueva === null) {
            return responderError(res, 400, "Mandá al menos un campo para actualizar: nombre, telefono, direccion_entrega");
        }

        // La direccion se geocodifica ANTES de abrir la transaccion: es una llamada de
        // red (misma regla que el registro). Si no se puede ubicar quedan las
        // coordenadas en NULL y se completan solas cuando hagan falta
        // (asegurarCoordenadasCliente). Lo que no puede pasar es que queden las de la
        // direccion vieja: el proximo pedido saldria hacia el domicilio anterior.
        const punto = direccionNueva !== null ? await geocodificarDireccion(direccionNueva) : null;

        connection = await database.getConnection();
        await connection.beginTransaction();

        if (direccionNueva !== null) {
            const [resultado] = await connection.query(
                `UPDATE clientes SET direccion_entrega = ?, latitud = ?, longitud = ? WHERE usuario_id = ?`,
                [direccionNueva, punto?.latitud ?? null, punto?.longitud ?? null, req.usuario.id]
            );

            if (resultado.affectedRows === 0) {
                await connection.rollback();
                return responderError(res, 400, "Tu cuenta no tiene perfil de cliente, así que no tiene dirección de entrega");
            }
        }

        const columnas = Object.keys(cambiosUsuario);

        if (columnas.length > 0) {
            // Los nombres de columna salen de cambiosUsuario, que solo puede tener
            // nombre y telefono: el body nunca decide que columna se escribe
            await connection.query(
                `UPDATE usuarios SET ${columnas.map((columna) => `${columna} = ?`).join(', ')} WHERE id = ?`,
                [...columnas.map((columna) => cambiosUsuario[columna]), req.usuario.id]
            );
        }

        await connection.commit();

        const cuenta = await buscarCuenta(database, req.usuario.id);

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Perfil actualizado",
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

// PATCH /api/perfil/contrasena
// Body: { "contrasena_actual": "...", "contrasena_nueva": "..." }
//
// Pide la actual aunque el token sea valido: un token robado, o una sesion abierta en
// una compu ajena, no tienen que alcanzar para quedarse con la cuenta.
const cambiarContrasena = async (req, res) => {
    try {
        const { contrasena_actual, contrasena_nueva } = req.body ?? {};

        if (typeof contrasena_actual !== "string" || !contrasena_actual ||
            typeof contrasena_nueva !== "string" || !contrasena_nueva) {
            return responderError(res, 400, "contrasena_actual y contrasena_nueva son obligatorias");
        }

        if (!esContrasenaValida(contrasena_nueva)) {
            return responderError(res, 400, "La contraseña nueva tiene que tener entre 8 y 72 caracteres");
        }

        if (contrasena_nueva === contrasena_actual) {
            return responderError(res, 400, "La contraseña nueva tiene que ser distinta de la actual");
        }

        const [usuarios] = await database.query(
            `SELECT contrasena FROM usuarios WHERE id = ?`,
            [req.usuario.id]
        );

        if (usuarios.length === 0) {
            return responderError(res, 404, "Usuario no encontrado");
        }

        const contrasenaValida = await bcrypt.compare(contrasena_actual, usuarios[0].contrasena);
        if (!contrasenaValida) {
            return responderError(res, 401, "La contraseña actual no es correcta");
        }

        const contrasenaHash = await bcrypt.hash(contrasena_nueva, 10);

        await database.query(
            `UPDATE usuarios SET contrasena = ? WHERE id = ?`,
            [contrasenaHash, req.usuario.id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "Contraseña actualizada" }
        });

    } catch (error) {
        return responderError(res, 500, "Error interno del servidor");
    }
};

// DELETE /api/perfil
// Body: { "contrasena": "..." }
//
// Baja logica de la propia cuenta (ver darDeBajaCuenta en usuario.service.js). Pide la
// contraseña por el mismo motivo que cambiarContrasena, y porque es irreversible para
// el usuario: volver a activarla la puede hacer solo un administrador.
const darDeBajaPerfil = async (req, res) => {
    let connection;
    try {
        const { contrasena } = req.body ?? {};

        if (typeof contrasena !== "string" || !contrasena) {
            return responderError(res, 400, "Para dar de baja la cuenta mandá tu contraseña en el campo contrasena");
        }

        const [usuarios] = await database.query(
            `SELECT contrasena FROM usuarios WHERE id = ?`,
            [req.usuario.id]
        );

        if (usuarios.length === 0) {
            return responderError(res, 404, "Usuario no encontrado");
        }

        const contrasenaValida = await bcrypt.compare(contrasena, usuarios[0].contrasena);
        if (!contrasenaValida) {
            return responderError(res, 401, "La contraseña no es correcta");
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        if (await esUltimoAdministradorActivo(connection, req.usuario.id)) {
            await connection.rollback();
            return responderError(res, 409, "Sos el único administrador activo: antes de irte, dale de alta a otro");
        }

        const pedidosEnCurso = await buscarPedidosEnCurso(connection, req.usuario.id);

        if (pedidosEnCurso.length > 0) {
            await connection.rollback();
            return responderError(res, 409, describirPedidosEnCurso(pedidosEnCurso));
        }

        const { pedidosCancelados } = await darDeBajaCuenta(connection, {
            usuarioId: req.usuario.id,
            actorUsuarioId: req.usuario.id,
            motivo: "El cliente dio de baja su cuenta"
        });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Tu cuenta fue dada de baja",
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

module.exports = {
    obtenerPerfil,
    actualizarPerfil,
    cambiarContrasena,
    darDeBajaPerfil
};
