# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

ATuPuerta es una app de delivery de productos variados (Práctica Profesionalizante 2, IES Santa Fe, 2026), con cuatro roles: cliente, comercio, repartidor y administrador.

- `backend/`: API REST en Node + Express + MySQL (CommonJS), con Socket.IO en el mismo puerto.
- `frontend/`: React 19 + Vite + React Router 8 (paquete `react-router`, no `react-router-dom`).
- `backend/rag/`: El Portero, el asistente de ayuda (RAG). Es un paquete aparte y opcional.

Todo está en español rioplatense: código, comentarios, documentación y mensajes al usuario ("Copiá…", "No tenés permisos…"). Los comentarios explican el porqué y suelen citar la semana o el caso de uso (CU) en que se decidió algo.

Documentación de referencia: `README.md` (cómo levantar todo, cuentas de prueba, El Portero), `backend/readme.md` (cada endpoint con sus decisiones de diseño), `frontend/README.md` (estructura, rutas, sesión) y `backend/rag/DECISIONES.md`.

## Comandos

Hace falta Node 22.22 o más nuevo. En Windows, si PowerShell bloquea `npm`, usar `npm.cmd`.

```sh
# Base: MySQL/MariaDB (XAMPP). Importar backend/scripts/aTuPuerta.sql en phpMyAdmin.
# El script arranca con DROP DATABASE: reimportarlo borra los datos locales.

cd backend  && npm install && npm run dev    # API en http://localhost:4000. Sin recarga automática: reiniciar a mano
cd frontend && npm install && npm run dev    # http://localhost:5173
cd frontend && npm run lint                  # Oxlint
cd frontend && npm run build
```

El backend necesita `backend/.env` (copiar `.env.example`). Sin `JWT_SECRET` o `DB_NAME` no arranca. El front funciona sin `.env`.

### Pruebas

No hay framework de tests (ni Jest ni Vitest), así que no se puede correr un test suelto.

- **Prueba de punta a punta:** `node scripts/prueba-flujos.js` desde `backend/`, con el servidor levantado. Termina con código distinto de 0 si algo falla. Necesita la base **recién importada** (espera los ids de la semilla), `MP_MODO=mock`, `MAPS_MODO=mock` y `EMAIL_MODO=mock` u `off` (con `smtp` no puede leer el código de verificación). El último bloque agota a propósito el límite de logins fallidos: después los logins dan `429` hasta reiniciar el backend. Para otra URL: `BASE_URL=http://localhost:4100/api`.
- **Postman:** `backend/postman/ATuPuerta.postman_collection.json` tiene todos los endpoints (correr primero "00 · Sesiones", que guarda los tokens). Las guías `backend/postman/backend-<módulo>.js` explican caso por caso y asumen la base recién importada.
- **Tiempo real:** `node scripts/cliente-seguimiento.js <token> <pedidoId>`. Postman no habla Socket.IO.

Cuentas de la semilla, todas con contraseña `Test1234!`: `maria.gomez@test.com` (cliente), `libreria.sur@test.com` con CUIL `20405060708` (comercio), `lucia.repartidor@test.com` (repartidor) y `admin@test.com`. Hay una sola sesión por cuenta: para probar varios roles a la vez, usar navegadores distintos o incógnito.

## Backend

`src/index.js` arma `http.createServer(app)` para que Socket.IO use el mismo puerto, y `src/app.js` monta todos los routers bajo `/api`. Capas: `routes/` (rutas y cadena de middlewares) → `controllers/` (validación y respuesta HTTP) → `services/` (reglas de negocio compartidas y adaptadores de servicios externos). El pool de `mysql2/promise` está en `src/database/database.js`.

**Sobre de respuesta.** Todas las respuestas, incluidos los errores de los middlewares y el 404, tienen la forma `{ codigo, estado: "exito" | "error", datos: { mensaje, ... } }`. El front la desarma en `frontend/src/api/cliente.js`.

**Sesión.**
- El JWT va en el header `Authorization`, crudo o con `Bearer `.
- `verificarToken` (`middlewares/autenticacion.middleware.js`) consulta la base en cada request: la cuenta tiene que estar activa y el rol del token tiene que coincidir con `usuarios.rol`.
- `usuarios.rol` es la sesión abierta, no lo que el usuario es: cada login la escribe y cerrar sesión de comercio o repartidor la vuelve a `'cliente'`. El handshake del socket usa la misma `validarSesion`.
- Las rutas protegidas encadenan `verificarToken → verificarRol('<rol>') → resolverCliente / resolverComercio / resolverRepartidor / resolverAdministrador`. Esos resolvers dejan el id del perfil en `req` (`req.comercioId`, `req.repartidorId`, ...). El dueño de un recurso sale siempre de ahí, nunca del body.
- **Acoplamiento:** el front detecta una sesión vencida comparando el texto del error con `MENSAJES_SESION_INVALIDA` en `frontend/src/api/cliente.js`. Si cambia un mensaje de `validarSesion`, hay que cambiarlo en los dos lados.

