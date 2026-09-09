# Backend — Sistema de delivery

Backend del proyecto anual Practica Profesionalizante 2. Node.js + Express + MySQL.

---

## Estructura

```
backend/
├── scripts/
│   └── aTuPuerta.sql
├── postman/
│   ├── backend-registro.js         <- guía de pruebas: registro y login
│   ├── backend-productos.js        <- guía de pruebas: catálogo y stock
│   └── backend-pagos.js            <- guía de pruebas: pagos (CU07)
├── src/
│   ├── controllers/
│   │   ├── registro.controller.js
│   │   ├── registroComercio.controller.js
│   │   ├── registroRepartidor.controller.js
│   │   ├── comercio.controller.js
│   │   ├── producto.controller.js
│   │   ├── carrito.controller.js
│   │   └── pago.controller.js
│   ├── database/
│   │   └── database.js
│   ├── middlewares/
│   │   ├── autenticacion.middleware.js
│   │   └── comercio.middleware.js
│   ├── routes/
│   │   ├── registro.routes.js
│   │   ├── registroComercio.routes.js
│   │   ├── registroRepartidor.routes.js
│   │   ├── comercio.routes.js
│   │   ├── producto.routes.js
│   │   ├── carrito.routes.js
│   │   └── pago.routes.js
│   ├── services/
│   │   ├── auditoria.service.js
│   │   ├── pedido.service.js       <- estados del pedido + devolución de stock
│   │   └── pago.service.js         <- adaptador de MercadoPago
│   ├── utils/
│   │   └── paginacion.js
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
  "estado": "mensaje de respuesta",
  "datos": { }
}
```

### Autenticación y registro

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/registro` | Alta de usuario base en `usuarios` (sin rol) |
| `POST` | `/api/inicioSesion` | Login genérico. Devuelve JWT |
| `POST` | `/api/registroComercio` | Alta de usuario + comercio en una transacción |
| `POST` | `/api/inicioSesionComercio` | Login de comercio (email + contraseña + CUIL) |

Los dos logins firman el mismo payload: `{ id, rol, comercioId }` (el `comercioId`
solo aparece si el usuario es un comercio).

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