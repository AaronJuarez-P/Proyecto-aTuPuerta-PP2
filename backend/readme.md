# Backend — Sistema de delivery

Backend del proyecto anual Practica Profesionalizante 2. Node.js + Express + MySQL.

---

## Estructura

```
backend/
├── scripts/
│   ├── aTuPuerta.sql
│   └── cliente-seguimiento.js      <- cliente de socket para probar el tiempo real a mano
├── postman/
│   ├── backend-registro.js         <- guía de pruebas: registro y login
│   ├── backend-productos.js        <- guía de pruebas: catálogo y stock
│   ├── backend-pagos.js            <- guía de pruebas: pagos (CU07)
│   ├── backend-repartidores.js     <- guía de pruebas: repartidores (CU19, CU20)
│   ├── backend-geolocalizacion.js  <- guía de pruebas: ubicación y rutas (CU21, CU22)
│   ├── backend-seguimiento.js      <- guía de pruebas: tiempo real (CU08, CU26)
│   └── lista-semanas-8-10.js       <- las semanas 8, 9 y 10 en una sola lista, para ir tildando
├── src/
│   ├── controllers/
│   │   ├── registro.controller.js
│   │   ├── registroComercio.controller.js
│   │   ├── registroRepartidor.controller.js
│   │   ├── comercio.controller.js
│   │   ├── producto.controller.js
│   │   ├── carrito.controller.js
│   │   ├── pago.controller.js
│   │   ├── pedido.controller.js
│   │   ├── repartidor.controller.js
│   │   ├── notificacion.controller.js
│   │   └── seguimiento.controller.js
│   ├── database/
│   │   └── database.js
│   ├── middlewares/
│   │   ├── autenticacion.middleware.js
│   │   ├── cliente.middleware.js
│   │   ├── comercio.middleware.js
│   │   └── repartidor.middleware.js
│   ├── routes/
│   │   ├── registro.routes.js
│   │   ├── registroComercio.routes.js
│   │   ├── registroRepartidor.routes.js
│   │   ├── comercio.routes.js
│   │   ├── producto.routes.js
│   │   ├── carrito.routes.js
│   │   ├── pago.routes.js
│   │   ├── pedido.routes.js
│   │   ├── repartidor.routes.js
│   │   ├── notificacion.routes.js
│   │   └── seguimiento.routes.js
│   ├── services/
│   │   ├── auditoria.service.js
│   │   ├── pedido.service.js       <- estados del pedido, stock, asignación, entrega y comisión
│   │   ├── pago.service.js         <- adaptador de MercadoPago
│   │   ├── maps.service.js         <- adaptador de Mapbox (Directions + Geocoding)
│   │   ├── ubicacion.service.js    <- posiciones del repartidor y coordenadas guardadas
│   │   ├── repartidor.service.js   <- disponibilidad del repartidor
│   │   ├── notificacion.service.js
│   │   ├── seguimiento.service.js  <- negocio del seguimiento: autorización, ETA y su caché
│   │   └── tiemporeal.service.js   <- adaptador de Socket.IO (handshake, salas, emisión)
│   ├── utils/
│   │   ├── paginacion.js
│   │   └── validacion.js
│   ├── app.js
│   └── index.js
├── .env
├── .env.example
├── .gitignore
├── package-lock.json
└── package.json
```

---

## Instrucciones para ejecutar

### 1 — Base de datos

- Encender XAMPP
- Importar `scripts/aTuPuerta.sql` en phpMyAdmin

> El script arranca con `DROP DATABASE IF EXISTS aTuPuerta`, así que re-importarlo
> borra los datos locales. Los usuarios de prueba quedan con la contraseña `Test1234!`.
> Cada vez que el script cambia hay que volver a importarlo entero.

> **Si lo importás desde la consola** en vez de phpMyAdmin, el `.sql` ya trae
> `SET NAMES utf8mb4` en la primera línea. Sin eso, `mysql.exe` en Windows usa la
> codepage de la consola y guarda todos los acentos doble-codificados: *Librería del Sur*
> queda como *Librer├¡a del Sur* en la base y no hay forma de darse cuenta hasta que
> falla una comparación.

### 2 — Variables de entorno

Crear `.env` en la raíz de `backend/` copiando `.env.example`:

```
HOST=localhost
DATABASE=aTuPuerta
USER=root
PASSWORD=
JWT_SECRET=ClaveSecretaProyecto2026
JWT_EXPIRES_IN=8h
PORT=4000

MP_MODO=mock
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
URL_PUBLICA=http://localhost:4000

MAPS_MODO=mock
MAPS_ACCESS_TOKEN=
MAPS_GEOCODING_PERMANENT=false
MAPS_CENTRO_LAT=-31.6667
MAPS_CENTRO_LNG=-60.7667
MAPS_RADIO_MOCK_KM=5
MAPS_VELOCIDAD_KMH=25
MAPS_FACTOR_RUTA=1.3
MAPS_DISTANCIA_FALLBACK_KM=3

COMISION_BASE=500
COMISION_POR_KM=80
```

> `PASSWORD` es la contraseña del usuario de MySQL. En XAMPP recién instalado `root` va
> **sin** contraseña, o sea `PASSWORD=` vacío. Si al arrancar aparece
> `Access denied for user 'root'@'localhost'`, el problema es este valor.

> **`.env` no se versiona.** Cada uno tiene el suyo, porque la contraseña de MySQL
> cambia de máquina en máquina. Si al pullear no lo tenés, copiá `.env.example`.

#### Variables de pago (semana 6)

| Variable | Para qué sirve |
|---|---|
| `MP_MODO` | `mock` no llama a MercadoPago y habilita `POST /api/pagos/simular`. `sandbox` usa el SDK real con credenciales de prueba |
| `MP_ACCESS_TOKEN` | Access token de prueba de la aplicación (empieza con `TEST-`). Solo con `MP_MODO=sandbox` |
| `MP_WEBHOOK_SECRET` | Clave con la que MercadoPago firma las notificaciones. Es lo que autentica el webhook |
| `URL_PUBLICA` | URL desde la que se llega al backend. Con `sandbox` tiene que ser la de ngrok, porque MercadoPago necesita alcanzar el webhook desde afuera |

Para desarrollo y para la defensa alcanza con `MP_MODO=mock`: no hace falta cuenta,
credenciales ni ngrok. Las credenciales de prueba de MercadoPago tampoco cuestan nada
(simulan transacciones sin dinero real), pero requieren exponer el backend a internet
para poder recibir el webhook.

#### Variables de geolocalización (semana 9)

| Variable | Para qué sirve |
|---|---|
| `MAPS_MODO` | `mock` no llama a Mapbox: geocodifica de forma determinística y estima la distancia con Haversine. `real` usa la Directions API y la Geocoding API |
| `MAPS_ACCESS_TOKEN` | Access token de Mapbox. Solo con `MAPS_MODO=real` |
| `MAPS_GEOCODING_PERMANENT` | En `true` pide derechos de almacenamiento permanente al geocodificar, que es lo que habilita a guardar las coordenadas en la base. Cuesta más por request y exige una tarjeta cargada en la cuenta, así que viene en `false` |
| `MAPS_CENTRO_LAT` / `MAPS_CENTRO_LNG` | Centro alrededor del cual el modo mock reparte las direcciones (por defecto, Santo Tomé) |
| `MAPS_RADIO_MOCK_KM` | Radio en el que el mock las dispersa |
| `MAPS_VELOCIDAD_KMH` | Velocidad promedio del repartidor, para estimar el tiempo de viaje sin Mapbox |
| `MAPS_FACTOR_RUTA` | Factor calle / línea recta que se le aplica al Haversine |
| `MAPS_DISTANCIA_FALLBACK_KM` | Distancia que se usa cuando no hay ni coordenadas para estimar |
| `COMISION_BASE` / `COMISION_POR_KM` | `comision = COMISION_BASE + COMISION_POR_KM × distancia_km` |

Igual que con los pagos, para la defensa alcanza con `MAPS_MODO=mock`: no hace falta
access token ni cargar una tarjeta. El modo mock es determinístico, así que la misma
dirección da siempre la misma coordenada y los números no cambian entre corridas.

#### Variables del seguimiento en tiempo real (semana 10)