**Transacciones y concurrencia.**
- Patrón: `database.getConnection()` → `beginTransaction` → `commit` / `rollback` → `release()` en el `finally`.
- Ninguna llamada de red (Mapbox, MercadoPago) va dentro de una transacción: se hace antes. Por eso `confirmarCarrito` tiene dos fases.
- Orden de locks, para evitar deadlocks: `repartidores → pagos → pedidos → productos`.
- Las carreras se resuelven con `UPDATE` condicionales atómicos, no con "consultar y después escribir". Ejemplo: asignar un pedido es `WHERE repartidor_id IS NULL AND estado IN (...)`, y si afecta 0 filas responde `409`.
- Las emisiones del socket y el push van después del `commit` y sin `await` (son best-effort): la fila en la base es la verdad. Lo que tiene que ser atómico, como la notificación con el código de entrega, se guarda dentro de la transacción.

**Pedidos.**
- La máquina de estados es `TRANSICIONES_PEDIDO` en `services/pedido.service.js`: `pago_espera → en_preparacion → preparado → en_camino → entregado`, más `cancelado`.
- Toda transición se audita en `auditoria_pedidos`. Cada escritura sobre productos se audita en `auditoria_productos`, dentro de la misma transacción.
- Cancelar devuelve el stock, porque se descuenta al confirmar el carrito y no al pagar.
- Los services tiran errores con `codigoHttp` (ver `crearErrorPedido`) y el controller los devuelve tal cual.

**Servicios externos detrás de adaptadores.** Con el `.env.example` tal cual no hace falta ninguna cuenta:

| Adaptador | Variable | Sin cuenta |
|---|---|---|
| `services/pago.service.js` (MercadoPago) | `MP_MODO=mock\|sandbox` | `POST /api/pagos/simular` aprueba o rechaza |
| `services/maps.service.js` (Mapbox) | `MAPS_MODO=mock\|real` | Geocodifica de forma determinística y mide con Haversine |
| `services/email.service.js` (Nodemailer) | `EMAIL_MODO=off\|mock\|smtp` | `mock` por defecto: no manda correos, el código de verificación viaja en la respuesta (`codigo_mock`) y sale por consola. `off` saltea la verificación |
| `config/webPush.js` | `VAPID_*` | Sin claves el push se apaga; las notificaciones se ven igual en la campanita |
| `services/ayuda.service.js` (El Portero) | `AYUDA_MODO=off\|faq\|rag` | `off` por defecto: no carga nada de `backend/rag` |

- `maps.service.js` es el único archivo que sabe que el proveedor es Mapbox. Mapbox pide `{longitud},{latitud}`, y el orden se da vuelta solo adentro del adaptador. Si Mapbox falla, degrada a un cálculo local y lo indica en `origen_datos`.
- En los pagos, el webhook es la fuente de verdad: se autentica por firma (no por JWT) y es idempotente.

**Registro de clientes en dos pasos (verificación del correo).**
- `POST /api/registro` no crea la cuenta: guarda los datos en `registros_pendientes` y manda un código de 6 dígitos (`202`). La cuenta (`usuarios` + `clientes`) se crea en `POST /api/registro/verificar`. Con `EMAIL_MODO=off` el registro la crea directo (`201`).
- `usuarios` solo tiene cuentas verificadas: los logins, `validarSesion` y el panel no saben nada de la verificación. Es la única puerta de entrada de un correo nuevo, porque los registros de comercio y repartidor agregan un perfil a una cuenta que ya existe.
- Verificar y reenviar piden email **y contraseña** además del código, y contestan el mismo `401` genérico de los logins. El código se guarda como HMAC (`services/verificacion.service.js`), nunca en texto plano.
- Lo que registre un cliente por la API (una prueba, una guía) tiene que hacer los dos pasos o correr con `EMAIL_MODO=off`.

**Tiempo real.** `services/tiemporeal.service.js` es el transporte (handshake, salas `pedido:<id>`, emisión) y `services/seguimiento.service.js` es el negocio (autorización, ETA y su caché), compartido con el endpoint REST. Funciona con una sola instancia, porque las salas viven en memoria.

**Detalles que muerden.**
- Las rutas del actor autenticado van en singular (`/comercio/...`, `/repartidor/...`). En plural chocarían con las públicas `/comercios/:id`.
- `mysql2` devuelve los `DECIMAL` como string.
- Los contadores de rate limit (`middlewares/limites.middleware.js`) viven en memoria: reiniciar el backend los resetea.
- En el SQL, los valores van siempre con placeholders. Los fragmentos dinámicos (filtros, columnas de un `UPDATE` parcial) salen de listas fijas del código, nunca del request.

