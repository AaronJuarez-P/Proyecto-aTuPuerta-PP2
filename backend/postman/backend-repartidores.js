//# Guía de pruebas Postman — Repartidores y asignación de pedidos (Semana 8)
//
//Cubre CU19 (ver pedidos disponibles para repartir) y CU20 (aceptar pedido): asignación de
//`repartidor_id`, disponibilidad del repartidor, confirmación de la entrega con el código
//del cliente y la validación de que un pedido no se asigne dos veces.
//
//Entregable de la semana: **un repartidor puede ver pedidos disponibles y aceptarlos,
//quedando asignados en la tabla `pedidos`.**
//
//Base URL local: `http://localhost:4000/api`
//
//Todas las respuestas siguen el formato uniforme del proyecto:
//```json
//{ "codigo": 0, "estado": "", "datos": {} }
//```
//
//---
//
//## Precondición: datos de la semana 8
//
//Importar `scripts/aTuPuerta.sql` entero, que ya trae los cambios de la semana 8. Ojo que
//arranca con `DROP DATABASE` y borra todo lo que haya cargado.
//
//Estado de partida:
//
//| Quién / qué | Estado |
//|---|---|
//| Carlos (`carlos.repartidor@test.com`, repartidor 1) | `disponible = 0`: tiene el pedido 1 `en_camino`, con código `12345678` |
//| Lucía (`lucia.repartidor@test.com`, repartidor 2) | `disponible = 0`: fuera de servicio, sin pedidos |
//| Pedido 3 | `en_preparacion` y sin repartidor. Es de María (cliente 2) a Librería del Sur |
//
//```sql
//SELECT id, disponible FROM repartidores;
//SELECT id, repartidor_id, estado, codigo FROM pedidos;
//```
//
//> **Los casos se corren en orden.** Cada uno deja la base como la necesita el siguiente.
//
//---
//
//## Cómo obtener los tokens
//
//Hacen falta tres: los dos repartidores y María, la clienta dueña del pedido 3.
//
//**Repartidores** → `POST /api/inicioSesionRepartidor`
//```json
//{ "email": "lucia.repartidor@test.com", "contrasena": "Test1234!" }
//```
//```json
//{ "email": "carlos.repartidor@test.com", "contrasena": "Test1234!" }
//```
//
//**Cliente** → `POST /api/inicioSesion`
//```json
//{ "correo": "maria.gomez@test.com", "contrasena": "Test1234!" }
//```
//
//> Ojo: el login de repartidor pide `email`, el de cliente pide `correo`.
//
//```
//Authorization: <el token, sin la palabra Bearer>
//```
//
//> **Importante:** `verificarToken` lee el header crudo, **no** saca el prefijo `Bearer `.
//> Si en Postman elegís Auth → Bearer Token, va a fallar con 401. Usar Headers →
//> `Authorization` con el token pelado.
//
//Todos los endpoints de repartidor pasan por `verificarToken` → `verificarRol('repartidor')`
//→ `resolverRepartidor`. Este último busca el repartidor del usuario en la base (no en el
//token) y verifica que el usuario siga activo y con `rol = 'repartidor'`, así un token de
//una sesión ya cerrada no sirve (Caso 25).
//
//---
//
//## Qué significa `disponible`
//
//`repartidores.disponible` significa **puede tomar un pedido nuevo**:
//
//- Pasa a `false` sola cuando el repartidor acepta un pedido.
//- Vuelve a `true` sola cuando confirma la entrega.
//- Además el repartidor entra y sale de servicio a mano.
//- Para ver pedidos disponibles y para aceptarlos tiene que estar en `true`.
//
//---
//---
//
//# Disponibilidad del repartidor
//
//## GET /api/repartidor/disponibilidad
//
//### Caso 1 — Consultar la disponibilidad
//**Precondición:** token de Lucía.
//**Request:** `GET /api/repartidor/disponibilidad`
//**Respuesta esperada:** `200 OK`
//```json
//{ "codigo": 200, "estado": "exito", "datos": { "disponible": false, "pedido_en_curso": null } }
//```
//`pedido_en_curso` es el id del pedido que tiene en camino, o `null`. Explica por qué un
//repartidor puede figurar no disponible sin haberse puesto fuera de servicio.
//
//---
//
//## PATCH /api/repartidor/disponibilidad
//
//Body:
//```json
//{ "disponible": true }
//```
//
//### Caso 2 — Valor inválido
//**Request:** `PATCH /api/repartidor/disponibilidad` → `{ "disponible": "true" }`
//**Respuesta esperada:** `400 Bad Request`
//```json
//{ "codigo": 400, "estado": "error", "datos": { "mensaje": "disponible es obligatorio y tiene que ser true o false" } }
//```
//> Se rechaza el string `"true"` a propósito: se valida con `typeof`. Si se validara por
//> truthy, el string `"false"` también dejaría al repartidor disponible.
//
//### Caso 3 — Ponerse disponible
//**Precondición:** token de Lucía.
//**Request:** `PATCH /api/repartidor/disponibilidad` → `{ "disponible": true }`
//**Respuesta esperada:** `200 OK`
//```json
//{ "codigo": 200, "estado": "exito", "datos": { "mensaje": "Estás disponible para tomar pedidos", "disponible": true } }
//```
//**Verificación en base:**
//```sql
//SELECT disponible FROM repartidores WHERE id = 2;
//-- 1
//```
//
//---
//---
//
//# CU19 — Ver pedidos disponibles para repartir
//
//## GET /api/pedido/listar
//
//Query string opcional: `pagina` y `limite` (por defecto 1 y 20, tope 100).
//
//Un pedido está disponible si ya se pagó (`en_preparacion`) y no tiene repartidor.
//
//### Caso 4 — Repartidor no disponible
//**Precondición:** token de Carlos (está en `false` porque tiene el pedido 1 en camino).
//**Request:** `GET /api/pedido/listar`
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "No estás disponible para tomar pedidos: tenés uno en curso o estás fuera de servicio" } }
//```
//
//### Caso 5 — ENTREGABLE: ver los pedidos disponibles
//**Precondición:** token de Lucía, ya disponible (Caso 3).
//**Request:** `GET /api/pedido/listar`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "pedidos": [
//      {
//        "id": 3,
//        "distancia_km": "0.8",
//        "tiempo_estimado": 6,
//        "comision": "700.00",
//        "comercio": "Librería del Sur",
//        "direccion_comercio": "Mitre 450, Santo Tomé",
//        "cantidad_items": 1
//      }
//    ],
//    "paginacion": { "pagina": 1, "limite": 20, "total": 1 }
//  }
//}
//```
//> La `direccion_entrega` del cliente **no** aparece a propósito. La ve solo el repartidor
//> que toma el pedido (Caso 9).
//
//---
//---
//
//# CU20 — Aceptar pedido
//
//## PATCH /api/pedido/asignar/:idPedido
//
//Sin body.
//
//### Caso 6 — Id inválido
//**Request:** `PATCH /api/pedido/asignar/abc`
//**Respuesta esperada:** `400 Bad Request` → `"El id del pedido no es válido"`
//
//### Caso 7 — Pedido inexistente
//**Request:** `PATCH /api/pedido/asignar/999999`
//**Respuesta esperada:** `404 Not Found` → `"Pedido no encontrado"`
//
//### Caso 8 — Pedido que todavía no se pagó
//**Request:** `PATCH /api/pedido/asignar/2` (el pedido 2 está en `pendiente_pago`)
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "El pedido está en estado \"pendiente_pago\" y no se puede asignar" } }
//```
//
//### Caso 9 — ENTREGABLE: aceptar un pedido
//**Precondición:** token de Lucía, disponible.
//**Request:** `PATCH /api/pedido/asignar/3`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Pedido asignado correctamente",
//    "pedido": {
//      "id": 3,
//      "estado": "en_camino",
//      "direccion_entrega": "Belgrano 567, Santo Tomé, Santa Fe",
//      "distancia_km": "0.8",
//      "tiempo_estimado": 6,
//      "comision": "700.00",
//      "comercio": "Librería del Sur",
//      "direccion_comercio": "Mitre 450, Santo Tomé"
//    }
//  }
//}
//```
//**Verificación en base:**
//```sql
//SELECT repartidor_id, estado, codigo FROM pedidos WHERE id = 3;
//-- 2 | en_camino | 10430860      <- ESTE ES EL ENTREGABLE (el código cambia cada vez)
//
//SELECT disponible FROM repartidores WHERE id = 2;
//-- 0   (con un pedido en curso no puede tomar otro)
//
//SELECT pedido_id, usuario_id, accion FROM auditoria_pedidos ORDER BY id DESC LIMIT 1;
//-- 3 | 6 | UPDATE   <- usuario_id es el usuario de Lucía: queda quién tomó el pedido
//
//SELECT usuario_id, tipo, mensaje FROM notificaciones ORDER BY id DESC LIMIT 1;
//-- 2 | pedido_en_camino | Un repartidor tomó tu pedido #3 de Librería del Sur. Tu código de entrega es 10430860: ...
//```
//
//> **El código de entrega no viene en la respuesta.** Le llega al cliente por notificación
//> y el cliente se lo dicta al repartidor cuando recibe el pedido. Si el repartidor lo
//> recibiera acá, podría confirmar una entrega que nunca hizo.
//
//> Todo esto pasa en **una sola transacción**: asignar el pedido, dejar al repartidor no
//> disponible, la fila de auditoría y la notificación. Si falla cualquiera de esas partes,
//> el pedido sigue sin asignar.
//
//### Caso 10 — Aceptar teniendo un pedido en curso
//**Precondición:** token de Lucía, con el pedido 3 ya tomado.
//**Request:** `PATCH /api/pedido/asignar/3`
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "Ya tenés un pedido en curso o estás fuera de servicio" } }
//```
//
//### Caso 11 — Ponerse disponible con un pedido en camino
//**Request:** `PATCH /api/repartidor/disponibilidad` → `{ "disponible": true }` (token de Lucía)
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "Tenés el pedido #3 en camino. Vas a quedar disponible cuando confirmes la entrega" } }
//```
//Y `GET /api/repartidor/disponibilidad` ahora devuelve `"disponible": false, "pedido_en_curso": 3`.
//
//> Si se pudiera, el repartidor podría aceptar un segundo pedido antes de entregar el
//> primero. Salir de servicio (`false`), en cambio, se puede siempre.
//
//---
//---
//
//# El cliente recibe el código de entrega
//
//## GET /api/notificaciones
//
//Sirve para cualquier rol: cada usuario ve solo las suyas, las más recientes primero.
//Acepta `pagina` y `limite`. Marcarlas como leídas queda para la semana 11.
//
//### Caso 12 — María ve su código
//**Precondición:** token de María.
//**Request:** `GET /api/notificaciones`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "notificaciones": [
//      {
//        "id": 4,
//        "tipo": "pedido_en_camino",
//        "mensaje": "Un repartidor tomó tu pedido #3 de Librería del Sur. Tu código de entrega es 10430860: dáselo cuando te lo entregue.",
//        "leida": 0,
//        "created_at": "2026-09-17T13:28:04.000Z"
//      },
//      {
//        "id": 3,
//        "tipo": "pedido_creado",
//        "mensaje": "Creaste el pedido #2, falta confirmar el pago.",
//        "leida": 0,
//        "created_at": "2026-09-17T13:28:04.000Z"
//      }
//    ],
//    "paginacion": { "pagina": 1, "limite": 20, "total": 2 }
//  }
//}
//```
//**Anotar el código**: se usa en los Casos 15 y 19.
//
//---
//---
//
//# Confirmar la entrega
//
//## PATCH /api/pedido/entrega/:idPedido
//
//Body:
//```json
//{ "codigoPedido": "12345678" }
//```
//El código son 8 dígitos. Se acepta como string o como número.
//
//### Caso 13 — Sin código
//**Precondición:** token de Carlos.
//**Request:** `PATCH /api/pedido/entrega/1` → `{}`
//**Respuesta esperada:** `400 Bad Request`
//```json
//{ "codigo": 400, "estado": "error", "datos": { "mensaje": "El código de entrega es obligatorio y tiene que tener 8 dígitos" } }
//```
//Lo mismo con un código de otro largo (`"1234567"`) o que no sea número.
//
//### Caso 14 — Código incorrecto
//**Request:** `PATCH /api/pedido/entrega/1` → `{ "codigoPedido": "87654321" }`
//**Respuesta esperada:** `400 Bad Request` → `"El código de entrega no es correcto"`
//
//### Caso 15 — Entregar el pedido de otro repartidor
//**Request:** `PATCH /api/pedido/entrega/3` con token de Carlos y **el código correcto** de María
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "Ese pedido no está asignado a vos" } }
//```
//**Verificación en base:** `SELECT estado FROM pedidos WHERE id = 3;` → sigue `en_camino`.
//
//> Primero se verifica que el pedido sea suyo y recién después el código. Así, a un
//> repartidor que no tiene el pedido nunca se le confirma si el código que probó es el
//> correcto.
//
//### Caso 16 — Entregar el pedido propio
//**Request:** `PATCH /api/pedido/entrega/1` → `{ "codigoPedido": "12345678" }` (token de Carlos)
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Pedido entregado correctamente",
//    "pedido": { "id": 1, "estado": "entregado" },
//    "disponible": true
//  }
//}
//```
//**Verificación en base:**
//```sql
//SELECT estado, codigo FROM pedidos WHERE id = 1;
//-- entregado | NULL   (el código ya no sirve y se borra)
//
//SELECT disponible FROM repartidores WHERE id = 1;
//-- 1   <- Carlos vuelve a poder tomar pedidos
//
//SELECT usuario_id, tipo FROM notificaciones ORDER BY id DESC LIMIT 1;
//-- 1 | pedido_entregado
//```
//
//### Caso 17 — Entregar dos veces
//**Request:** repetir el Caso 16.
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "El pedido está en estado \"entregado\" y no se puede entregar" } }
//```
//
//---
//---
//
//# Validación: un pedido no puede asignarse dos veces
//
//### Caso 18 — ENTREGABLE: otro repartidor intenta tomar un pedido ya asignado
//**Precondición:** Carlos disponible (Caso 16) y el pedido 3 asignado a Lucía (Caso 9).
//**Request:** `PATCH /api/pedido/asignar/3` con token de Carlos
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "El pedido ya no está disponible: lo tomó otro repartidor" } }
//```
//**Verificación en base:**
//```sql
//SELECT repartidor_id FROM pedidos WHERE id = 3;
//-- 2   <- sigue siendo de Lucía, no se pisó
//SELECT disponible FROM repartidores WHERE id = 1;
//-- 1   <- Carlos no quedó bloqueado por el intento fallido
//```
//
//> **Por qué funciona también si los dos aceptan en el mismo instante:** no se hace
//> "consultar si está libre y después asignar" (entre las dos cosas otro podría tomarlo).
//> Es un único `UPDATE ... WHERE id = ? AND repartidor_id IS NULL AND estado =
//> 'en_preparacion'`. InnoDB hace esperar al segundo `UPDATE` hasta que termina el primero,
//> y cuando le toca la fila ya tiene repartidor: afecta 0 filas y responde 409.
//
//> El mismo repartidor tampoco puede aceptar dos pedidos distintos a la vez: antes de
//> asignar se lockea su fila en `repartidores` (`SELECT ... FOR UPDATE`), así que la
//> segunda aceptación espera a la primera y ya lo encuentra no disponible.
//
//### Caso 19 — Lucía entrega el pedido 3
//**Request:** `PATCH /api/pedido/entrega/3` → `{ "codigoPedido": "<el código del Caso 12>" }` (token de Lucía)
//**Respuesta esperada:** `200 OK` → `"Pedido entregado correctamente"`, y Lucía vuelve a
//`disponible = 1`.
//
//### Caso 20 — Sin pedidos para repartir
//**Request:** `GET /api/pedido/listar` (token de Lucía)
//**Respuesta esperada:** `200 OK`, **no** `404`
//```json
//{ "codigo": 200, "estado": "exito", "datos": { "pedidos": [], "paginacion": { "pagina": 1, "limite": 20, "total": 0 } } }
//```
//> Que no haya pedidos es una respuesta válida: la lista existe, solo que está vacía.
//
//---
//---
//
//# Casos de error comunes
//
//### Caso 21 — Sin token
//**Request:** `GET /api/pedido/listar` sin header `Authorization`
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{ "codigo": 401, "estado": "error", "datos": { "mensaje": "Token no proporcionado" } }
//```
//Con un token inventado o con el prefijo `Bearer ` → `401` y `"Token inválido o expirado"`.
//
//### Caso 22 — Rol equivocado
//**Request:** `GET /api/pedido/listar` con el token de María (rol `cliente`)
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "No tenés permisos para acceder a este recurso" } }
//```
//
//### Caso 23 — Usuario dado de baja
//**Precondición:**
//```sql
//UPDATE usuarios SET activo = FALSE WHERE id = 5;   -- Carlos
//```
//**Request:** `GET /api/pedido/listar` con el token de Carlos (el token sigue vigente)
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "No tenés un perfil de repartidor activo asociado a tu cuenta" } }
//```
//Volver a dejarlo activo: `UPDATE usuarios SET activo = TRUE WHERE id = 5;`
//
//> Por esto `resolverRepartidor` resuelve contra la base y no contra el `repartidorId` del
//> token: un token emitido antes de la baja no sirve.
//
//### Caso 24 — Error 500 forzado
//**Precondición:** apagar MySQL desde el panel de XAMPP.
//**Request:** `PATCH /api/pedido/asignar/3`
//**Respuesta esperada:** `500 Internal Server Error`
//```json
//{ "codigo": 500, "estado": "error", "datos": { "mensaje": "Error interno del servidor" } }
//```
//Volver a prender MySQL antes de seguir.
//
//### Caso 25 — Sesión cerrada con el token todavía vigente
//**Precondición:** `POST /api/cerrarSesionRepartidor` con el token de Lucía → `200`.
//Eso la deja en `rol = 'cliente'`, pero el token sigue diciendo `repartidor` hasta que vence.
//**Request:** `GET /api/pedido/listar` con ese mismo token
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "No tenés un perfil de repartidor activo asociado a tu cuenta" } }
//```
//Para volver al estado anterior: `POST /api/inicioSesionRepartidor` otra vez (deja `rol =
//'repartidor'` y devuelve un token nuevo).
//
//> `resolverRepartidor` filtra por `u.rol = 'repartidor'`, así que el mismo 403 cubre los tres
//> casos: nunca fue repartidor, lo dieron de baja, o cerró sesión. `verificarRol` solo mira el
//> rol que viene adentro del token y por eso no alcanza.
//
//---
//
//## Checklist rápido antes de correr esta guía
//
//- [ ] XAMPP con MySQL prendido
//- [ ] Base con los datos de la semana 8: `aTuPuerta.sql` recién importado
//- [ ] Servidor levantado con `npm run dev` sin errores
//- [ ] Tokens de Lucía, Carlos y María, cada uno en el header `Authorization`, **sin** `Bearer`
//- [ ] Correr los casos en orden (cada uno deja la base lista para el siguiente)
