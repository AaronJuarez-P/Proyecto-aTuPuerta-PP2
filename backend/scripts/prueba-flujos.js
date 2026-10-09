// Prueba de humo de punta a punta (semana 14).
//
// Recorre los flujos completos de la API contra un servidor levantado y verifica los
// codigos y los datos clave de cada respuesta. Sirve como prueba de regresion antes de
// entregar o de mergear: si algo que andaba se rompe, lo dice.
//
// Uso:
//   1. Importar scripts/aTuPuerta.sql RECIEN (los ids esperados son los de la semilla).
//   2. .env con MP_MODO=mock y MAPS_MODO=mock.
//   3. npm run dev (en otra terminal).
//   4. node scripts/prueba-flujos.js
//
// Con otra URL: BASE_URL=http://localhost:4100/api node scripts/prueba-flujos.js
//
// OJO: el ultimo bloque agota el limite de intentos de login fallidos a proposito, asi
// que por unos minutos (RATE_LIMIT_VENTANA_MINUTOS) los logins desde esta maquina van a
// dar 429. Reiniciar el servidor lo resetea: los contadores viven en memoria.
//
// No usa dependencias: fetch viene con Node 18+. El bloque del socket usa
// socket.io-client (devDependency); si no esta instalado, se saltea.

const BASE = process.env.BASE_URL || "http://localhost:4000/api";
const RAIZ = BASE.replace(/\/api\/?$/, "");

let pasos = 0;
let fallos = 0;

const seccion = (titulo) => console.log(`\n== ${titulo} ==`);

const verificar = (descripcion, condicion, detalle) => {
    pasos++;

    if (condicion) {
        console.log(`  [OK]    ${descripcion}`);
    } else {
        fallos++;
        console.log(`  [FALLO] ${descripcion}`);
        if (detalle) {
            console.log(`          ${detalle}`);
        }
    }
};

// Hace el request y devuelve { status, json, headers }. token va crudo en Authorization,
// que es la convencion del proyecto; crudo manda el body tal cual, sin JSON.stringify.
const llamar = async (metodo, ruta, { token, body, crudo } = {}) => {
    const opciones = { method: metodo, headers: {} };

    if (token) {
        opciones.headers.Authorization = token;
    }

    if (crudo !== undefined || body !== undefined) {
        opciones.headers["Content-Type"] = "application/json";
        opciones.body = crudo !== undefined ? crudo : JSON.stringify(body);
    }

    const respuesta = await fetch(ruta.startsWith("http") ? ruta : BASE + ruta, opciones);
    let json = null;

    try {
        json = await respuesta.json();
    } catch (error) {
        json = null;
    }

    return { status: respuesta.status, json, headers: respuesta.headers };
};

// Llama y verifica el codigo HTTP y, opcionalmente, una condicion sobre el JSON
const esperar = async (descripcion, metodo, ruta, opciones, codigoEsperado, condicion) => {
    const respuesta = await llamar(metodo, ruta, opciones);
    let ok = respuesta.status === codigoEsperado;

    if (ok && condicion) {
        try {
            ok = Boolean(condicion(respuesta.json?.datos, respuesta.json));
        } catch (error) {
            ok = false;
        }
    }

    verificar(
        `${metodo} ${ruta} -> ${codigoEsperado} ${descripcion}`,
        ok,
        `obtuvo ${respuesta.status}: ${JSON.stringify(respuesta.json)?.slice(0, 400)}`
    );

    return respuesta;
};

const login = async (ruta, body) => {
    const respuesta = await llamar("POST", ruta, { body });
    verificar(`login ${body.email}`, respuesta.status === 200 && respuesta.json?.datos?.token,
        `obtuvo ${respuesta.status}: ${JSON.stringify(respuesta.json)}`);
    return respuesta.json?.datos?.token;
};

const CONTRASENA = "Test1234!";