**Base de datos.** `backend/scripts/aTuPuerta.sql` tiene el esquema completo y la semilla. Un cambio de esquema va ahí y además como migración en `backend/scripts/migraciones/AAAAMMDD_descripcion.sql`, para las bases que ya tienen datos. Cada migración lleva un encabezado que explica qué hace.

**Documentación.** Cada módulo tiene su sección en `backend/readme.md` (tabla de endpoints y decisiones de diseño) y su guía en `backend/postman/`, y la colección de Postman tiene todos los endpoints. Cuando se agrega o cambia un endpoint, hay que mantener al día los tres.

## Frontend

- Todas las llamadas pasan por `pedir()` de `src/api/cliente.js`, que devuelve `datos` o tira `ErrorApi`. En `src/api/<módulo>.js` hay una función por endpoint. Con `token: undefined` usa la sesión guardada; con `token: null` no manda ninguno (logins y registros, donde un 401 no significa sesión vencida).
- La sesión se guarda en `localStorage` como `sesion = { token, usuario }` y se confirma con `GET /perfil` al abrir la app. `SesionProvider` escucha `EVENTO_SESION_VENCIDA` y manda al login. Orden de los proveedores en `App.jsx`: Sesión > Avisos > Carrito > Notificaciones.
- El paso del código al registrarse (`components/VerificarCorreo`) no tiene ruta propia: lo muestran `Registro` y `Login`, que ya tienen la contraseña en memoria. Así no viaja por la URL.
- `<RutaProtegida roles={[...]} />` protege por rol. Las pantallas con mapa o socket y las de administración se cargan con `lazy`, y el `Suspense` está en `Layout`.
- Las notificaciones del backend traen URLs propias (`/cliente/pedidos/:id`, ...) que `App.jsx` redirige con `Redirigir`. Si cambian en el backend, hay que cambiarlas también acá.
- Cada página tiene su CSS, acotado a su clase raíz (`.pedido-page ...`). Lo compartido está en `components/Comunes/Comunes.css`. Colores y tipografías son variables de `index.css` (`--brand`, `--ink`, ...), no valores escritos a mano.
- Los íconos son de `lucide-react`. Un botón que solo tiene un ícono lleva `aria-label`.
- `VITE_API_URL` vale por defecto `http://localhost:4000/api`, y el socket usa el mismo servidor sin el `/api`. El `CORS_ORIGEN` del backend tiene que incluir el origen del front.

## El Portero (`backend/rag`)

Es el RAG de la materia Desarrollo con IA. Paquete aparte: ESM (`.mjs`), con su propio `package.json` y su propio `.env`. Usa Postgres con pgvector en Docker (contenedor `rag-db`, puerto 5433), embeddings con Ollama (`bge-m3`) y respuestas con Gemini.

- `services/ayuda.service.js` es el único archivo del backend que conoce el RAG: lo carga con `import()` dinámico recién con la primera pregunta. El front muestra el botón solo si `GET /api/ayuda/estado` dice que está activo.
- Los scripts se corren parados en `backend/rag`, con `node --env-file=.env <script>.mjs`: `crear-tabla`, `indexar`, `preguntar "…" [--sin-modelo | --faq]`, `distribucion` y `evaluar`.
- El corpus está en `corpus/*.md`. Cada pregunta arranca con `## ¿…?` en un renglón propio, que es lo que reconoce `marca.mjs`.
- Reindexar no obliga a reiniciar el backend. Cambiar `backend/rag/.env` o `prompt.txt`, sí.
- **Regla del grupo:** si cambia una regla de la app, se actualiza el corpus y se vuelve a indexar.
- Los nombres de archivos, funciones y de la tabla vienen del código de la clase 8: se respetan, y cada cambio se anota en `DECISIONES.md`.
- `backend/rag/.env` tiene una clave de Google: no leerlo ni imprimirlo. Para probar con otros valores, pasar las variables por la terminal (`process.loadEnvFile` no pisa las que ya existen).

## Git

**Las operaciones de Git las hace cada integrante, no Claude.** Claude no corre `git add`, `commit`, `push`, `pull`, `merge` ni `rebase`, no cambia de rama y no abre ni mergea PRs. Al terminar, deja los cambios sin commitear, muestra `git status` y `git diff --stat`, y sugiere un mensaje de commit en español con el estilo del historial (por ejemplo, "Colores de la marca en variables"). Sí puede leer el estado del repo (`git status`, `git diff`, `git log`).

`main` es la única rama de integración. Cada integrante trabaja en su rama personal y abre un PR a `main`. Los PRs se mergean con "Create a merge commit", nunca con squash ni rebase.

Las dos reglas tienen el mismo motivo: cada uno controla qué entra en sus commits, y la cátedra evalúa los commits y la autoría de cada integrante.