| Variable | Para qué sirve |
|---|---|
| `SOCKET_ORIGEN` | Orígenes permitidos en el handshake del socket. Socket.IO **no** hereda el `cors()` de Express, así que sin esto un front servido desde otro puerto no conecta. En desarrollo, `*` |
| `SEGUIMIENTO_PINGS_REFRESCO` | Cada cuántos pings del repartidor se le vuelve a pedir la ruta real a Mapbox. Entre refrescos el ETA se reescala localmente, que es gratis |
| `SEGUIMIENTO_MINUTOS_REFRESCO` | Tope de tiempo entre refrescos, por si el repartidor pingea muy espaciado |
| `SEGUIMIENTO_SESIONES_MAX` | Tope de pedidos con sesión de seguimiento viva en memoria |

Las cuatro tienen valor por defecto en el código: el seguimiento funciona sin tocar el
`.env`.

### 3 — Instalar y correr

```bash
npm install
npm run dev
```

Servidor en `http://localhost:4000`

### 4 — Probar

Todo se prueba desde Postman con las guías de `postman/`. Cada guía explica, caso por caso,
qué request mandar, qué tiene que contestar y por qué el endpoint hace lo que hace.

Para las semanas 8, 9 y 10 hay además `postman/lista-semanas-8-10.js`: las tres guías
resumidas en una sola lista ordenada, para ir tildando mientras se prueba. Sirve como
checklist de regresión antes de entregar; el detalle sigue estando en las guías largas.

La parte de tiempo real de la semana 10 es la única que no se corre con Postman: necesita
un cliente de Socket.IO, y para eso está `scripts/cliente-seguimiento.js`.

Los casos se corren **en orden** y cada uno deja la base como la necesita el siguiente, así
que conviene reimportar `scripts/aTuPuerta.sql` antes de empezar cada guía.

---

## Endpoints

### Formato de respuesta uniforme

```json
{
  "codigo": 200,
  "estado": "exito",
  "datos": { "mensaje": "texto para mostrarle al usuario" }
}
```

`estado` es siempre `"exito"` o `"error"`, nunca un mensaje: el cliente decide con eso qué
rama tomar y saca el texto de `datos.mensaje`. Vale también para los errores de
`verificarToken`, `verificarRol` y el `404` de ruta desconocida.

### Autenticación y registro

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/registro` | Alta de usuario base en `usuarios` (sin rol) |
| `POST` | `/api/inicioSesion` | Login genérico. Devuelve JWT |
| `POST` | `/api/registroComercio` | Alta de usuario + comercio en una transacción |
| `POST` | `/api/inicioSesionComercio` | Login de comercio (email + contraseña + CUIL) |
| `POST` | `/api/cerrarSesionComercio` | Cierra la sesión de comercio |
| `POST` | `/api/registroRepartidor` | Alta del perfil de repartidor para un usuario ya registrado (pide su contraseña) |
| `POST` | `/api/inicioSesionRepartidor` | Login de repartidor. Body: `{ email, contrasena }` |
| `POST` | `/api/cerrarSesionRepartidor` | Cierra la sesión de repartidor |

Los dos logins firman el mismo payload: `{ id, rol, comercioId }` (el `comercioId`
solo aparece si el usuario es un comercio). El login de repartidor firma
`{ id, rol: 'repartidor', repartidorId }`.

`usuarios.rol` funciona como "qué sesión tenés abierta", una sola a la vez: cada login
la escribe y cerrar sesión de comercio o de repartidor vuelve a dejarla en `cliente`.
Por eso `resolverComercio` y `resolverRepartidor` filtran por `usuarios.rol` y no por el
rol que viene adentro del token.

> **Limitación conocida:** cerrar sesión no invalida el JWT, porque el token no tiene
> estado del lado del servidor. Deja de servir para lo que pasa por `resolverComercio` o
> `resolverRepartidor`, pero donde solo corre `verificarToken` (por ejemplo
> `GET /api/notificaciones`) vale hasta que expira, a las 8 horas. La solución real es
> expiración corta con refresh token, o una lista de tokens revocados.

### Catálogo — CU03, CU04 (públicos)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/comercios` | Lista comercios activos. Filtros: `categoria`, `buscar`, `pagina`, `limite` |
| `GET` | `/api/comercios/:id` | Detalle de un comercio |
| `GET` | `/api/comercios/:id/productos` | Productos de un comercio. Filtros: `categoria`, `buscar` |
| `GET` | `/api/productos` | Búsqueda global. Filtros: `buscar`, `categoria`, `comercioId`, `precioMin`, `precioMax` |
| `GET` | `/api/productos/:id` | Detalle de un producto |