const main = async () => {
    console.log(`Probando ${BASE}`);

    // -----------------------------------------------------------------------
    seccion("Semana 1 y 14 - Salud, errores y cabeceras");
    // -----------------------------------------------------------------------
    const salud = await esperar("servidor y base arriba", "GET", `${RAIZ}/health`, {}, 200,
        (datos) => datos.base_de_datos === "ok");

    verificar("helmet: X-Content-Type-Options nosniff", salud.headers.get("x-content-type-options") === "nosniff");
    verificar("helmet: sin X-Powered-By", !salud.headers.get("x-powered-by"));

    await esperar("ruta desconocida", "GET", "/no-existe", {}, 404);
    await esperar("sin token", "GET", "/perfil", {}, 401,
        (datos) => datos.mensaje === "Token no proporcionado");
    await esperar("JSON mal escrito", "POST", "/inicioSesion", { crudo: '{"email":' }, 400,
        (datos) => datos.mensaje.includes("JSON"));
    await esperar("body demasiado grande", "POST", "/inicioSesion",
        { crudo: JSON.stringify({ email: "x".repeat(200 * 1024) }) }, 413);
    await esperar("query con array", "GET", "/productos?buscar[]=martillo", {}, 400);

    // -----------------------------------------------------------------------
    seccion("Logins de la semilla");
    // -----------------------------------------------------------------------
    const juan = await login("/inicioSesion", { email: "juan.perez@test.com", contrasena: CONTRASENA });
    const maria = await login("/inicioSesion", { email: "maria.gomez@test.com", contrasena: CONTRASENA });
    const ferreteria = await login("/inicioSesionComercio", { email: "ferreteria.central@test.com", contrasena: CONTRASENA, cuil: "20304050607" });
    const libreria = await login("/inicioSesionComercio", { email: "libreria.sur@test.com", contrasena: CONTRASENA, cuil: "20405060708" });
    const carlos = await login("/inicioSesionRepartidor", { email: "carlos.repartidor@test.com", contrasena: CONTRASENA });
    const lucia = await login("/inicioSesionRepartidor", { email: "lucia.repartidor@test.com", contrasena: CONTRASENA });
    const admin = await login("/inicioSesionAdministrador", { email: "admin@test.com", contrasena: CONTRASENA });

    await esperar("con prefijo Bearer", "GET", "/perfil", { token: `Bearer ${juan}` }, 200);

    // -----------------------------------------------------------------------
    seccion("Semana 3 - Perfiles");
    // -----------------------------------------------------------------------
    await esperar("perfil de Juan", "GET", "/perfil", { token: juan }, 200,
        (datos) => datos.usuario.perfiles.cliente !== null && datos.usuario.sesion === "cliente");
    await esperar("editar telefono", "PATCH", "/perfil", { token: juan, body: { telefono: "3421111111" } }, 200,
        (datos) => datos.usuario.telefono === "3421111111");
    await esperar("el email no se edita desde el perfil", "PATCH", "/perfil", { token: juan, body: { email: "otro@test.com" } }, 400);
    await esperar("nombre de 101 caracteres", "PATCH", "/perfil", { token: juan, body: { nombre: "x".repeat(101) } }, 400);
    await esperar("cambiar contraseña con la actual mal", "PATCH", "/perfil/contrasena",
        { token: juan, body: { contrasena_actual: "Incorrecta1", contrasena_nueva: "Nueva12345" } }, 401);
    await esperar("cambiar contraseña", "PATCH", "/perfil/contrasena",
        { token: juan, body: { contrasena_actual: CONTRASENA, contrasena_nueva: "Nueva12345" } }, 200);
    await esperar("login con la nueva", "POST", "/inicioSesion",
        { body: { email: "juan.perez@test.com", contrasena: "Nueva12345" } }, 200);
    await esperar("volver a la de la semilla", "PATCH", "/perfil/contrasena",
        { token: juan, body: { contrasena_actual: "Nueva12345", contrasena_nueva: CONTRASENA } }, 200);

    await esperar("perfil del comercio", "GET", "/comercio/perfil", { token: ferreteria }, 200,
        (datos) => datos.comercio.cuit_cuil === "20304050607");
    await esperar("editar horario del comercio", "PATCH", "/comercio/perfil",
        { token: ferreteria, body: { horario_atencion: "Lun a Dom 08:00-22:00" } }, 200,
        (datos) => datos.comercio.horario_atencion === "Lun a Dom 08:00-22:00");
    await esperar("el horario actualizado persiste en la base", "GET", "/comercio/perfil", { token: ferreteria }, 200,
        (datos) => datos.comercio.horario_atencion === "Lun a Dom 08:00-22:00");
    await esperar("perfil del comercio con token de cliente", "GET", "/comercio/perfil", { token: juan }, 403);

    await esperar("perfil de Carlos con pedido en curso", "GET", "/repartidor/perfil", { token: carlos }, 200,
        (datos) => datos.pedido_en_curso === 1);
    await esperar("no cambia el vehiculo con un pedido en camino", "PATCH", "/repartidor/perfil",
        { token: carlos, body: { tipo_vehiculo: "auto" } }, 409);
    await esperar("patente repetida", "PATCH", "/repartidor/perfil",
        { token: lucia, body: { patente: "A123BCD" } }, 409);
    await esperar("editar licencia", "PATCH", "/repartidor/perfil",
        { token: lucia, body: { numero_licencia: "LIC-999" } }, 200,
        (datos) => datos.repartidor.numero_licencia === "LIC-999");

    // -----------------------------------------------------------------------
    seccion("Semana 11 - Notificaciones");
    // -----------------------------------------------------------------------
    await esperar("Juan tiene 1 sin leer", "GET", "/notificaciones", { token: juan }, 200,
        (datos) => datos.no_leidas === 1);
    await esperar("marcar la 1 como leida", "PATCH", "/notificaciones/1/leida", { token: juan }, 200);
    await esperar("ya no le quedan sin leer", "GET", "/notificaciones?no_leidas=true", { token: juan }, 200,
        (datos) => datos.no_leidas === 0 && datos.notificaciones.length === 0);
    await esperar("la de otro usuario da 404", "PATCH", "/notificaciones/3/leida", { token: juan }, 404);
    await esperar("clave publica sin VAPID", "GET", "/notificaciones/clave-publica", {}, 200,
        (datos) => typeof datos.push_habilitado === "boolean");
    await esperar("suscripcion invalida", "POST", "/notificaciones/suscribir",
        { token: juan, body: { endpoint: "http://no-es-https" } }, 400);

    // -----------------------------------------------------------------------
    seccion("Semanas 5 a 10 - Flujo completo del pedido (regresion + semana 7)");
    // -----------------------------------------------------------------------
    await esperar("carrito con token de comercio", "GET", "/carrito/listar", { token: ferreteria }, 403);
    await esperar("agregar cuadernos", "POST", "/carrito/agregar", { token: maria, body: { id_producto: 4, cantidad: 2 } }, 201);
    await esperar("agregar martillo", "POST", "/carrito/agregar", { token: maria, body: { id_producto: 1, cantidad: 1 } }, 201);
    await esperar("subir la cantidad de cuadernos", "PATCH", "/carrito/4", { token: maria, body: { cantidad: 3 } }, 200,
        (datos) => datos.item.cantidad === 3);
    await esperar("cantidad por encima del stock", "PATCH", "/carrito/4", { token: maria, body: { cantidad: 999 } }, 400);
    await esperar("cantidad 0 no vale: sacar es DELETE", "PATCH", "/carrito/4", { token: maria, body: { cantidad: 0 } }, 400);
    await esperar("un producto que no está en el carrito", "PATCH", "/carrito/5", { token: maria, body: { cantidad: 1 } }, 404);
    await esperar("volver a 2 cuadernos", "PATCH", "/carrito/4", { token: maria, body: { cantidad: 2 } }, 200,
        (datos) => datos.item.cantidad === 2);
    await esperar("confirmar: un pedido por comercio", "POST", "/carrito/confirmar", { token: maria }, 201,
        (datos) => datos.pedidos.length === 2 && datos.pedidos[0].pedidoId === 4 && datos.pedidos[1].pedidoId === 5);
    await esperar("nace en pago_espera", "GET", "/pedidos/5", { token: maria }, 200,
        (datos) => datos.pedido.estado === "pago_espera" && datos.pedido.items.length === 1);
    await esperar("stock descontado", "GET", "/productos/4", {}, 200, (datos) => datos.producto.stock === 38);
    await esperar("aviso de pedido creado", "GET", "/notificaciones", { token: maria }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "pedido_creado" && n.mensaje.includes("#5")));

    await esperar("el cliente cancela antes de pagar", "PATCH", "/pedidos/4/cancelar", { token: maria }, 200);
    await esperar("el stock vuelve", "GET", "/productos/1", {}, 200, (datos) => datos.producto.stock === 25);
    await esperar("no se cancela dos veces", "PATCH", "/pedidos/4/cancelar", { token: maria }, 409);
    await esperar("un cancelado no se paga", "POST", "/pedidos/4/pagar", { token: maria }, 409);

    await esperar("pagar", "POST", "/pedidos/5/pagar", { token: maria }, 201);
    await esperar("simular aprobado", "POST", "/pagos/simular", { token: maria, body: { pedido_id: 5, resultado: "approved" } }, 200,
        (datos) => datos.resultado === "aprobado");
    await esperar("pago consultado", "GET", "/pedidos/5/pago", { token: maria }, 200,
        (datos) => datos.pago.estado === "aprobado" && datos.pedido.estado === "en_preparacion");
    await esperar("aviso de pago aprobado al cliente", "GET", "/notificaciones", { token: maria }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "pago_aprobado"));

    await esperar("la libreria ve lo que tiene que preparar", "GET", "/comercio/ventas?estado=en_preparacion", { token: libreria }, 200,
        (datos) => datos.ventas.map((v) => v.id).sort().join(",") === "3,5");
    await esperar("otro comercio no lo puede subir", "PATCH", "/comercios/pedidos/5/subir", { token: ferreteria }, 403);
    await esperar("la libreria lo marca preparado", "PATCH", "/comercios/pedidos/5/subir", { token: libreria }, 200);
    await esperar("no se marca dos veces", "PATCH", "/comercios/pedidos/5/subir", { token: libreria }, 409);

    await esperar("Lucia entra en servicio", "PATCH", "/repartidor/disponibilidad", { token: lucia, body: { disponible: true } }, 200);
    await esperar("ve el preparado y el en_preparacion", "GET", "/pedido/listar", { token: lucia }, 200,
        (datos) => datos.pedidos.some((p) => p.id === 5 && p.estado === "preparado") &&
                   datos.pedidos.some((p) => p.id === 3 && p.estado === "en_preparacion"));
    await esperar("toma el pedido preparado", "PATCH", "/pedido/asignar/5", { token: lucia }, 200);
    await esperar("Carlos no disponible no toma", "PATCH", "/pedido/asignar/3", { token: carlos }, 409);

    const detalle = await esperar("el cliente ve el codigo en camino", "GET", "/pedidos/5", { token: maria }, 200,
        (datos) => datos.pedido.estado === "en_camino" && /^\d{8}$/.test(datos.pedido.codigo_entrega));
    const codigo = detalle.json?.datos?.pedido?.codigo_entrega;

    await esperar("aviso con el codigo", "GET", "/notificaciones", { token: maria }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "pedido_en_camino" && n.mensaje.includes(codigo)));
    await esperar("ubicacion del repartidor", "POST", "/repartidor/ubicacion",
        { token: lucia, body: { latitud: -31.672, longitud: -60.77 } }, 201);
    const sinRetirar = await esperar("seguimiento del cliente: sin retirar, la ruta pasa por el comercio", "GET", "/pedidos/5/seguimiento", { token: maria }, 200,
        (datos) => datos.pedido.estado === "en_camino" && datos.retirado === false);
    const rutaSinRetirar = sinRetirar.json?.datos?.ruta?.distancia_km;
    await esperar("la del repartidor es la misma, con la parada", "GET", "/pedido/ruta/5", { token: lucia }, 200,
        (datos) => datos.retirado === false && datos.ruta.tramos.length === 2 && datos.ruta.distancia_km === rutaSinRetirar);
    await esperar("retiro sin decir si retiró", "PATCH", "/pedido/retiro/5", { token: lucia, body: {} }, 400);
    await esperar("otro repartidor no marca el retiro", "PATCH", "/pedido/retiro/5", { token: carlos, body: { retirado: true } }, 403);
    await esperar("Lucía retira el pedido del comercio", "PATCH", "/pedido/retiro/5", { token: lucia, body: { retirado: true } }, 200,
        (datos) => datos.pedido.retirado === true && Boolean(datos.pedido.retirado_en));
    await esperar("marcarlo de nuevo no cambia nada", "PATCH", "/pedido/retiro/5", { token: lucia, body: { retirado: true } }, 200);
    await esperar("la ruta del repartidor ya no pasa por el comercio", "GET", "/pedido/ruta/5", { token: lucia }, 200,
        (datos) => datos.retirado === true && datos.ruta.tramos.length === 1 && !datos.ruta.puntos.comercio);
    await esperar("la del cliente tampoco, y es más corta", "GET", "/pedidos/5/seguimiento", { token: maria }, 200,
        (datos) => datos.retirado === true && datos.ruta.distancia_km < rutaSinRetirar);
    await esperar("codigo incorrecto", "PATCH", "/pedido/entrega/5", { token: lucia, body: { codigoPedido: "00000000" } }, 400);
    await esperar("entrega", "PATCH", "/pedido/entrega/5", { token: lucia, body: { codigoPedido: codigo } }, 200);
    await esperar("entregado, el retiro ya no se toca", "PATCH", "/pedido/retiro/5", { token: lucia, body: { retirado: false } }, 409);
    await esperar("las entregas de Lucía: sin pedido en curso y con la 5 entregada", "GET", "/repartidor/entregas", { token: lucia }, 200,
        (datos) => datos.en_curso === null && datos.entregas.some((e) => e.id === 5 && e.estado === "entregado") &&
                   datos.resumen.entregados === 1 && datos.resumen.comisiones > 0);
    await esperar("el pedido en curso de Carlos trae las direcciones y los ítems", "GET", "/repartidor/entregas", { token: carlos }, 200,
        (datos) => datos.en_curso?.id === 1 && datos.en_curso.direccion_entrega.includes("San Martín") &&
                   datos.en_curso.items.length === 2 && typeof datos.en_curso.comision === "number" &&
                   datos.en_curso.retirado_en === null);
    await esperar("estado de entrega inventado", "GET", "/repartidor/entregas?estado=perdido", { token: lucia }, 400);

    // -----------------------------------------------------------------------
    seccion("Semana 12 - Historial y repeticion");
    // -----------------------------------------------------------------------
    await esperar("historial de Maria", "GET", "/pedidos", { token: maria }, 200,
        (datos) => datos.paginacion.total === 4 && datos.pedidos[0].id === 5);
    await esperar("filtro por estado", "GET", "/pedidos?estado=entregado", { token: maria }, 200,
        (datos) => datos.pedidos.length === 1 && datos.pedidos[0].id === 5);
    await esperar("fecha inexistente", "GET", "/pedidos?desde=2026-02-31", { token: maria }, 400);
    await esperar("estado inventado", "GET", "/pedidos?estado=perdido", { token: maria }, 400);
    await esperar("pedido ajeno", "GET", "/pedidos/1", { token: maria }, 403);
    await esperar("Juan ve el codigo de su pedido en camino", "GET", "/pedidos/1", { token: juan }, 200,
        (datos) => datos.pedido.codigo_entrega === "12345678");

    await esperar("repetir el pedido entregado", "POST", "/pedidos/5/repetir", { token: maria }, 201,
        (datos) => datos.agregados.length === 1 && datos.agregados[0].cantidad === 2 && datos.omitidos.length === 0);
    await esperar("repetir el cancelado", "POST", "/pedidos/4/repetir", { token: maria }, 201,
        (datos) => datos.agregados[0].producto_id === 1);
    await esperar("el carrito quedo con los dos comercios", "GET", "/carrito/listar", { token: maria }, 200,
        (datos) => datos.comercios.length === 2);
    await esperar("repetir un pedido ajeno", "POST", "/pedidos/1/repetir", { token: maria }, 403);

    await esperar("historial de ventas de la libreria", "GET", "/comercio/ventas", { token: libreria }, 200,
        (datos) => datos.resumen.pedidos === 2 && datos.resumen.entregados === 1 &&
                   datos.resumen.total_vendido === 4200 && datos.resumen.en_curso === 1);
    await esperar("detalle de una venta", "GET", "/comercio/ventas/5", { token: libreria }, 200,
        (datos) => datos.venta.items.length === 1 && datos.venta.cliente === "María Gómez");
    await esperar("un pedido sin pagar no es una venta", "GET", "/comercio/ventas/2", { token: libreria }, 404);
    await esperar("venta de otro comercio", "GET", "/comercio/ventas/5", { token: ferreteria }, 403);

    // -----------------------------------------------------------------------
    seccion("Semana 13 - Usuarios (CU23)");
    // -----------------------------------------------------------------------
    await esperar("un cliente no entra al panel", "GET", "/admin/usuarios", { token: juan }, 403);
    await esperar("listado de usuarios", "GET", "/admin/usuarios", { token: admin }, 200,
        (datos) => datos.paginacion.total === 7);
    await esperar("filtro por rol", "GET", "/admin/usuarios?rol=repartidor", { token: admin }, 200,
        (datos) => datos.paginacion.total === 2);
    await esperar("busqueda", "GET", "/admin/usuarios?buscar=maria", { token: admin }, 200,
        (datos) => datos.paginacion.total === 1);
    await esperar("filtro activo invalido", "GET", "/admin/usuarios?activo=quizas", { token: admin }, 400);
    await esperar("detalle con conteos", "GET", "/admin/usuarios/2", { token: admin }, 200,
        (datos) => datos.pedidos.como_cliente === 4);

    await esperar("alta de administrador", "POST", "/admin/usuarios",
        { token: admin, body: { nombre: "Otra Admin", email: "otra.admin@test.com", contrasena: "Clave12345", telefono: "3421000008", rol: "administrador" } }, 201,
        (datos) => datos.usuario.perfiles.administrador !== null);
    await esperar("email repetido", "POST", "/admin/usuarios",
        { token: admin, body: { nombre: "X", email: "otra.admin@test.com", contrasena: "Clave12345", telefono: "3421000008", rol: "administrador" } }, 409);
    await esperar("no se dan de alta comercios", "POST", "/admin/usuarios",
        { token: admin, body: { nombre: "X", email: "x@test.com", contrasena: "Clave12345", telefono: "3421000008", rol: "comercio" } }, 400);
    await esperar("contraseña corta", "POST", "/admin/usuarios",
        { token: admin, body: { nombre: "X", email: "x@test.com", contrasena: "corta", telefono: "3421000008", rol: "cliente", direccion_entrega: "Calle 1" } }, 400);
    const otraAdmin = await login("/inicioSesionAdministrador", { email: "otra.admin@test.com", contrasena: "Clave12345" });

    await esperar("editar usuario", "PATCH", "/admin/usuarios/1", { token: admin, body: { nombre: "Juan Pérez" } }, 200);
    await esperar("email de otro usuario", "PATCH", "/admin/usuarios/1", { token: admin, body: { email: "maria.gomez@test.com" } }, 409);

    await esperar("registro de Pedro", "POST", "/registro",
        { body: { nombre: "Pedro Prueba", email: "pedro@test.com", contrasena: "Clave12345", telefono: "3421000009", direccion_entrega: "Rivadavia 100, Santo Tomé" } }, 201);
    let pedro = await login("/inicioSesion", { email: "pedro@test.com", contrasena: "Clave12345" });
    await esperar("Pedro arma un pedido", "POST", "/carrito/agregar", { token: pedro, body: { id_producto: 3, cantidad: 2 } }, 201);
    await esperar("y lo confirma sin pagar", "POST", "/carrito/confirmar", { token: pedro }, 201,
        (datos) => datos.pedidos[0].pedidoId === 6);

    await esperar("suspender a Pedro", "PATCH", "/admin/usuarios/9/estado", { token: admin, body: { activo: false } }, 200);
    await esperar("su token deja de servir al instante", "GET", "/perfil", { token: pedro }, 403,
        (datos) => datos.mensaje.includes("suspendida"));
    await esperar("y no puede entrar", "POST", "/inicioSesion", { body: { email: "pedro@test.com", contrasena: "Clave12345" } }, 403);
    await esperar("reactivar a Pedro", "PATCH", "/admin/usuarios/9/estado", { token: admin, body: { activo: true } }, 200);
    pedro = await login("/inicioSesion", { email: "pedro@test.com", contrasena: "Clave12345" });

    await esperar("eliminación definitiva de Pedro", "DELETE", "/admin/usuarios/9", { token: admin }, 200,
        (datos) => datos.pedidos_cancelados.length === 1 && datos.pedidos_cancelados[0] === 6 &&
                   datos.pedidos_eliminados === 1);
    await esperar("y el stock vuelve", "GET", "/productos/3", {}, 200, (datos) => datos.producto.stock === 60);
    await esperar("el token de la cuenta eliminada deja de servir", "GET", "/perfil", { token: pedro }, 401);
    await esperar("Pedro puede registrarse otra vez con los mismos datos", "POST", "/registro",
        { body: { nombre: "Pedro Prueba", email: "pedro@test.com", contrasena: "Clave12345", telefono: "3421000009", direccion_entrega: "Rivadavia 100, Santo Tomé" } }, 201);
    await login("/inicioSesion", { email: "pedro@test.com", contrasena: "Clave12345" });
    await esperar("Carlos tiene un pedido en camino", "PATCH", "/admin/usuarios/5/estado", { token: admin, body: { activo: false } }, 409);
    await esperar("un admin no se suspende a si mismo", "PATCH", "/admin/usuarios/7/estado", { token: admin, body: { activo: false } }, 409);
    await esperar("activo como string", "PATCH", "/admin/usuarios/5/estado", { token: admin, body: { activo: "false" } }, 400);

    // -----------------------------------------------------------------------
    seccion("Semana 13 - Supervision de pedidos (CU24)");
    // -----------------------------------------------------------------------
    await esperar("pedidos activos", "GET", "/admin/pedidos?activos=true", { token: admin }, 200,
        (datos) => datos.pedidos.map((p) => p.id).sort().join(",") === "1,2,3" &&
                   datos.resumen_por_estado.total === 5 && datos.resumen_por_estado.cancelado === 1);
    await esperar("detalle con la auditoria completa", "GET", "/admin/pedidos/5", { token: admin }, 200,
        (datos) => datos.pedido.auditoria.length === 6 && datos.pedido.pago.estado === "aprobado" &&
                   datos.pedido.auditoria.some((a) => a.detalle === "en_preparacion -> preparado") &&
                   datos.pedido.auditoria.some((a) => a.detalle === "retirado del comercio"));
    await esperar("cancelar un pedido en camino", "PATCH", "/admin/pedidos/1/cancelar",
        { token: admin, body: { motivo: "Prueba de cancelación" } }, 200,
        (datos) => datos.repartidor_liberado === true && datos.reembolso_manual === true);
    await esperar("Carlos queda disponible", "GET", "/repartidor/disponibilidad", { token: carlos }, 200,
        (datos) => datos.disponible === true);
    await esperar("Juan se entera", "GET", "/notificaciones", { token: juan }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "pedido_cancelado"));
    await esperar("un cancelado no se cancela", "PATCH", "/admin/pedidos/1/cancelar",
        { token: admin, body: { motivo: "otra vez" } }, 409);
    await esperar("sin motivo", "PATCH", "/admin/pedidos/2/cancelar", { token: admin, body: {} }, 400);

    await esperar("suspender la ferreteria", "PATCH", "/admin/comercios/1/estado", { token: admin, body: { activo: false } }, 200);
    await esperar("sale del catalogo", "GET", "/comercios", {}, 200, (datos) => datos.paginacion.total === 1);
    await esperar("y no puede gestionar", "GET", "/comercio/perfil", { token: ferreteria }, 403);
    await esperar("reactivarla", "PATCH", "/admin/comercios/1/estado", { token: admin, body: { activo: true } }, 200);
    await esperar("la libreria tiene un pedido por preparar", "PATCH", "/admin/comercios/2/estado", { token: admin, body: { activo: false } }, 409);

    // -----------------------------------------------------------------------
    seccion("Semana 13 - Reclamos (CU25)");
    // -----------------------------------------------------------------------
    const reclamo = await esperar("Maria reclama", "POST", "/reclamos",
        { token: maria, body: { pedido_id: 5, descripcion: "El cuaderno llegó con la tapa doblada." } }, 201);
    const reclamoId = reclamo.json?.datos?.reclamo?.id;

    await esperar("no dos abiertos por el mismo pedido", "POST", "/reclamos",
        { token: maria, body: { pedido_id: 5, descripcion: "Otra vez lo mismo, la tapa doblada." } }, 409);
    await esperar("sobre un pedido ajeno", "POST", "/reclamos",
        { token: maria, body: { pedido_id: 1, descripcion: "Un pedido que no es mío." } }, 403);
    await esperar("descripcion corta", "POST", "/reclamos", { token: juan, body: { descripcion: "corto" } }, 400);
    await esperar("los admin no reclaman", "POST", "/reclamos", { token: admin, body: { descripcion: "Un reclamo de admin." } }, 403);

    await esperar("cola de reclamos", "GET", "/admin/reclamos", { token: admin }, 200,
        (datos) => datos.paginacion.total === 2 && datos.resumen_por_estado.pendiente === 2);
    await esperar("sin asignar no se resuelve", "PATCH", `/admin/reclamos/${reclamoId}/resolver`,
        { token: admin, body: { estado: "resuelto", resolucion: "Listo, reenviado." } }, 409);
    await esperar("asignarselo", "PATCH", `/admin/reclamos/${reclamoId}/asignar`, { token: admin }, 200);
    await esperar("otro admin no lo resuelve", "PATCH", `/admin/reclamos/${reclamoId}/resolver`,
        { token: otraAdmin, body: { estado: "resuelto", resolucion: "Intento ajeno." } }, 403);
    await esperar("resolverlo", "PATCH", `/admin/reclamos/${reclamoId}/resolver`,
        { token: admin, body: { estado: "resuelto", resolucion: "Te reenviamos un cuaderno nuevo." } }, 200);
    await esperar("Maria ve la resolucion", "GET", `/reclamos/${reclamoId}`, { token: maria }, 200,
        (datos) => datos.reclamo.estado === "resuelto" && datos.reclamo.resolucion.includes("cuaderno"));
    await esperar("Juan no ve el reclamo de Maria", "GET", `/reclamos/${reclamoId}`, { token: juan }, 404);
    await esperar("uno cerrado no se reasigna", "PATCH", `/admin/reclamos/${reclamoId}/asignar`, { token: admin }, 409);
    await esperar("asignar el de la semilla a la otra admin", "PATCH", "/admin/reclamos/1/asignar",
        { token: admin, body: { administrador_id: 2 } }, 200);

    // -----------------------------------------------------------------------
    seccion("Semana 13 - Trazabilidad");
    // -----------------------------------------------------------------------
    await esperar("cambio de precio", "PATCH", "/productos/1/precio", { token: ferreteria, body: { precio: 4600 } }, 200);
    await esperar("catálogo de gestión del comercio, con sus categorías", "GET", "/comercio/productos", { token: ferreteria }, 200,
        (datos) => datos.productos.length === 3 && datos.productos.every((p) => p.comercio_id === 1) &&
                   datos.categorias.includes("Herramientas") && typeof datos.productos[0].precio === "number");
    await esperar("filtro activo inválido", "GET", "/comercio/productos?activo=quizas", { token: ferreteria }, 400);
    await esperar("un cliente no ve el catálogo de gestión", "GET", "/comercio/productos", { token: juan }, 403);
    await esperar("auditoria de productos del comercio", "GET", "/admin/auditoria/productos?comercioId=1", { token: admin }, 200,
        (datos) => datos.auditoria.length >= 1 && datos.auditoria[0].accion === "UPDATE" && datos.auditoria[0].usuario === "Ferretería Central");
    await esperar("auditoria del pedido 5", "GET", "/admin/auditoria/pedidos?pedidoId=5", { token: admin }, 200,
        (datos) => datos.paginacion.total === 6);
    await esperar("accion invalida", "GET", "/admin/auditoria/pedidos?accion=BORRAR", { token: admin }, 400);

    // -----------------------------------------------------------------------
    seccion("Semana 11 - Notificaciones generales por rol");
    // -----------------------------------------------------------------------
    await esperar("Lucia ve las generales de repartidores", "GET", "/notificaciones", { token: lucia }, 200,
        (datos) => datos.notificaciones.filter((n) => n.general).length >= 2 && datos.no_leidas >= 2);
    await esperar("marcar todas", "PATCH", "/notificaciones/leidas", { token: lucia }, 200,
        (datos) => datos.marcadas >= 2);
    await esperar("sin pendientes", "GET", "/notificaciones", { token: lucia }, 200, (datos) => datos.no_leidas === 0);
    await esperar("los admin reciben los reclamos nuevos", "GET", "/notificaciones", { token: admin }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "reclamo_nuevo" && n.general));

    // -----------------------------------------------------------------------
    seccion("Semana 14 - Sesiones");
    // -----------------------------------------------------------------------
    await esperar("Lucia cierra sesion", "POST", "/cerrarSesionRepartidor", { token: lucia }, 200);
    await esperar("su token viejo ya no sirve", "GET", "/pedido/listar", { token: lucia }, 401,
        (datos) => datos.mensaje.includes("sesión"));

    // -----------------------------------------------------------------------
    seccion("Semana 10 y 14 - Socket.IO");
    // -----------------------------------------------------------------------
    let io = null;
    try {
        io = require("socket.io-client").io;
    } catch (error) {
        console.log("  (socket.io-client no está instalado: se saltea)");
    }

    if (io) {
        const conectar = (token) => new Promise((resolver) => {
            const socket = io(RAIZ, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 5000 });
            socket.on("connect", () => resolver({ socket }));
            socket.on("connect_error", (error) => { socket.close(); resolver({ error }); });
        });

        const conMaria = await conectar(maria);
        verificar("socket: Maria conecta", Boolean(conMaria.socket), conMaria.error?.message);

        if (conMaria.socket) {
            const ack = await new Promise((resolver) => conMaria.socket.emit("seguir_pedido", { pedidoId: 5 }, resolver));
            verificar("socket: sigue su pedido", ack?.codigo === 200 && ack?.datos?.estado === "entregado", JSON.stringify(ack));
            conMaria.socket.close();
        }

        const conPedro = await conectar(pedro);
        verificar("socket: una cuenta eliminada no conecta", conPedro.error?.data?.codigo === 401,
            conPedro.error?.message || "conectó");

        const conBasura = await conectar("no-es-un-token");
        verificar("socket: token invalido", conBasura.error?.data?.codigo === 401, conBasura.error?.message || "conectó");
    }

    // -----------------------------------------------------------------------
    seccion("Semanas 6, 7 y 13 - Caminos del pago");
    // -----------------------------------------------------------------------
    // Va al final para no correr los ids ni los conteos de las secciones de arriba. El
    // carrito de Maria todavia tiene lo que cargo "repetir pedido".
    await esperar("Maria confirma lo que repitio", "POST", "/carrito/confirmar", { token: maria }, 201,
        (datos) => datos.pedidos.length === 2 && datos.pedidos[0].pedidoId === 7 && datos.pedidos[1].pedidoId === 8);

    await esperar("empieza a pagar el 7", "POST", "/pedidos/7/pagar", { token: maria }, 201);
    await esperar("y lo cancela antes de que se acredite", "PATCH", "/pedidos/7/cancelar", { token: maria }, 200);
    await esperar("el pago llega aprobado igual", "POST", "/pagos/simular", { token: maria, body: { pedido_id: 7, resultado: "approved" } }, 200,
        (datos) => datos.resultado === "pedido_no_pagable");
    await esperar("el pedido sigue cancelado y el pago queda registrado", "GET", "/pedidos/7", { token: maria }, 200,
        (datos) => datos.pedido.estado === "cancelado" && datos.pedido.pago.estado === "aprobado" &&
                   datos.pedido.pago.motivo_rechazo.includes("devolución"));
    await esperar("los admin se enteran de la devolucion", "GET", "/notificaciones", { token: admin }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "pago_a_devolver"));

    await esperar("paga el 8", "POST", "/pedidos/8/pagar", { token: maria }, 201);
    await esperar("rechazado", "POST", "/pagos/simular", { token: maria, body: { pedido_id: 8, resultado: "rejected" } }, 200,
        (datos) => datos.resultado === "rechazado");
    await esperar("cancelado por el rechazo", "GET", "/pedidos/8", { token: maria }, 200,
        (datos) => datos.pedido.estado === "cancelado");
    await esperar("el stock vuelve", "GET", "/productos/4", {}, 200, (datos) => datos.producto.stock === 38);
    await esperar("aviso de pago rechazado", "GET", "/notificaciones", { token: maria }, 200,
        (datos) => datos.notificaciones.some((n) => n.tipo === "pago_rechazado"));

    // Vuelta del navegador desde MercadoPago: con FRONT_URL redirige al pedido en el front,
    // sin FRONT_URL contesta el JSON de siempre. Se acepta cualquiera de los dos.
    const retorno = await fetch(`${BASE}/pagos/retorno?external_reference=8&status=rejected`, { redirect: "manual" });
    const destinoRetorno = retorno.headers.get("location") || "";
    verificar("vuelta de MercadoPago: JSON, o redirección al pedido en el front",
        retorno.status === 200 || (retorno.status === 302 && destinoRetorno.endsWith("/pedidos/8?pago=rejected")),
        `obtuvo ${retorno.status} ${destinoRetorno}`);

    // -----------------------------------------------------------------------
    seccion("Semana 14 - Limite de intentos (va ultimo: bloquea los logins un rato)");
    // -----------------------------------------------------------------------
    let limitado = false;

    for (let intento = 1; intento <= 15 && !limitado; intento++) {
        const respuesta = await llamar("POST", "/inicioSesion", { body: { email: "juan.perez@test.com", contrasena: "mal" } });
        limitado = respuesta.status === 429 && respuesta.json?.estado === "error";
    }

    verificar("los logins fallidos terminan en 429 con el formato de la API", limitado);

    console.log(`\n${pasos - fallos}/${pasos} verificaciones OK${fallos > 0 ? ` - ${fallos} FALLARON` : ""}`);
    process.exit(fallos > 0 ? 1 : 0);
};

main().catch((error) => {
    console.error("\nLa prueba se cortó:", error.message);
    console.error("¿Está el servidor levantado en", BASE, "?");
    process.exit(1);
});
