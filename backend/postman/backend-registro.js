//# Guía de pruebas Postman — Registro y Login
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
//## POST /api/registro
//
//Crea un usuario base en la tabla `usuarios`. En esta etapa el usuario se crea **sin rol asignado** (`rol = NULL`); la asignación de rol se resuelve en una etapa posterior del proyecto.
//
//### Body (raw JSON)
//```json
//{
//  "nombre": "Juan Pérez",
//  "correo": "juan.perez@test.com",
//  "contrasena": "Test1234!",
//  "telefono": "3421000001"
//}
//```
//
//### Caso 1 — Registro exitoso
//**Precondición:** el email no existe todavía en la tabla `usuarios`.
//
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": { "mensaje": "Usuario registrado exitosamente Juan Pérez, juan.perez@test.com, 3421000001" }
//}
//```
//**Verificación en base:** debe existir una fila nueva en `usuarios` con `rol` en `NULL` y `contrasena` como hash bcrypt (no texto plano).
//
//---
//
//### Caso 2 — Campo faltante
//**Body:** omitir cualquiera de los 4 campos, ej.:
//```json
//{ "correo": "test@test.com", "contrasena": "Test1234!", "telefono": "3421000099" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Todos los campos son obligatorios" }
//}
//```
//
//---
//
//### Caso 3 — Campo vacío o solo espacios
//**Body:**
//```json
//{ "nombre": "   ", "correo": "test@test.com", "contrasena": "Test1234!", "telefono": "3421000099" }
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
//### Caso 4 — Email ya registrado
//**Precondición:** repetir el `correo` del Caso 1 (ya insertado).
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
//### Caso 5 — Error interno (para verificar el catch)
//**Cómo forzarlo:** apagar MySQL/XAMPP y repetir el Caso 1.
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
//## POST /api/login
//
//### Body (raw JSON)
//```json
//{
//  "correo": "juan.perez@test.com",
//  "contrasena": "Test1234!"
//}
//```
//
//### Caso 1 — Login exitoso
//**Precondición:** usuario existente, activo, con la contraseña correcta.
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
//      "correo": "juan.perez@test.com",
//      "rol": null
//    }
//  }
//}
//```
//> Nota: `rol` va a aparecer como `null` para cualquier usuario creado solo con `/api/registro`, hasta que el proyecto implemente la asignación de rol.
//
//**Verificación:** copiar el `token` recibido — se va a necesitar para probar rutas protegidas por `verificarToken` más adelante.
//
//---
//
//### Caso 2 — Campo faltante
//**Body:**
//```json
//{ "correo": "juan.perez@test.com" }
//```
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Correo y contraseña son obligatorios" }
//}
//```
//
//---
//
//### Caso 3 — Campo vacío o solo espacios
//**Body:**
//```json
//{ "correo": "  ", "contrasena": "Test1234!" }
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
//{ "correo": "noexiste@test.com", "contrasena": "Test1234!" }
//```
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{
//  "codigo": 401,
//  "estado": "error",
//  "datos": { "mensaje": "Correo o contraseña incorrectos" }
//}
//```
//
//---
//
//### Caso 5 — Contraseña incorrecta
//**Body:** email válido, contraseña equivocada.
//```json
//{ "correo": "juan.perez@test.com", "contrasena": "ContraseñaMala" }
//```
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{
//  "codigo": 401,
//  "estado": "error",
//  "datos": { "mensaje": "Credenciales inválidas" }
//}
//```
//> Nota para el equipo: hoy este caso devuelve un mensaje distinto ("Credenciales inválidas") al del Caso 4 ("Correo o contraseña incorrectos"). Por buenas prácticas de seguridad (evitar enumeración de usuarios) ambos deberían decir exactamente lo mismo — a definir si se unifica antes o después del commit.
//
//---
//
//### Caso 6 — Usuario inactivo
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
//---
//
//### Caso 7 — Error interno (para verificar el catch)
//**Cómo forzarlo:** apagar MySQL/XAMPP y repetir el Caso 1.
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
//- [ ] `npm install` corrido con `bcryptjs` en `package.json` (no `bcrypt`, o ajustar el `require` del controller).
//- [ ] Script `aTuPuerta.sql` importado en phpMyAdmin, con el `ENUM` de `rol` actualizado y `DEFAULT NULL`.
//- [ ] `.env` creado a partir de `.env.example`, con `DATABASE=aTuPuerta`.
//- [ ] `registro.routes.js` creado y enlazado en `app.js`.
//- [ ] Servidor corriendo (`npm run dev`) y `GET /health` respondiendo `200`.