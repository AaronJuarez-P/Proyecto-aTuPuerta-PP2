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
│   └── backend-productos.js        <- guía de pruebas: catálogo y stock
├── src/
│   ├── controllers/
│   │   ├── registro.controller.js
│   │   ├── registroComercio.controller.js
│   │   ├── comercio.controller.js
│   │   └── producto.controller.js
│   ├── database/
│   │   └── database.js
│   ├── middlewares/
│   │   ├── autenticacion.middleware.js
│   │   └── comercio.middleware.js
│   ├── routes/
│   │   ├── registro.routes.js
│   │   ├── registroComercio.routes.js
│   │   ├── comercio.routes.js
│   │   └── producto.routes.js
│   ├── services/
│   │   └── auditoria.service.js
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
```

> `PASSWORD` es la contraseña del usuario de MySQL. En XAMPP recién instalado `root` va
> **sin** contraseña, o sea `PASSWORD=` vacío. Si al arrancar aparece
> `Access denied for user 'root'@'localhost'`, el problema es este valor.

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