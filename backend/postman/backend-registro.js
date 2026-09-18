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
//> Los seis endpoints de registro y login usan el mismo nombre.
//
//---
//
//## POST /api/registro
//
//Crea el usuario en `usuarios` con `rol = 'cliente'` y, en la misma transacción, su perfil
//en `clientes` con la dirección de entrega. Sin esa segunda fila el usuario nunca podría
//usar el carrito.
//
//Antes de abrir la transacción geocodifica la dirección. Si el proveedor de mapas no
//contesta, el usuario se crea igual con `latitud` y `longitud` en `NULL`: nadie se queda
//sin poder registrarse porque un tercero está caído.
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
//### Caso 1 — Registro exitoso
//**Precondición:** el email no existe todavía en `usuarios`. Los de la semilla ya están
//tomados: usar uno nuevo.
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
//Tiene que haber **una fila en cada tabla**, con `rol = 'cliente'`, `contrasena` como hash
//bcrypt (no texto plano) y las coordenadas cargadas si el modo de mapas estaba en `mock`.
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
//> que una dirección existe es mandarle un mail de verificación, que todavía no hacemos.
//
//---
//
//### Caso 5 — Email ya registrado
//**Precondición:** repetir el `email` del Caso 1 (ya insertado), o usar uno de la semilla.
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Usuario ya registrado" }
//}
//```
//
//---
//
//### Caso 6 — Error interno (para verificar el catch)
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
//Authorization: <el token, sin la palabra Bearer>
//```
//
//> **Importante:** `verificarToken` lee el header tal cual, **no** saca el prefijo `Bearer `.
//> Si usás Auth → Bearer Token en Postman, todo te va a dar `401`.
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
//### Caso 8 — Error interno (para verificar el catch)
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
//- [ ] `npm install` corrido, con `bcryptjs` en `package.json`.
//- [ ] Script `aTuPuerta.sql` importado desde phpMyAdmin.
//- [ ] `.env` creado a partir de `.env.example`, con `DATABASE=aTuPuerta`.
//- [ ] Servidor corriendo (`npm run dev`) y `GET /health` respondiendo `200`.
//- [ ] Acordarse de que el header `Authorization` va **sin** `Bearer`.
