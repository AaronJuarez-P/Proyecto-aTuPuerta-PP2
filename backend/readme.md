# Backend — Sistema de delivery

Backend del proyecto anual Practica Profesionalizante 2. Node.js + Express + MySQL.

---

## Estructura

```
backend/
├── scripts/
│   ├── aTuPuerta.sql
├── postman/
│   ├── backend-registro.js         <- guía de pruebas: registro y login
│   ├── backend-productos.js        <- guía de pruebas: catálogo y stock
│   ├── backend-pagos.js            <- guía de pruebas: pagos (CU07)
│   └── backend-repartidores.js     <- guía de pruebas: repartidores (CU19, CU20)
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
│   │   └── notificacion.controller.js
│   ├── database/
│   │   └── database.js
│   ├── middlewares/
│   │   ├── autenticacion.middleware.js
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
│   │   └── notificacion.routes.js
│   ├── services/
│   │   ├── auditoria.service.js
│   │   ├── pedido.service.js       <- estados del pedido, devolución de stock, asignación y entrega
│   │   ├── pago.service.js         <- adaptador de MercadoPago
│   │   ├── repartidor.service.js   <- disponibilidad del repartidor
│   │   └── notificacion.service.js
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

### 3 — Instalar y correr

```bash
npm install
npm run dev
```

Servidor en `http://localhost:4000`

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
| `PATCH` | `/api/pedido/entrega/:idPedido` | Confirma la entrega. Body: `{ codigoPedido }` |
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

### Notificaciones (cualquier usuario logueado)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/notificaciones` | Notificaciones propias, las más recientes primero. Filtros: `pagina`, `limite` |

Versión mínima de la semana 8: las notificaciones se guardan en la tabla `notificaciones`
(`services/notificacion.service.js`, dentro de la transacción que las origina) y se leen
con este endpoint. Marcarlas como leídas y el envío en tiempo real quedan para la semana 11.

Los casos de prueba están en `postman/backend-repartidores.js`.