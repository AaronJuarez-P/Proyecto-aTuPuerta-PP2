# Backend — Sistema de delivery

Backend del proyecto anual Practica Profesionalizante 2. Node.js + Express + MySQL.

---

## Estructura

```
backend/
├── scripts/
│   ├── aTuPuerta.sql               <- esquema completo + datos de prueba (arranca con DROP DATABASE)
│   ├── migraciones/                <- para actualizar una base que ya tiene datos
│   ├── prueba-flujos.js            <- prueba automática de punta a punta (semana 14)
│   └── cliente-seguimiento.js      <- cliente de socket para probar el tiempo real a mano
├── postman/
│   ├── ATuPuerta.postman_collection.json <- colección importable con TODOS los endpoints
│   ├── backend-registro.js         <- guía de pruebas: registro y login
│   ├── backend-productos.js        <- guía de pruebas: catálogo y stock
│   ├── backend-pagos.js            <- guía de pruebas: pagos (CU07)
│   ├── backend-repartidores.js     <- guía de pruebas: repartidores (CU19, CU20)
│   ├── backend-geolocalizacion.js  <- guía de pruebas: ubicación y rutas (CU21, CU22)
│   ├── backend-seguimiento.js      <- guía de pruebas: tiempo real (CU08, CU26)
│   ├── lista-semanas-8-10.js       <- las semanas 8, 9 y 10 en una sola lista, para ir tildando
│   └── lista-semanas-11-14.js      <- perfiles, notificaciones, historial, administración y seguridad
├── src/
│   ├── config/
│   │   └── webPush.js              <- claves VAPID; sin ellas el push queda apagado
│   ├── controllers/
│   │   ├── registro.controller.js
│   │   ├── registroComercio.controller.js
│   │   ├── registroRepartidor.controller.js
│   │   ├── perfil.controller.js        <- perfil propio, contraseña y baja (semana 3)
│   │   ├── comercio.controller.js      <- catálogo público, perfil y ventas del comercio
│   │   ├── producto.controller.js
│   │   ├── carrito.controller.js
│   │   ├── pago.controller.js
│   │   ├── pedido.controller.js        <- lado repartidor del pedido
│   │   ├── pedidoCliente.controller.js <- lado cliente: historial, repetir y cancelar (semana 12)
│   │   ├── repartidor.controller.js
│   │   ├── notificacion.controller.js  <- listar y marcar como leídas
│   │   ├── notificaciones.controller.js <- Web Push: suscripción y envío
│   │   ├── seguimiento.controller.js
│   │   ├── administrador.controller.js <- login de administrador, usuarios y comercios (CU23)
│   │   ├── supervision.controller.js   <- pedidos y auditoría (CU24)
│   │   └── reclamo.controller.js       <- reclamos (CU25)
│   ├── database/
│   │   └── database.js
│   ├── middlewares/
│   │   ├── autenticacion.middleware.js <- token + sesión viva contra la base
│   │   ├── cliente.middleware.js
│   │   ├── comercio.middleware.js
│   │   ├── repartidor.middleware.js
│   │   ├── administrador.middleware.js
│   │   └── limites.middleware.js       <- rate limiting (semana 14)
│   ├── routes/
│   │   ├── registro.routes.js
│   │   ├── registroComercio.routes.js
│   │   ├── registroRepartidor.routes.js
│   │   ├── perfil.routes.js
│   │   ├── comercio.routes.js
│   │   ├── producto.routes.js
│   │   ├── carrito.routes.js
│   │   ├── pago.routes.js
│   │   ├── pedido.routes.js
│   │   ├── pedidoCliente.routes.js
│   │   ├── repartidor.routes.js
│   │   ├── notificacion.routes.js
│   │   ├── notificaciones.routes.js
│   │   ├── seguimiento.routes.js
│   │   ├── administrador.routes.js
│   │   └── reclamo.routes.js
│   ├── services/
│   │   ├── auditoria.service.js
│   │   ├── pedido.service.js       <- máquina de estados, stock, cancelación, asignación, entrega y comisión
│   │   ├── pago.service.js         <- adaptador de MercadoPago
│   │   ├── maps.service.js         <- adaptador de Mapbox (Directions + Geocoding)
│   │   ├── ubicacion.service.js    <- posiciones del repartidor y coordenadas guardadas
│   │   ├── repartidor.service.js   <- disponibilidad del repartidor
│   │   ├── usuario.service.js      <- cuentas: perfiles, pedidos en curso y baja lógica
│   │   ├── notificacion.service.js <- filas de notificaciones y envío push
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

> **Para no perder los datos de una base existente**, en vez de reimportar se pueden correr
> las migraciones de `scripts/migraciones/`, en orden de fecha. La del 29/09
> (`20260929_semanas_11_a_14.sql`) explica en su encabezado qué hace falta antes. Normaliza
> el estado "esperando el pago" a `pago_espera` venga la base de la rama que venga (en
> `ramaSanti` se llamaba `pendiente_pago`, y XAMPP guardaba el estado vacío cuando no
> coincidía con el ENUM).

La semilla trae un usuario de cada rol, todos con la contraseña `Test1234!`:

| Rol | Email | Login |
|---|---|---|
| Cliente | `juan.perez@test.com`, `maria.gomez@test.com` | `POST /api/inicioSesion` |
| Comercio | `ferreteria.central@test.com` (CUIL `20304050607`), `libreria.sur@test.com` (CUIL `20405060708`) | `POST /api/inicioSesionComercio` |
| Repartidor | `carlos.repartidor@test.com`, `lucia.repartidor@test.com` | `POST /api/inicioSesionRepartidor` |
| Administrador | `admin@test.com` | `POST /api/inicioSesionAdministrador` |

### 2 — Variables de entorno

Crear `.env` en la raíz de `backend/` copiando `.env.example`:

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=aTuPuerta
DB_USER=root
DB_PASSWORD=
JWT_SECRET=ClaveSecretaProyecto2026
JWT_EXPIRES_IN=8h
PORT=4000

MP_MODO=mock
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
URL_PUBLICA=http://localhost:4000
FRONT_URL=http://localhost:5173

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

VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:ATuPuerta@gmail.org

CORS_ORIGEN=http://localhost:5173
RATE_LIMIT_VENTANA_MINUTOS=15
RATE_LIMIT_MAX=1000
RATE_LIMIT_LOGIN_MAX=10
TRUST_PROXY=
```

