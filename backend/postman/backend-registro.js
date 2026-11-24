//# Guía de pruebas Postman — Registro y Login
//
//Base URL local: `http://localhost:4000/api`
//
//Todas las respuestas siguen el formato uniforme del proyecto:
//```json
//{ "codigo": 0, "estado": "", "datos": {} }
//```
//
//> **El campo se llama `email` en toda la API**, igual que la columna `usuarios.email`.
//> Todos los endpoints de registro y login usan el mismo nombre.
//
//> **Esta guía asume `EMAIL_MODO=mock`**, que es el valor por defecto: el registro pide el
//> código de verificación pero no manda ningún correo, y el código vuelve en la respuesta
//> (`codigo_mock`). Con `EMAIL_MODO=off` no hay código: ver el Caso 1b.
//
//> **Ojo con el límite de intentos fallidos.** Todos estos endpoints cuentan las respuestas
//> de error por IP, y a las 10 en 15 minutos contestan `429` · "Demasiados intentos
//> fallidos. Esperá unos minutos y volvé a intentar". Esta guía junta más de 10 errores a
//> propósito, así que para correrla entera conviene subir `RATE_LIMIT_LOGIN_MAX` en el
//> `.env` (a 100, por ejemplo) o reiniciar el backend cuando aparezca: los contadores viven
//> en memoria.
//
//---
//
//## POST /api/registro
//
//Primer paso del alta de un cliente. Qué hace depende de `EMAIL_MODO`:
//
//| Modo | Qué hace | Respuesta |
//|---|---|---|
//| `mock` (por defecto) | Guarda el registro en `registros_pendientes` y genera un código de 6 dígitos. No manda ningún correo: el código vuelve en `codigo_mock` y sale por la consola del backend | `202` |
//| `consola` | Lo mismo, pero el código sale solo por la consola del backend y **no** viaja en la respuesta. Esta guía no se puede seguir de punta a punta en este modo: usar `mock` | `202` |
//| `smtp` | Lo mismo, pero el código sale por correo y **no** viaja en la respuesta | `202` |
//| `off` | Crea la cuenta directo, sin código, como antes de que existiera la verificación | `201` |
//
//Con `mock` y `smtp`, después de este pedido **la cuenta todavía no existe**: la crea
//`POST /api/registro/verificar` cuando el código es correcto.
//
//Antes de guardar geocodifica la dirección. Si el proveedor de mapas no contesta, el
//registro sigue igual con `latitud` y `longitud` en `NULL`: nadie se queda sin poder
//registrarse porque un tercero está caído.
//
//### Body (raw JSON)
//```json
//{
//  "nombre": "Ana López",
//  "email": "ana.lopez@test.com",
//  "contrasena": "Test1234!",
//  "telefono": "3421000099",
//  "direccion_entrega": "Sarmiento 100, Santo Tomé, Santa Fe"
//}
//```
//
//### Caso 1 — Registro aceptado: falta el código
//**Precondición:** el email no existe todavía en `usuarios`. Los de la semilla ya están
//tomados: usar uno nuevo.
//
//**Respuesta esperada:** `202 Accepted`
//```json
//{
//  "codigo": 202,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Te mandamos un código de 6 dígitos a ana.lopez@test.com. Ingresalo para terminar de crear tu cuenta.",
//    "verificacion_pendiente": true,
//    "email": "ana.lopez@test.com",
//    "minutos_vigencia": 15,
//    "segundos_reenvio": 60,
//    "codigo_mock": "483920"
//  }
//}
//```
//**Copiar `codigo_mock`**: es el código que hay que mandar a `/api/registro/verificar`. El
//mismo valor aparece en la consola del backend:
//```
//[email mock] Código de verificación para ana.lopez@test.com: 483920
//```
//> `202` y no `201`: el pedido se aceptó, pero la cuenta todavía no existe. El `201` lo
//> contesta `/api/registro/verificar`, que es quien la crea.
//
//**Verificación en base:**
//```sql
//SELECT email, nombre, contrasena, latitud, longitud, codigo_hash, codigo_expira_en,
//       intentos_fallidos, ultimo_envio_en
//FROM registros_pendientes WHERE email = 'ana.lopez@test.com';
//
//SELECT COUNT(*) FROM usuarios WHERE email = 'ana.lopez@test.com';   -- 0
//```
//Tiene que haber **una fila en `registros_pendientes` y ninguna en `usuarios`**. `contrasena`
//es un hash bcrypt y `codigo_hash` son 64 caracteres hexadecimales: el código en texto
//plano no se guarda nunca. Las coordenadas ya están cargadas si el modo de mapas estaba en
//`mock`.
//
//---
//
//### Caso 1b — Con `EMAIL_MODO=off` la cuenta se crea directo
//**Precondición:** `EMAIL_MODO=off` en el `.env` y el servidor reiniciado. Al arrancar
//avisa: `[email] EMAIL_MODO=off: el registro crea la cuenta SIN verificar el correo...`
//
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": { "mensaje": "Usuario registrado exitosamente Ana López, ana.lopez@test.com, 3421000099" }
//}
//```
//**Verificación en base:**
//```sql
//SELECT u.id, u.email, u.rol, c.direccion_entrega, c.latitud, c.longitud
//FROM usuarios u INNER JOIN clientes c ON c.usuario_id = u.id
//WHERE u.email = 'ana.lopez@test.com';
//```
//Tiene que haber **una fila en cada tabla**, con `rol = 'cliente'` y `contrasena` como hash
//bcrypt (no texto plano).
//
//> Sirve para cargar muchos usuarios de prueba sin tipear códigos. Volver a `mock` y
//> reiniciar antes de seguir con la guía.
//
//---
//
//### Caso 2 — Campo faltante
//**Body:** omitir cualquiera de los 5 campos, ej. sin `nombre`:
//```json
//{ "email": "test@test.com", "contrasena": "Test1234!", "telefono": "3421000098", "direccion_entrega": "Mitre 200, Santo Tomé" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Todos los campos son obligatorios" }
//}
//```
//> Este es también el caso que confirma que **`correo` ya no se acepta**: mandar el body
//> con `correo` en vez de `email` cae exactamente acá.
//
//---
//
//### Caso 3 — Campo vacío o solo espacios
//**Body:**
//```json
//{ "nombre": "   ", "email": "test@test.com", "contrasena": "Test1234!", "telefono": "3421000098", "direccion_entrega": "Mitre 200, Santo Tomé" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Datos ingresados incompletos" }
//}
//```
//
//---
//
//### Caso 4 — Email con formato inválido
//**Body:** cualquiera de estos en `email`: `"sinarroba"`, `"dos@@arrobas.com"`,
//`"sin@punto"`, `"con espacio@test.com"`.
//```json
//{ "nombre": "Ana López", "email": "sinarroba", "contrasena": "Test1234!", "telefono": "3421000098", "direccion_entrega": "Mitre 200, Santo Tomé" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El email no tiene un formato válido" }
//}
//```
//> La validación (`esEmailValido` en `utils/validacion.js`) es a propósito laxa: descarta lo
//> obviamente mal escrito, no pretende cumplir el RFC 5322. Lo único que prueba de verdad
//> que una dirección existe es mandarle un correo, y eso es lo que hace el código de
//> verificación.
//
//---
//
//### Caso 5 — Email ya registrado
//**Precondición:** usar el `email` de una cuenta que ya existe, por ejemplo uno de la
//semilla (`juan.perez@test.com`).
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Usuario ya registrado" }
//}
//```
//> Un correo con un registro **pendiente** no está "ya registrado": la cuenta todavía no
//> existe. Lo que pasa en ese caso es el Caso 6.
//
//---
//
//### Caso 6 — Registrarse de nuevo con un correo que está pendiente
//**Precondición:** el Caso 1 recién corrido (hace menos de un minuto).
//**Body:** el mismo del Caso 1.
//**Respuesta esperada:** `429 Too Many Requests`
//```json
//{
//  "codigo": 429,
//  "estado": "error",
//  "datos": {
//    "mensaje": "Ya te mandamos un código hace instantes. Esperá 52 segundos para pedir otro.",
//    "segundos_restantes": 52
//  }
//}
//```
//**Pasado el minuto**, el mismo pedido da `202` con un `codigo_mock` distinto: el registro
//pendiente se reemplaza entero (contraseña incluida), el código anterior deja de servir y
//los intentos vuelven a 0.
//
//> Por eso un correo mal escrito o un registro abandonado no dejan la dirección tomada. Y
//> la espera es por correo: evita que registrarse una y otra vez con la dirección de otro
//> sirva para llenarle la casilla.
//
//---
//
//### Caso 7 — Error interno (para verificar el catch)
//**Cómo forzarlo:** apagar MySQL desde XAMPP y repetir el Caso 1.
//**Respuesta esperada:** `500 Internal Server Error`
//```json
//{
//  "codigo": 500,
//  "estado": "error",
//  "datos": { "mensaje": "Error interno del servidor" }
//}
//```
//> También da `500` una base que no tiene la tabla `registros_pendientes` (una base vieja
//> sin la migración `20261111_registros_pendientes.sql`). En ese caso la consola del backend
//> dice exactamente qué falta.
//
//---
//
//### Caso 8 — El correo no sale (solo con `EMAIL_MODO=smtp`)
//**Cómo forzarlo:** `EMAIL_MODO=smtp` con un `SMTP_PASS` equivocado, reiniciar y repetir el
//Caso 1 con un email nuevo.
//**Respuesta esperada:** `503 Service Unavailable`
//```json
//{
//  "codigo": 503,
//  "estado": "error",
//  "datos": { "mensaje": "No pudimos mandarte el correo con el código. Probá de nuevo en unos minutos." }
//}
//```
//> El registro pendiente queda guardado, pero con `ultimo_envio_en` en `NULL`: como nadie
//> recibió nada, se puede reintentar enseguida sin esperar el minuto. El motivo real (por
//> ejemplo, credenciales rechazadas) queda en la consola del backend, no en la respuesta.
//
//---
//
//## POST /api/registro/verificar
//
//Segundo paso del registro: con el código correcto crea la cuenta (`usuarios` + `clientes`,
//en una transacción) y borra el registro pendiente.
//
//### Body (raw JSON)
//```json
//{
//  "email": "ana.lopez@test.com",
//  "contrasena": "Test1234!",
//  "codigo": "483920"
//}
//```
//`codigo` va como **texto**: como número perdería los ceros de adelante (`012345` sería
//`12345`).
//
//> **Por qué pide también la contraseña.** El código prueba que la persona lee ese correo;
//> la contraseña, que el registro que está confirmando es el suyo. Sin eso habría una forma
//> de quedarse con la cuenta de otro: registrarse con el correo de la víctima y una
//> contraseña propia justo cuando ella se está registrando. A ella le llega un código más,
//> lo ingresa creyendo que es el suyo, y deja verificada una cuenta que abre la contraseña
//> del atacante.
//
//Los casos van en este orden a propósito: cada código incorrecto gasta uno de los 5
//intentos, y el correcto consume el registro pendiente.
//
//### Caso 1 — Campo faltante
//**Body:** sin `codigo`.
//```json
//{ "email": "ana.lopez@test.com", "contrasena": "Test1234!" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Email, contraseña y código son obligatorios" }
//}
//```
//
//---
//
//### Caso 2 — Código mal formado
//**Body:** en `codigo`, cualquiera de estos: `"12345"` (5 dígitos), `"12a456"`, o `123456`
//como número.
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El código tiene 6 dígitos y va como texto" }
//}
//```
//> No gasta ningún intento del código: ni siquiera se llegó a compararlo.
//
//---
//
//### Caso 3 — La contraseña no es la de ese registro
//**Body:** el email del Caso 1 del registro, con otra contraseña.
//```json
//{ "email": "ana.lopez@test.com", "contrasena": "OtraClave99", "codigo": "483920" }
//```
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{
//  "codigo": 401,
//  "estado": "error",
//  "datos": { "mensaje": "Email o contraseña incorrectos" }
//}
//```
//> **El mismo `401`, palabra por palabra, contesta un email que no tiene ningún registro
//> pendiente** (probar con `nadie@test.com`). Si fueran distintos, cualquiera podría
//> averiguar qué correos están a medio registrar.
//
//---
//
//### Caso 4 — Código incorrecto
//**Body:** email y contraseña correctos, y un código que no es el de `codigo_mock`.
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El código no es correcto. Te quedan 4 intentos.", "intentos_restantes": 4 }
//}
//```
//**Verificación en base:**
//```sql
//SELECT intentos_fallidos FROM registros_pendientes WHERE email = 'ana.lopez@test.com';   -- 1
//```
//
//---
//
//### Caso 5 — Código correcto: se crea la cuenta
//**Body:** email, contraseña y el `codigo_mock` del registro.
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": { "mensaje": "¡Listo! Verificamos tu correo y tu cuenta ya está creada. Iniciá sesión para empezar." }
//}
//```
//**Verificación en base:**
//```sql
//SELECT u.id, u.email, u.rol, c.direccion_entrega, c.latitud, c.longitud
//FROM usuarios u INNER JOIN clientes c ON c.usuario_id = u.id
//WHERE u.email = 'ana.lopez@test.com';
//
//SELECT COUNT(*) FROM registros_pendientes WHERE email = 'ana.lopez@test.com';   -- 0
//```
//Tiene que haber **una fila en cada tabla**, con `rol = 'cliente'`, la contraseña como hash
//bcrypt y las mismas coordenadas que tenía el registro pendiente. Y el pendiente ya no está.
//
//> No devuelve token: después hay que iniciar sesión con `POST /api/inicioSesion`, igual
//> que siempre.
//
//---
//
//### Caso 6 — Repetir el código ya usado
//**Body:** el mismo del Caso 5.
//**Respuesta esperada:** `401 Unauthorized` · "Email o contraseña incorrectos"
//
//> Ya no hay ningún registro pendiente para ese correo, así que cae en el mismo `401`
//> genérico del Caso 3. No se crea una segunda cuenta.
//
//---
//
//### Caso 7 — Intentos agotados
//**Precondición:** registrar otro email (`POST /api/registro`) y guardar su `codigo_mock`.
//**Body:** email y contraseña correctos con un código incorrecto, **cinco veces**.
//
//Las cuatro primeras contestan como el Caso 4, con `intentos_restantes` bajando de 4 a 1.
//La quinta:
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El código no es correcto y ya no te quedan intentos. Pedí uno nuevo.", "intentos_restantes": 0 }
//}
//```
//**Sexto pedido, ahora con el código correcto.** Respuesta esperada: `429 Too Many Requests`
//```json
//{
//  "codigo": 429,
//  "estado": "error",
//  "datos": { "mensaje": "Agotaste los intentos con este código. Pedí uno nuevo." }
//}
//```
//> Con los intentos agotados no sirve ni el código correcto: si sirviera, el límite sería
//> solo un cartel. Con 6 dígitos hay un millón de combinaciones, así que 5 intentos son 1
//> posibilidad en 200.000 de acertar. La salida es `POST /api/registro/reenviar`.
//
//---
//
//### Caso 8 — Código vencido
//**Precondición:** un registro pendiente con intentos disponibles (por ejemplo, el del
//Caso 7 después de pedirle un código nuevo). En la base, correr manualmente:
//```sql
//UPDATE registros_pendientes SET codigo_expira_en = NOW() - INTERVAL 1 MINUTE
//WHERE email = '<el email>';
//```
//**Body:** email, contraseña y el código correcto.
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El código venció. Pedí uno nuevo." }
//}
//```
//
//---
//
//## POST /api/registro/reenviar
//
//Emite un código nuevo para un registro pendiente y lo manda. El anterior deja de servir,
//los intentos vuelven a 0 y el vencimiento arranca de nuevo.
//
//### Body (raw JSON)
//```json
//{
//  "email": "ana.lopez@test.com",
//  "contrasena": "Test1234!"
//}
//```
//
//### Caso 1 — Reenvío exitoso
//**Precondición:** un registro pendiente al que se le mandó el último código hace más de un
//minuto.
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Te mandamos un código nuevo a ana.lopez@test.com.",
//    "email": "ana.lopez@test.com",
//    "minutos_vigencia": 15,
//    "segundos_reenvio": 60,
//    "codigo_mock": "170452"
//  }
//}
//```
//**Verificación:** el código anterior ya no sirve (`/api/registro/verificar` con él da
//`400` · "El código no es correcto. Te quedan 4 intentos."), y el nuevo sí.
//
//---
//
//### Caso 2 — Antes de que pase el minuto
//**Body:** repetir el Caso 1 enseguida.
//**Respuesta esperada:** `429 Too Many Requests`
//```json
//{
//  "codigo": 429,
//  "estado": "error",
//  "datos": {
//    "mensaje": "Ya te mandamos un código hace instantes. Esperá 57 segundos para pedir otro.",
//    "segundos_restantes": 57
//  }
//}
//```
//> El front usa `segundos_restantes` para poner en hora la cuenta regresiva del botón
//> "Reenviar código".
//
//---
//
//### Caso 3 — Contraseña incorrecta o email sin registro pendiente
//**Respuesta esperada:** `401 Unauthorized` · "Email o contraseña incorrectos"
//
//> Sin la contraseña, alcanzaría con saber un correo a medio registrar para hacerle llegar
//> códigos a su dueño.
//
//---
//
//### Caso 4 — Campo faltante
//**Body:** `{ "email": "ana.lopez@test.com" }`
//**Respuesta esperada:** `400 Bad Request` · "Email y contraseña son obligatorios"
//
//---
//
//## POST /api/inicioSesion
//
//El login de la **app del cliente**. Resuelve con
//`usuarios INNER JOIN clientes`, así que solo entran los usuarios que tienen perfil de
//cliente. Los comercios usan `/api/inicioSesionComercio` y los repartidores
//`/api/inicioSesionRepartidor`.
//
//### Body (raw JSON)
//```json
//{
//  "email": "juan.perez@test.com",
//  "contrasena": "Test1234!"
//}
//```
//
//### Caso 1 — Login exitoso
//**Precondición:** usuario existente, activo, con perfil de cliente y la contraseña correcta.
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "token": "<JWT>",
//    "usuario": {
//      "id": 1,
//      "nombre": "Juan Pérez",
//      "email": "juan.perez@test.com",
//      "rol": "cliente"
//    }
//  }
//}
//```
//**Verificación:** copiar el `token` recibido — se va a necesitar para todas las rutas
//protegidas por `verificarToken`. Va en el header **crudo**:
//
//```
//Authorization: <el token, con o sin la palabra Bearer>
//```
//
//> **Desde la semana 14** `verificarToken` acepta el token pelado y también con el
//> prefijo `Bearer ` (Auth → Bearer Token en Postman). Antes el prefijo daba `401`.
//
//---
//
//### Caso 2 — Campo faltante
//**Body:**
//```json
//{ "email": "juan.perez@test.com" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Email y contraseña son obligatorios" }
//}
//```
//
//---
//
//### Caso 3 — Campo vacío o solo espacios
//**Body:**
//```json
//{ "email": "  ", "contrasena": "Test1234!" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Datos ingresados incompletos" }
//}
//```
//
//---
//
//### Caso 4 — Email no existe
//**Body:**
//```json
//{ "email": "noexiste@test.com", "contrasena": "Test1234!" }
//```
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{
//  "codigo": 401,
//  "estado": "error",
//  "datos": { "mensaje": "Email o contraseña incorrectos" }
//}
//```
//
//---
//
//### Caso 5 — Contraseña incorrecta
//**Body:** email válido, contraseña equivocada.
//```json
//{ "email": "juan.perez@test.com", "contrasena": "ContraseñaMala" }
//```
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{
//  "codigo": 401,
//  "estado": "error",
//  "datos": { "mensaje": "Email o contraseña incorrectos" }
//}
//```
//> **Tiene que ser el mismo mensaje, palabra por palabra, que el del Caso 4.** Si fueran
//> distintos, cualquiera podría averiguar qué emails están registrados probando de a uno y
//> mirando cuál de los dos errores le contesta el servidor. Vale lo mismo para los logins de
//> comercio y de repartidor.
//
//---
//
//### Caso 6 — Usuario sin perfil de cliente
//**Body:** las credenciales, correctas, de un comercio o de un repartidor de la semilla.
//```json
//{ "email": "carlos.repartidor@test.com", "contrasena": "Test1234!" }
//```
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{
//  "codigo": 401,
//  "estado": "error",
//  "datos": { "mensaje": "Email o contraseña incorrectos" }
//}
//```
//**Verificación en base:** `SELECT rol FROM usuarios WHERE id = 5;` tiene que seguir
//diciendo `repartidor`.
//
//> Antes esto devolvía `200`. Como el login fija `usuarios.rol = 'cliente'` y los
//> middlewares `resolverComercio` y `resolverRepartidor` filtran por el rol **de la base**
//> —no por el del token—, entrar al login equivocado le pisaba el rol a Carlos y le dejaba
//> todos los endpoints de repartidor en `403` hasta que volviera a entrar por el suyo.
//> El `INNER JOIN clientes` lo corta de raíz.
//>
//> Lo que sigue en pie: si un usuario es cliente **y** repartidor (registrado como cliente y
//> después dado de alta como repartidor por la API), entrar por acá le cierra igual la
//> sesión de repartidor. `usuarios.rol` guarda el rol de la sesión activa, así que hay uno
//> solo por vez. Está anotado como deuda.
//
//---
//
//### Caso 7 — Usuario inactivo
//**Precondición:** en la base, correr manualmente:
//```sql
//UPDATE usuarios SET activo = FALSE WHERE email = 'juan.perez@test.com';
//```
//**Body:** credenciales correctas de ese usuario.
//**Respuesta esperada:** `403 Forbidden`
//```json
//{
//  "codigo": 403,
//  "estado": "error",
//  "datos": { "mensaje": "Usuario inactivo" }
//}
//```
//**Para revertir:** `UPDATE usuarios SET activo = TRUE WHERE email = 'juan.perez@test.com';`
//
//> El chequeo de `activo` va **después** de validar la contraseña, a propósito: si fuera
//> antes, alguien sin credenciales podría averiguar qué cuentas existen y en qué estado están.
//
//---
//
//### Caso 8 — Registro sin verificar
//**Precondición:** un registro pendiente: `POST /api/registro` con un email nuevo, **sin**
//mandar el código a `/api/registro/verificar`.
//**Body:** el email y la contraseña de ese registro.
//**Respuesta esperada:** `403 Forbidden`
//```json
//{
//  "codigo": 403,
//  "estado": "error",
//  "datos": {
//    "mensaje": "Todavía no verificaste tu correo. Ingresá el código que te mandamos para terminar de crear tu cuenta.",
//    "verificacion_pendiente": true
//  }
//}
//```
//**Con otra contraseña**, el mismo email contesta el `401` genérico del Caso 4.
//
//> Quien se registró y cerró la pestaña antes de ingresar el código no tiene fila en
//> `usuarios`: sin este aviso caería en "Email o contraseña incorrectos" y no sabría qué le
//> falta. El front usa `verificacion_pendiente` para mostrarle el paso del código ahí mismo.
//> Igual que "Usuario inactivo", se dice recién **después** de comprobar la contraseña.
//
//---
//
//### Caso 9 — Error interno (para verificar el catch)
//**Cómo forzarlo:** apagar MySQL desde XAMPP y repetir el Caso 1.
//**Respuesta esperada:** `500 Internal Server Error`
//```json
//{
//  "codigo": 500,
//  "estado": "error",
//  "datos": { "mensaje": "Error interno del servidor" }
//}
//```
//
//---
//
//## Checklist rápido antes de correr esta guía
//
//- [ ] `npm install` corrido, con `bcryptjs` y `nodemailer` en `package.json`.
//- [ ] Script `aTuPuerta.sql` importado desde phpMyAdmin (o, en una base con datos, la
//      migración `20261111_registros_pendientes.sql`).
//- [ ] `.env` creado a partir de `.env.example`, con `DB_NAME=aTuPuerta` y
//      `EMAIL_MODO=mock` (o sin la variable).
//- [ ] Servidor corriendo (`npm run dev`) y `GET /health` respondiendo `200`.
//- [ ] El header `Authorization` acepta el token pelado o con `Bearer ` (semana 14).
//- [ ] Para correr la guía entera de una, `RATE_LIMIT_LOGIN_MAX` subido en el `.env`.
