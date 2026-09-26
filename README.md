# ProyectoAnual — Sistema de delivery de productos variados

Proyecto anual Practica Profesionalizante 2 — IES Santa Fe — 2026.

Sistema de delivery enfocado en la distribuciòn de productos variados, soportar tipos de usuarios cliente, comerio y repartidor y soportar funcionalidades como el pago, trackeo de repartidores, sistema push de notificaciones, mapas integrados con Mapbox, etc. Desarrollo dividido en dos ramas;
backend: Las tecnologias utilizadas son Node.js, Express.js y API rest para las conecciones y el funcionamiento general de la app, MySql para la base de datos, VisualStudio como IDE, Github como plataforma para aplicar los cambios en el proyecto y desarrollo colaborativo.
frontend: Creado con JavaScript, HTML y CSS.

**Desarrollado por Aaròn Juarez - backend, Santiago Weidmann - backend, Gonzalo Silva - frontend y Jeronimo Ocampo - frontend.**

---

## Organización del repositorio

```
├── backend/    <- API REST — Node.js + Express + MySQL
├── frontend/   <- JavaSctip + HTML + CSS
```

---

## Stack tecnológico

**Backend**
- Node.js + Express
- MySQL / MariaDB
- JWT — autenticación
- bcrypt — hash de contraseñas

## Changelog

