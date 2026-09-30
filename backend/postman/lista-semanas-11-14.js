//# Lista para correr en Postman — Semanas 11 a 14 (y los pendientes de las semanas 3 y 7)
//
//Todas las requests nuevas, en orden, en una sola lista para ir tildando. Cubre:
//
//- **Semana 3** — perfiles de los cuatro roles y login de administrador (CU11, CU12, CU18)
//- **Semana 7** — la máquina de estados del pedido, con auditoría de cada transición
//- **Semana 11** — notificaciones: leídas, generales por rol y los eventos que faltaban (CU27)
//- **Semana 12** — historial del cliente, repetir pedido e historial de ventas (CU09, CU10, CU17)
//- **Semana 13** — usuarios, supervisión de pedidos, reclamos y auditoría (CU23, CU24, CU25)
//- **Semana 14** — seguridad: sesiones, límites de intentos y validación de entradas
//
//> **La misma secuencia está automatizada** en `scripts/prueba-flujos.js`: con la base recién
//> importada y el servidor corriendo, `node scripts/prueba-flujos.js` corre todo esto (y la
//> regresión de las semanas 5 a 10) y dice qué falla. Esta lista es para hacerlo a mano,
//> entender qué pasa en cada paso o mostrarlo en la defensa.
//
//Base URL: `http://localhost:4000/api`
//
//Las ⭐ son los entregables de cada semana, los que hay que poder mostrar en la defensa.
//
//---
//
//## Antes de arrancar
//
//1. XAMPP con MySQL prendido.
//2. Importar `scripts/aTuPuerta.sql` **entero**. Arranca con `DROP DATABASE`, así que borra
//   lo que haya. Los ids de esta lista son los de la semilla recién importada.
//3. En el `.env`, `MAPS_MODO=mock` y `MP_MODO=mock`.
//4. `npm run dev`. Si ya estaba corriendo, **reiniciarlo**: el límite de intentos de login
//   vive en memoria y el caso 14.6 lo agota a propósito.
//
//> **Los casos se corren en orden.** Cada uno deja la base como la necesita el siguiente.
//
//---
//
//## Los tokens
//
//Con la colección `ATuPuerta.postman_collection.json` alcanza con correr la carpeta
//"00 · Sesiones": cada login guarda su token solo. A mano:
//
//| Quién | Endpoint | Body |
//|---|---|---|
//| Juan (cliente) | `POST /inicioSesion` | `{ "email": "juan.perez@test.com", "contrasena": "Test1234!" }` |
//| María (clienta) | `POST /inicioSesion` | `{ "email": "maria.gomez@test.com", "contrasena": "Test1234!" }` |
//| Ferretería Central | `POST /inicioSesionComercio` | `{ "email": "ferreteria.central@test.com", "contrasena": "Test1234!", "cuil": "20304050607" }` |
//| Librería del Sur | `POST /inicioSesionComercio` | `{ "email": "libreria.sur@test.com", "contrasena": "Test1234!", "cuil": "20405060708" }` |
//| Carlos (repartidor) | `POST /inicioSesionRepartidor` | `{ "email": "carlos.repartidor@test.com", "contrasena": "Test1234!" }` |
//| Lucía (repartidora) | `POST /inicioSesionRepartidor` | `{ "email": "lucia.repartidor@test.com", "contrasena": "Test1234!" }` |
//| Admin ⭐ | `POST /inicioSesionAdministrador` | `{ "email": "admin@test.com", "contrasena": "Test1234!" }` |
//
//El token va en el header `Authorization`, pelado o con `Bearer ` adelante: desde la semana
//14 se aceptan los dos.
//
//---
//---
//
//# Semana 3 — Perfiles (CU11, CU12, CU18)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 3.1 ⭐ | `GET /perfil` | Juan | `200` · `sesion: "cliente"` y `perfiles.cliente` con la dirección |
//| 3.2 ⭐ | `PATCH /perfil` → `{ "telefono": "3421111111" }` | Juan | `200` · el usuario con el teléfono nuevo |
//| 3.3 | `PATCH /perfil` → `{ "email": "otro@test.com" }` | Juan | `400` · "El email no se puede cambiar desde el perfil..." |
//| 3.4 | `PATCH /perfil` → `{ "nombre": "<101 caracteres>" }` | Juan | `400` · "El nombre tiene que tener entre 1 y 100 caracteres" |
//| 3.5 | `PATCH /perfil/contrasena` → `{ "contrasena_actual": "Incorrecta1", "contrasena_nueva": "Nueva12345" }` | Juan | `401` · "La contraseña actual no es correcta" |
//| 3.6 ⭐ | `PATCH /perfil/contrasena` → `{ "contrasena_actual": "Test1234!", "contrasena_nueva": "Nueva12345" }` | Juan | `200` · y el login con `Nueva12345` anda |
//| 3.7 | `PATCH /perfil/contrasena` → volver a `Test1234!` | Juan | `200` |
//| 3.8 ⭐ | `GET /comercio/perfil` | Ferretería | `200` · con `cuit_cuil: "20304050607"` |
//| 3.9 | `PATCH /comercio/perfil` → `{ "horario_atencion": "Lun a Dom 08:00-22:00" }` | Ferretería | `200` |
//| 3.10 | `GET /comercio/perfil` | Juan | `403` · "No tenés permisos para acceder a este recurso" |
//| 3.11 ⭐ | `GET /repartidor/perfil` | Carlos | `200` · `pedido_en_curso: 1` |
//| 3.12 | `PATCH /repartidor/perfil` → `{ "tipo_vehiculo": "auto" }` | Carlos | `409` · "Tenés el pedido #1 en camino..." |
//| 3.13 | `PATCH /repartidor/perfil` → `{ "patente": "A123BCD" }` | Lucía | `409` · "Esa patente ya está registrada por otro repartidor" |
//| 3.14 | `PATCH /repartidor/perfil` → `{ "numero_licencia": "LIC-999" }` | Lucía | `200` |
//
//> El usuario sale siempre del token: no hay ruta para pedir ni tocar el perfil de otro. El
//> email, el CUIT y el DNI no se editan desde el perfil.
//
//---
//
//# Semana 11 — Notificaciones (CU27)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 11.1 ⭐ | `GET /notificaciones` | Juan | `200` · `no_leidas: 1` (la semilla le deja una sin leer) |
//| 11.2 ⭐ | `PATCH /notificaciones/1/leida` | Juan | `200` · "Notificación marcada como leída" |
//| 11.3 | `GET /notificaciones?no_leidas=true` | Juan | `200` · lista vacía y `no_leidas: 0` |
//| 11.4 | `PATCH /notificaciones/3/leida` (es de María) | Juan | `404` · "Notificación no encontrada" |
//| 11.5 | `GET /notificaciones/clave-publica` (sin token) | — | `200` · `push_habilitado: false` si el `.env` no tiene claves VAPID |
//| 11.6 | `POST /notificaciones/suscribir` → `{ "endpoint": "http://no-es-https" }` | Juan | `400` · "Suscripción inválida..." |
//
//> Los eventos que faltaban (pedido creado, pago aprobado o rechazado, pedido cancelado,
//> reclamos) se ven a lo largo de las secciones de abajo, en los casos que dicen "aviso".
//
//---
//
//# Semana 7 — Ciclo de vida del pedido (y regresión de las semanas 5 a 10)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 7.1 | `GET /carrito/listar` | Ferretería | `403` · el carrito es solo de clientes (semana 14) |
//| 7.2 | `POST /carrito/agregar` → `{ "id_producto": 4, "cantidad": 2 }` | María | `201` |
//| 7.3 | `POST /carrito/agregar` → `{ "id_producto": 1, "cantidad": 1 }` | María | `201` |
//| 7.4 ⭐ | `POST /carrito/confirmar` | María | `201` · dos pedidos: el **4** (Ferretería) y el **5** (Librería) |
//| 7.5 | `GET /pedidos/5` | María | `200` · `estado: "pago_espera"` |
//| 7.6 | `GET /notificaciones` | María | aviso `pedido_creado` del pedido #5 |
//| 7.7 ⭐ | `PATCH /pedidos/4/cancelar` | María | `200` · y `GET /productos/1` vuelve a `stock: 25` |
//| 7.8 | `PATCH /pedidos/4/cancelar` otra vez | María | `409` · "...Solo se puede cancelar un pedido que todavía no pagaste..." |
//| 7.9 | `POST /pedidos/4/pagar` | María | `409` · un cancelado no se paga |
//| 7.10 | `POST /pedidos/5/pagar` y después `POST /pagos/simular` → `{ "pedido_id": 5, "resultado": "approved" }` | María | `201` y `200` · `resultado: "aprobado"` |
//| 7.11 | `GET /notificaciones` | María | aviso `pago_aprobado` (semana 11) |
//| 7.12 | `GET /comercio/ventas?estado=en_preparacion` | Librería | `200` · los pedidos 3 y 5 |
//| 7.13 | `PATCH /comercios/pedidos/5/subir` | Ferretería | `403` · "Este pedido no pertenece a tu comercio" |
//| 7.14 ⭐ | `PATCH /comercios/pedidos/5/subir` | Librería | `200` · pasa a `preparado` |
//| 7.15 | `PATCH /comercios/pedidos/5/subir` otra vez | Librería | `409` · "El pedido está en estado \"preparado\"..." |
//| 7.16 | `PATCH /repartidor/disponibilidad` → `{ "disponible": true }` | Lucía | `200` |
//| 7.17 ⭐ | `GET /pedido/listar` | Lucía | `200` · el 5 con `estado: "preparado"` y el 3 con `estado: "en_preparacion"` |
//| 7.18 ⭐ | `PATCH /pedido/asignar/5` | Lucía | `200` · un pedido **preparado** se puede tomar (antes quedaba trabado) |
//| 7.19 | `GET /pedidos/5` | María | `200` · `estado: "en_camino"` y el `codigo_entrega` de 8 dígitos |
//| 7.20 | `PATCH /pedido/entrega/5` → `{ "codigoPedido": "00000000" }` | Lucía | `400` · "El código de entrega no es correcto" |
//| 7.21 | `PATCH /pedido/entrega/5` → `{ "codigoPedido": "<el de 7.19>" }` | Lucía | `200` · "Pedido entregado correctamente" |
//
//> Cada transición quedó en `auditoria_pedidos` con su `detalle`: se ve en 13.19.
//
//---
//
//# Semana 12 — Historial y repetición (CU09, CU10, CU17)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 12.1 ⭐ | `GET /pedidos` | María | `200` · 4 pedidos (2, 3, 4 y 5), el 5 primero |
//| 12.2 | `GET /pedidos?estado=entregado` | María | `200` · solo el 5 |
//| 12.3 | `GET /pedidos?desde=2026-02-31` | María | `400` · la fecha no existe |
//| 12.4 | `GET /pedidos?estado=perdido` | María | `400` |
//| 12.5 | `GET /pedidos/1` | María | `403` · "Ese pedido no es tuyo" |
//| 12.6 | `GET /pedidos/1` | Juan | `200` · `codigo_entrega: "12345678"` (va en camino) |
//| 12.7 ⭐ | `POST /pedidos/5/repetir` | María | `201` · agrega el producto 4 × 2, sin omitidos |
//| 12.8 | `POST /pedidos/4/repetir` (el cancelado) | María | `201` · agrega el producto 1 |
//| 12.9 | `GET /carrito/listar` | María | `200` · el carrito con los dos comercios |
//| 12.10 | `POST /pedidos/1/repetir` | María | `403` |
//| 12.11 ⭐ | `GET /comercio/ventas` | Librería | `200` · `resumen`: 2 pedidos, 1 entregado, 1 en curso, `total_vendido: 4200` |
//| 12.12 | `GET /comercio/ventas/5` | Librería | `200` · con los ítems y `cliente: "María Gómez"` |
//| 12.13 | `GET /comercio/ventas/2` | Librería | `404` · un pedido sin pagar no es una venta |
//| 12.14 | `GET /comercio/ventas/5` | Ferretería | `403` |
//
//---
//
//# Semana 13 — Administración (CU23, CU24, CU25)
//
//## Usuarios (CU23)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 13.1 | `GET /admin/usuarios` | Juan | `403` |
//| 13.2 ⭐ | `GET /admin/usuarios` | Admin | `200` · 7 usuarios |
//| 13.3 | `GET /admin/usuarios?rol=repartidor` / `?buscar=maria` | Admin | `200` · 2 / 1 |
//| 13.4 | `GET /admin/usuarios/2` | Admin | `200` · `pedidos.como_cliente: 4` |
//| 13.5 ⭐ | `POST /admin/usuarios` → `{ "nombre": "Otra Admin", "email": "otra.admin@test.com", "contrasena": "Clave12345", "telefono": "3421000008", "rol": "administrador" }` | Admin | `201` · alta de administrador (usuario 8) |
//| 13.6 | El mismo body otra vez | Admin | `409` · "Ya existe un usuario con ese email" |
//| 13.7 | Con `"rol": "comercio"` | Admin | `400` · comercios y repartidores se registran solos |
//| 13.8 | `PATCH /admin/usuarios/1` → `{ "email": "maria.gomez@test.com" }` | Admin | `409` |
//| 13.9 | `POST /registro` de Pedro (`pedro@test.com`, `Clave12345`), login, y un pedido sin pagar del producto 3 × 2 | Pedro | usuario 9, pedido 6 en `pago_espera` |
//| 13.10 ⭐ | `PATCH /admin/usuarios/9/estado` → `{ "activo": false }` | Admin | `200` · "Usuario suspendido" |
//| 13.11 ⭐ | `GET /perfil` con el token que Pedro **ya tenía** | Pedro | `403` · "Tu cuenta está suspendida o dada de baja" |
//| 13.12 | `PATCH /admin/usuarios/9/estado` → `{ "activo": true }` | Admin | `200` · y Pedro recibe el aviso `cuenta_reactivada` |
//| 13.13 ⭐ | `DELETE /admin/usuarios/9` | Admin | `200` · `pedidos_cancelados: [6]` y el producto 3 vuelve a `stock: 60` |
//| 13.14 | `PATCH /admin/usuarios/5/estado` → `{ "activo": false }` | Admin | `409` · Carlos lleva el pedido #1 en camino |
//| 13.15 | `PATCH /admin/usuarios/7/estado` → `{ "activo": false }` | Admin | `409` · no puede suspenderse a sí mismo |
//
//## Supervisión de pedidos (CU24)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 13.16 ⭐ | `GET /admin/pedidos?activos=true` | Admin | `200` · pedidos 1, 2 y 3; `resumen_por_estado` con 6 en total y 2 cancelados |
//| 13.17 ⭐ | `GET /admin/pedidos/5` | Admin | `200` · los 3 actores, el pago aprobado y 5 filas de auditoría |
//| 13.18 ⭐ | `PATCH /admin/pedidos/1/cancelar` → `{ "motivo": "Prueba de cancelación" }` | Admin | `200` · `repartidor_liberado: true`, `reembolso_manual: true` |
//| 13.19 | `GET /repartidor/disponibilidad` | Carlos | `200` · `disponible: true` |
//| 13.20 | `GET /notificaciones` | Juan | aviso `pedido_cancelado` con el motivo |
//| 13.21 | `PATCH /admin/pedidos/1/cancelar` otra vez | Admin | `409` |
//| 13.22 ⭐ | `PATCH /admin/comercios/1/estado` → `{ "activo": false }` | Admin | `200` · y `GET /comercios` muestra un solo comercio |
//| 13.23 | `GET /comercio/perfil` | Ferretería | `403` · "No tenés un comercio activo asociado a tu cuenta" |
//| 13.24 | `PATCH /admin/comercios/1/estado` → `{ "activo": true }` | Admin | `200` |
//| 13.25 | `PATCH /admin/comercios/2/estado` → `{ "activo": false }` | Admin | `409` · la librería tiene el pedido 3 por preparar |
//
//## Reclamos (CU25)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 13.26 ⭐ | `POST /reclamos` → `{ "pedido_id": 5, "descripcion": "El cuaderno llegó con la tapa doblada." }` | María | `201` · reclamo 2 en `pendiente` |
//| 13.27 | El mismo otra vez | María | `409` · "Ya tenés un reclamo abierto por ese pedido (#2)" |
//| 13.28 | `POST /reclamos` sobre el pedido 1 | María | `403` · "Ese pedido no es tuyo" |
//| 13.29 | `GET /admin/reclamos` | Admin | `200` · 2 reclamos, los dos `pendiente` |
//| 13.30 | `PATCH /admin/reclamos/2/resolver` sin asignarlo | Admin | `409` · "...asignalo antes de resolverlo" |
//| 13.31 ⭐ | `PATCH /admin/reclamos/2/asignar` | Admin | `200` · pasa a `en_revision` y María recibe el aviso |
//| 13.32 | `PATCH /admin/reclamos/2/resolver` → `{ "estado": "resuelto", "resolucion": "Intento ajeno." }` | Otra Admin | `403` · "El reclamo está asignado a otro administrador" |
//| 13.33 ⭐ | `PATCH /admin/reclamos/2/resolver` → `{ "estado": "resuelto", "resolucion": "Te reenviamos un cuaderno nuevo." }` | Admin | `200` |
//| 13.34 | `GET /reclamos/2` | María / Juan | `200` con la resolución / `404` |
//
//## Trazabilidad
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 13.35 | `PATCH /productos/1/precio` → `{ "precio": 4600 }` | Ferretería | `200` |
//| 13.36 ⭐ | `GET /admin/auditoria/productos?comercioId=1` | Admin | `200` · el `UPDATE` recién hecho, con el usuario "Ferretería Central" |
//| 13.37 ⭐ | `GET /admin/auditoria/pedidos?pedidoId=5` | Admin | `200` · 5 filas: `Pedido creado en pago_espera`, `pago_espera -> en_preparacion: pago aprobado`, `en_preparacion -> preparado`, `preparado -> en_camino: lo tomó el repartidor #2`, `en_camino -> entregado` |
//
//---
//
//# Semana 11 — Notificaciones generales por rol
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 11.7 ⭐ | `GET /notificaciones` | Lucía | `200` · las dos generales para repartidores (`general: true`) |
//| 11.8 | `PATCH /notificaciones/leidas` | Lucía | `200` · `marcadas: 2` |
//| 11.9 | `GET /notificaciones` | Lucía | `no_leidas: 0`. Para Carlos siguen sin leer: la lectura de una general es por usuario |
//| 11.10 | `GET /notificaciones` | Admin | la general `reclamo_nuevo` |
//
//---
//
//# Semana 14 — Seguridad
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 14.1 ⭐ | `POST /cerrarSesionRepartidor` y después `GET /pedido/listar` con el mismo token | Lucía | `200` y `401` · "La sesión ya no es válida: iniciá sesión de nuevo" |
//| 14.2 | `GET /perfil` con `Authorization: Bearer <token>` | Juan | `200` |
//| 14.3 | `POST /inicioSesion` con el body `{"email":` (JSON cortado) | — | `400` · "El cuerpo de la petición no es un JSON válido" |
//| 14.4 | `GET /productos?buscar[]=martillo` | — | `400` · antes era un `500` |
//| 14.5 | `GET http://localhost:4000/health` | — | `200` · `base_de_datos: "ok"`, y en los headers `X-Content-Type-Options: nosniff` y sin `X-Powered-By` |
//| 14.6 ⭐ | `POST /inicioSesion` con una contraseña mala, una y otra vez | — | A lo sumo en el intento 11 contesta `429` · "Demasiados intentos fallidos..." (el 3.5 ya contó uno). **Va último**: reiniciar el servidor para volver a entrar |
//
//---
//
//## Checklist rápido antes de correr esta lista
//
//- [ ] XAMPP con MySQL prendido
//- [ ] `aTuPuerta.sql` recién importado (o, para no perder datos, la migración
//      `scripts/migraciones/20260929_semanas_11_a_14.sql`; pero los ids de esta lista son los de
//      la semilla)
//- [ ] `npm install` corrido después de pullear: hay dependencias nuevas (`helmet`,
//      `express-rate-limit`) y `web-push` pasó a `dependencies`
//- [ ] Servidor recién levantado con `npm run dev`
//- [ ] Correr los casos en orden
