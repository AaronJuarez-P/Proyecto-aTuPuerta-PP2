const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database/database');
const { geocodificarDireccion } = require('../services/maps.service');
const { crearCuentaCliente } = require('../services/usuario.service');
const { verificacionActiva, enviaCorreos, enviarCodigoVerificacion } = require('../services/email.service');
const {
    MINUTOS_VIGENCIA,
    INTENTOS_MAXIMOS,
    SEGUNDOS_REENVIO,
    generarCodigo,
    hashearCodigo,
    codigoCoincide,
    esCodigoBienFormado
} = require('../services/verificacion.service');
const { esEmailValido, esTelefonoValido, esContrasenaValida } = require('../utils/validacion');

// ---------------------------------------------------------------------------
// Verificacion del correo al registrarse
//
// Con EMAIL_MODO=mock o smtp, POST /api/registro no crea la cuenta: guarda los datos
// en registros_pendientes y manda un codigo de 6 digitos. La cuenta (usuarios +
// clientes) se crea recien en POST /api/registro/verificar, cuando el codigo es
// correcto. Asi usuarios solo tiene cuentas con el correo verificado, y los logins, los
// registros de comercio y de repartidor y el panel no tienen que saber nada de esto.
//
// Con EMAIL_MODO=off el registro crea la cuenta directo, como antes.
// ---------------------------------------------------------------------------

const responderError = (res, codigo, mensaje, extra = {}) => {
    return res.status(codigo).json({
        codigo,
        estado: "error",
        datos: { mensaje, ...extra }
    });
};

// El mismo texto que los logins, y por el mismo motivo: verificar y reenviar contestan
// igual si no hay un registro pendiente para ese correo que si la contraseña no es la de
// ese registro, para que no sirvan para averiguar que correos estan a medio registrar.
const CREDENCIALES_INCORRECTAS = "Email o contraseña incorrectos";

// A quien pullea el codigo y todavia no corrio la migracion, el 500 solo no le dice nada
const avisarSiFaltaLaTabla = (error) => {
    if (error?.code === 'ER_NO_SUCH_TABLE' && String(error.message).includes('registros_pendientes')) {
        console.error("Falta la tabla registros_pendientes: corré scripts/migraciones/20261111_registros_pendientes.sql, o reimportá scripts/aTuPuerta.sql.");
        return true;
    }

    return false;
};

// Lo que el front necesita para mostrar el paso del codigo.
//
// codigo_mock viaja solo cuando NO se mandan correos de verdad (EMAIL_MODO=mock): no hay
// ninguna casilla que proteger, y es lo que deja completar el flujo desde el front,
// Postman y scripts/prueba-flujos.js sin leer la consola del backend. Con smtp no viaja
// nunca: ahi el codigo es justamente lo que prueba que la persona lee ese correo.
const datosDelCodigo = (email, codigoVerificacion) => ({
    email,
    minutos_vigencia: MINUTOS_VIGENCIA,
    segundos_reenvio: SEGUNDOS_REENVIO,
    ...(enviaCorreos() ? {} : { codigo_mock: codigoVerificacion })
});

// 429 con los segundos que faltan para poder pedirle otro codigo a ese correo
const responderEspera = async (res, email) => {
    const [filas] = await database.query(
        `SELECT TIMESTAMPDIFF(SECOND, ultimo_envio_en, NOW()) AS transcurridos
         FROM registros_pendientes
         WHERE email = ?`,
        [email]
    );

    const transcurridos = filas[0]?.transcurridos;
    const restantes = transcurridos === null || transcurridos === undefined
        ? SEGUNDOS_REENVIO
        : Math.min(SEGUNDOS_REENVIO, Math.max(1, SEGUNDOS_REENVIO - Number(transcurridos)));

    return responderError(
        res,
        429,
        `Ya te mandamos un código hace instantes. Esperá ${restantes} ${restantes === 1 ? 'segundo' : 'segundos'} para pedir otro.`,
        { segundos_restantes: restantes }
    );
};