## Registro usuarios

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/registro` | Crea un usuario base en la tabla `usuarios`. El campo `rol` queda en `NULL` — la asignación de rol a un tipo específico (cliente, comercio, repartidor) se resuelve en una etapa posterior del proyecto, no en este endpoint. |
| `POST` | `/api/inicioSesion` | Autentica un usuario existente y devuelve un JWT válido por `JWT_EXPIRES_IN` (definido en `.env`, actualmente `8h`). |

Formato de respuesta uniforme en ambos:
```json
{ "codigo": 0, "estado": "", "datos": {} }
```

---

### POST /api/registro

**Body esperado:**
```json
{
  "nombre": "string",
  "email": "string",
  "contrasena": "string",
  "telefono": "string",
  "direccion_entrega": "string"
}
```

> Toda la API nombra este campo `email`, igual que la columna `usuarios.email`. Los seis endpoints de registro y login usan el mismo nombre.

**Validaciones, en orden de ejecución:**

1. **Campos obligatorios.** Si falta `nombre`, `email`, `contrasena`, `telefono` o `direccion_entrega` → `400`, `"Todos los campos son obligatorios"`.
2. **Campos vacíos o solo espacios.** Se aplica `.trim()` a cada campo; si alguno queda vacío → `400`, `"Datos ingresados incompletos"`.
3. **Formato del email.** `esEmailValido()` de `utils/validacion.js`. Si no pasa → `400`, `"El email no tiene un formato válido"`. Es una validación deliberadamente laxa: descarta lo obviamente mal escrito, no pretende cumplir el RFC 5322. Lo único que prueba de verdad que una dirección existe es mandarle un mail de verificación, que el proyecto todavía no hace.
4. **Geocodificación de la dirección.** Se resuelve **antes** de abrir la transacción, porque es una llamada de red y ninguna llamada de red puede quedar adentro de una. Si falla, devuelve `null` y el usuario se crea igual con las coordenadas en `NULL` (ver *Geolocalización*).
5. **Email ya registrado.** Se consulta `SELECT id FROM usuarios WHERE email = ? FOR UPDATE` antes de insertar. Si ya existe una fila → `400`, `"Usuario ya registrado"`. (Esta validación es una capa adicional de UX; la base también rechaza duplicados por el `UNIQUE KEY uq_usuarios_email`, como red de seguridad ante condiciones de carrera.)
6. **Hash de contraseña.** Recién después de pasar las validaciones anteriores, se genera el hash con `bcrypt.genSalt(10)` + `bcrypt.hash()`. La contraseña en texto plano nunca se guarda ni se loguea.
7. **Inserción.** Dentro de una transacción, `INSERT INTO usuarios (...)` con `rol = 'cliente'` y después `INSERT INTO clientes (...)` con la dirección y las coordenadas. Sin la segunda fila el usuario nunca podría usar el carrito.

**Respuestas posibles:**

| Código | Caso | `datos.mensaje` |
|---|---|---|
| `201` | Registro exitoso | `"Usuario registrado exitosamente {nombre}, {email}, {telefono}"` |
| `400` | Campo faltante | `"Todos los campos son obligatorios"` |
| `400` | Campo vacío / solo espacios | `"Datos ingresados incompletos"` |
| `400` | Email con formato inválido | `"El email no tiene un formato válido"` |
| `400` | Email ya registrado | `"Usuario ya registrado"` |
| `500` | Error interno (ej. base caída) | `"Error interno del servidor"` |

---

### POST /api/inicioSesion

**Body esperado:**
```json
{
  "email": "string",
  "contrasena": "string"
}
```

**Validaciones, en orden de ejecución:**

1. **Campos obligatorios.** Si falta `email` o `contrasena` → `400`, `"Email y contraseña son obligatorios"`.
2. **Campos vacíos o solo espacios.** → `400`, `"Datos ingresados incompletos"`.
3. **Existencia del usuario, con perfil de cliente.** `SELECT ... FROM usuarios u INNER JOIN clientes c ON u.id = c.usuario_id WHERE u.email = ?`. Si no hay resultados → `401`, `"Email o contraseña incorrectos"`. El `INNER JOIN` es importante: este endpoint es el login de la app del cliente y solo sirve para usuarios que tengan perfil de cliente. Un comercio o un repartidor entran por el suyo.
4. **Comparación de contraseña.** `bcrypt.compare(contrasena, usuario.contrasena)` contra el hash guardado (nunca se compara texto plano contra texto plano). Si no coincide → `401`, `"Email o contraseña incorrectos"`.
5. **Usuario activo.** Si `usuario.activo` es `false` → `403`, `"Usuario inactivo"`. Va **después** de validar la contraseña a propósito: si fuera antes, un atacante sin credenciales podría averiguar qué cuentas existen y en qué estado están.
6. **Rol de la sesión.** `UPDATE usuarios SET rol = 'cliente' WHERE id = ? AND rol <> 'cliente'`. Ver la nota de abajo.
7. **Generación de token.** `jwt.sign({ id, rol: 'cliente' }, JWT_SECRET, { expiresIn: '8h' })`.

**Respuestas posibles:**

| Código | Caso | `datos.mensaje` |
|---|---|---|
| `200` | Login exitoso | — (`datos` trae `token` y `usuario: { id, nombre, email, rol }`) |
| `400` | Campo faltante | `"Email y contraseña son obligatorios"` |
| `400` | Campo vacío / solo espacios | `"Datos ingresados incompletos"` |
| `401` | Email no existe, o no tiene perfil de cliente | `"Email o contraseña incorrectos"` |
| `401` | Contraseña incorrecta | `"Email o contraseña incorrectos"` |
| `403` | Usuario inactivo | `"Usuario inactivo"` |
| `500` | Error interno | `"Error interno del servidor"` |

> Los casos "email no existe" y "contraseña incorrecta" devuelven exactamente el mismo mensaje genérico, para que un atacante no pueda confirmar qué emails están registrados probando de a uno. Lo mismo vale para los logins de comercio y de repartidor.

#### `usuarios.rol` es el rol de la sesión, no lo que el usuario es

Los tres logins fijan `usuarios.rol` al entrar y los dos `cerrarSesion` lo devuelven a `'cliente'`. Los middlewares `resolverComercio` y `resolverRepartidor` consultan esa columna contra la base en vez de confiar en el rol del token, justamente para que cerrar sesión sirva de algo: el JWT ya emitido sigue diciendo `'repartidor'` hasta que expira.

La consecuencia es que **un usuario tiene un solo rol activo por vez**. Si alguien es cliente y repartidor, entrar por `/api/inicioSesion` cierra de hecho su sesión de repartidor. Es una limitación conocida del diseño; sacarla implicaría dejar de usar la columna como estado de sesión, que toca los tres logins, los dos `cerrarSesion` y los dos middlewares.

El `INNER JOIN clientes` del punto 3 acota el daño: antes, **cualquier** usuario podía autenticarse acá y quedaba con el rol pisado, incluidos los comercios y los repartidores de la semilla, que ni siquiera tienen perfil de cliente. Se llevaban un token que no les servía para el carrito y perdían el acceso a sus propios endpoints hasta volver a entrar por el login que les corresponde.

---

### Seguridad

- Las contraseñas se almacenan siempre como hash `bcrypt` (costo 10), nunca en texto plano.
- El JWT se firma con `JWT_SECRET` (variable de entorno, no hardcodeada) y expira en `JWT_EXPIRES_IN`.
- El campo `contrasena` nunca se incluye en las respuestas HTTP, ni siquiera hasheado.
- `.env` está excluido de git (`.gitignore`); las credenciales reales no se versionan.

---

### Dependencias dentro de esta lógica

- `usuarios.rol` es `ENUM('cliente','comercio','repartidor','administrador') DEFAULT NULL` — nulable a propósito, porque el registro base no define el rol.
- El alta de `administrador` **no** se hace por API: se inserta manualmente en la base por un super usuario, directo en las tablas `usuarios` + `administradores`. No existe (ni debe existir) un endpoint público para este rol.
- Las tablas de rol (`clientes`, `comercios`, `repartidores`, `administradores`) están definidas en el schema pero **todavía no se completan desde el registro** — se conectarán en una etapa posterior del proyecto, cada una vía su propio endpoint. `comercios` ya está conectada vía `/api/registroComercio`.

---

## Catálogo de productos y stock (Semana 4 — CU03, CU04, CU13 a CU16)

### Endpoints públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/comercios` | Explorar comercios activos (CU03). Filtros: `categoria`, `buscar`, `pagina`, `limite` |
| `GET` | `/api/comercios/:id` | Detalle de un comercio |
| `GET` | `/api/comercios/:id/productos` | Productos de un comercio (CU03) |
| `GET` | `/api/productos` | Buscar productos (CU04). Filtros: `buscar`, `categoria`, `comercioId`, `precioMin`, `precioMax`, `pagina`, `limite` |
| `GET` | `/api/productos/:id` | Detalle de un producto |