### Gestión del catálogo — CU13 a CU16 (solo rol `comercio`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/productos` | Alta de producto |
| `PUT` | `/api/productos/:id` | Edición completa |
| `PATCH` | `/api/productos/:id/stock` | Actualiza stock. Body: `{ stock }` o `{ ajuste }` |
| `PATCH` | `/api/productos/:id/precio` | Actualiza precio. Body: `{ precio }` |
| `DELETE` | `/api/productos/:id` | Baja lógica (`activo = FALSE`) |
| `GET` | `/api/productos/:id/auditoria` | Historial de cambios del producto |

Cadena de middlewares: `verificarToken` → `verificarRol('comercio')` → `resolverComercio`.

- El token va en el header `Authorization` **sin** el prefijo `Bearer `.
- El `comercio_id` sale siempre del token, nunca del body: un comercio no puede crear
  ni modificar productos de otro (`403`).
- Cada escritura corre dentro de una transacción junto con su fila en
  `auditoria_productos` (`INSERT` / `UPDATE` / `DELETE`, con el `usuario_id` del actor).
- El borrado es lógico porque `items_pedido.producto_id` es `ON DELETE RESTRICT` y
  `auditoria_productos.producto_id` es `ON DELETE CASCADE`.

Los casos de prueba de cada endpoint están en `postman/backend-productos.js`.

### Pagos — CU07 (rol `cliente`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/pedidos/:id/pagar` | Registra el intento de pago y devuelve la URL de MercadoPago |
| `GET` | `/api/pedidos/:id/pago` | Estado del pago del pedido propio |
| `POST` | `/api/pagos/webhook` | Notificación de MercadoPago. **Público** |
| `GET` | `/api/pagos/retorno` | Vuelta del navegador después de pagar (`back_urls`) |
| `POST` | `/api/pagos/simular` | Fuerza un resultado. Solo con `MP_MODO=mock` |

Flujo: `confirmarCarrito` deja el pedido en `pendiente_pago` → `POST /pedidos/:id/pagar`
crea la preferencia y la fila en `pagos` → el cliente paga en MercadoPago →
la notificación llega al webhook → el pedido avanza o se cancela.

- **El webhook es la fuente de verdad**, no la respuesta de `/pagar`: cuando se crea la
  preferencia el pago todavía no existe.
- **El webhook no pasa por `verificarToken`** porque MercadoPago no tiene nuestro JWT.
  Lo autentica la firma `x-signature` (HMAC-SHA256), validada con el
  `WebhookSignatureValidator` del SDK. Sin eso, cualquiera que supiera un `pedido_id`
  podría mandar una aprobación falsa.
- **Nunca se le cree al cuerpo de la notificación**: solo trae un id, y el estado y el
  monto reales se consultan contra la API. Si el monto no coincide con `pedidos.total`,
  el pago queda `fallido` y el pedido no se libera.
- **Es idempotente**: MercadoPago reintenta las notificaciones, así que un pago que ya
  está en un estado terminal no vuelve a tocar nada. Sin esa guarda, un aviso repetido
  devolvería el stock dos veces.
- **Un pago rechazado cancela el pedido y devuelve el stock.** El stock se descuenta al
  confirmar el carrito (semana 5), no al pagar, así que si nadie lo devolviera quedaría
  reservado para siempre. Como contrapartida, no se puede reintentar sobre el mismo
  pedido: hay que rearmar el carrito.
- El cambio de estado del pedido vive en `services/pedido.service.js`, no suelto en el
  controlador, para que la semana 7 lo reemplace en un solo lugar. Cada cambio queda en
  `auditoria_pedidos`.
- `pagos` tiene `UNIQUE KEY uq_pagos_pedido`: una sola fila por pedido, así que un
  reintento actualiza la que ya existe.

Los casos de prueba están en `postman/backend-pagos.js`.

### Repartidores — CU19, CU20 (rol `repartidor`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/pedido/listar` | Pedidos disponibles: `en_preparacion` y sin repartidor. Filtros: `pagina`, `limite` |
| `PATCH` | `/api/pedido/asignar/:idPedido` | Acepta el pedido: `repartidor_id`, `en_camino` y código de entrega |
| `PATCH` | `/api/pedido/entrega/:idPedido` | Confirma la entrega. Body: `{ codigoPedido }` y, opcional, `{ latitud, longitud }` |
| `GET` | `/api/repartidor/disponibilidad` | `{ disponible, pedido_en_curso }` |
| `PATCH` | `/api/repartidor/disponibilidad` | Entrar o salir de servicio. Body: `{ disponible }` |

