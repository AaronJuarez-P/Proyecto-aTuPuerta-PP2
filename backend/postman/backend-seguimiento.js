//# Guía de pruebas — Seguimiento en tiempo real (Semana 10)
//
//Cubre CU08 (seguimiento del pedido) y CU26 (el cliente ve ubicación, ETA y ruta mientras
//el pedido está en camino): el endpoint REST de seguimiento y el canal de tiempo real por
//Socket.IO, con eventos de ubicación y de cambio de estado.
//
//Entregable de la semana: **el cliente ve en vivo la ubicación del repartidor y el estado
//del pedido mientras se traslada.**
//
//Base URL local: `http://localhost:4000/api`
//Socket: `http://localhost:4000` (el MISMO puerto que la API, no hay un segundo servidor)
//
//Todas las respuestas HTTP siguen el formato uniforme del proyecto:
//```json
//{ "codigo": 0, "estado": "", "datos": {} }
//```
//
//---
//
//## Esta semana NO cambia la base
//
//Es la primera. No hay `ALTER TABLE` ni columnas nuevas: el seguimiento lee
//`ubicaciones_repartidor` con el índice `idx_ubicaciones_pedido` que ya creó la semana 9, y
//el ETA vive en memoria a propósito, porque es un valor que caduca con el próximo ping.
//
//Igual conviene **reimportar `scripts/aTuPuerta.sql`** antes de arrancar, por el motivo de
//siempre: los casos de abajo salen del estado semilla y usan el pedido 1, que las listas de
//las semanas 8 y 9 dejan entregado.
//
//---
//
//## Precondiciones
//
//1. XAMPP con MySQL prendido.
//2. Importar `scripts/aTuPuerta.sql` entero. Arranca con `DROP DATABASE`.
//3. En el `.env`: `MAPS_MODO=mock` y `MP_MODO=mock`. **No hace falta ningún token ni
//   tarjeta**, ni de Mapbox ni de MercadoPago.
//4. `npm install` (esta semana suma `socket.io` y, como dependencia de desarrollo,
//   `socket.io-client`).
//5. `npm run dev`. En la consola tienen que aparecer **dos** líneas:
//   ```
//   Canal de tiempo real activo (Socket.IO)
//   Servidor corriendo en puerto 4000
//   ```
//   Si falta la primera, el socket no se levantó y todos los casos del 10.7 en adelante
//   van a fallar.
//
//Estado de partida:
//
//| Quién / qué | Estado |
//|---|---|
//| Pedido 1 | `en_camino`, cliente Juan, repartidor Carlos, código `12345678` |
//| Pedido 2 | `pendiente_pago`, cliente María |
//| Pedido 3 | `en_preparacion`, cliente María, sin repartidor |
//| Última ubicación del pedido 1 | `-31.6720, -60.7818` (fila 2 de `ubicaciones_repartidor`) |
//| Destino del pedido 1 | `-31.6715, -60.7690` (San Martín 1234) |
//
//```sql
//SELECT id, cliente_id, repartidor_id, estado, destino_latitud, destino_longitud FROM pedidos;
//SELECT * FROM ubicaciones_repartidor ORDER BY id;
//```
//
//> **Los casos se corren en orden.** Cada uno deja la base como la necesita el siguiente.
//
//> **El modo mock es determinístico.** Los números de abajo son exactamente los que te van
//> a salir a vos.
//
//---
//
//## Los tokens
//
//| Quién | Endpoint | Body |
//|---|---|---|
//| Juan (cliente del pedido 1) | `POST /inicioSesion` | `{ "email": "juan.perez@test.com", "contrasena": "Test1234!" }` |
//| María (clienta de los pedidos 2 y 3) | `POST /inicioSesion` | `{ "email": "maria.gomez@test.com", "contrasena": "Test1234!" }` |
//| Carlos (repartidor del pedido 1, moto) | `POST /inicioSesionRepartidor` | `{ "email": "carlos.repartidor@test.com", "contrasena": "Test1234!" }` |
//
//```
//Authorization: <el token, sin la palabra Bearer>
//```
//
//> **Si en Postman usás Auth → Bearer Token, todo va a dar 401.** `verificarToken` lee el
//> header crudo y no saca el prefijo. Va en Headers → `Authorization` con el token pelado.
//>
//> El socket usa el mismo criterio: el token viaja crudo en `auth.token` del handshake.
//
//---
//
//# Parte 1 — El endpoint REST (CU08)
//
//`GET /api/pedidos/:id/seguimiento` — solo cliente.
//
//> **Este endpoint nunca devuelve 409.** Es la diferencia con `GET /pedido/ruta/:idPedido`
//> de la semana 9, que sí le contesta 409 al repartidor que todavía no registró su
//> ubicación. Ahí tiene sentido: el repartidor *puede* arreglarlo mandando un ping. El
//> cliente no puede arreglar nada, y necesita una pantalla que se dibuje igual. Por eso
//> siempre son 200 con campos en `null` y un `mensaje` que explica qué está pasando.
//
//---
//
//## Caso 10.1 — Sin token → 401
//
//`GET /api/pedidos/1/seguimiento`, sin header `Authorization`.
//
//```json
//{ "codigo": 401, "estado": "error", "datos": { "mensaje": "Token no proporcionado" } }
//```
//
//---
//
//## Caso 10.2 — Con el token de Carlos (repartidor) → 403
//
//`GET /api/pedidos/1/seguimiento` con el token del repartidor.
//
//```json
//{ "codigo": 403, "estado": "error",
//  "datos": { "mensaje": "No tenés permisos para acceder a este recurso" } }
//```
//
//> Carlos ES el repartidor de ese pedido, y aun así el REST le dice que no. No es un
//> descuido: el endpoint es del lado cliente (`verificarRol('cliente')`), y el repartidor
//> ya tiene el suyo desde la semana 9, con la ruta que a él le sirve —la que pasa por el
//> comercio—. Por el **socket** sí puede seguir el pedido: ahí la autorización es por
//> pertenencia y no por rol (ver 10.9).
//
//---
//
//## Caso 10.3 — Pedido ajeno → 403
//
//`GET /api/pedidos/2/seguimiento` con el token de **Juan**. El pedido 2 es de María.
//
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "Ese pedido no es tuyo" } }
//```
//
//---
//
//## Caso 10.4 — Pedido inexistente → 404
//
//`GET /api/pedidos/9999/seguimiento` con el token de Juan.
//
//```json
//{ "codigo": 404, "estado": "error", "datos": { "mensaje": "Pedido no encontrado" } }
//```
//
//---
//
//## Caso 10.5 — Id inválido → 400
//
//`GET /api/pedidos/abc/seguimiento` con el token de Juan.
//
//```json
//{ "codigo": 400, "estado": "error", "datos": { "mensaje": "El id del pedido no es válido" } }
//```
//
//---
//
//## Caso 10.6 ⭐ — Seguimiento del pedido 1, `en_camino`
//
//`GET /api/pedidos/1/seguimiento` con el token de **Juan**. 200:
//
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "pedido": {
//      "id": 1,
//      "estado": "en_camino",
//      "total": 36500,
//      "direccion_entrega": "San Martín 1234, Santo Tomé, Santa Fe",
//      "comercio": {
//        "id": 1, "nombre": "Ferretería Central",
//        "direccion": "Av. Rivadavia 800, Santo Tomé",
//        "latitud": -31.6642, "longitud": -60.7712
//      }
//    },
//    "repartidor": { "nombre": "Carlos Rodríguez", "tipo_vehiculo": "moto" },
//    "seguimiento_activo": true,
//    "ubicacion": { "latitud": -31.672, "longitud": -60.7818, "registrado_en": "..." },
//    "destino": { "latitud": -31.6715, "longitud": -60.769 },
//    "eta": { "minutos": 4, "hora_estimada": "...", "calculado_en": "...",
//             "origen_datos": "mock" },
//    "ruta": { "polilinea": null, "distancia_km": 1.58, "duracion_minutos": 4,
//              "origen_datos": "mock" },
//    "mensaje": "Tu pedido está en camino."
//  }
//}
//```
//
//Tres cosas para mirar:
//
//- **`total` es `36500`, no `"36500.00"`.** mysql2 devuelve los `DECIMAL` como string; el
//  controlador los convierte. Lo mismo con las coordenadas del comercio.
//- **`repartidor` trae solo nombre y vehículo.** Ni teléfono, ni email, ni `usuario_id`: lo
//  que no hace falta para ver dónde está el pedido, no se expone.
//- **La ruta va derecho del repartidor a la puerta**, sin pasar por el comercio. `1.58 km`
//  y 4 minutos acá, contra los `2.81 km` y 8 minutos que da `GET /pedido/ruta/1` para el
//  mismo pedido en el mismo momento, justamente porque CU21 mete la parada. Son dos
//  preguntas distintas: el cliente pregunta cuándo le llega, el repartidor pregunta qué
//  vuelta tiene que dar. Vale la pena mostrar los dos endpoints uno al lado del otro.
//
//---
//
//## Caso 10.7 — Pedido en `pendiente_pago`
//
//`GET /api/pedidos/2/seguimiento` con el token de **María**. 200, todo vacío:
//
//```json
//{ "codigo": 200, "estado": "exito", "datos": {
//    "pedido": { "id": 2, "estado": "pendiente_pago", "total": 5300, "...": "..." },
//    "repartidor": null,
//    "seguimiento_activo": false,
//    "ubicacion": null, "destino": null, "eta": null, "ruta": null,
//    "mensaje": "Todavía no pagaste este pedido." } }
//```
//
//Probar también el pedido 3 (`en_preparacion`, de María): mismos `null`, pero
//`"mensaje": "El comercio está preparando tu pedido."`.
//
//> `seguimiento_activo` es el campo que el front usa para decidir si abre el canal en vivo
//> o muestra una pantalla estática. Es `true` solo con `en_camino`.
//
//---
//
//# Parte 2 — El canal en tiempo real (CU26)
//
//Hace falta un cliente de socket. El proyecto trae uno:
//
//```
//node scripts/cliente-seguimiento.js <token> <pedidoId>
//```
//
//Se deja corriendo en **una terminal aparte** mientras se mandan las requests desde Postman
//en otra. Hacen falta tres terminales: `npm run dev`, el cliente de seguimiento, y Postman.
//
//> **Postman no sirve para esta parte.** Postman tiene soporte de WebSocket crudo, pero
//> Socket.IO no es WebSocket a secas: tiene su propio protocolo de handshake arriba. Por eso
//> la semana trae un script en vez de más requests para la colección.
//
//---
//
//## Caso 10.8 — Handshake sin token y con token roto
//
//```
//node scripts/cliente-seguimiento.js "" 1
//node scripts/cliente-seguimiento.js esto-no-es-un-jwt 1
//```
//
//```
//connect_error: Token no proporcionado (codigo 401)
//connect_error: Token inválido o expirado (codigo 401)
//```
//
//> El código viaja en `err.data.codigo` y no en el mensaje, así que el front puede
//> distinguir un 401 sin comparar textos.
//
//---
//
//## Caso 10.9 — `seguir_pedido` de un pedido ajeno → ack 403
//
//```
//node scripts/cliente-seguimiento.js <token de Juan> 2
//```
//
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "Ese pedido no es tuyo" } }
//```
//
//> Los **acks** llevan el mismo envoltorio `{codigo, estado, datos}` que la API: son
//> pregunta → respuesta, tienen éxito o fracaso, y el front reusa el parser que ya tiene.
//> Los eventos que el servidor empuja (`ubicacion_actualizada`, `estado_actualizado`) NO lo
//> llevan: no contestan ninguna pregunta, y un `"estado": "exito"` ahí chocaría con el
//> `estado` del pedido, que es el campo que de verdad importa en ese payload.
//
//Con el token de **Carlos** y el pedido 1, en cambio, el ack da 200: por el socket la
//autorización es por pertenencia, no por rol (comparar con el 403 del caso 10.2).
//
//---
//
//## Caso 10.10 ⭐ — Ubicación en vivo
//
//**Terminal A:**
//```
//node scripts/cliente-seguimiento.js <token de Juan> 1
//```
//Tiene que imprimir el ack con `"estado": "en_camino"` y `"seguimiento_activo": true`.
//
//**Terminal B (Postman):** `POST /api/repartidor/ubicacion` con el token de **Carlos**, doce
//veces, acercándose al destino `-31.6715, -60.7690`:
//
//```json
//{ "latitud": -31.6719, "longitud": -60.7805 }
//{ "latitud": -31.6718, "longitud": -60.7790 }
//{ "latitud": -31.6717, "longitud": -60.7775 }
//...
//```
//
//En la terminal A, un evento por cada POST:
//
//```
//UBICACION #3 -31.6719,-60.7805  |  ETA 4 min (mock)  |  ruta refrescada, 1.42 km
//UBICACION #4 -31.6718,-60.779   |  ETA 4 min (mock)  |  ruta sin cambios
//UBICACION #5 -31.6717,-60.7775  |  ETA 3 min (mock)  |  ruta sin cambios
//...
//UBICACION #13 -31.6715,-60.7697 |  ETA 1 min (mock)  |  ruta refrescada, 0.09 km
//```
//
//**Lo que hay que mostrar en la defensa son dos cosas:**
//
//1. **El ETA baja** a medida que el repartidor se acerca.
//2. **`ruta` viene solo en el ping 1 y en el 11.** Ese es el diseño del ETA: pedirle la ruta
//   de verdad a Mapbox en cada ping sería una llamada de red por ping por repartidor, pero
//   calcularlo con Haversine crudo tampoco sirve, porque la línea recta ignora que la calle
//   da vueltas. La solución es pedir la ruta real cada `SEGUIMIENTO_PINGS_REFRESCO` pings
//   (10, configurable) y entre medio **reescalar** esa ruta por la fracción de distancia que
//   falta. Los otros 9 eventos viajan livianos, con `"ruta": null`, y el front conserva la
//   polilínea que ya tenía.
//
//> **`origen_datos` dice de dónde salió el número**: `mapbox` es una ruta real, `mock` es el
//> modo de prueba, `estimado` es una cuenta local (el reescalado, o una degradación porque
//> Mapbox no contestó). Con `MAPS_MODO=mock` siempre dice `mock`. La degradación nunca tiene
//> que ser silenciosa: mismo criterio que en CU21.
//
//Verificación en la base:
//
//```sql
//SELECT id, pedido_id, latitud, longitud, registrado_en
//FROM ubicaciones_repartidor WHERE pedido_id = 1 ORDER BY id;
//SELECT latitud_actual, longitud_actual FROM repartidores WHERE id = 1;
//```
//
//---
//
//## Caso 10.11 — El REST y el socket dan el mismo ETA
//
//Sin cerrar la terminal A, `GET /api/pedidos/1/seguimiento` con el token de Juan: el `eta`
//tiene que coincidir con el del último evento que imprimió el script.
//
//> No es casualidad, es el motivo por el que el cálculo vive en `seguimiento.service.js` y
//> no adentro del módulo del socket: los dos caminos llaman a la misma función y comparten
//> la misma caché.
//
//---
//
//## Caso 10.12 ⭐ — Cambios de estado en vivo
//
//Con la terminal A abierta en el pedido 1, `PATCH /api/pedido/entrega/1` con el token de
//Carlos y el código `12345678`:
//
//```json
//{ "codigoPedido": "12345678" }
//```
//
//En la terminal A:
//```
//ESTADO -> entregado  |  seguimiento_activo: false  |  Tu pedido fue entregado.
//```
//
//Los otros tres puntos que emiten estado, para probar con el pedido 2 y el token de María:
//
//| Acción | Evento |
//|---|---|
//| `POST /api/pagos/simular` con `{ "pedido_id": 2, "resultado": "approved" }` | `en_preparacion` |
//| `POST /api/pagos/simular` con `{ "pedido_id": 2, "resultado": "rejected" }` | `cancelado` |
//| `PATCH /api/pedido/asignar/2` con el token de un repartidor libre | `en_camino` |
//
//> **El evento de `en_camino` no lleva el código de entrega**, aunque la asignación lo
//> genere. En la sala del pedido están el cliente **y** el repartidor, así que el mismo
//> motivo por el que el código no va en la respuesta de `asignarPedido` —el repartidor
//> podría confirmar una entrega que nunca hizo— vale multiplicado acá.
//
//---
//
//## Caso 10.13 — Seguimiento después de la entrega
//
//`GET /api/pedidos/1/seguimiento` con el token de Juan. 200:
//
//- `"estado": "entregado"`, `"seguimiento_activo": false`
//- `ubicacion`: la última registrada, que es **el punto donde se entregó**
//- `eta: null`, `ruta: null` — lo que falta son cero minutos
//- `"mensaje": "Tu pedido fue entregado."`
//
//> La ubicación se sigue devolviendo a propósito: es lo que cierra el recorrido en el mapa.
//> Con `cancelado`, en cambio, va todo en `null`.
//
//---
//
//## Caso 10.14 — Reconexión
//
//Con la terminal A corriendo, cortar el servidor con `Ctrl+C` y volver a levantarlo con
//`npm run dev`. En la terminal A:
//
//```
//desconectado: transport close
//conectado (<id nuevo>)
//seguir_pedido -> { "codigo": 200, ... }
//```
//
//Mandar un ping de ubicación: el evento tiene que llegar igual.
//
//> **Es el caso que más fácil se rompe y más difícil se ve.** Socket.IO reconecta solo, pero
//> **no vuelve a entrar a las salas**: la sala es estado del servidor, y el servidor se
//> reinició. Un front que se suscriba una sola vez, en el primer `connect`, después de la
//> primera reconexión queda "conectado" y mudo para siempre, sin ningún error en pantalla.
//> Por eso `scripts/cliente-seguimiento.js` emite `seguir_pedido` en **cada** `connect`, y
//> por eso este caso está en la lista.
//
//---
//
//## Caso 10.15 — Nadie mirando
//
//Cerrar la terminal A y mandar un `POST /api/repartidor/ubicacion`. Contesta 201 igual, y la
//fila queda en `ubicaciones_repartidor`.
//
//> Con la sala vacía el backend no consulta el pedido ni calcula el ETA ni le habla a
//> Mapbox: corta antes con `haySeguidores()`. Es lo que hace que los pings sean baratos
//> cuando nadie tiene la pantalla abierta, que es la mayor parte del tiempo.
//
//---
//
//## Qué NO entra en esta semana
//
//- **La máquina de estados** (validar que de `pendiente_pago` solo se pueda ir a
//  `en_preparacion` o `cancelado`) sigue siendo el entregable pendiente de la semana 7.
//  Esta semana toca los tres lugares donde el pedido cambia de estado, pero solo para
//  avisar, no para validar.
//- **Las notificaciones en tiempo real** son la semana 11. El canal de acá se agrupa por
//  **pedido** (`pedido:<id>`); el de notificaciones se va a agrupar por **usuario**
//  (`usuario:<id>`). Son dos ejes distintos y mezclarlos ahora obligaría a rehacerlo.
//- **Redis / varias instancias.** Con dos procesos de Node, cada uno tendría sus propias
//  salas y un evento emitido en uno no llegaría a los clientes del otro. La solución es
//  `@socket.io/redis-adapter`, y hoy corre una sola instancia.