### Endpoints de gestión (solo rol `comercio`)

| Método | Ruta | Caso de uso |
|---|---|---|
| `POST` | `/api/productos` | Alta de producto |
| `PUT` | `/api/productos/:id` | Edición completa |
| `PATCH` | `/api/productos/:id/stock` | Gestionar y actualizar stock (CU13, CU14) |
| `PATCH` | `/api/productos/:id/precio` | Gestionar y actualizar precios (CU15, CU16) |
| `DELETE` | `/api/productos/:id` | Baja lógica del producto |
| `GET` | `/api/productos/:id/auditoria` | Historial de cambios del producto |

Protegidos por la cadena `verificarToken` → `verificarRol('comercio')` → `resolverComercio`.
El token va en el header `Authorization`, **sin** el prefijo `Bearer `.

### Decisiones de diseño

- **El `comercio_id` sale siempre del token, nunca del body.** Antes de cualquier
  `UPDATE` o `DELETE` se verifica que el producto sea del comercio autenticado: si es de
  otro devuelve `403`, si no existe `404`. Es lo que impide que un comercio toque el
  catálogo de otro.
- **El borrado es lógico** (`activo = FALSE`). Un `DELETE` físico no es posible porque
  `items_pedido.producto_id` es `ON DELETE RESTRICT` (un producto ya pedido no se puede
  borrar), y además `auditoria_productos.producto_id` es `ON DELETE CASCADE`, o sea que
  borrar el producto se llevaría puesta su propia auditoría.