> `DB_PASSWORD` es la contraseña del usuario de MySQL. En XAMPP recién instalado `root` va
> **sin** contraseña, o sea `DB_PASSWORD=` vacío. Si al arrancar aparece
> `Access denied for user 'root'@'localhost'`, el problema es este valor.

> **`DB_*` desde la semana 14.** Los nombres viejos (`HOST`, `DATABASE`, `USER`,
> `PASSWORD`) siguen funcionando para no romper los `.env` que ya existen, pero conviene
> pasarse: en Mac y Linux `USER` es una variable del sistema operativo y dotenv no la pisa,
> así que el `USER=root` del `.env` se ignoraba y la conexión salía con el usuario de la
> computadora.

> **Si falta `JWT_SECRET` o el nombre de la base, el servidor no arranca** y dice qué
> falta. Antes arrancaba igual y cada login contestaba un `500`.

> **`.env` no se versiona.** Cada uno tiene el suyo, porque la contraseña de MySQL
> cambia de máquina en máquina. Si al pullear no lo tenés, copiá `.env.example`.

#### Variables de pago (semana 6)

| Variable | Para qué sirve |
|---|---|
| `MP_MODO` | `mock` no llama a MercadoPago y habilita `POST /api/pagos/simular`. `sandbox` usa el SDK real con credenciales de prueba |
| `MP_ACCESS_TOKEN` | Access token de prueba de la aplicación (empieza con `TEST-`). Solo con `MP_MODO=sandbox` |
| `MP_WEBHOOK_SECRET` | Clave con la que MercadoPago firma las notificaciones. Es lo que autentica el webhook |
| `URL_PUBLICA` | URL desde la que se llega al backend. Con `sandbox` tiene que ser la de ngrok, porque MercadoPago necesita alcanzar el webhook desde afuera |
| `FRONT_URL` | URL del front. Al volver de MercadoPago, `GET /api/pagos/retorno` redirige al detalle del pedido ahí. Vacía, contesta un JSON |

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

#### Variables de notificaciones push (semana 11)

| Variable | Para qué sirve |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Identifican al servidor ante el servicio de push del navegador. Se generan una sola vez con `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | Contacto del dueño de las claves (`mailto:...`) |

Son opcionales. Sin ellas el push queda apagado —el servidor lo avisa al arrancar— y todo lo
demás funciona igual: las notificaciones se guardan en la base y se leen con
`GET /api/notificaciones`. Antes, sin estas claves el servidor directamente no arrancaba.

#### Variables de seguridad (semana 14)

| Variable | Para qué sirve |
|---|---|
| `CORS_ORIGEN` | Orígenes que pueden llamar a la API desde un navegador, separados por coma. Vacío = cualquiera (se avisa al arrancar). El socket usa este mismo valor si no hay `SOCKET_ORIGEN` |
| `RATE_LIMIT_VENTANA_MINUTOS` | Ventana de los dos límites de abajo |
| `RATE_LIMIT_MAX` | Pedidos totales a `/api` por IP en la ventana. Generoso: alcanza para correr las guías enteras |
| `RATE_LIMIT_LOGIN_MAX` | Intentos **fallidos** de login, registro y contraseña por IP en la ventana |
| `TRUST_PROXY` | Solo detrás de un proxy (ngrok, un despliegue): cuántos saltos creerle para sacar la IP real |

### 3 — Instalar y correr

```bash
npm install
npm run dev
```

Servidor en `http://localhost:4000`

