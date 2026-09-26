//# Guía de pruebas Postman — Geolocalización y Mapbox (Semana 9)
//
//Cubre CU21 (ver ruta optimizada) y CU22 (confirmar entrega, extendido con la posición
//final): registro de la posición del repartidor en `ubicaciones_repartidor`, cálculo de la
//ruta con parada en el comercio, ETA, y el reemplazo de los valores hardcodeados de
//`distancia_km` / `tiempo_estimado` / `comision` al crear el pedido.
//
//Entregable de la semana: **el repartidor obtiene una ruta optimizada hacia el destino y
//puede confirmar la entrega del pedido.**
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
//## Precondición: datos de la semana 9
//
//Importar `scripts/aTuPuerta.sql` entero, que ya trae los cambios de la semana 9. Ojo que
//arranca con `DROP DATABASE` y borra todo lo que haya cargado.
//
//En el `.env` tiene que estar `MAPS_MODO=mock` (es el valor por defecto). **No hace falta
//access token de Mapbox ni cargar una tarjeta**: el modo mock geocodifica con un hash
//determinístico y estima la distancia con Haversine.
//
//Estado de partida:
//
//| Quién / qué | Estado |
//|---|---|
//| Carlos (`carlos.repartidor@test.com`, repartidor 1) | `moto`, `disponible = 0`, pedido 1 `en_camino` con código `12345678`, última posición `-31.6730, -60.7830` |
//| Lucía (`lucia.repartidor@test.com`, repartidor 2) | `bicicleta`, `disponible = 0`, sin pedidos, última posición `-31.6710, -60.7810` |
//| María (`maria.gomez@test.com`, cliente 2) | Belgrano 567 → `-31.6760000, -60.7735000` |
//| Librería del Sur (comercio 2) | Mitre 450 → `-31.6698000, -60.7648000` |
//
//```sql
//SELECT id, tipo_vehiculo, disponible, latitud_actual, longitud_actual FROM repartidores;
//SELECT id, direccion, latitud, longitud FROM comercios;
//SELECT id, direccion_entrega, latitud, longitud FROM clientes;
//SELECT id, estado, distancia_km, tiempo_estimado, comision, destino_latitud FROM pedidos;
//```
//
//> **Los casos se corren en orden.** Cada uno deja la base como la necesita el siguiente.
//
//> **El modo mock es determinístico.** La misma dirección da siempre la misma coordenada,
//> así que todos los números que aparecen abajo son los que te van a salir a vos. Si repetís
//> el Caso 1 dos veces con el mismo carrito, la distancia da idéntica las dos veces: ese es
//> el argumento de que el mock sirve para la defensa.
//
//---
//
//## Cómo obtener los tokens
//
//Hacen falta dos: María (la clienta) y Lucía (la repartidora).
//
//**Cliente** → `POST /api/inicioSesion`
//```json
//{ "email": "maria.gomez@test.com", "contrasena": "Test1234!" }
//```
//
//**Repartidora** → `POST /api/inicioSesionRepartidor`
//```json
//{ "email": "lucia.repartidor@test.com", "contrasena": "Test1234!" }
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
//---
//
//# Parte 1 — El pedido ya no nace con datos inventados
//
//Hasta la semana 8, `confirmarCarrito` insertaba los literales `100.00, 25, 500.50` en
//`distancia_km`, `tiempo_estimado` y `comision`, con un comentario que decía "en espera de
//la integración de la API". Esta semana esos tres valores salen de la ruta real.
//
//## POST /api/carrito/agregar + POST /api/carrito/confirmar
//
//### Caso 1 — ENTREGABLE: crear un pedido con distancia y comisión calculadas
//**Precondición:** token de María.
//**Request 1:** `POST /api/carrito/agregar`
//```json
//{ "id_producto": 4, "cantidad": 1 }
//```
//**Request 2:** `POST /api/carrito/confirmar` con body `{}`
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Pedido(s) confirmado(s) correctamente",
//    "pedidos": [
//      {
//        "pedidoId": 4,
//        "comercioId": "2",
//        "total": 2100,
//        "distancia_km": 1.4,
//        "tiempo_estimado": 4,
//        "comision": 612,
//        "origen_datos": "mock"
//      }
//    ]
//  }
//}
//```
//**Verificación en base:**
//```sql
//SELECT id, distancia_km, tiempo_estimado, comision, destino_latitud, destino_longitud
//  FROM pedidos WHERE id = 4;
//-- 1.40 | 4 | 612.00 | -31.6760000 | -60.7735000
//```
//La cuenta es verificable a mano: `comision = COMISION_BASE + COMISION_POR_KM × distancia_km`
//= `500 + 80 × 1.4` = **612**. Y `destino_latitud/longitud` son la foto fija del destino:
//si María después cambia la dirección de su perfil, este pedido sigue apuntando acá.
//
//> `origen_datos` dice de dónde salió el número: `mock` (modo de prueba), `mapbox` (ruta
//> real) o `estimado` (Mapbox no contestó y se calculó localmente). Nunca es silencioso.
//
//---
//---
//
//# Preparar el pedido para repartir
//
//### Caso 2 — Pagar el pedido 4
//**Precondición:** token de María.
//**Request 1:** `POST /api/pedidos/4/pagar` → `{ "metodo": "mercadopago" }` → `201`
//**Request 2:** `POST /api/pagos/simular`
//```json
//{ "pedido_id": 4, "resultado": "approved" }
//```
//**Respuesta esperada:** `200 OK`. El pedido 4 queda en `en_preparacion`.
//
//> Ojo: `resultado` va en inglés (`approved` / `rejected`), no en castellano.
//
//### Caso 3 — Lucía se pone disponible y toma el pedido
//**Precondición:** token de Lucía.
//**Request 1:** `PATCH /api/repartidor/disponibilidad` → `{ "disponible": true }` → `200`
//**Request 2:** `PATCH /api/pedido/asignar/4`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Pedido asignado correctamente",
//    "pedido": {
//      "id": 4, "estado": "en_camino",
//      "direccion_entrega": "Belgrano 567, Santo Tomé, Santa Fe",
//      "distancia_km": "1.40", "tiempo_estimado": 4, "comision": "612.00",
//      "comercio": "Librería del Sur", "direccion_comercio": "Mitre 450, Santo Tomé"
//    }
//  }
//}
//```
//> **Cambio respecto de la semana 8:** `distancia_km` ahora viene como `"1.40"` y no como
//> `"1.4"`. La columna pasó de `DECIMAL(4,1)` a `DECIMAL(6,2)` y `mysql2` devuelve los
//> `DECIMAL` como string. Es cosmético, pero si comparás contra la guía vieja te va a
//> llamar la atención.
//
//**Anotá el código de entrega**, que le llega a María por notificación:
//```sql
//SELECT codigo FROM pedidos WHERE id = 4;
//```
//
//---
//---
//
//# Registrar la posición del repartidor
//
//## POST /api/repartidor/ubicacion
//
//Body:
//```json
//{ "latitud": -31.6725, "longitud": -60.7825 }
//```
//
//El `pedido_id` **no** va en el body: se infiere. `ubicaciones_repartidor.pedido_id` es
//`NOT NULL` y un repartidor puede tener un solo pedido `en_camino` a la vez, así que no hay
//ambigüedad. Y que el cliente no pueda elegirlo cierra de entrada la posibilidad de escribir
//en el histórico de un pedido ajeno.
//
//### Caso 4 — Coordenadas como string
//**Request:** `POST /api/repartidor/ubicacion` → `{ "latitud": "-31.6", "longitud": -60.7 }`
//**Respuesta esperada:** `400 Bad Request`
//```json
//{ "codigo": 400, "estado": "error", "datos": { "mensaje": "latitud y longitud son obligatorias, tienen que ser números y estar dentro de rango (±90 y ±180)" } }
//```
//> Se rechaza el string a propósito, igual que `disponible`: se valida con `typeof`. Si se
//> aceptaran strings, un `""` se convertiría en `0` sin que nadie se entere, y `0` es una
//> latitud perfectamente válida (el ecuador).
//
//### Caso 5 — Coordenada fuera de rango
//**Request:** `POST /api/repartidor/ubicacion` → `{ "latitud": -95, "longitud": -60.7 }`
//**Respuesta esperada:** `400 Bad Request`, mismo mensaje.
//
//### Caso 6 — Registrar la posición
//**Precondición:** token de Lucía, con el pedido 4 en camino (Caso 3).
//**Request:** `POST /api/repartidor/ubicacion`
//```json
//{ "latitud": -31.6725, "longitud": -60.7825 }
//```
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Ubicación registrada",
//    "ubicacion": { "id": 3, "pedido_id": 4, "latitud": -31.6725, "longitud": -60.7825 }
//  }
//}
//```
//**Verificación en base:** se escribe en los dos lados.
//```sql
//SELECT * FROM ubicaciones_repartidor WHERE pedido_id = 4;
//-- una fila nueva: el histórico del recorrido
//SELECT latitud_actual, longitud_actual FROM repartidores WHERE id = 2;
//-- -31.6725000 | -60.7825000  <- el snapshot, "dónde está ahora"
//```
//> El histórico sirve para reconstruir el recorrido; el snapshot evita que CU21 tenga que
//> ordenar el histórico cada vez que quiere el origen de la ruta. Las dos columnas de
//> `repartidores` existían en el modelo desde la semana 1 y no las usaba nadie.
//
//---
//---
//
//# CU21 — Ver la ruta optimizada
//
//## GET /api/pedido/ruta/:idPedido
//
//Query string opcional: `retirado=true|false` (por defecto `false`).
//
//### Caso 7 — ENTREGABLE: la ruta con la parada en el comercio
//**Precondición:** token de Lucía, pedido 4 en camino, posición registrada (Caso 6).
//**Request:** `GET /api/pedido/ruta/4`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "pedido": {
//      "id": 4, "estado": "en_camino",
//      "comercio": "Librería del Sur",
//      "direccion_comercio": "Mitre 450, Santo Tomé",
//      "direccion_entrega": "Belgrano 567, Santo Tomé, Santa Fe"
//    },
//    "retirado": false,
//    "ruta": {
//      "distancia_km": 3.61,
//      "duracion_minutos": 10,
//      "polilinea": null,
//      "tramos": [
//        { "hasta": "comercio", "distancia_km": 2.21, "duracion_minutos": 6 },
//        { "hasta": "cliente",  "distancia_km": 1.4,  "duracion_minutos": 4 }
//      ],
//      "puntos": {
//        "origen":   { "latitud": -31.6725, "longitud": -60.7825 },
//        "comercio": { "latitud": -31.6698, "longitud": -60.7648 },
//        "destino":  { "latitud": -31.676,  "longitud": -60.7735 }
//      },
//      "origen_datos": "mock"
//    },
//    "eta": {
//      "minutos": 10,
//      "hora_estimada": "2026-09-17T23:25:34.851Z",
//      "calculado_en": "2026-09-17T23:15:34.851Z"
//    }
//  }
//}
//```
//Qué mirar:
//- **Dos tramos**, con el comercio como parada. Cuando Lucía aceptó, el pedido pasó a
//  `en_camino` pero todavía no retiró la mercadería: tiene que pasar por la librería.
//- **`hora_estimada` menos `calculado_en` = `duracion_minutos`.** El ETA viene acá y no en
//  un endpoint aparte porque sale de la misma llamada: separarlo significaría pagarle dos
//  veces a Mapbox por el mismo dato.
//- **`polilinea` es `null` en modo mock.** Con `MAPS_MODO=real` trae la polilínea codificada
//  que dibuja la ruta en un mapa.
//
//### Caso 8 — Después de retirar: la ruta va derecho al cliente
//**Request:** `GET /api/pedido/ruta/4?retirado=true`
//**Respuesta esperada:** `200 OK`, con
//```json
//{ "retirado": true,
//  "ruta": { "distancia_km": 1.22, "duracion_minutos": 3,
//            "tramos": [ { "hasta": "cliente", "distancia_km": 1.22, "duracion_minutos": 3 } ] } }
//```
//`puntos` ya no trae `comercio`, y la distancia es **menor** que la del Caso 7.
//> Sin este parámetro, una vez que el repartidor pasó por la tienda la ruta lo seguiría
//> mandando de vuelta. Modelarlo como un estado real del pedido (`retirado_en`) sería más
//> prolijo, pero es un estado nuevo que CU22 no pide: queda para la semana 10.
//
//---
//---
//
//# CU22 — Confirmar la entrega
//
//## PATCH /api/pedido/entrega/:idPedido
//
//El endpoint es el de la semana 8. Lo nuevo es que el body **puede** traer además `latitud`
//y `longitud`, para dejar registrado dónde se hizo la entrega.
//
//### Caso 9 — Solo una de las dos coordenadas
//**Request:** `PATCH /api/pedido/entrega/4`
//```json
//{ "codigoPedido": "<el del Caso 3>", "latitud": -31.676 }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{ "codigo": 400, "estado": "error", "datos": { "mensaje": "Si mandás la ubicación de la entrega tenés que mandar latitud y longitud, las dos, como números dentro de rango" } }
//```
//> Se avisa en vez de ignorarla en silencio: mandar media coordenada siempre es un error del
//> cliente, no una decisión.
//
//### Caso 10 — ENTREGABLE: entregar registrando la posición final
//**Request:** `PATCH /api/pedido/entrega/4`
//```json
//{ "codigoPedido": "<el del Caso 3>", "latitud": -31.6760, "longitud": -60.7735 }
//```
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Pedido entregado correctamente",
//    "pedido": { "id": 4, "estado": "entregado" },
//    "disponible": true,
//    "ubicacion_registrada": true
//  }
//}
//```
//**Verificación en base:** el rastro del pedido cierra en el punto de entrega.
//```sql
//SELECT estado, codigo FROM pedidos WHERE id = 4;
//-- entregado | NULL   <- el código se borra, ya no sirve para nada
//SELECT id, latitud, longitud, registrado_en FROM ubicaciones_repartidor WHERE pedido_id = 4 ORDER BY id;
//-- la última fila es el domicilio de María: ahí se entregó
//SELECT disponible, latitud_actual, longitud_actual FROM repartidores WHERE id = 2;
//-- 1 | -31.6760000 | -60.7735000   <- libre para tomar otro, y el snapshot actualizado
//SELECT pedido_id, usuario_id, accion FROM auditoria_pedidos WHERE pedido_id = 4;
//-- el cambio de estado quedó auditado con el usuario de Lucía
//```
//> Todo esto pasa en **una sola transacción**: marcar entregado, liberar al repartidor,
//> guardar la posición, auditar y notificar al cliente se confirman juntos o no pasa nada.
//
//### Caso 11 — Compatibilidad con la semana 8: entregar SIN coordenadas
//**Precondición:** token de Carlos, que tiene el pedido 1 en camino con código `12345678`.
//**Request:** `PATCH /api/pedido/entrega/1`
//```json
//{ "codigoPedido": "12345678" }
//```
//**Respuesta esperada:** `200 OK`, con `"ubicacion_registrada": false`.
//> Es el caso más importante de esta guía después del entregable: **la guía
//> `backend-repartidores.js` tiene que seguir pasando entera, sin cambiarle una coma.** Las
//> coordenadas son opcionales; si no vienen, el endpoint se comporta exactamente como antes.
//
//---
//---
//
//# Casos de error comunes
//
//### Caso 12 — Pedir la ruta de un pedido que no es tuyo
//**Precondición:** token de Lucía. El pedido 1 es de Carlos.
//**Request:** `GET /api/pedido/ruta/1`
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "error", "datos": { "mensaje": "Ese pedido no está asignado a vos" } }
//```
//> La pertenencia se chequea **antes** que el estado, mismo criterio que la entrega: a quien
//> no le toca el pedido no se le cuenta nada de cómo viene.
//
//### Caso 13 — Pedir la ruta de un pedido propio que ya se entregó
//**Precondición:** token de Lucía. El pedido 4 quedó `entregado` en el Caso 10, y sigue
//teniendo su `repartidor_id`.
//**Request:** `GET /api/pedido/ruta/4`
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "El pedido está en estado \"entregado\" y no tiene una ruta que calcular" } }
//```
//
//### Caso 14 — Pedido inexistente
//**Request:** `GET /api/pedido/ruta/999` → `404 Not Found`, `"Pedido no encontrado"`.
//
//### Caso 15 — Id inválido
//**Request:** `GET /api/pedido/ruta/abc` → `400 Bad Request`, `"El id del pedido no es válido"`.
//
//### Caso 16 — Registrar ubicación sin ningún pedido en curso
//**Precondición:** token de Lucía, que ya entregó el pedido 4 y quedó libre.
//**Request:** `POST /api/repartidor/ubicacion` → `{ "latitud": -31.67, "longitud": -60.78 }`
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "No tenés ningún pedido en curso al que asociar tu ubicación" } }
//```
//> Es una limitación heredada del modelo: `ubicaciones_repartidor.pedido_id` es `NOT NULL`,
//> así que no hay dónde guardar una posición que no pertenezca a ningún pedido.
//
//### Caso 17 — Pedir la ruta sin haber registrado nunca la ubicación
//**Precondición:** hay que forzarlo, porque los repartidores del seed ya vienen con una
//posición cargada.
//```sql
//UPDATE repartidores SET latitud_actual = NULL, longitud_actual = NULL WHERE id = 1;
//UPDATE pedidos SET estado = 'en_camino', codigo = '12345678' WHERE id = 1;
//```
//**Request:** `GET /api/pedido/ruta/1` con el token de Carlos
//**Respuesta esperada:** `409 Conflict`
//```json
//{ "codigo": 409, "estado": "error", "datos": { "mensaje": "Todavía no registraste tu ubicación. Mandá POST /api/repartidor/ubicacion antes de pedir la ruta" } }
//```
//Para volver atrás:
//```sql
//UPDATE pedidos SET estado = 'entregado', codigo = NULL WHERE id = 1;
//UPDATE repartidores SET latitud_actual = -31.6730, longitud_actual = -60.7830 WHERE id = 1;
//```
//
//### Caso 18 — Token de cliente en un endpoint de repartidor
//**Request:** `GET /api/pedido/ruta/4` con el token de María
//**Respuesta esperada:** `403 Forbidden`, `"No tenés permisos para acceder a este recurso"`.
//
//### Caso 19 — Sin token
//**Request:** `GET /api/pedido/ruta/4` sin el header
//**Respuesta esperada:** `401 Unauthorized`, `"Token no proporcionado"`.
//
//---
//---
//
//# Demostrar que una caída de Mapbox no rompe nada
//
//Esta es la prueba de que el sistema degrada en vez de caerse. Vale la pena mostrarla en la
//defensa.
//
//### Caso 20 — Crear un pedido con `MAPS_MODO=real` y sin access token
//**Precondición:** en el `.env`, poner `MAPS_MODO=real` y dejar `MAPS_ACCESS_TOKEN=` vacío.
//Reiniciar el servidor. Token de Juan (`juan.perez@test.com`, cliente 1).
//**Request 1:** `POST /api/carrito/agregar` → `{ "id_producto": 1, "cantidad": 1 }`
//**Request 2:** `POST /api/carrito/confirmar` con body `{}`
//**Respuesta esperada:** `201 Created`. **El pedido se crea igual**, con
//```json
//{ "distancia_km": 1.09, "tiempo_estimado": 3, "comision": 587.2, "origen_datos": "estimado" }
//```
//**Verificación en la consola del servidor:**
//```
//[maps] Directions API fallo, se estima la ruta localmente: Falta MAPS_ACCESS_TOKEN en el .env para usar MAPS_MODO=real
//```
//Qué demuestra:
//- `distancia_km`, `tiempo_estimado` y `comision` son `NOT NULL`: hay que poner algo sí o sí.
//  Un pedido que no se puede crear porque un tercero se cayó es una caída de producción
//  regalada.
//- `origen_datos: "estimado"` deja claro que el número no vino de Mapbox.
//- El `console.error` nombra **la variable exacta** que falta. Sin ese log, un token
//  vencido daría ETAs silenciosamente falsos y nadie se enteraría nunca.
//
//### Caso 21 — Registrarse con `MAPS_MODO=real` y sin access token
//**Request:** `POST /api/registro`
//```json
//{ "nombre": "Prueba", "email": "prueba.geo@test.com", "contrasena": "Test1234!",
//  "telefono": "3421999999", "direccion_entrega": "Sarmiento 100, Santo Tomé" }
//```
//**Respuesta esperada:** `201 Created`. El alta funciona igual.
//```sql
//SELECT direccion_entrega, latitud, longitud FROM clientes ORDER BY id DESC LIMIT 1;
//-- Sarmiento 100, Santo Tomé | NULL | NULL
//```
//> Nadie se queda sin poder registrarse porque Mapbox no contestó. Las coordenadas quedan en
//> `NULL` y se completan solas más adelante.
//
//### Caso 22 — El relleno perezoso repara la fila sola
//**Precondición:** volver a poner `MAPS_MODO=mock` y reiniciar el servidor. Token del
//usuario del Caso 21, que tiene las coordenadas en `NULL`.
//**Request 1:** `POST /api/carrito/agregar` → `{ "id_producto": 3, "cantidad": 2 }`
//**Request 2:** `POST /api/carrito/confirmar` con body `{}` → `201`
//**Verificación en base:**
//```sql
//SELECT id, latitud, longitud FROM clientes WHERE direccion_entrega = 'Sarmiento 100, Santo Tomé';
//-- ya NO son NULL: se geocodificaron al crear el pedido y quedaron guardadas
//```
//> Este es el motivo por el que no hizo falta ningún script de migración para las filas que
//> ya existían: cada una se geocodifica la primera vez que su coordenada se necesita de
//> verdad, y queda guardada para siempre (`asegurarCoordenadas*` en
//> `services/ubicacion.service.js`).
//
//### Caso 23 — Error 500 forzado
//**Precondición:** apagar MySQL desde el panel de XAMPP.
//**Request:** `GET /api/pedido/ruta/4`
//**Respuesta esperada:** `500 Internal Server Error`
//```json
//{ "codigo": 500, "estado": "error", "datos": { "mensaje": "Error interno del servidor" } }
//```
//Volver a prender MySQL antes de seguir.
//
//---
//---
//
//# Probar contra la API real de Mapbox
//
//Todo lo de arriba corre en modo mock y no toca la red. Esto es para el día que el equipo
//tenga un access token y quiera confirmar que la integración real anda.
//
//## Conseguir el access token
//
//1. Crear una cuenta en `account.mapbox.com`. **No pide tarjeta de crédito.**
//2. El token público por defecto (`pk.eyJ1...`) aparece en el panel apenas entrás. Ese
//   alcanza: la Directions API y la Geocoding API no exigen ningún scope especial, y la
//   documentación de Mapbox dice que cuando un endpoint no pide scope, el token por
//   defecto sirve.
//3. En el `.env`:
//```
//MAPS_MODO=real
//MAPS_ACCESS_TOKEN=pk.eyJ1...
//```
//4. Reiniciar el servidor.
//
//> El token público va en la URL de cada request, así que es visible para cualquiera que
//> mire el tráfico. Eso es normal y esperado en Mapbox: los `pk.` son públicos por diseño.
//> Los que no hay que publicar nunca son los secretos (`sk.`), que este proyecto no usa.
//
//## Caso 24 — La ruta sale de Mapbox y no de Haversine
//
//**Precondición:** base recién importada. No hace falta preparar nada más: el pedido 1 ya
//viene `en_camino`, asignado a Carlos, y Carlos ya tiene una posición cargada en la
//semilla. Es la forma más rápida de pegarle a la API real.
//
//**Request:** `GET /api/pedido/ruta/1` con el token de Carlos
//**Respuesta esperada:** `200 OK`, y comparada con el modo mock tiene que cambiar esto:
//
//| Campo | En mock | Con el token |
//|---|---|---|
//| `origen_datos` | `"mock"` | **`"mapbox"`** |
//| `polilinea` | `null` | una cadena larga tipo `"mnn_Ick}pAfBiF..."` |
//| `distancia_km` | Haversine × 1.3 | **mayor**, porque la calle real no es la línea recta |
//| `puntos` | — | **iguales**: salen de la base, no de Mapbox |
//
//Qué mirar, en orden de importancia:
//
//- **`origen_datos: "mapbox"`.** Si dice `"estimado"`, la llamada falló y degradó. Mirá la
//  consola del servidor: el `console.error` dice exactamente qué pasó (token inválido,
//  timeout, `NoRoute`).
//- **Que la distancia sea del mismo orden de magnitud**, un par de kilómetros. Si te da
//  miles de kilómetros, **las coordenadas salieron invertidas**: Mapbox las quiere como
//  `{longitud},{latitud}` y el resto del proyecto las maneja al revés. Es el error más
//  fácil de cometer acá y el más difícil de ver, porque no falla: devuelve un punto
//  perfectamente válido en el medio de China.
//- **Que `polilinea` deje de ser `null`.** Es lo que le va a servir al frontend para dibujar
//  la ruta en el mapa.
//
//## Caso 25 — La geocodificación real
//
//**Request:** `POST /api/registro` con una dirección que exista de verdad
//```json
//{ "nombre": "Prueba Real", "email": "prueba.real@test.com", "contrasena": "Test1234!",
//  "telefono": "3421888888", "direccion_entrega": "Boulevard Gálvez 1150, Santa Fe" }
//```
//**Verificación en base:**
//```sql
//SELECT direccion_entrega, latitud, longitud FROM clientes ORDER BY id DESC LIMIT 1;
//-- latitud  ~ -31.6  (negativa, entre -31 y -32)
//-- longitud ~ -60.7  (negativa, entre -60 y -61)
//```
//**Si latitud y longitud aparecen intercambiadas, el bug es ese**: una latitud de -60 no
//existe en Santa Fe. En modo mock esto nunca se puede detectar, porque el mock arma las dos
//coordenadas él mismo y siempre salen bien.
//
//> Acordate de volver a `MAPS_MODO=mock` cuando termines. Si no, el resto de la guía deja
//> de dar los números fijos que figuran en cada caso.
//
//---
//
//## Checklist rápido antes de correr esta guía
//
//- [ ] XAMPP con MySQL prendido
//- [ ] Base con los datos de la semana 9: `aTuPuerta.sql` recién importado
//- [ ] `.env` con `MAPS_MODO=mock` y `MP_MODO=mock` (no hace falta ningún token ni tarjeta)
//- [ ] Servidor levantado con `npm run dev` sin errores
//- [ ] Tokens de María y Lucía, cada uno en el header `Authorization`, **sin** `Bearer`
//- [ ] Correr los casos en orden (cada uno deja la base lista para el siguiente)
//- [ ] Para los Casos 20 y 21 hay que tocar el `.env` y reiniciar; acordarse de volver a
//      dejar `MAPS_MODO=mock` después
//- [ ] Los Casos 24 y 25 son aparte: solo se pueden correr con un access token de Mapbox
//
//> Si ya conocés los casos y solo querés volver a correrlos para ver que nada se rompió,
//> `postman/lista-semanas-8-10.js` los tiene todos resumidos en una tabla, en orden, junto
//> con los de las semanas 8 y 10.