- **Auditoría transaccional.** Cada escritura sobre `productos` va en la misma transacción
  que su fila en `auditoria_productos`: se guardan las dos cosas o ninguna. La acción se
  registra con el ENUM `INSERT` / `UPDATE` / `DELETE` más `fecha` y `hora`.
- **`auditoria_productos.usuario_id`.** La tabla original solo tenía `administrador_id`,
  pero en CU13 a CU16 quien modifica los productos es el **comercio**, no un administrador.
  Se agregó `usuario_id` (FK a `usuarios`, nulable) para registrar al actor real sea cual
  sea su rol. `administrador_id` se conserva para el panel de administración (semana 13),
  y queda en `NULL` cuando el cambio lo hace un comercio.
- **`PATCH` separados para stock y precio** porque los casos de uso los separan. El de
  stock acepta `{ stock }` (valor absoluto) o `{ ajuste }` (delta, puede ser negativo), y
  rechaza con `400` cualquier ajuste que dejaría el stock por debajo de cero.
- **Paginación** en todos los listados: `limite` por defecto 20 y tope 100, `pagina` por
  defecto 1. La respuesta incluye `datos.paginacion` con el total de resultados.

Los casos de prueba están en `backend/postman/backend-productos.js`.

---

## Repartidores y asignación de pedidos (Semana 8 — CU19, CU20)

### Endpoints del repartidor (solo rol `repartidor`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/pedido/listar` | Pedidos disponibles para repartir (CU19): pagados y sin repartidor. Filtros: `pagina`, `limite` |
| `PATCH` | `/api/pedido/asignar/:idPedido` | Aceptar un pedido (CU20): le asigna `repartidor_id` y lo pasa a `en_camino` |
| `PATCH` | `/api/pedido/entrega/:idPedido` | Confirmar la entrega con el código del cliente. Body: `{ codigoPedido }` |
| `GET` | `/api/repartidor/disponibilidad` | Disponibilidad actual y pedido en curso |
| `PATCH` | `/api/repartidor/disponibilidad` | Entrar o salir de servicio. Body: `{ disponible }` |

Protegidos por la cadena `verificarToken` → `verificarRol('repartidor')` → `resolverRepartidor`.

### Endpoint para cualquier usuario logueado

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/notificaciones` | Notificaciones propias, las más recientes primero. Filtros: `pagina`, `limite` |

### Decisiones de diseño

- **Un pedido no puede asignarse dos veces.** La asignación es un único `UPDATE ... WHERE
  repartidor_id IS NULL AND estado = 'en_preparacion'`, no un "consultar si está libre y
  después asignar". Si dos repartidores aceptan a la vez, InnoDB hace esperar al segundo
  `UPDATE`: cuando le toca, la fila ya tiene repartidor, afecta 0 filas y recibe `409`.
- **`disponible` significa "puede tomar un pedido nuevo".** Pasa a `FALSE` al aceptar,
  vuelve a `TRUE` al entregar, y además el repartidor entra y sale de servicio a mano. Para
  ver pedidos y aceptarlos tiene que estar disponible, y no puede ponerse disponible con un
  pedido en camino.
- **Orden de locks.** Aceptar, entregar y cambiar la disponibilidad lockean primero la fila
  del repartidor (`SELECT ... FOR UPDATE`). Eso impide que el mismo repartidor acepte dos
  pedidos a la vez y fija el orden `repartidores → pagos → pedidos → productos`, que evita
  deadlocks con el resto del sistema.
- **Código de entrega.** Al aceptar se genera un código de 8 dígitos con `crypto.randomInt`
  (y no `Math.random`, porque es lo que autoriza la entrega). Le llega **al cliente** por
  notificación y **no** viene en la respuesta al repartidor: si viniera, el repartidor
  podría confirmar una entrega que no hizo. Al entregar se borra.
- **Todo en una transacción.** Asignar el pedido, cambiar la disponibilidad, auditar y
  notificar al cliente se confirman juntos. Si falla cualquier parte, el pedido queda sin
  asignar: nunca queda tomado con un código que el cliente no recibió.
- **`auditoria_pedidos.usuario_id`.** Mismo criterio que en productos: se agregó para
  registrar al actor real de cada cambio (el repartidor que acepta o entrega). Queda en
  `NULL` cuando el cambio lo dispara un pago aprobado.
- **Notificaciones mínimas.** Por ahora solo se guardan en la tabla `notificaciones` y se
  leen con `GET /api/notificaciones`. El envío en tiempo real es de la semana 11.
- **Lista vacía → `200`**, no `404`: que no haya pedidos para repartir es una respuesta
  válida.
- **El listado no muestra la `direccion_entrega` del cliente.** La ve solo el repartidor
  que toma el pedido, en la respuesta de `asignar`.

### Base de datos

Los cambios de esquema (`auditoria_pedidos.usuario_id` y el índice `idx_pedidos_disponibles`)
y los datos de prueba nuevos están en `backend/scripts/aTuPuerta.sql`, que hay que volver a
importar entero para tenerlos.

Los casos de prueba están en `backend/postman/backend-repartidores.js`.

---

## Geolocalización e integración con Mapbox (Semana 9 — CU21, CU22)

### Endpoints nuevos (solo rol `repartidor`)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/repartidor/ubicacion` | Registra la posición actual del repartidor. Body: `{ latitud, longitud }` |
| `GET` | `/api/pedido/ruta/:idPedido` | Ruta optimizada hacia el destino y ETA (CU21). Query: `retirado=true\|false` |