### 4 — Probar

**Prueba automática (semana 14).** Con la base recién importada y el servidor corriendo:

```bash
node scripts/prueba-flujos.js
```

Recorre todos los flujos de punta a punta —registro, perfiles, carrito, pago, preparación,
reparto, entrega, historial, repetición, notificaciones, administración, reclamos,
auditoría, sesiones, socket y límites— y verifica los códigos y los datos clave de cada
respuesta (159 verificaciones). Termina con código distinto de 0 si algo falla, así que
sirve como prueba de regresión antes de entregar o de mergear. Otra URL:
`BASE_URL=http://localhost:4100/api node scripts/prueba-flujos.js`.

> El último bloque agota a propósito el límite de logins fallidos, así que por
> `RATE_LIMIT_VENTANA_MINUTOS` los logins desde esa máquina dan `429`. Reiniciar el servidor
> lo resetea: los contadores viven en memoria.

**Postman.** `postman/ATuPuerta.postman_collection.json` es una colección importable con
todos los endpoints, agrupados por módulo. Los requests de login guardan el token solos en
las variables de la colección (`{{token_maria}}`, `{{token_admin}}`...), así que alcanza con
correr primero la carpeta "00 · Sesiones".

Además están las guías de `postman/`. Cada guía explica, caso por caso,
qué request mandar, qué tiene que contestar y por qué el endpoint hace lo que hace.

Para las semanas 8, 9 y 10 hay además `postman/lista-semanas-8-10.js`: las tres guías
resumidas en una sola lista ordenada, para ir tildando mientras se prueba. Sirve como
checklist de regresión antes de entregar; el detalle sigue estando en las guías largas.
`postman/lista-semanas-11-14.js` hace lo mismo con los pendientes de las semanas 3 y 7 y
con las semanas 11 a 14.

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
| `POST` | `/api/registro` | Alta de usuario con perfil de cliente. Contraseña de 8 a 72 caracteres |
| `POST` | `/api/inicioSesion` | Login de cliente. Devuelve JWT |
| `POST` | `/api/registroComercio` | Alta de usuario + comercio en una transacción |
| `POST` | `/api/inicioSesionComercio` | Login de comercio (email + contraseña + CUIL) |
| `POST` | `/api/cerrarSesionComercio` | Cierra la sesión de comercio |
| `POST` | `/api/registroRepartidor` | Alta del perfil de repartidor para un usuario ya registrado (pide su contraseña) |
| `POST` | `/api/inicioSesionRepartidor` | Login de repartidor. Body: `{ email, contrasena }` |
| `POST` | `/api/cerrarSesionRepartidor` | Cierra la sesión de repartidor |
| `POST` | `/api/inicioSesionAdministrador` | Login de administrador. Body: `{ email, contrasena }` |

Los dos logins firman el mismo payload: `{ id, rol, comercioId }` (el `comercioId`
solo aparece si el usuario es un comercio). El login de repartidor firma
`{ id, rol: 'repartidor', repartidorId }` y el de administrador
`{ id, rol: 'administrador', administradorId }`.

No hay registro público de administradores: si lo hubiera, cualquiera podría darse
permisos. El primero viene en la semilla y los demás los da de alta otro administrador
(`POST /api/admin/usuarios` con `rol: 'administrador'`).