// Manda el codigo y devuelve si salio. Si no salio libera la espera entre codigos
// (ultimo_envio_en = NULL): nadie recibio nada, asi que hay que poder reintentar
// enseguida en vez de esperar por un correo que nunca se mando.
const mandarCodigo = async (email, codigoVerificacion) => {
    try {
        await enviarCodigoVerificacion({ email, codigo: codigoVerificacion, minutos: MINUTOS_VIGENCIA });
        return true;
    } catch (error) {
        console.error(`[email] No se pudo mandar el código de verificación: ${error.message}`);

        await database.query(
            `UPDATE registros_pendientes SET ultimo_envio_en = NULL WHERE email = ?`,
            [email]
        ).catch(() => {});

        return false;
    }
};

const SIN_CORREO = "No pudimos mandarte el correo con el código. Probá de nuevo en unos minutos.";

// Registro con verificacion: guarda (o reemplaza) el registro pendiente y manda el
// codigo. Recibe los datos ya validados por registro().
const registrarPendiente = async (res, { nombre, email, contrasena, telefono, direccion_entrega }) => {
    // Sin FOR UPDATE ni transaccion: aca no se inserta en usuarios. Si la cuenta aparece
    // justo despues de este chequeo (un alta del administrador, por ejemplo) queda un
    // pendiente de mas que no hace daño: verificarRegistro choca con UNIQUE
    // uq_usuarios_email y lo borra.
    const [existentes] = await database.query(
        `SELECT id FROM usuarios WHERE email = ?`,
        [email]
    );

    if (existentes.length > 0) {
        return responderError(res, 400, "Usuario ya registrado");
    }

    // Llamada de red, antes de escribir nada (misma regla de la semana 9). Las
    // coordenadas esperan en el pendiente para que verificar no tenga que volver a
    // llamar al proveedor de mapas.
    const punto = await geocodificarDireccion(direccion_entrega);

    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const codigoVerificacion = generarCodigo();

    // Limpieza perezosa de los registros que nadie termino: son un nombre, un telefono
    // y una direccion de alguien que al final no se registro, y no hay por que
    // guardarlos. Va aca, y no en una tarea programada, porque el backend no tiene
    // ninguna y esta tabla solo crece por este endpoint.
    await database.query(
        `DELETE FROM registros_pendientes WHERE codigo_expira_en < NOW() - INTERVAL 1 DAY`
    );

    const datos = [
        nombre.trim(), contrasenaHash, telefono.trim(), direccion_entrega.trim(),
        punto?.latitud ?? null, punto?.longitud ?? null,
        hashearCodigo(codigoVerificacion), MINUTOS_VIGENCIA
    ];

    // Ya habia un pendiente para este correo: se reemplaza entero, contraseña incluida.
    // Es lo que hace que un correo mal escrito o un registro abandonado no dejen la
    // direccion tomada.
    //
    // El WHERE hace de "reservar el turno" de forma atomica (como la asignacion de
    // pedidos): si dos pedidos llegan juntos, solo uno afecta la fila y manda el correo.
    const [reemplazo] = await database.query(
        `UPDATE registros_pendientes
         SET email = ?, nombre = ?, contrasena = ?, telefono = ?, direccion_entrega = ?,
             latitud = ?, longitud = ?, codigo_hash = ?,
             codigo_expira_en = NOW() + INTERVAL ? MINUTE,
             intentos_fallidos = 0, ultimo_envio_en = NOW()
         WHERE email = ?
           AND (ultimo_envio_en IS NULL OR ultimo_envio_en <= NOW() - INTERVAL ? SECOND)`,
        [email, ...datos, email, SEGUNDOS_REENVIO]
    );

    if (reemplazo.affectedRows === 0) {
        // O no habia pendiente, o hay uno al que se le mando un codigo hace instantes.
        // El INSERT los distingue sin una consulta previa: UNIQUE
        // uq_registros_pendientes_email lo rechaza en el segundo caso.
        try {
            await database.query(
                `INSERT INTO registros_pendientes
                 (email, nombre, contrasena, telefono, direccion_entrega, latitud, longitud,
                  codigo_hash, codigo_expira_en, ultimo_envio_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ? MINUTE, NOW())`,
                [email, ...datos]
            );
        } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') {
                throw error;
            }

            return responderEspera(res, email);
        }
    }

    // Otra llamada de red, y tambien fuera de toda transaccion. A diferencia del push,
    // este envio no es "si sale, sale": sin el correo la persona no puede seguir, asi
    // que se espera y, si falla, se le avisa.
    if (!(await mandarCodigo(email, codigoVerificacion))) {
        return responderError(res, 503, SIN_CORREO);
    }

    // 202 y no 201: el pedido se acepto, pero la cuenta todavia no existe. El 201 lo
    // contesta verificarRegistro, que es quien la crea.
    return res.status(202).json({
        codigo: 202,
        estado: "exito",
        datos: {
            mensaje: `Te mandamos un código de 6 dígitos a ${email}. Ingresalo para terminar de crear tu cuenta.`,
            verificacion_pendiente: true,
            ...datosDelCodigo(email, codigoVerificacion)
        }
    });
};

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

        // Semana 14: largos y formatos. Los maximos son los de las columnas: pasarse
        // era un 500 con MySQL en modo estricto y un recorte silencioso en XAMPP.
        if (nombre.trim().length > 100) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El nombre no puede superar los 100 caracteres" }
            });
        }

        if (!esTelefonoValido(telefono)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El teléfono tiene que tener entre 6 y 20 caracteres: números, espacios, +, - o paréntesis" }
            });
        }

        if (direccion_entrega.trim().length > 200) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "La dirección de entrega no puede superar los 200 caracteres" }
            });
        }

        if (!esContrasenaValida(contrasena)) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "La contraseña tiene que tener entre 8 y 72 caracteres" }
            });
        }

        // Se guarda recortado (semana 14): un espacio de mas al principio del email
        // haria que despues el login no lo encuentre
        const emailLimpio = email.trim();

        // Verificacion del correo: con EMAIL_MODO=mock o smtp la cuenta no se crea aca,
        // sino cuando la persona ingresa el codigo (verificarRegistro)
        if (verificacionActiva()) {
            return await registrarPendiente(res, { nombre, email: emailLimpio, contrasena, telefono, direccion_entrega });
        }

        // De aca para abajo, EMAIL_MODO=off: el registro directo de siempre.

        // Geocodificacion ANTES de abrir la transaccion (semana 9): es una llamada de
        // red y no puede quedar adentro. Si falla devuelve null y el usuario se crea
        // igual con las coordenadas en NULL; se completan solas la primera vez que
        // hagan falta (ver asegurarCoordenadasCliente en ubicacion.service.js).
        const punto = await geocodificarDireccion(direccion_entrega);

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [existentes] = await connection.query(
            `SELECT id FROM usuarios WHERE email = ? FOR UPDATE`,
            [emailLimpio]
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

        // Usuario y perfil de cliente juntos: sin el perfil, el usuario nunca podria
        // usar el carrito ni crear pedidos
        await crearCuentaCliente(connection, {
            nombre: nombre.trim(),
            email: emailLimpio,
            contrasenaHash,
            telefono: telefono.trim(),
            direccionEntrega: direccion_entrega.trim(),
            latitud: punto?.latitud ?? null,
            longitud: punto?.longitud ?? null
        });

        await connection.commit();

        // Si para este correo habia quedado un registro pendiente de cuando la
        // verificacion estaba prendida, ya no sirve. Va despues del commit y sin await:
        // si falla (o si la tabla ni existe, que con off no hace falta) la cuenta ya
        // esta creada igual, y un pendiente huerfano se limpia solo.
        database.query(`DELETE FROM registros_pendientes WHERE email = ?`, [emailLimpio]).catch(() => {});

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
        avisarSiFaltaLaTabla(error);
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

// POST /api/registro/verificar
// Body: { "email": "...", "contrasena": "...", "codigo": "123456" }
//
// Segundo paso del registro: con el codigo correcto crea la cuenta que estaba esperando
// en registros_pendientes.
//
// Pide tambien la contraseña, y no es de mas. El codigo prueba que la persona lee ese
// correo; la contraseña, que el registro que esta confirmando es el suyo. Sin eso habria
// una forma de quedarse con la cuenta de otro: registrarse con SU correo y una
// contraseña propia justo cuando esa persona se esta registrando. A ella le llega un
// codigo mas, lo ingresa convencida de que es el suyo, y deja verificada una cuenta que
// abre la contraseña del atacante. Con la contraseña en el medio, ese codigo no
// confirma nada: solo coincide con el registro de quien conoce las dos cosas.
const verificarRegistro = async (req, res) => {
    let connection;
    let emailLimpio = null;
    try {
        const { email, contrasena, codigo } = req.body ?? {};

        if (typeof email !== "string" || typeof contrasena !== "string" ||
            !email.trim() || !contrasena || codigo === undefined || codigo === null || codigo === "") {
            return responderError(res, 400, "Email, contraseña y código son obligatorios");
        }

        if (!esCodigoBienFormado(codigo)) {
            return responderError(res, 400, "El código tiene 6 dígitos y va como texto");
        }

        emailLimpio = email.trim();

        connection = await database.getConnection();
        await connection.beginTransaction();

        // FOR UPDATE: dos pedidos con el mismo codigo se ponen en fila. El segundo ve lo
        // que dejo el primero (el pendiente ya borrado, o un intento mas contado), asi
        // que ni se crean dos cuentas ni se cuelan intentos de mas probando en paralelo.
        //
        // El vencimiento se compara en el SQL, contra el mismo NOW() con el que se
        // guardo: no depende del reloj ni de la zona horaria del backend.
        const [pendientes] = await connection.query(
            `SELECT id, email, nombre, contrasena, telefono, direccion_entrega, latitud, longitud,
                    codigo_hash, intentos_fallidos, (codigo_expira_en < NOW()) AS vencido
             FROM registros_pendientes
             WHERE email = ?
             FOR UPDATE`,
            [emailLimpio]
        );

        if (pendientes.length === 0 || !(await bcrypt.compare(contrasena, pendientes[0].contrasena))) {
            await connection.rollback();
            return responderError(res, 401, CREDENCIALES_INCORRECTAS);
        }

        const pendiente = pendientes[0];

        // Antes de mirar el codigo: con los intentos agotados no sirve ni el correcto,
        // que si no el limite seria solo un cartel
        if (pendiente.intentos_fallidos >= INTENTOS_MAXIMOS) {
            await connection.rollback();
            return responderError(res, 429, "Agotaste los intentos con este código. Pedí uno nuevo.");
        }

        if (pendiente.vencido) {
            await connection.rollback();
            return responderError(res, 400, "El código venció. Pedí uno nuevo.");
        }

        if (!codigoCoincide(codigo.trim(), pendiente.codigo_hash)) {
            await connection.query(
                `UPDATE registros_pendientes SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?`,
                [pendiente.id]
            );

            // commit y no rollback: el intento tiene que quedar contado
            await connection.commit();

            const restantes = INTENTOS_MAXIMOS - pendiente.intentos_fallidos - 1;
            const mensaje = restantes > 0
                ? `El código no es correcto. Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`}.`
                : "El código no es correcto y ya no te quedan intentos. Pedí uno nuevo.";

            return responderError(res, 400, mensaje, { intentos_restantes: restantes });
        }

        // La contraseña ya esta hasheada desde el registro y las coordenadas ya estan
        // resueltas: aca no hay ninguna llamada de red, solo la transaccion
        await crearCuentaCliente(connection, {
            nombre: pendiente.nombre,
            email: pendiente.email,
            contrasenaHash: pendiente.contrasena,
            telefono: pendiente.telefono,
            direccionEntrega: pendiente.direccion_entrega,
            latitud: pendiente.latitud,
            longitud: pendiente.longitud
        });

        await connection.query(
            `DELETE FROM registros_pendientes WHERE id = ?`,
            [pendiente.id]
        );

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { mensaje: "¡Listo! Verificamos tu correo y tu cuenta ya está creada. Iniciá sesión para empezar." }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
            }
        }

        // La cuenta se creo por otro camino mientras el registro esperaba: un
        // administrador la dio de alta, o el backend paso un rato por EMAIL_MODO=off.
        // El pendiente ya no sirve para nada.
        if (error.code === 'ER_DUP_ENTRY') {
            await database.query(
                `DELETE FROM registros_pendientes WHERE email = ?`,
                [emailLimpio]
            ).catch(() => {});

            return responderError(res, 400, "Usuario ya registrado");
        }

        avisarSiFaltaLaTabla(error);
        return responderError(res, 500, "Error interno del servidor");
    } finally {
        if (connection) connection.release();
    }
};

// POST /api/registro/reenviar
// Body: { "email": "...", "contrasena": "..." }
//
// Emite un codigo nuevo para un registro pendiente y lo manda. El anterior deja de
// servir y los intentos vuelven a 0.
//
// Pide la contraseña por el mismo motivo que verificarRegistro, y por uno mas: sin ella
// alcanzaria con saber un correo a medio registrar para hacerle llegar codigos.
const reenviarCodigo = async (req, res) => {
    try {
        const { email, contrasena } = req.body ?? {};

        if (typeof email !== "string" || typeof contrasena !== "string" ||
            !email.trim() || !contrasena) {
            return responderError(res, 400, "Email y contraseña son obligatorios");
        }

        const emailLimpio = email.trim();

        const [pendientes] = await database.query(
            `SELECT id, contrasena FROM registros_pendientes WHERE email = ?`,
            [emailLimpio]
        );

        if (pendientes.length === 0 || !(await bcrypt.compare(contrasena, pendientes[0].contrasena))) {
            return responderError(res, 401, CREDENCIALES_INCORRECTAS);
        }

        const codigoVerificacion = generarCodigo();

        // El WHERE reserva el turno de forma atomica, igual que en registrarPendiente:
        // de dos clics seguidos en "Reenviar", solo uno afecta la fila y manda el correo
        const [resultado] = await database.query(
            `UPDATE registros_pendientes
             SET codigo_hash = ?, codigo_expira_en = NOW() + INTERVAL ? MINUTE,
                 intentos_fallidos = 0, ultimo_envio_en = NOW()
             WHERE id = ?
               AND (ultimo_envio_en IS NULL OR ultimo_envio_en <= NOW() - INTERVAL ? SECOND)`,
            [hashearCodigo(codigoVerificacion), MINUTOS_VIGENCIA, pendientes[0].id, SEGUNDOS_REENVIO]
        );

        if (resultado.affectedRows === 0) {
            return await responderEspera(res, emailLimpio);
        }

        if (!(await mandarCodigo(emailLimpio, codigoVerificacion))) {
            return responderError(res, 503, SIN_CORREO);
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: `Te mandamos un código nuevo a ${emailLimpio}.`,
                ...datosDelCodigo(emailLimpio, codigoVerificacion)
            }
        });

    } catch (error) {
        avisarSiFaltaLaTabla(error);
        return responderError(res, 500, "Error interno del servidor");
    }
};

// true si para ese correo hay un registro esperando el codigo Y la contraseña es la de
// ese registro. Lo usa el login para avisar "te falta verificar" en vez del generico.
const esRegistroPendiente = async (email, contrasena) => {
    try {
        const [pendientes] = await database.query(
            `SELECT contrasena FROM registros_pendientes WHERE email = ?`,
            [email.trim()]
        );

        return pendientes.length > 0 && await bcrypt.compare(contrasena, pendientes[0].contrasena);
    } catch (error) {
        // Sin la migracion corrida, el login tiene que seguir contestando lo de siempre
        if (avisarSiFaltaLaTabla(error)) {
            return false;
        }

        throw error;
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
            // Verificacion del correo: quien se registro y todavia no ingreso el codigo
            // no tiene fila en usuarios, asi que caeria aca con un "incorrectos" que no
            // le dice que le falta. Se le avisa, pero solo si ademas la contraseña es la
            // de ese registro: sin ella contesta lo generico, igual que "Usuario
            // inactivo", que tambien se dice recien despues de comprobar la contraseña.
            if (await esRegistroPendiente(email, contrasena)) {
                return res.status(403).json({
                    codigo: 403,
                    estado: "error",
                    datos: {
                        mensaje: "Todavía no verificaste tu correo. Ingresá el código que te mandamos para terminar de crear tu cuenta.",
                        verificacion_pendiente: true
                    }
                });
            }

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

module.exports = { registro, verificarRegistro, reenviarCodigo, inicioSesion };