Y `PATCH /api/pedido/entrega/:idPedido` (CU22) ahora acepta además `{ latitud, longitud }`
de forma **opcional**, para dejar registrado el punto exacto donde se hizo la entrega.

### Decisiones de diseño

- **El proveedor de mapas es Mapbox, y se eligió por la barrera de entrada, no por el
  precio.** El plan original decía Google Maps Platform, pero Google **no habilita ninguna
  de sus APIs hasta que el proyecto de Google Cloud tenga una cuenta de facturación con
  tarjeta de crédito real cargada**, aunque después el consumo entre en el free tier y no
  cobre nada: alguien del equipo tendría que poner su tarjeta personal. Mapbox entrega un
  access token funcional apenas te registrás. Se usa la Directions API v5 para la ruta y la
  Geocoding API v6 para convertir direcciones en coordenadas.
- **La migración costó dos funciones de un archivo.** La semana 9 se escribió entera contra
  Google (Routes API + Geocoding API) y se migró a Mapbox la semana siguiente sin tocar el
  esquema, ningún controller, ninguna ruta ni el modo mock: `maps.service.js` es el único
  archivo del proyecto que sabe qué proveedor se usa, y todo el resto del backend habla
  contra una interfaz que no cambió. **Aislar al proveedor detrás de un adaptador se pagó
  solo a la semana de haberlo hecho.**
- **Mapbox pide las coordenadas como `{longitud},{latitud}`, al revés que Google.** Es la
  fuente de bugs número uno de este tipo de integración, porque invertirlas no falla de
  forma ruidosa: devuelve un punto válido en el lugar equivocado del planeta. La interfaz
  interna sigue hablando de `{ latitud, longitud }` y el orden se da vuelta en el borde del
  adaptador, en un solo lugar.
- **Todo el flujo se puede probar sin access token.** `MAPS_MODO=mock` (el valor por
  defecto) no llama a Mapbox: geocodifica con un hash determinístico alrededor de Santo Tomé
  y calcula la distancia con la fórmula de Haversine. Determinístico a propósito: la misma
  dirección da siempre el mismo punto, así los números de la demo no cambian entre corridas.
  Mismo criterio que se tomó con MercadoPago en la semana 6.
- **Una caída de Mapbox nunca tira abajo un pedido.** `distancia_km`, `tiempo_estimado` y
  `comision` son `NOT NULL`, así que si la API falla, expira el timeout o falta el token, el
  backend degrada a un cálculo local y sigue. La degradación no es silenciosa: queda un
  `console.error` en el servidor y el campo `origen_datos` de la respuesta dice de dónde
  salió cada número (`mapbox`, `mock` o `estimado`).
