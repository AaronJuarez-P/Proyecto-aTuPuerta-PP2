# ProyectoAnual — Sistema de delivery de productos variados

Proyecto anual Practica Profesionalizante 2 — IES Santa Fe — 2026.

Sistema de delivery enfocado en la distribuciòn de productos variados, soportar tipos de usuarios cliente, comerio y repartidor y soportar funcionalidades como el pago, trackeo de repartidores, sistema push de notificaciones, google maps integrado, etc. Desarrollo dividido en dos ramas;
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
| `POST` | `/api/login` | Autentica un usuario existente y devuelve un JWT válido por `JWT_EXPIRES_IN` (definido en `.env`, actualmente `8h`). |

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
  "correo": "string",
  "contrasena": "string",
  "telefono": "string"
}
```

**Validaciones, en orden de ejecución:**

1. **Campos obligatorios.** Si falta `nombre`, `correo`, `contrasena` o `telefono` → `400`, `"Todos los campos son obligatorios"`.
2. **Campos vacíos o solo espacios.** Se aplica `.trim()` a cada campo; si alguno queda vacío → `400`, `"Datos ingresados incompletos"`.
3. **Email ya registrado.** Se consulta `SELECT id FROM usuarios WHERE email = ?` antes de insertar. Si ya existe una fila → `400`, `"Usuario ya registrado"`. (Esta validación es una capa adicional de UX; la base también rechaza duplicados por el `UNIQUE KEY uq_usuarios_email`, como red de seguridad ante condiciones de carrera.)
4. **Hash de contraseña.** Recién después de pasar las validaciones anteriores, se genera el hash con `bcrypt.genSalt(10)` + `bcrypt.hash()`. La contraseña en texto plano nunca se guarda ni se loguea.
5. **Inserción.** `INSERT INTO usuarios (nombre, email, contrasena, telefono)` — sin `rol`, que queda `NULL` por defecto en la base.

**Respuestas posibles:**

| Código | Caso | `datos.mensaje` |
|---|---|---|
| `201` | Registro exitoso | `"Usuario registrado exitosamente {nombre}, {correo}, {telefono}"` |
| `400` | Campo faltante | `"Todos los campos son obligatorios"` |
| `400` | Campo vacío / solo espacios | `"Datos ingresados incompletos"` |
| `400` | Email ya registrado | `"Usuario ya registrado"` |
| `500` | Error interno (ej. base caída) | `"Error interno del servidor"` |

---

### POST /api/login

**Body esperado:**
```json
{
  "correo": "string",
  "contrasena": "string"
}
```

**Validaciones, en orden de ejecución:**

1. **Campos obligatorios.** Si falta `correo` o `contrasena` → `400`, `"Correo y contraseña son obligatorios"`.
2. **Campos vacíos o solo espacios.** → `400`, `"Datos ingresados incompletos"`.
3. **Existencia del usuario.** `SELECT * FROM usuarios WHERE email = ?`. Si no hay resultados → `401`, `"Correo o contraseña incorrectos"`.
4. **Comparación de contraseña.** `bcrypt.compare(contrasena, usuario.contrasena)` contra el hash guardado (nunca se compara texto plano contra texto plano). Si no coincide → `401`, `"Credenciales inválidas"`.
5. **Usuario activo.** Si `usuario.activo` es `false` → `403`, `"Usuario inactivo"`.
6. **Generación de token.** `jwt.sign({ id, rol }, JWT_SECRET, { expiresIn: '8h' })`. Nota: `rol` puede llegar como `null` para cualquier usuario creado solo con `/api/registro`, hasta que el proyecto implemente la asignación de rol.

**Respuestas posibles:**

| Código | Caso | `datos.mensaje` |
|---|---|---|
| `200` | Login exitoso | — (`datos` trae `token` y `usuario: { id, nombre, correo, rol }`) |
| `400` | Campo faltante | `"Correo y contraseña son obligatorios"` |
| `400` | Campo vacío / solo espacios | `"Datos ingresados incompletos"` |
| `401` | Email no existe | `"Correo o contraseña incorrectos"` |
| `401` | Contraseña incorrecta | `"Credenciales inválidas"` |
| `403` | Usuario inactivo | `"Usuario inactivo"` |
| `500` | Error interno | `"Error interno del servidor"` |

> **Pendiente a definir por el equipo:** los casos "email no existe" y "contraseña incorrecta" devuelven mensajes distintos hoy. Por buena práctica de seguridad (evitar que un atacante confirme qué emails están registrados) ambos deberían devolver el mismo mensaje genérico. Queda anotado para decidir antes de cerrar el módulo de auth.

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
- Las tablas de rol (`clientes`, `comercios`, `repartidores`, `administradores`) están definidas en el schema pero **todavía no se completan desde el registro** — se conectarán en una etapa posterior del proyecto, cada una vía su propio endpoint.
