//# Guía de pruebas Postman — Pagos (Semana 6)
//
//Cubre CU07 (realizar pago): registro del intento de pago, integración con MercadoPago,
//persistencia en `pagos` y actualización automática del estado del pedido.
//
//Entregable de la semana: **un pedido pagado pasa de `pendiente_pago` a `en_preparacion`;
//un pago rechazado queda registrado con motivo.**
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
//## Precondición: modo de pago
//
//En el `.env` tiene que estar:
//```
//MP_MODO=mock
//```
//
//Con `mock` el backend no llama a MercadoPago: devuelve una preferencia falsa y habilita
//`POST /api/pagos/simular` para forzar el resultado. Es lo que permite probar aprobado y
//rechazado sin cuenta, sin credenciales y sin ngrok.
//
//Al final de esta guía está cómo correr lo mismo contra el sandbox real.
//
//---
//
//## Cómo obtener el token
//
//Todos los endpoints de pago menos el webhook piden `verificarToken` → `verificarRol('cliente')`.
//
//`POST /api/inicioSesion`
//```json
//{
//  "correo": "juan.perez@test.com",
//  "contrasena": "Test1234!"
//}
//```
//
//```
//Authorization: <el token, sin la palabra Bearer>
//```
//
//> **Importante:** `verificarToken` lee el header crudo, **no** saca el prefijo `Bearer `.
//> Si en Postman elegís Auth → Bearer Token, va a fallar con 401. Usar Headers →
//> `Authorization` con el token pelado.
//
//---
//
//## Cómo llegar a un pedido pagable
//
//El pago necesita un pedido en `pendiente_pago`. Se consigue con el flujo del carrito:
//
//1. `POST /api/carrito/agregar` → `{ "id_producto": 1, "cantidad": 2 }`
//2. `POST /api/carrito/confirmar`
//
//La respuesta del paso 2 trae los pedidos creados. Anotar el `pedidoId`:
//```json
//{ "datos": { "pedidos": [ { "pedidoId": 3, "comercioId": "1", "total": 9000 } ] } }
//```
//
//> Ojo: el carrito arma **un pedido por comercio**. Si el carrito tiene productos de dos
//> comercios distintos, salen dos pedidos y cada uno se paga por separado (la tabla
//> `pagos` tiene `UNIQUE KEY uq_pagos_pedido`: un pago por pedido).
//
//> El stock se descuenta **acá**, al confirmar el carrito, no al pagar.
//> Anotar el stock antes de empezar: `SELECT stock FROM productos WHERE id = 1;`
//
//---
//---
//
//# CU07 — Realizar pago
//
//## POST /api/pedidos/:id/pagar
//
//### Caso 1 — Iniciar el pago de un pedido propio
//**Precondición:** pedido 3 en `pendiente_pago`, token de `juan.perez@test.com`.
//**Request:** `POST /api/pedidos/3/pagar` (sin body)
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Intento de pago registrado",
//    "pago": {
//      "pedido_id": 3,
//      "estado": "pendiente",
//      "monto": 9000,
//      "referencia_externa": "MOCK-3-1757447315123"
//    },
//    "url_pago": "http://localhost:4000/api/pagos/simular",
//    "modo": "mock"
//  }
//}
//```
//**Verificación en base:**
//```sql
//SELECT pedido_id, metodo, estado, monto, referencia_externa FROM pagos WHERE pedido_id = 3;
//-- mercadopago | pendiente | 9000.00 | MOCK-3-...
//SELECT estado FROM pedidos WHERE id = 3;
//-- pendiente_pago  (todavía no cambió: el pago recién arranca)
//```
//
//> En `MP_MODO=sandbox` el `url_pago` es el `sandbox_init_point` de MercadoPago y ahí sí
//> hay que abrirlo en el navegador para pagar.
//
//### Caso 2 — Pedido de otro cliente
//**Precondición:** loguearse con otro cliente e intentar pagar el pedido 3.
//**Request:** `POST /api/pedidos/3/pagar`
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "Ese pedido no es tuyo" } }
//```
//
//### Caso 3 — Pedido inexistente
//**Request:** `POST /api/pedidos/999999/pagar`
//**Respuesta esperada:** `404 Not Found` → `"Pedido no encontrado"`
//
//### Caso 4 — Id inválido
//**Request:** `POST /api/pedidos/abc/pagar`
//**Respuesta esperada:** `400 Bad Request` → `"El id del pedido no es válido"`
//
//### Caso 5 — Sin token
//**Request:** `POST /api/pedidos/3/pagar` sin header `Authorization`
//**Respuesta esperada:** `401 Unauthorized` → `"Token no proporcionado"`
//
//### Caso 6 — Con rol equivocado
//**Precondición:** token de `ferreteria.central@test.com` (rol `comercio`).
//**Respuesta esperada:** `403 Forbidden` → `"No tenés permisos para acceder a este recurso"`
//
//---
//
//## POST /api/pagos/simular
//
//Solo existe con `MP_MODO=mock`. Corre exactamente la misma lógica que el webhook real,
//así que lo que se prueba acá es lo que va a correr en serio.
//
//Body:
//```json
//{ "pedido_id": 3, "resultado": "approved" }
//```
//`resultado` acepta `"approved"` o `"rejected"`. Opcionalmente `monto`, para probar la
//validación de importe.
//
//### Caso 7 — ENTREGABLE: pago aprobado
//**Precondición:** pedido 3 con un pago en `pendiente` (Caso 1).
//**Request:** `POST /api/pagos/simular` → `{ "pedido_id": 3, "resultado": "approved" }`
//**Respuesta esperada:** `200 OK`
//```json
//{ "codigo": 200, "estado": "exito", "datos": { "mensaje": "Resultado de pago simulado aplicado", "resultado": "aprobado" } }
//```
//**Verificación en base:**
//```sql
//SELECT p.estado AS pedido, pg.estado AS pago, pg.fecha_pago
//  FROM pedidos p JOIN pagos pg ON pg.pedido_id = p.id WHERE p.id = 3;
//-- en_preparacion | aprobado | 2026-09-09 17:50:29     <- ESTE ES EL ENTREGABLE
//
//SELECT stock FROM productos WHERE id = 1;
//-- igual que antes de pagar: aprobar NO toca el stock, ya se había descontado
//
//SELECT pedido_id, accion, fecha, hora FROM auditoria_pedidos ORDER BY id DESC LIMIT 1;
//-- 3 | UPDATE | ...   <- el cambio de estado queda auditado
//```
//
//### Caso 8 — ENTREGABLE: pago rechazado
//**Precondición:** un pedido nuevo (repetir el flujo del carrito) con pago en `pendiente`.
//Anotar el stock del producto antes.
//**Request:** `POST /api/pagos/simular` → `{ "pedido_id": 4, "resultado": "rejected" }`
//**Respuesta esperada:** `200 OK` con `"resultado": "rechazado"`
//**Verificación en base:**
//```sql
//SELECT estado, motivo_rechazo FROM pagos WHERE pedido_id = 4;
//-- rechazado | cc_rejected_insufficient_amount    <- ESTE ES EL ENTREGABLE
//
//SELECT estado FROM pedidos WHERE id = 4;
//-- cancelado
//
//SELECT stock FROM productos WHERE id = 1;
//-- volvió al valor que tenía ANTES de confirmar el carrito
//```
//
//> El stock vuelve porque se había descontado al confirmar el carrito. Si nadie lo
//> devolviera, un pago rechazado dejaría stock reservado para siempre.
//
//> Como el pedido queda `cancelado`, **no se puede reintentar el pago sobre él**: hay que
//> rearmar el carrito. Es la contrapartida de devolver el stock.
//
//### Caso 9 — Idempotencia: la misma notificación dos veces
//**Precondición:** el pedido 4 ya rechazado (Caso 8).
//**Request:** mandar EXACTAMENTE el mismo `POST /api/pagos/simular` otra vez.
//**Respuesta esperada:** `200 OK`
//```json
//{ "datos": { "resultado": "ya_procesado" } }
//```
//**Verificación en base:**
//```sql
//SELECT stock FROM productos WHERE id = 1;
//-- EL MISMO valor que en el Caso 8: el stock no se devolvió dos veces
//```
//
//> Este caso no es un capricho: MercadoPago reintenta las notificaciones y puede mandar
//> varias por el mismo pago. Sin esta guarda, cada reintento devolvería el stock de nuevo.
//
//### Caso 10 — Monto manipulado
//**Precondición:** un pedido nuevo con pago en `pendiente`. Su total es, por ejemplo, 9000.
//**Request:** `POST /api/pagos/simular` → `{ "pedido_id": 5, "resultado": "approved", "monto": 1 }`
//**Respuesta esperada:** `200 OK` con `"resultado": "monto_invalido"`
//**Verificación en base:**
//```sql
//SELECT estado, motivo_rechazo FROM pagos WHERE pedido_id = 5;
//-- fallido | El monto pagado (1) no coincide con el total del pedido (9000.00)
//SELECT estado FROM pedidos WHERE id = 5;
//-- cancelado   <- el pedido NO se libera pagando de menos
//```
//
//### Caso 11 — Pedido ya pagado
//**Precondición:** pedido 3 aprobado (Caso 7).
//**Request:** `POST /api/pedidos/3/pagar`
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "datos": { "mensaje": "El pedido está en estado \"en_preparacion\" y ya no se puede pagar" } }
//```
//
//### Caso 12 — Resultado inválido
//**Request:** `POST /api/pagos/simular` → `{ "pedido_id": 3, "resultado": "cualquiera" }`
//**Respuesta esperada:** `400 Bad Request` → `resultado debe ser "approved" o "rejected"`
//
//---
//
//## GET /api/pedidos/:id/pago
//
//Hace falta porque el webhook es asincrónico: el cliente no sabe cuándo se acreditó.
//
//### Caso 13 — Consultar un pago propio
//**Request:** `GET /api/pedidos/3/pago`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "pago": {
//      "pedido_id": 3, "metodo": "mercadopago", "estado": "aprobado",
//      "monto": "9000.00", "referencia_externa": "MOCK-PAY-...",
//      "motivo_rechazo": null, "fecha_pago": "2026-09-09T20:50:29.000Z"
//    },
//    "pedido": { "id": 3, "estado": "en_preparacion", "total": 9000 }
//  }
//}
//```
//
//### Caso 14 — Pedido sin intento de pago
//**Precondición:** un pedido recién confirmado, al que nunca se le llamó `/pagar`.
//**Respuesta esperada:** `404 Not Found` → `"Todavía no se registró ningún intento de pago para este pedido"`
//
//---
//
//## POST /api/pagos/webhook
//
//Es el endpoint que llama MercadoPago. **Es público**: no pasa por `verificarToken` porque
//MercadoPago no tiene nuestro JWT. Lo autentica la firma `x-signature`.
//
//### Caso 15 — En modo mock
//**Request:** `POST /api/pagos/webhook` con body `{ "type": "payment", "data": { "id": "123" } }`
//**Respuesta esperada:** `200 OK`
//```json
//{ "datos": { "mensaje": "El backend está en MP_MODO=mock. Para simular un resultado usá POST /api/pagos/simular" } }
//```
//
//### Caso 16 — Firma inválida (requiere MP_MODO=sandbox)
//**Precondición:** `MP_MODO=sandbox` y `MP_WEBHOOK_SECRET` cargado.
//**Request:** `POST /api/pagos/webhook?data.id=123` con body `{ "type": "payment", "data": { "id": "123" } }`
//y **sin** header `x-signature` (o con uno inventado).
//**Respuesta esperada:** `401 Unauthorized` → `"Firma de la notificación inválida"`
//
//> Este caso es la prueba de seguridad importante del módulo. Sin la validación de firma,
//> cualquiera que supiera un `pedido_id` podría mandar una aprobación falsa y llevarse un
//> pedido sin pagarlo.
//
//---
//
//## Caso 17 — Error 500 forzado
//
//**Precondición:** apagar MySQL desde el panel de XAMPP.
//**Request:** `POST /api/pedidos/3/pagar`
//**Respuesta esperada:** `500 Internal Server Error`
//```json
//{ "codigo": 500, "estado": "error", "datos": { "mensaje": "Error interno del servidor" } }
//```
//Sirve para verificar que el `catch` hace `rollback` y libera la conexión.
//Volver a prender MySQL antes de seguir.
//
//---
//---
//
//# Probar contra el sandbox real de MercadoPago
//
//Todo lo anterior corre sin cuenta ni internet. Para probar la integración de verdad:
//
//## 1. Crear la aplicación
//
//1. Crear cuenta en MercadoPago Argentina (una personal sirve).
//2. Panel de desarrolladores → **Tus integraciones** → **Crear aplicación**.
//   - Solución de pago: **pagos online**
//   - Producto: **Checkout Pro**
//3. En la aplicación, sección **Credenciales de prueba**: copiar el access token
//   (empieza con `TEST-`) a `MP_ACCESS_TOKEN`.
//4. Crear **usuarios de prueba** (uno vendedor y uno comprador). Con el comprador se paga.
//
//No cuesta nada: las credenciales de prueba simulan transacciones sin dinero real y no
//piden tarjeta ni activación.
//
//## 2. Exponer el backend
//
//MercadoPago tiene que poder llegar al webhook, y `localhost` no le sirve:
//
//```bash
//ngrok http 4000
//```
//
//La URL que devuelve va en `URL_PUBLICA`. En el plan gratuito **cambia cada vez que
//reiniciás ngrok**, así que hay que actualizar el `.env` y la configuración del webhook
//cada vez.
//
//En la configuración de la aplicación en MercadoPago, registrar la URL de notificaciones:
//```
//<URL_PUBLICA>/api/pagos/webhook
//```
//y copiar la **clave secreta** que genera a `MP_WEBHOOK_SECRET`.
//
//## 3. Cambiar el modo y reiniciar
//
//```
//MP_MODO=sandbox
//```
//Reiniciar el servidor para que tome el `.env`.
//
//## 4. Pagar
//
//`POST /api/pedidos/:id/pagar` ahora devuelve un `url_pago` de MercadoPago
//(el `sandbox_init_point`). Abrirlo en el navegador y pagar con una tarjeta de prueba.
//
//El resultado se fuerza con el **nombre del titular**:
//
//| Titular | Resultado |
//|---|---|
//| `APRO` | aprobado |
//| `FUND` | rechazado por fondos insuficientes |
//| `SECU` | rechazado por código de seguridad inválido |
//| `EXPI` | rechazado por fecha de vencimiento |
//
//Tarjeta Mastercard de prueba: `5031 7557 3453 0604`, cualquier CVV de 3 dígitos y
//vencimiento futuro.
//
//Después de pagar, el webhook llega solo. Verificar en el log de `morgan` que aparezca
//`POST /api/pagos/webhook 200` y correr los mismos `SELECT` de los Casos 7 y 8.
//
//> Si el webhook no llega: revisar que ngrok esté corriendo, que `URL_PUBLICA` coincida
//> con la URL actual de ngrok y que la URL esté registrada en el panel de MercadoPago.
//
//---
//
//## Checklist rápido antes de correr esta guía
//
//- [ ] XAMPP con MySQL prendido
//- [ ] `npm install` corrido (tiene que estar el paquete `mercadopago`)
//- [ ] `.env` con `MP_MODO=mock` para los casos 1 a 15
//- [ ] Servidor levantado con `npm run dev` sin errores
//- [ ] Token de `juan.perez@test.com` en el header `Authorization`, **sin** `Bearer`
//- [ ] Stock del producto anotado antes de empezar, para poder comparar
//- [ ] Para los casos 16 y 17 en adelante: `MP_MODO=sandbox`, ngrok corriendo y
//      credenciales cargadas