Los siete endpoints que verifican una contraseña (los cuatro logins y los tres registros,
porque los de comercio y repartidor comparan la contraseña de una cuenta que ya existe)
tienen límite de intentos fallidos: ver [Seguridad](#seguridad--semana-14).

`usuarios.rol` funciona como "qué sesión tenés abierta", una sola a la vez: cada login
la escribe y cerrar sesión de comercio o de repartidor vuelve a dejarla en `cliente`.
Por eso `resolverComercio` y `resolverRepartidor` filtran por `usuarios.rol` y no por el
rol que viene adentro del token.

> **Cerrar sesión invalida el token en todas las rutas (semana 14).** Hasta la semana 13
> el token de una sesión cerrada dejaba de servir solo donde pasaba `resolverComercio` o
> `resolverRepartidor`, y en el resto (por ejemplo `GET /api/notificaciones`) valía hasta
> que expiraba. Ahora `verificarToken` compara el rol del token con `usuarios.rol` en cada
> request y contesta `401` · "La sesión ya no es válida: iniciá sesión de nuevo". Por la
> misma consulta, una cuenta suspendida o dada de baja queda afuera al instante (`403`).
>
> Consecuencia del modelo de una sesión por cuenta: si alguien es cliente y repartidor y
> entra como cliente, su token de repartidor deja de servir. Y `registroComercio` /
> `registroRepartidor` dejan la cuenta en la sesión nueva, así que el token de cliente que
> tenía hasta ese momento también: hay que volver a iniciar sesión.

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

- El token va en el header `Authorization`, pelado o con el prefijo `Bearer ` (este último
  se acepta desde la semana 14).
- El `comercio_id` sale siempre del token, nunca del body: un comercio no puede crear
  ni modificar productos de otro (`403`).
- Cada escritura corre dentro de una transacción junto con su fila en
  `auditoria_productos` (`INSERT` / `UPDATE` / `DELETE`, con el `usuario_id` del actor).
- El borrado es lógico porque `items_pedido.producto_id` es `ON DELETE RESTRICT` y
  `auditoria_productos.producto_id` es `ON DELETE CASCADE`.

Los casos de prueba de cada endpoint están en `postman/backend-productos.js`.

### Carrito — CU05, CU06 (rol `cliente`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/carrito/agregar` | Suma un producto. Body: `{ id_producto, cantidad }`. Si ya estaba, se suma a lo que había |
| `GET` | `/api/carrito/listar` | El carrito agrupado por comercio, con `subtotal_comercio`, `total_general` y `direccion_entrega_default` |
| `PATCH` | `/api/carrito/:id_producto` | Cambia la cantidad de un producto que ya está en el carrito. Body: `{ cantidad }`, la nueva y mayor a 0 |
| `DELETE` | `/api/carrito/:id_producto` | Saca el producto del carrito |
| `POST` | `/api/carrito/confirmar` | Crea un pedido por comercio, descuenta el stock y vacía el carrito. Body opcional: `{ direccion_entrega }` |

- **Un pedido por comercio.** Cada comercio prepara y despacha lo suyo, así que el carrito se
  parte al confirmar: la respuesta trae `pedidos`, uno por comercio, con su distancia y su
  tiempo estimado. Cada pedido nace en `pago_espera` y se paga por separado.
- **`direccion_entrega` en confirmar** es para una entrega suelta en otra dirección: se
  geocodifica pero no pisa la del perfil. Sin ella se usa la del perfil del cliente.
- **El stock se valida al agregar, al cambiar la cantidad y al confirmar**, siempre con el
  producto lockeado (`FOR UPDATE`). `listar` marca `disponible: false` lo que ya no se puede
  comprar (producto o comercio dado de baja, o stock que no alcanza): no suma al total, y
  confirmar con algo así contesta `409` con la lista en `datos.errores`.
- **`PATCH` es de la integración con el front.** Agregar suma, así que sin él bajar una
  cantidad obligaba a sacar el producto entero. Cantidad 0 no vale a propósito: sacar un
  producto es `DELETE`, siempre una acción explícita.

### Pagos — CU07 (rol `cliente`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/pedidos/:id/pagar` | Registra el intento de pago y devuelve la URL de MercadoPago |
| `GET` | `/api/pedidos/:id/pago` | Estado del pago del pedido propio |
| `POST` | `/api/pagos/webhook` | Notificación de MercadoPago. **Público** |
| `GET` | `/api/pagos/retorno` | Vuelta del navegador después de pagar (`back_urls`). Con `FRONT_URL` redirige a `FRONT_URL/pedidos/:id?pago=<status>` |
| `POST` | `/api/pagos/simular` | Fuerza un resultado. Solo con `MP_MODO=mock` |

Flujo: `confirmarCarrito` deja el pedido en `pago_espera` → `POST /pedidos/:id/pagar`
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
  pedido: hay que rearmarlo, y `POST /api/pedidos/:id/repetir` lo hace de un solo paso.
- El cambio de estado del pedido vive en `services/pedido.service.js`, no suelto en el
  controlador, y pasa por la máquina de estados (ver
  [Ciclo de vida del pedido](#ciclo-de-vida-del-pedido--semana-7)). Cada cambio queda en
  `auditoria_pedidos` con la transición en `detalle`.
- **Un pago que llega para un pedido que ya no lo espera** (el cliente o un administrador
  lo cancelaron mientras el pago estaba en curso) se registra tal cual en `pagos` pero no
  mueve el pedido: un cancelado no vuelve atrás. Si se aprobó, queda con el motivo
  "requiere devolución manual" y les llega un aviso a los administradores. Sin esta
  guarda, el webhook contestaría `500` y MercadoPago lo reintentaría para siempre.
- Al cliente le llega una notificación con el resultado (`pago_aprobado` o
  `pago_rechazado`), y al comercio y a los repartidores la de pedido nuevo.
- `pagos` tiene `UNIQUE KEY uq_pagos_pedido`: una sola fila por pedido, así que un
  reintento actualiza la que ya existe.

Los casos de prueba están en `postman/backend-pagos.js`.

### Repartidores — CU19, CU20 (rol `repartidor`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/pedido/listar` | Pedidos disponibles: pagados (`en_preparacion` o `preparado`) y sin repartidor, con su `estado`. Filtros: `pagina`, `limite` |
| `PATCH` | `/api/pedido/asignar/:idPedido` | Acepta el pedido: `repartidor_id`, `en_camino` y código de entrega |
| `PATCH` | `/api/pedido/entrega/:idPedido` | Confirma la entrega. Body: `{ codigoPedido }` y, opcional, `{ latitud, longitud }` |
| `GET` | `/api/repartidor/disponibilidad` | `{ disponible, pedido_en_curso }` |
| `PATCH` | `/api/repartidor/disponibilidad` | Entrar o salir de servicio. Body: `{ disponible }` |

Cadena de middlewares: `verificarToken` → `verificarRol('repartidor')` → `resolverRepartidor`
(busca el repartidor en la base y exige que el usuario siga activo).

Flujo: el pago aprobado deja el pedido en `en_preparacion` → el comercio lo marca
`preparado` cuando lo tiene listo → el repartidor disponible lo ve en `/pedido/listar` y lo
acepta → el cliente recibe el código por notificación → el repartidor confirma la entrega
con ese código y vuelve a quedar disponible.

- **Se puede tomar antes de que esté listo.** El repartidor acepta pedidos en
  `en_preparacion` o en `preparado`; el listado le dice cuál es cuál, para que decida si le
  conviene ir ya o esperar. Hasta la semana 13 solo se aceptaba `en_preparacion`, y un
  pedido que el comercio marcaba listo ya no lo podía tomar nadie.
- **Doble asignación.** Aceptar es un único `UPDATE ... WHERE repartidor_id IS NULL AND
  estado IN ('en_preparacion', 'preparado')`: si dos repartidores aceptan a la vez, el
  segundo afecta 0 filas y recibe `409`. Vive en `services/pedido.service.js`.
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

### Notificaciones — CU27, semana 11 (cualquier usuario logueado)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/notificaciones` | Propias y generales del rol de la sesión, las más recientes primero. Filtros: `no_leidas=true`, `pagina`, `limite`. Devuelve siempre `no_leidas` |
| `PATCH` | `/api/notificaciones/:id/leida` | Marca una como leída. Idempotente; una ajena da `404` |
| `PATCH` | `/api/notificaciones/leidas` | Marca todas como leídas |
| `GET` | `/api/notificaciones/clave-publica` | Clave VAPID pública para suscribirse. **Pública** |
| `POST` | `/api/notificaciones/suscribir` | Guarda la `PushSubscription` del navegador |

Eventos que generan una notificación:

| Evento | A quién |
|---|---|
| Pedido creado (`confirmarCarrito`) | Cliente |
| Pago aprobado | Cliente, comercio y repartidores (general) |
| Pago rechazado o con monto inválido | Cliente |
| Pedido preparado | Cliente y repartidores (general) |
| Repartidor asignado / en camino, con el código de entrega | Cliente |
| Pedido entregado | Cliente |
| Pedido cancelado por un administrador | Cliente, comercio y repartidor |
| Reclamo nuevo | Administradores (general) |
| Reclamo en revisión, resuelto o rechazado | Quien reclamó |
| Pago aprobado de un pedido ya cancelado | Administradores (general) |

- **Personales y generales.** Una personal tiene `usuario_id`. Una general va a todo un
  rol: una sola fila con `usuario_id` NULL y `destinatario_rol`. Se muestra según el rol de
  la sesión abierta: quien usa la app como cliente no ve los avisos para repartidores
  aunque también lo sea.
- **La lectura de una general va en su propia tabla** (`notificaciones_leidas`, una fila
  por usuario). La columna `leida` sirve para las personales, pero en una general el
  primero que la leyera la marcaría para todos.
- **La fila es la verdad; el push es best-effort.** La fila se guarda aunque el usuario no
  tenga suscripción, el push esté apagado por falta de claves VAPID o el servicio de push
  falle. El push sale después del commit y sin `await`, con la misma regla que las
  emisiones del socket.
- Las notificaciones de asignar y entregar se guardan **dentro** de la transacción que las
  origina (`registrarNotificacion`): si no se puede avisar el código de entrega, el pedido
  no queda asignado con un código que nadie conoce.

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

### Ciclo de vida del pedido — semana 7

```
pago_espera -> en_preparacion -> preparado -> en_camino -> entregado
                     |                            ^
                     +----------------------------+

y desde cualquier estado no terminal -> cancelado
```

| Transición | Quién la dispara | Dónde |
|---|---|---|
| `pago_espera` → `en_preparacion` | Pago aprobado | `aplicarResultadoPago` |
| `en_preparacion` → `preparado` | El comercio (`PATCH /api/comercios/pedidos/:id/subir`) | `subirPedido` |
| `en_preparacion` / `preparado` → `en_camino` | Un repartidor lo toma | `asignarPedidoARepartidor` |
| `en_camino` → `entregado` | El repartidor, con el código del cliente | `confirmarEntregaPedido` |
| `pago_espera` → `cancelado` | Pago rechazado, o el cliente antes de pagar | `aplicarResultadoPago`, `cancelarMiPedido` |
| cualquiera no terminal → `cancelado` | Un administrador (CU24) | `cancelarPedidoAdmin` |

- **Las reglas viven en un solo lugar:** `TRANSICIONES_PEDIDO` en
  `services/pedido.service.js`. `cambiarEstadoPedido` lee el estado con `FOR UPDATE`, valida
  la transición y contesta `409` si no es legal. Asignar y entregar no pasan por ahí
  porque son `UPDATE` condicionales atómicos (la defensa contra la doble asignación), pero
  sus `WHERE` respetan el mismo mapa.
- **Toda transición queda en `auditoria_pedidos`**, con quién la hizo (`usuario_id` y, si fue
  un administrador, `administrador_id`) y qué pasó en `detalle`: `"en_preparacion ->
  preparado"`, o el motivo de una cancelación. El alta del pedido también se audita.
- **Cancelar siempre devuelve el stock** (se descuenta al confirmar el carrito, no al pagar)
  y, si el pedido iba en camino, deja al repartidor disponible otra vez. No toca `pagos`: si
  ya estaba pagado, la devolución del dinero es manual.
- **El cliente puede cancelar solo antes de pagar** (`PATCH /api/pedidos/:id/cancelar`). Sin
  esto, un pedido que nunca se paga dejaba su stock reservado para siempre. Después de
  pagar ya hay un comercio preparándolo: la vía es un reclamo, y lo cancela un
  administrador.

### Perfiles — semana 3 (CU11, CU12, CU18)

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| `GET` | `/api/perfil` | Cualquier sesión | Cuenta y perfiles que tiene: cliente, comercio, repartidor, administrador |
| `PATCH` | `/api/perfil` | Cualquier sesión | `nombre`, `telefono` y, si es cliente, `direccion_entrega` |
| `PATCH` | `/api/perfil/contrasena` | Cualquier sesión | `{ contrasena_actual, contrasena_nueva }` |
| `DELETE` | `/api/perfil` | Cualquier sesión | Baja lógica de la propia cuenta. Body: `{ contrasena }` |
| `GET` / `PATCH` | `/api/comercio/perfil` | Comercio | `nombre`, `categoria`, `direccion`, `horario_atencion` |
| `GET` / `PATCH` | `/api/repartidor/perfil` | Repartidor | `tipo_vehiculo`, `patente`, `numero_licencia` |

- El usuario sale siempre del token: no hay forma de pedir ni de tocar el perfil de otro.
- **El email no se cambia desde el perfil**: es con lo que se inicia sesión, y cambiarlo sin
  verificar la casilla nueva es una forma fácil de quedarse afuera. Lo corrige un
  administrador. Tampoco se editan el CUIT del comercio ni el DNI del repartidor.
- **Cambiar la dirección la vuelve a geocodificar**, fuera de la transacción. Si no se
  puede ubicar, las coordenadas quedan en NULL y se completan solas cuando hagan falta: lo
  que no puede pasar es que queden las de la dirección vieja.
- El repartidor no puede cambiar el vehículo con un pedido en camino: el perfil de ruta de
  Mapbox y el ETA del seguimiento salen de `tipo_vehiculo`.
- **La baja pide la contraseña** y no se permite con pedidos pagados en curso, ni si es el
  último administrador activo. Cancela los pedidos que el cliente nunca pagó y devuelve su
  stock (ver `darDeBajaCuenta` en `services/usuario.service.js`).

### Historial y repetición — semana 12 (CU09, CU10, CU17)

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| `GET` | `/api/pedidos` | Cliente | Historial propio. Filtros: `estado`, `desde`, `hasta` (AAAA-MM-DD), `pagina`, `limite` |
| `GET` | `/api/pedidos/:id` | Cliente | Detalle: ítems, comercio, pago, repartidor y, si va en camino, el código de entrega |
| `POST` | `/api/pedidos/:id/repetir` | Cliente | Vuelve a cargar en el carrito los productos de un pedido anterior |
| `PATCH` | `/api/pedidos/:id/cancelar` | Cliente | Cancela un pedido que todavía no pagó |
| `GET` | `/api/comercio/ventas` | Comercio | Pedidos pagados del comercio + `resumen` (cantidad, entregados, cancelados, en curso, total vendido, ticket promedio). Mismos filtros |
| `GET` | `/api/comercio/ventas/:id` | Comercio | Detalle de una venta propia |

- **Repetir suma, no reemplaza**: lo que el cliente ya tenía en el carrito se queda. Usa los
  precios de hoy (el carrito no guarda precio) e informa el anterior y el actual. Un
  producto o comercio dado de baja va a `omitidos`; si el stock no alcanza, se agrega lo
  que hay (descontando lo que ya está en el carrito) y se marca como `parcial`. Si no se
  puede agregar nada, `409` y el carrito queda como estaba. No crea el pedido: el cliente
  revisa el carrito y confirma como siempre.
- **Un pedido sin pagar no es una venta**: `/comercio/ventas` excluye `pago_espera`, que es
  además el momento en que el comercio todavía no se enteró de que el pedido existe. Con
  `?estado=en_preparacion` es la bandeja de pedidos que el comercio tiene que preparar.
- El `resumen` se calcula sobre el filtro completo, no sobre la página.
- `hasta` es inclusivo: "hasta el 31" incluye todo el día 31. Una fecha que no existe
  (`2026-02-31`) da `400`, no un resultado corrido a marzo.
- Van en singular (`/comercio/...`), igual que `/repartidor/...`: en plural chocarían con
  `/comercios/:id`, que es público y se tragaría `/comercios/ventas` con "ventas" como id.

### Administración — semana 13 (CU23, CU24)

Todas las rutas `/api/admin/*` pasan por `verificarToken` → `verificarRol('administrador')`
→ `resolverAdministrador`, que resuelve contra la base el id de `administradores` (es lo
que guardan las auditorías y los reclamos).

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/usuarios` | Filtros: `rol` (según los perfiles que tiene), `activo`, `buscar` (nombre o email) |
| `GET` | `/api/admin/usuarios/:id` | Cuenta, perfiles, conteo de pedidos por rol, pedidos en curso y reclamos |
| `POST` | `/api/admin/usuarios` | Alta de un cliente o de un **administrador** (`rol: 'cliente' \| 'administrador'`) |
| `PATCH` | `/api/admin/usuarios/:id` | `nombre`, `telefono`, `email` |
| `PATCH` | `/api/admin/usuarios/:id/estado` | `{ activo: false }` suspende, `{ activo: true }` reactiva |
| `DELETE` | `/api/admin/usuarios/:id` | Baja lógica |
| `PATCH` | `/api/admin/comercios/:id/estado` | Suspende o reactiva solo el comercio |
| `GET` | `/api/admin/pedidos` | Vista global. Filtros: `estado`, `activos`, `comercioId`, `clienteId`, `repartidorId`, `desde`, `hasta`. Incluye `resumen_por_estado` |
| `GET` | `/api/admin/pedidos/:id` | Ítems, pago, los tres actores, última ubicación, auditoría y reclamos |
| `PATCH` | `/api/admin/pedidos/:id/cancelar` | `{ motivo }`. Desde cualquier estado no terminal |
| `GET` | `/api/admin/auditoria/productos` | Filtros: `productoId`, `comercioId`, `usuarioId`, `accion`, `desde`, `hasta` |
| `GET` | `/api/admin/auditoria/pedidos` | Filtros: `pedidoId`, `usuarioId`, `accion`, `desde`, `hasta` |

- **Suspender corta el acceso al instante**, porque `verificarToken` consulta
  `usuarios.activo` en cada request: el token que la persona ya tenía deja de servir. Es
  reversible tal cual.
- **La baja además** saca el comercio del catálogo, deja al repartidor fuera de servicio,
  cancela los pedidos que el cliente nunca pagó y borra sus suscripciones push. Es lógica:
  pedidos, reclamos y auditoría siguen apuntando a la cuenta.
- **Suspensión por rol:** `/admin/comercios/:id/estado` suspende solo el comercio. La persona
  sigue pudiendo comprar como cliente.
- Suspender o dar de baja da `409` si hay pedidos pagados que dependen de esa cuenta (el
  repartidor que lleva uno en camino, el comercio que tiene pedidos por preparar, el
  cliente con pedidos en curso), si es la propia cuenta, o si es el último administrador
  activo.
- Comercio y repartidor no se dan de alta desde el panel: se registran desde su propio
  formulario, sobre una cuenta que ya existe, con datos que solo tiene la persona.
- **Cancelar un pedido pagado** avisa en la respuesta (`reembolso_manual: true`) que la
  devolución del dinero se hace a mano: el pago sigue `aprobado` en `pagos`, porque es lo
  que pasó.
- `resumen_por_estado` es global y no respeta los filtros: son los números del tablero.

### Reclamos — semana 13 (CU25)

```
pendiente -> en_revision -> resuelto
                         -> rechazado
```

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| `POST` | `/api/reclamos` | Cliente, comercio o repartidor | `{ descripcion, pedido_id? }` |
| `GET` | `/api/reclamos` | Cliente, comercio o repartidor | Los propios. Filtro: `estado` |
| `GET` | `/api/reclamos/:id` | Cliente, comercio o repartidor | Uno propio (uno ajeno da `404`) |
| `GET` | `/api/admin/reclamos` | Administrador | Cola de atención: abiertos primero, los más viejos adelante. Filtros: `estado`, `asignado=yo\|ninguno` |
| `GET` | `/api/admin/reclamos/:id` | Administrador | Con el usuario y el pedido |
| `PATCH` | `/api/admin/reclamos/:id/asignar` | Administrador | `{ administrador_id? }`, por defecto quien lo pide. Pasa a `en_revision` |
| `PATCH` | `/api/admin/reclamos/:id/resolver` | Administrador | `{ estado: 'resuelto' \| 'rechazado', resolucion }` |

- Si el reclamo es sobre un pedido, el pedido tiene que ser del usuario: como cliente que lo
  compró, comercio que lo vendió o repartidor que lo llevó. Y no puede tener otro reclamo
  abierto sobre el mismo pedido.
- **Solo lo cierra el administrador asignado.** Sin esa regla, dos administradores podrían
  contestarle cosas distintas a la misma persona. Asignar y resolver son `UPDATE`
  condicionales, igual que la asignación de pedidos.
- Un reclamo cerrado no se reabre: si el problema sigue, se hace uno nuevo.

### Seguridad — semana 14

- **Cabeceras** con `helmet`: `nosniff`, `frameguard`, HSTS, sin `X-Powered-By`, etc.
- **CORS restringido** a `CORS_ORIGEN`. Sin definir queda abierto y el servidor lo avisa.
- **Límites por IP** (`express-rate-limit`, `middlewares/limites.middleware.js`):
  - general para toda la API (`RATE_LIMIT_MAX`), generoso a propósito;
  - de intentos **fallidos** (`RATE_LIMIT_LOGIN_MAX`) en todo lo que verifica una
    contraseña: los cuatro logins, los tres registros, cambiar la contraseña y dar de baja
    la cuenta. Quien entra bien nunca se lo cruza.
  - Los dos contestan `429` con el formato de siempre.
- **Sesión viva contra la base** en cada request (`verificarToken`) y en el handshake del
  socket: cuenta activa y sesión abierta. Ver la nota de
  [Autenticación y registro](#autenticación-y-registro).
- **Rutas protegidas por rol** en todos los routers. El carrito, que solo pedía token,
  ahora exige ser cliente, igual que pagos y seguimiento.
- **Validación de entradas**: largos de cada columna (antes pasarse daba `500` en MySQL
  estricto y un recorte silencioso en XAMPP), formato de teléfono, contraseñas nuevas de 8
  a 72 caracteres (bcrypt solo mira los primeros 72 bytes), fechas que existan, y filtros
  de query string que tienen que ser texto: `?buscar[]=x` llegaba como array y daba `500`.
- **SQL**: todos los valores van con placeholders. Donde el SQL se arma dinámicamente
  (filtros, columnas de un `UPDATE` parcial), los fragmentos salen de listas fijas del
  código, nunca del request.
- **Errores centralizados**: un JSON mal escrito da `400` y un cuerpo de más de 100 kb
  `413`, en vez de `500`. Una promesa rechazada sin manejar se loguea en vez de tirar el
  proceso.
- **Dependencias**: `npm audit` en 0. Se sacó `bcrypt` (el nativo), que no se usaba —el
  proyecto usa `bcryptjs`— y traía una vulnerabilidad crítica a través de `tar`.
- `/health` además dice si la base responde (`503` si no).