Cadena de middlewares: `verificarToken` → `verificarRol('repartidor')` → `resolverRepartidor`
(busca el repartidor en la base y exige que el usuario siga activo).

Flujo: el pago aprobado deja el pedido en `en_preparacion` → el repartidor disponible lo
ve en `/pedido/listar` y lo acepta → el cliente recibe el código por notificación → el
repartidor confirma la entrega con ese código y vuelve a quedar disponible.

- **Doble asignación.** Aceptar es un único `UPDATE ... WHERE repartidor_id IS NULL AND
  estado = 'en_preparacion'`: si dos repartidores aceptan a la vez, el segundo afecta 0
  filas y recibe `409`. Vive en `services/pedido.service.js`.
- **`disponible` = puede tomar un pedido nuevo.** `FALSE` al aceptar, `TRUE` al entregar,
  y además a mano. Sin estar disponible no se ve el listado (`403`) ni se acepta (`409`),
  y con un pedido en camino no se puede volver a estar disponible (`409`).
- **Orden de locks.** Aceptar, entregar y el cambio manual de disponibilidad lockean
  primero la fila en `repartidores` (`bloquearRepartidor` en `services/repartidor.service.js`).
  Así el mismo repartidor no acepta dos pedidos a la vez, y el orden del proyecto queda
  `repartidores → pagos → pedidos → productos`.
- **Código de entrega** de 8 dígitos con `crypto.randomInt`. Le llega al cliente por
  notificación y nunca al repartidor en la respuesta. Al entregar se borra (`codigo = NULL`).
- **Transacción completa.** Asignar, cambiar la disponibilidad, auditar en
  `auditoria_pedidos` (con el `usuario_id` del repartidor) y notificar al cliente se
  confirman juntos o se revierten juntos.
- **Errores precisos en el camino de error.** Cuando el `UPDATE` condicional no afecta
  filas, se consulta el pedido para responder `404` (no existe), `403` (es de otro
  repartidor), `409` (estado que no corresponde) o `400` (código incorrecto). Para la
  entrega, la pertenencia se verifica antes que el código: a quien no tiene el pedido
  nunca se le confirma si un código es correcto.

### Geolocalización — CU21, CU22 (rol `repartidor`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/repartidor/ubicacion` | Registra la posición actual. Body: `{ latitud, longitud }` |
| `GET` | `/api/pedido/ruta/:idPedido` | Ruta optimizada hacia el destino + ETA. Query: `retirado=true\|false` |

Misma cadena de middlewares que el resto de repartidores. `resolverRepartidor` deja además
`req.repartidorVehiculo`, que es lo que define el perfil de ruta con el que se le pide la
ruta a Mapbox.

Flujo: el repartidor manda su posición cada tanto → pide la ruta y obtiene el camino
`donde estoy → comercio → domicilio del cliente` con la distancia, la duración y el ETA →
al confirmar la entrega puede mandar la posición final, que cierra el rastro del pedido.

- **El proveedor es Mapbox**: `GET api.mapbox.com/directions/v5/mapbox/{perfil}/{coords}`
  para la ruta y la Geocoding API v6 para convertir direcciones en coordenadas. La semana 9
  se escribió contra Google Maps Platform y se migró a Mapbox porque Google no habilita
  ninguna de sus APIs hasta que el proyecto de Google Cloud tenga una cuenta de facturación
  con tarjeta de crédito real cargada, aunque después el consumo entre en el free tier y no
  cobre nada. Migrar costó reescribir dos funciones de `maps.service.js`: nada afuera del
  adaptador se enteró.
- **Mapbox pide las coordenadas como `{longitud},{latitud}`, al revés que Google.** La
  interfaz interna sigue hablando de `{ latitud, longitud }` y el orden se da vuelta en el
  borde del adaptador, en un solo lugar.
- **El comercio es una parada obligatoria.** Cuando el repartidor acepta, el pedido pasa a
  `en_camino` pero todavía no retiró la mercadería, así que la ruta por defecto pasa por
  el comercio. Con `?retirado=true` va derecho al cliente.
