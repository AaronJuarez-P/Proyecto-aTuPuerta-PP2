//# Lista para correr en Postman — Semanas 8, 9 y 10
//
//Todas las requests de las tres semanas, en orden, en una sola lista. Es para ir tildando
//mientras se prueba: el detalle de cada caso —el JSON completo, por qué el endpoint hace lo
//que hace, las verificaciones en la base— está en las guías largas:
//
//- `postman/backend-repartidores.js` — semana 8 (CU19, CU20)
//- `postman/backend-geolocalizacion.js` — semana 9 (CU21, CU22)
//- `postman/backend-seguimiento.js` — semana 10 (CU08, CU26)
//
//La numeración es la misma que la de esas guías: el `9.7` de acá es el "Caso 7" de
//`backend-geolocalizacion.js`.
//
//> **La semana 10 no se corre entera con Postman.** El endpoint REST sí, pero el canal en
//> tiempo real necesita un cliente de Socket.IO, que es un protocolo propio arriba de
//> WebSocket y no el WebSocket crudo que Postman soporta. Para eso está
//> `scripts/cliente-seguimiento.js`, que se deja corriendo en otra terminal.
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
//2. Importar `scripts/aTuPuerta.sql` **entero** desde phpMyAdmin. Arranca con
//   `DROP DATABASE`, así que borra todo lo que haya cargado.
//3. En el `.env`, `MAPS_MODO=mock` y `MP_MODO=mock`. **No hace falta ningún token ni
//   tarjeta de crédito**, ni de MercadoPago ni de Mapbox.
//4. `npm run dev`.
//
//> **Reimportar la base antes de empezar la semana 9.** Las dos listas arrancan del estado
//> semilla y las dos usan el pedido 1, que viene `en_camino` con el código `12345678`: la
//> semana 8 lo entrega en 8.16 —y al entregarlo el código se borra—, así que si corrés la 9
//> encima, el caso 9.11 te va a dar `409` en vez de `200`. Es el único que se pisa, pero
//> reimportar es más rápido que acordarse de eso.
//
//> **Los casos se corren en orden.** Cada uno deja la base como la necesita el siguiente.
//
//> **El modo mock es determinístico:** la misma dirección da siempre la misma coordenada.
//> Los números que figuran abajo son exactamente los que te van a salir a vos.
//
//---
//
//## Los tokens
//
//| Quién | Endpoint | Body |
//|---|---|---|
//| Lucía (repartidora, bicicleta) | `POST /inicioSesionRepartidor` | `{ "email": "lucia.repartidor@test.com", "contrasena": "Test1234!" }` |
//| Carlos (repartidor, moto) | `POST /inicioSesionRepartidor` | `{ "email": "carlos.repartidor@test.com", "contrasena": "Test1234!" }` |
//| María (clienta) | `POST /inicioSesion` | `{ "email": "maria.gomez@test.com", "contrasena": "Test1234!" }` |
//| Juan (cliente, solo para 9.20) | `POST /inicioSesion` | `{ "email": "juan.perez@test.com", "contrasena": "Test1234!" }` |
//
//> Los cuatro logins de la API usan `email`, igual que la columna `usuarios.email`. El de
//> comercio, que acá no hace falta, pide además el `cuil`.
//
//El token va así:
//
//```
//Authorization: <el token, sin la palabra Bearer>
//```
//
//> **Si en Postman usás Auth → Bearer Token, todo va a dar 401.** `verificarToken` lee el
//> header crudo y no saca el prefijo. Hay que ponerlo en Headers → `Authorization` con el
//> token pelado. Lo más cómodo es guardarlos como variables de entorno de Postman
//> (`{{token_lucia}}`, `{{token_carlos}}`, `{{token_maria}}`) y pegar el valor una sola vez.
//
//---
//---
//
//# Semana 8 — Repartidores y asignación de pedidos (CU19, CU20)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 8.1 | `GET /repartidor/disponibilidad` | Lucía | `200` · `disponible: false`, `pedido_en_curso: null` |
//| 8.2 | `PATCH /repartidor/disponibilidad` → `{ "disponible": "true" }` | Lucía | `400` · "disponible es obligatorio y tiene que ser true o false" |
//| 8.3 | `PATCH /repartidor/disponibilidad` → `{ "disponible": true }` | Lucía | `200` · `disponible: true` |
//| 8.4 | `GET /pedido/listar` | Carlos | `403` · "No estás disponible para tomar pedidos: tenés uno en curso o estás fuera de servicio" |
//| 8.5 ⭐ | `GET /pedido/listar` | Lucía | `200` · un solo pedido: `id 3`, `distancia_km "0.80"`, `tiempo_estimado 6`, `comision "700.00"`, `comercio "Librería del Sur"`, `cantidad_items 1`. **No** trae `direccion_entrega` |
//| 8.6 | `PATCH /pedido/asignar/abc` | Lucía | `400` · "El id del pedido no es válido" |
//| 8.7 | `PATCH /pedido/asignar/999999` | Lucía | `404` · "Pedido no encontrado" |
//| 8.8 | `PATCH /pedido/asignar/2` | Lucía | `409` · `El pedido está en estado "pendiente_pago" y no se puede asignar` |
//| 8.9 ⭐ | `PATCH /pedido/asignar/3` | Lucía | `200` · `estado: "en_camino"`, ahora **sí** aparece `direccion_entrega`, `comision "700.00"`. El código de entrega **no** viaja en la respuesta: es del cliente |
//| 8.10 | `PATCH /pedido/asignar/3` de nuevo | Lucía | `409` · "Ya tenés un pedido en curso o estás fuera de servicio" |
//| 8.11 | `PATCH /repartidor/disponibilidad` → `{ "disponible": true }`, y después `GET /repartidor/disponibilidad` | Lucía | `409` · "Tenés el pedido #3 en camino. Vas a quedar disponible cuando confirmes la entrega". La consulta devuelve `pedido_en_curso: 3` |
//| 8.12 | `GET /notificaciones` | María | `200` · la primera es `tipo: "pedido_en_camino"` y el mensaje trae el código de 8 dígitos. **Anotalo**: lo usan 8.15 y 8.19 |
//| 8.13 | `PATCH /pedido/entrega/1` → `{}` | Carlos | `400` · "El código de entrega es obligatorio y tiene que tener 8 dígitos" |
//| 8.14 | `PATCH /pedido/entrega/1` → `{ "codigoPedido": "87654321" }` | Carlos | `400` · "El código de entrega no es correcto" |
//| 8.15 | `PATCH /pedido/entrega/3` → `{ "codigoPedido": "<el de 8.12>" }` | Carlos | `403` · "Ese pedido no está asignado a vos". El pedido 3 sigue `en_camino` |
//| 8.16 | `PATCH /pedido/entrega/1` → `{ "codigoPedido": "12345678" }` | Carlos | `200` · `estado: "entregado"`, `disponible: true` |
//| 8.17 | Repetir 8.16 | Carlos | `409` · `El pedido está en estado "entregado" y no se puede entregar` |
//| 8.18 ⭐ | `PATCH /pedido/asignar/3` | Carlos | `409` · "El pedido ya no está disponible: lo tomó otro repartidor". Carlos **no** queda bloqueado: sigue disponible |
//| 8.19 | `PATCH /pedido/entrega/3` → `{ "codigoPedido": "<el de 8.12>" }` | Lucía | `200` · "Pedido entregado correctamente" |
//| 8.20 | `GET /pedido/listar` | Lucía | `200` · `pedidos: []` y `total: 0`. Que no haya pedidos es una lista vacía, no un 404 |
//| 8.21 | `GET /pedido/listar` sin header, y después con `Bearer <token>` | — / Lucía | `401` · "Token no proporcionado" el primero, `401` · "Token inválido o expirado" el segundo |
//| 8.22 | `GET /pedido/listar` | María | `403` · "No tenés permisos para acceder a este recurso" |
//| 8.23 🔧 | `GET /pedido/listar` | Carlos | `403` · "No tenés un perfil de repartidor activo asociado a tu cuenta" |
//| 8.24 🔧 | `PATCH /pedido/asignar/3` | Lucía | `500` · "Error interno del servidor" |
//| 8.25 | `POST /cerrarSesionRepartidor` → `200`, y después `GET /pedido/listar` con **ese mismo** token | Lucía | `403` · "No tenés un perfil de repartidor activo asociado a tu cuenta". Para seguir, volver a loguear a Lucía |
//
//---
//---
//
//# Semana 9 — Geolocalización y Mapbox (CU21, CU22)
//
//> **Reimportar `aTuPuerta.sql` antes de empezar esta parte.**
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 9.1 ⭐ | `POST /carrito/agregar` → `{ "id_producto": 4, "cantidad": 1 }` (`201`), y después `POST /carrito/confirmar` → `{}` | María | `201` · `pedidoId 4`, `distancia_km 1.4`, `tiempo_estimado 4`, `comision 612`, `origen_datos "mock"`. Ya no son valores hardcodeados: `comision = 500 + 80 × 1.4` |
//| 9.2 | `POST /pedidos/4/pagar` → `{ "metodo": "mercadopago" }` (`201`), y después `POST /pagos/simular` → `{ "pedido_id": 4, "resultado": "approved" }` | María | `200` · el pedido 4 queda `en_preparacion`. Ojo: `resultado` va en inglés |
//| 9.3 | `PATCH /repartidor/disponibilidad` → `{ "disponible": true }` (`200`), y después `PATCH /pedido/asignar/4` | Lucía | `200` · `estado: "en_camino"`, `distancia_km "1.40"`, `comision "612.00"` |
//| 9.3b | `GET /notificaciones` | María | El código de entrega del pedido 4. **Anotalo**: lo usan 9.9 y 9.10 |
//| 9.4 | `POST /repartidor/ubicacion` → `{ "latitud": "-31.6", "longitud": -60.7 }` | Lucía | `400` · "latitud y longitud son obligatorias, tienen que ser números y estar dentro de rango (±90 y ±180)". El string se rechaza a propósito |
//| 9.5 | `POST /repartidor/ubicacion` → `{ "latitud": -95, "longitud": -60.7 }` | Lucía | `400` · mismo mensaje |
//| 9.6 | `POST /repartidor/ubicacion` → `{ "latitud": -31.6725, "longitud": -60.7825 }` | Lucía | `201` · `pedido_id: 4`. El `pedido_id` no va en el body: se infiere del pedido en curso |
//| 9.7 ⭐ | `GET /pedido/ruta/4` | Lucía | `200` · `distancia_km 3.61`, `duracion_minutos 10`, `polilinea null` (en mock), `origen_datos "mock"`, `eta.minutos 10`, y dos tramos: `comercio 2.21 km / 6 min` y `cliente 1.4 km / 4 min` |
//| 9.8 | `GET /pedido/ruta/4?retirado=true` | Lucía | `200` · `1.22 km`, `3 min`, un solo tramo (`cliente`), y `puntos` ya no trae `comercio` |
//| 9.9 | `PATCH /pedido/entrega/4` → `{ "codigoPedido": "<el de 9.3b>", "latitud": -31.676 }` | Lucía | `400` · "…latitud y longitud, las dos…". O van las dos o no va ninguna |
//| 9.10 ⭐ | `PATCH /pedido/entrega/4` → `{ "codigoPedido": "<el de 9.3b>", "latitud": -31.676, "longitud": -60.7735 }` | Lucía | `200` · `estado: "entregado"`, `disponible: true`, `ubicacion_registrada: true` |
//| 9.11 | `PATCH /pedido/entrega/1` → `{ "codigoPedido": "12345678" }` | Carlos | `200` · `ubicacion_registrada: false`. La entrega de la semana 8, sin coordenadas, sigue funcionando igual. **Este es el que pide la base recién importada**: si ya corriste 8.16, el pedido 1 está entregado y el código borrado |
//| 9.12 | `GET /pedido/ruta/1` | Lucía | `403` · "Ese pedido no está asignado a vos" |
//| 9.13 | `GET /pedido/ruta/4` | Lucía | `409` · `El pedido está en estado "entregado" y no tiene una ruta que calcular` |
//| 9.14 | `GET /pedido/ruta/999` | Lucía | `404` · "Pedido no encontrado" |
//| 9.15 | `GET /pedido/ruta/abc` | Lucía | `400` · "El id del pedido no es válido" |
//| 9.16 | `POST /repartidor/ubicacion` → `{ "latitud": -31.67, "longitud": -60.78 }` | Lucía | `409` · "No tenés ningún pedido en curso al que asociar tu ubicación" |
//| 9.17 🔧 | `GET /pedido/ruta/1` | Carlos | `409` · "Todavía no registraste tu ubicación…" |
//| 9.18 | `GET /pedido/ruta/4` | María | `403` · "No tenés permisos para acceder a este recurso" |
//| 9.19 | `GET /pedido/ruta/4` sin header | — | `401` · "Token no proporcionado" |
//| 9.20 🔧 | `POST /carrito/agregar` → `{ "id_producto": 1, "cantidad": 1 }`, y después `POST /carrito/confirmar` → `{}` | Juan | `201` **igual** · `distancia_km 1.09`, `tiempo_estimado 3`, `comision 587.2`, `origen_datos "estimado"`. En la consola del servidor: `[maps] Directions API fallo` … `Falta MAPS_ACCESS_TOKEN en el .env para usar MAPS_MODO=real` |
//| 9.21 🔧 | `POST /registro` → `{ "nombre": "Prueba", "email": "prueba.geo@test.com", "contrasena": "Test1234!", "telefono": "3421999999", "direccion_entrega": "Sarmiento 100, Santo Tomé" }` | — | `201` · el usuario se crea lo mismo, con `latitud` y `longitud` en `NULL`. Nadie se queda sin poder registrarse porque un tercero no contestó |
//| 9.22 🔧 | Login de `prueba.geo@test.com`, `POST /carrito/agregar` → `{ "id_producto": 3, "cantidad": 2 }`, y después `POST /carrito/confirmar` → `{}` | el nuevo | `201` · `origen_datos "mock"`, y las coordenadas de ese cliente ya **no** están en `NULL`: se rellenaron solas al necesitarlas |
//| 9.23 🔧 | `GET /pedido/ruta/4` | Lucía | `500` · "Error interno del servidor" |
//
//Los dos entregables de la semana, 9.1 y 9.7, son los que conviene tener preparados para
//mostrar: el pedido que nace con la distancia calculada, y la ruta con la parada en el
//comercio.
//
//---
//---
//
//# Semana 10 — Seguimiento en tiempo real (CU08, CU26)
//
//> **Reimportar `aTuPuerta.sql` antes de empezar esta parte.** No porque la semana 10 cambie
//> el esquema —es la primera que no lo toca— sino porque los casos salen del estado semilla
//> y usan el pedido 1, que las semanas 8 y 9 dejan entregado.
//
//> **Hacen falta tres terminales**: `npm run dev`, `node scripts/cliente-seguimiento.js`, y
//> Postman. Al arrancar el servidor tienen que aparecer **dos** líneas en la consola:
//> `Canal de tiempo real activo (Socket.IO)` y `Servidor corriendo en puerto 4000`. Si falta
//> la primera, todo lo del 10.8 en adelante falla.
//
//## Parte REST — `GET /pedidos/:id/seguimiento` (esto sí es Postman)
//
//| # | Request | Token | Tiene que dar |
//|---|---|---|---|
//| 10.1 | `GET /pedidos/1/seguimiento` sin header | — | `401` · "Token no proporcionado" |
//| 10.2 | `GET /pedidos/1/seguimiento` | Carlos | `403` · "No tenés permisos para acceder a este recurso". Es del pedido y aun así no entra: el endpoint es del lado cliente. Por el socket sí puede (10.9) |
//| 10.3 | `GET /pedidos/2/seguimiento` | Juan | `403` · "Ese pedido no es tuyo" |
//| 10.4 | `GET /pedidos/9999/seguimiento` | Juan | `404` · "Pedido no encontrado" |
//| 10.5 | `GET /pedidos/abc/seguimiento` | Juan | `400` · "El id del pedido no es válido" |
//| 10.6 ⭐ | `GET /pedidos/1/seguimiento` | Juan | `200` · `seguimiento_activo: true`, `ubicacion -31.672 / -60.7818`, `destino -31.6715 / -60.769`, `eta.minutos 4`, `ruta.distancia_km 1.58`, `repartidor { "Carlos Rodríguez", "moto" }`, mensaje "Tu pedido está en camino." |
//| 10.6b | `GET /pedido/ruta/1` | Carlos | `200` · `2.81 km / 8 min`. **Mostrar los dos juntos**: la del cliente va derecho a la puerta, la del repartidor pasa por el comercio |
//| 10.7 | `GET /pedidos/2/seguimiento` y `GET /pedidos/3/seguimiento` | María | `200` los dos · todo en `null` y `seguimiento_activo: false`. Mensajes "Todavía no pagaste este pedido." y "El comercio está preparando tu pedido." |
//
//> Este endpoint **nunca devuelve 409**, a diferencia de `GET /pedido/ruta/:idPedido`. El
//> repartidor sin ubicación registrada puede arreglarlo mandando un ping; el cliente no
//> puede arreglar nada y necesita una pantalla que se dibuje igual.
//
//## Parte socket — `node scripts/cliente-seguimiento.js <token> <pedidoId>`
//
//| # | Qué correr | Tiene que dar |
//|---|---|---|
//| 10.8 | El script con `""` y con `esto-no-es-un-jwt` | `connect_error: Token no proporcionado (codigo 401)` y `Token inválido o expirado (codigo 401)` |
//| 10.9 | El script con el token de Juan y el pedido `2` | ack `403` · "Ese pedido no es tuyo". Con el token de **Carlos** y el pedido 1, en cambio, ack `200`: por el socket la autorización es por pertenencia, no por rol |
//| 10.10 ⭐ | El script con Juan y el pedido 1, y después 12 × `POST /repartidor/ubicacion` con Carlos, acercándose a `-31.6715, -60.769` | Un evento `UBICACION` por POST, con el **ETA bajando**, y `ruta` solo en el ping 1 y en el 11 |
//| 10.11 | Con el script abierto, `GET /pedidos/1/seguimiento` | El `eta` coincide con el del último evento. Los dos caminos usan la misma función y la misma caché |
//| 10.12 ⭐ | Con el script abierto, `PATCH /pedido/entrega/1` → `{ "codigoPedido": "12345678" }` | Evento `ESTADO -> entregado`, `seguimiento_activo: false` |
//| 10.12b | Con el script en el pedido 2 y el token de María: `POST /pagos/simular` → `{ "pedido_id": 2, "resultado": "approved" }` | Evento `ESTADO -> en_preparacion`. Con `"rejected"`, `cancelado`; con `PATCH /pedido/asignar/2`, `en_camino` |
//| 10.13 | `GET /pedidos/1/seguimiento` después de 10.12 | `200` · `entregado`, `ubicacion` = el punto de la entrega, `eta: null`, `ruta: null` |
//| 10.14 | Con el script corriendo, `Ctrl+C` al servidor y `npm run dev` otra vez. Después un ping | `desconectado` → `conectado` → `seguir_pedido -> 200`, y el ping llega igual. **Socket.IO reconecta solo pero NO vuelve a entrar a las salas**: por eso el script se resuscribe en cada `connect` |
//| 10.15 | Cerrar el script y mandar `POST /repartidor/ubicacion` | `201` igual, y la fila queda en la base. Con la sala vacía el backend ni consulta el pedido ni calcula ETA: corta antes |
//
//Los entregables para la defensa son **10.6, 10.10, 10.12 y 10.14**: la pantalla del
//cliente, la ubicación en vivo con el ETA bajando, el cambio de estado sin refrescar, y la
//reconexión.
//
//> **El evento de `en_camino` no lleva el código de entrega**, aunque la asignación lo
//> genere: en la sala del pedido están el cliente **y** el repartidor.
//
//---
//
//## 🔧 Los que necesitan algo más que Postman
//
//| # | Qué hay que hacer |
//|---|---|
//| 8.23 | En phpMyAdmin, antes: `UPDATE usuarios SET activo = FALSE WHERE id = 5;`. Después, dejarlo como estaba: `UPDATE usuarios SET activo = TRUE WHERE id = 5;` |
//| 8.24 y 9.23 | Apagar MySQL desde el panel de XAMPP, mandar la request, y volver a prenderlo antes de seguir |
//| 9.17 | En phpMyAdmin, antes: `UPDATE repartidores SET latitud_actual = NULL, longitud_actual = NULL WHERE id = 1; UPDATE pedidos SET estado = 'en_camino', codigo = '12345678' WHERE id = 1;`<br>Después: `UPDATE pedidos SET estado = 'entregado', codigo = NULL WHERE id = 1; UPDATE repartidores SET latitud_actual = -31.6730, longitud_actual = -60.7830 WHERE id = 1;` |
//| 9.20 y 9.21 | En el `.env`: `MAPS_MODO=real` con `MAPS_ACCESS_TOKEN=` vacío, y **reiniciar el servidor**. Estos dos casos se miran tanto en la respuesta como en la consola del servidor |
//| 9.22 | Volver a `MAPS_MODO=mock` y reiniciar otra vez |
//
//> 9.20, 9.21 y 9.22 son los que demuestran la decisión de diseño más importante de la
//> semana 9: **ninguna llamada de red pasa adentro de una transacción**. Si Mapbox se cae o
//> el token está mal, el pedido se crea igual y el registro funciona igual; lo único que se
//> degrada es la estimación, y queda marcado en `origen_datos`.
//
//---
//
//## Verificar en la base (opcional)
//
//Postman muestra lo que devuelve la API; estas consultas muestran lo que quedó guardado.
//Van en phpMyAdmin y están explicadas caso por caso en las guías largas.
//
//```sql
//SELECT id, estado, repartidor_id, codigo, distancia_km, tiempo_estimado, comision FROM pedidos;
//SELECT id, tipo_vehiculo, disponible, latitud_actual, longitud_actual FROM repartidores;
//SELECT pedido_id, latitud, longitud, created_at FROM ubicaciones_repartidor ORDER BY id;
//SELECT id, direccion_entrega, latitud, longitud FROM clientes;
//```
//
//Lo que más vale la pena mirar: después de 9.10, el rastro del pedido 4 tiene dos puntos y
//el último es el domicilio de María (`-31.6760000, -60.7735000`); y el `codigo` del pedido
//queda en `NULL`, porque ya se usó.
//
//---
//
//## Con un access token de Mapbox
//
//Todo lo de arriba corre en modo mock y **no toca la red**. Para probar la API real están
//los **Casos 24 y 25** al final de `postman/backend-geolocalizacion.js`: cómo sacar el token
//(no pide tarjeta), qué cambia en la respuesta, y cómo darse cuenta si las coordenadas
//salieron invertidas, que es el error clásico de Mapbox y el único que no falla ruidosamente.
//
//---
//
//## Checklist de corrida
//
//- [ ] MySQL prendido y `aTuPuerta.sql` recién importado
//- [ ] `npm install` corrido (la semana 10 suma `socket.io` y `socket.io-client`)
//- [ ] `.env` con `MAPS_MODO=mock` y `MP_MODO=mock`
//- [ ] `npm run dev` sin errores, y con las **dos** líneas en la consola
//- [ ] Tokens de Lucía, Carlos, María y Juan en `Authorization`, **sin** `Bearer`
//- [ ] Semana 8: casos 8.1 a 8.25, en orden
//- [ ] Reimportar la base
//- [ ] Semana 9: casos 9.1 a 9.23, en orden
//- [ ] Reimportar la base
//- [ ] Semana 10: casos 10.1 a 10.15, en orden, con las tres terminales abiertas
//- [ ] Dejar el `.env` en `MAPS_MODO=mock` al terminar
//- [ ] La consola del servidor abierta: los casos 🔧 de Mapbox se comprueban ahí