- **La ruta pasa por el comercio.** Cuando el repartidor acepta, el pedido pasa a
  `en_camino` pero todavía no retiró la mercadería, así que la ruta real es
  `donde estoy → comercio → domicilio del cliente`. Con `?retirado=true` va derecho al
  cliente, para que después de pasar por la tienda no lo mande de vuelta.
- **"Optimizada" es el mejor camino, no reordenar las paradas.** Las paradas van en el orden
  en que se mandan, justamente porque reordenarlas sería incorrecto: no se puede entregar
  antes de retirar. Lo que optimiza la ruta es el perfil `driving-traffic`, que tiene en
  cuenta el tráfico en tiempo real.
- **El vehículo define el perfil de ruta.** `bicicleta` → `cycling`, `moto`, `auto` y `otro`
  → `driving-traffic`. Mapbox no tiene un perfil dedicado para motos, así que van por el
  mismo que los autos: es una pérdida menor frente al `TWO_WHEELER` que tenía Google, y a
  cambio desaparece la restricción que obligaba a tratar la bicicleta como un caso aparte.
- **El ETA viaja adentro de la respuesta de la ruta.** Sale de la misma llamada, así que un
  endpoint aparte significaría pagar dos veces la misma request a Mapbox.
- **Geocodificación "temporary" vs "permanent".** Los términos de Mapbox distinguen las dos,
  y solo la permanent habilita a guardar las coordenadas en una base de datos. Como el
  proyecto las guarda, la variable `MAPS_GEOCODING_PERMANENT` controla cuál se pide; viene
  en `false` porque la permanent cuesta más por request y exige una tarjeta cargada en la
  cuenta. Para el trabajo de cátedra queda documentado; para un despliegue real hay que
  prenderla. Google también prohíbe el almacenamiento permanente, con la diferencia de que
  no ofrece una opción paga explícita.
- **Ninguna llamada de red ocurre dentro de una transacción.** Por eso
  `confirmarCarrito` quedó partido en dos fases: la primera lee el carrito y calcula las
  rutas contra el pool, la segunda abre la transacción, lockea los productos y crea los
  pedidos. Si la llamada quedara adentro, habría filas de productos bloqueadas mientras se
  espera la red.
- **Se terminaron los valores hardcodeados.** `distancia_km`, `tiempo_estimado` y `comision`
  se calculaban con los literales `100.00, 25, 500.50`. Ahora salen de la ruta real, y la
  comisión es `COMISION_BASE + COMISION_POR_KM × distancia_km`, configurable en el `.env`.
- **Las coordenadas se completan solas.** Se cargan al registrar un cliente o un comercio y
  al crear el pedido. Las filas que ya existían quedan en `NULL` y se geocodifican la
  primera vez que hacen falta, así que no hizo falta ningún script de migración masiva.
- **Snapshot e histórico.** Cada posición se guarda en los dos lados:
  `ubicaciones_repartidor` acumula el recorrido completo del pedido y
  `repartidores.latitud_actual/longitud_actual` guarda dónde está ahora. Las dos columnas
  existían en el modelo desde el principio y no se usaban.

### Base de datos

Cambios de esquema en `backend/scripts/aTuPuerta.sql` (hay que volver a importarlo entero):

- `latitud` / `longitud` en `comercios` y `clientes`.
- `destino_latitud` / `destino_longitud` en `pedidos`, como foto fija del destino.
- `pedidos.distancia_km` pasa de `DECIMAL(4,1)` a `DECIMAL(6,2)`: ahora sale de una ruta
  real y la comisión se calcula sobre ella, así que redondear a 100 metros se notaba en
  plata. **Ojo:** `mysql2` devuelve los `DECIMAL` como string, así que en las respuestas
  ese campo pasó de `"1.2"` a `"1.20"`.
- Índice `idx_ubicaciones_pedido (pedido_id, registrado_en)`, que es como se consulta la
  última posición de un pedido.

Los casos de prueba están en `backend/postman/backend-geolocalizacion.js`.