- **Las paradas no se reordenan a propósito.** Reordenarlas sería incorrecto: no se puede
  entregar antes de retirar. "Ruta optimizada" acá significa el mejor camino según el
  tráfico (perfil `driving-traffic`), no cambiar el orden.
- **El perfil de ruta sale de `repartidores.tipo_vehiculo`**: `bicicleta` → `cycling`, todo
  el resto → `driving-traffic`. Mapbox no tiene perfil de moto, así que las motos van por
  el mismo que los autos; a cambio desaparece la restricción de Google, que devolvía `400
  INVALID_ARGUMENT` si se le mandaba la preferencia de tráfico junto con `BICYCLE`.
- **El ETA va adentro de la respuesta de la ruta**, no en un endpoint aparte: sale de la
  misma llamada, así que separarlo significaría pagar dos veces la misma request.
- **La geocodificación es "temporary" mientras `MAPS_GEOCODING_PERMANENT` esté en `false`.**
  Los términos de Mapbox distinguen geocodificación temporary de permanent, y solo la
  segunda habilita a guardar las coordenadas en una base de datos. Como este proyecto las
  guarda, para un despliegue real hay que prender el flag y cargar una tarjeta en la
  cuenta. Para el trabajo de cátedra queda documentado y apagado.
- **Nada de esto puede tirar abajo un pedido.** Si Mapbox no contesta, expira el timeout o
  falta el access token, `maps.service.js` degrada a un cálculo local con Haversine y lo
  avisa con un `console.error`. El campo `origen_datos` de la respuesta dice de dónde salió
  cada número: `mapbox`, `mock` (modo de prueba) o `estimado` (degradó).
- **Ninguna llamada de red ocurre dentro de una transacción.** `confirmarCarrito` está
  partido en dos fases justamente por eso: la fase 1 calcula las rutas contra el pool y la
  fase 2 abre la transacción, lockea los productos y crea los pedidos.
- **Las coordenadas se completan solas.** `clientes`, `comercios` y `pedidos` tienen
  columnas de latitud/longitud nullables. Se llenan al registrarse o al crear el pedido, y
  las filas viejas se geocodifican la primera vez que hacen falta
  (`asegurarCoordenadas*` en `services/ubicacion.service.js`). No hay script de backfill.
- **Snapshot e histórico.** Cada posición se escribe en los dos lados:
  `ubicaciones_repartidor` guarda el recorrido completo del pedido y
  `repartidores.latitud_actual/longitud_actual` guarda dónde está ahora, que es lo que la
  ruta usa como origen sin tener que ordenar el histórico.

Los casos de prueba están en `postman/backend-geolocalizacion.js`.

### Notificaciones (cualquier usuario logueado)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/notificaciones` | Notificaciones propias, las más recientes primero. Filtros: `pagina`, `limite` |

Versión mínima de la semana 8: las notificaciones se guardan en la tabla `notificaciones`
(`services/notificacion.service.js`, dentro de la transacción que las origina) y se leen
con este endpoint. Marcarlas como leídas y el envío en tiempo real quedan para la semana 11.

Los casos de prueba están en `postman/backend-repartidores.js`.

### Seguimiento en tiempo real — CU08, CU26

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/pedidos/:id/seguimiento` | Estado del pedido, posición del repartidor, ETA y ruta. Rol `cliente` |

Y un canal de Socket.IO sobre **el mismo puerto que la API**:

| Dirección | Evento | Payload |
|---|---|---|
| cliente → servidor | `seguir_pedido` | `{ pedidoId }`, con ack `{ codigo, estado, datos }` |
| cliente → servidor | `dejar_pedido` | `{ pedidoId }`, con ack |
| servidor → sala | `ubicacion_actualizada` | `{ pedido_id, ubicacion, eta, ruta, emitido_en }` |
| servidor → sala | `estado_actualizado` | `{ pedido_id, estado, seguimiento_activo, mensaje, ocurrido_en }` |

Flujo: el cliente abre la pantalla y pide `GET /pedidos/:id/seguimiento` para dibujar el
estado inicial → se conecta al socket y emite `seguir_pedido` → mientras el pedido está
`en_camino`, cada `POST /repartidor/ubicacion` le llega como un evento con la posición
nueva y el ETA recalculado → los cambios de estado (pago aprobado, repartidor asignado,
entregado, cancelado) llegan por el mismo canal.

- **El socket va sobre el mismo servidor HTTP que Express.** `index.js` arma el servidor
  con `http.createServer(app)` en vez de `app.listen()`, que crea uno propio al que
  Socket.IO no se puede enganchar. En puertos separados el front tendría dos orígenes que
  configurar y dos cosas que romper.
- **El token viaja crudo en `auth.token` del handshake**, sin prefijo `Bearer`, igual que
  lo lee `verificarToken`. Por `auth` y no por query string para que no quede en los logs
  del servidor ni en el historial del navegador.
- **Una sala por pedido (`pedido:<id>`).** Entrar se autoriza contra la base: hay que ser
  el cliente del pedido o el repartidor asignado. Ahí la autorización es por pertenencia y
  no por rol, así que el repartidor entra al socket aunque el endpoint REST le dé `403`.
- **No se exige `en_camino` para entrar a la sala.** Si se exigiera, el cliente que abre la
  pantalla mientras el comercio prepara el pedido nunca recibiría el evento que lo lleva a
  `en_camino`, que es justamente el que está esperando.
- **Las emisiones van después del `commit` y sin `await`.** Lo que se anuncia ya tiene que
  estar en la base, y esperar la emisión sería tener una de las 10 conexiones del pool
  tomada durante una llamada a Mapbox de hasta 5 segundos, con un repartidor que pingea
  cada pocos segundos. El canal es best-effort: la fila y la respuesta HTTP son la verdad.
- **El ETA se reescala entre refrescos.** Pedirle la ruta a Mapbox en cada ping sería una
  request de red por ping por repartidor; calcularlo con Haversine crudo ignoraría que la
  calle da vueltas. Se pide la ruta real cada `SEGUIMIENTO_PINGS_REFRESCO` pings y entre
  medio se reescala esa ruta por la fracción de distancia que falta. `ruta` viaja solo en
  el evento donde hubo refresco; en los demás va `null` y el front conserva la anterior.
- **Si nadie mira, no se calcula nada.** `haySeguidores()` corta antes de consultar el
  pedido, calcular el ETA o hablarle a Mapbox. La caché de ETA vive en memoria y es solo
  costo, nunca corrección: si se vacía, el próximo ping paga un refresco.
- **El REST y el socket dan el mismo ETA** porque los dos llaman a la misma función de
  `seguimiento.service.js` y comparten la misma caché. Por eso el negocio está separado
  del transporte: si viviera en el módulo del socket, el controlador REST tendría que
  importar Socket.IO nada más que para sacar un número.
- **El endpoint REST nunca devuelve `409`.** A diferencia de `GET /pedido/ruta/:idPedido`,
  que sí le contesta `409` al repartidor sin ubicación registrada —él puede arreglarlo
  mandando un ping—, el cliente no puede arreglar nada: siempre `200`, con los campos en
  `null` y un `mensaje` que explica qué está pasando.
- **La ruta del cliente va derecho a la puerta**, sin la parada en el comercio que sí mete
  CU21. Son dos preguntas distintas: el cliente pregunta cuándo le llega, el repartidor
  pregunta qué vuelta tiene que dar.
- **El evento de `en_camino` no lleva el código de entrega**, aunque la asignación lo
  genere: en la sala están el cliente y el repartidor.
- **Socket.IO reconecta solo, pero no vuelve a entrar a las salas.** La sala es estado del
  servidor. El cliente tiene que re-emitir `seguir_pedido` en **cada** `connect`, no solo
  en el primero; `scripts/cliente-seguimiento.js` lo hace así.
- **Una sola instancia.** Con dos procesos de Node cada uno tendría sus propias salas y un
  evento emitido en uno no llegaría a los clientes del otro. La solución es
  `@socket.io/redis-adapter`, y queda anotada sin construir.
- **Esta semana no cambia el esquema.** Es la primera. El seguimiento lee
  `ubicaciones_repartidor` con el índice que ya creó la semana 9, y el ETA no se persiste:
  `pedidos.tiempo_estimado` es la foto del checkout, el ETA en vivo caduca con el próximo
  ping.

Para probarlo sin frontend:

```bash
node scripts/cliente-seguimiento.js <token> <pedidoId>
```

Se deja corriendo en una terminal aparte mientras se mandan las requests desde Postman.
**Postman no sirve para el canal**: tiene WebSocket crudo, y Socket.IO es un protocolo
propio por encima.

Los casos de prueba están en `postman/backend-seguimiento.js`.