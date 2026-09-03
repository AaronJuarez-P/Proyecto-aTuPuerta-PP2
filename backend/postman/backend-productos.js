//# Guía de pruebas Postman — Catálogo de productos y stock (Semana 4)
//
//Cubre CU03 (explorar comercios), CU04 (buscar productos) y CU13 a CU16 (gestionar
//stock y precios), más la auditoría de cambios en `auditoria_productos`.
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
//## Cómo obtener el token (necesario para todo lo de CU13 a CU16)
//
//Los endpoints de gestión están protegidos por `verificarToken` → `verificarRol('comercio')`
//→ `resolverComercio`. Antes de probarlos hay que loguearse como comercio.
//
//`POST /api/inicioSesion`
//```json
//{
//  "correo": "ferreteria.central@test.com",
//  "contrasena": "Test1234!"
//}
//```
//
//Del `datos.token` que devuelve, copiar el JWT y mandarlo en el header de cada request
//protegido:
//
//```
//Authorization: <el token, sin la palabra Bearer>
//```
//
//> **Importante:** `verificarToken` lee el header crudo, **no** saca el prefijo `Bearer `.
//> Si en Postman elegís Auth → Bearer Token, va a fallar con 401. Usar Headers →
//> `Authorization` con el token pelado.
//
//Decodificando el token en jwt.io tiene que verse:
//```json
//{ "id": 3, "rol": "comercio", "comercioId": 1 }
//```
//
//`POST /api/inicioSesionComercio` (con `email`, `contrasena` y `cuil: "20304050607"`)
//devuelve un token con exactamente el mismo formato, así que sirve igual.
//
//Usuarios semilla útiles (todos con contraseña `Test1234!`):
//
//| Email | Rol | comercio_id |
//|---|---|---|
//| `ferreteria.central@test.com` | comercio | 1 (productos 1, 2, 3) |
//| `libreria.sur@test.com` | comercio | 2 (productos 4, 5) |
//| `juan.perez@test.com` | cliente | — (sirve para probar el 403 por rol) |
//
//---
//---
//
//# CU03 — Explorar comercios (público, sin token)
//
//## GET /api/comercios
//
//Query params opcionales: `categoria`, `buscar` (sobre el nombre), `pagina`, `limite`.
//
//### Caso 1 — Listado completo
//**Precondición:** base recién importada con los datos semilla.
//**Request:** `GET /api/comercios`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "comercios": [
//      { "id": 1, "nombre": "Ferretería Central", "categoria": "Ferretería", "direccion": "Av. Rivadavia 800, Santo Tomé", "horario_atencion": "Lun a Sáb 08:00-20:00" },
//      { "id": 2, "nombre": "Librería del Sur", "categoria": "Librería", "direccion": "Mitre 450, Santo Tomé", "horario_atencion": "Lun a Vie 09:00-19:00" }
//    ],
//    "paginacion": { "pagina": 1, "limite": 20, "total": 2 }
//  }
//}
//```
//
//---
//
//### Caso 2 — Filtro por nombre
//**Request:** `GET /api/comercios?buscar=libre`
//**Respuesta esperada:** `200 OK` con un solo comercio (Librería del Sur) y `total: 1`.
//
//---
//
//### Caso 3 — Paginación
//**Request:** `GET /api/comercios?limite=1&pagina=2`
//**Respuesta esperada:** `200 OK` con 1 comercio (el segundo alfabéticamente) y
//`paginacion: { "pagina": 2, "limite": 1, "total": 2 }`.
//> El `limite` tiene tope 100 y valor por defecto 20. Un `limite=999` se recorta a 100,
//> y un `pagina=0` o `pagina=abc` cae al valor por defecto 1.
//
//---
//
//### Caso 4 — Comercio dado de baja no aparece
//**Precondición:** `UPDATE comercios SET activo = FALSE WHERE id = 2;`
//**Request:** `GET /api/comercios`
//**Respuesta esperada:** `200 OK` con un solo comercio y `total: 1`.
//**Para revertir:** `UPDATE comercios SET activo = TRUE WHERE id = 2;`
//
//---
//
//## GET /api/comercios/:id
//
//### Caso 1 — Detalle existente
//**Request:** `GET /api/comercios/1`
//**Respuesta esperada:** `200 OK` con `datos.comercio.nombre = "Ferretería Central"`.
//
//---
//
//### Caso 2 — Comercio inexistente
//**Request:** `GET /api/comercios/999`
//**Respuesta esperada:** `404 Not Found`
//```json
//{
//  "codigo": 404,
//  "estado": "error",
//  "datos": { "mensaje": "Comercio no encontrado" }
//}
//```
//
//---
//
//### Caso 3 — Id no numérico
//**Request:** `GET /api/comercios/abc`
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El id del comercio debe ser un número válido" }
//}
//```
//
//---
//
//## GET /api/comercios/:id/productos
//
//Query params opcionales: `categoria`, `buscar`, `pagina`, `limite`.
//
//### Caso 1 — Productos de un comercio
//**Request:** `GET /api/comercios/1/productos`
//**Respuesta esperada:** `200 OK` con los 3 productos de Ferretería Central
//(Martillo, Taladro, Caja de tornillos) y `datos.comercio` con el nombre.
//
//---
//
//### Caso 2 — Filtro por categoría
//**Request:** `GET /api/comercios/1/productos?categoria=Herramientas`
//**Respuesta esperada:** `200 OK` con 2 productos (Martillo y Taladro).
//
//---
//
//### Caso 3 — Comercio inexistente
//**Request:** `GET /api/comercios/999/productos`
//**Respuesta esperada:** `404 Not Found`, `"Comercio no encontrado"`.
//> Se distingue a propósito de un comercio real que todavía no cargó productos:
//> ese devuelve `200` con `productos: []`.
//
//---
//---
//
//# CU04 — Buscar productos (público, sin token)
//
//## GET /api/productos
//
//Query params opcionales: `buscar` (nombre o descripción), `categoria`, `comercioId`,
//`precioMin`, `precioMax`, `pagina`, `limite`.
//
//### Caso 1 — Búsqueda por nombre
//**Request:** `GET /api/productos?buscar=taladro`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "productos": [
//      {
//        "id": 2,
//        "comercio_id": 1,
//        "nombre": "Taladro percutor 650W",
//        "descripcion": "Taladro percutor con maletín y accesorios",
//        "categoria": "Herramientas",
//        "precio": "32000.00",
//        "stock": 10,
//        "comercio_nombre": "Ferretería Central",
//        "comercio_categoria": "Ferretería"
//      }
//    ],
//    "paginacion": { "pagina": 1, "limite": 20, "total": 1 }
//  }
//}
//```
//> Cada resultado trae el nombre del comercio, así el frontend no necesita otra request.
//
//---
//
//### Caso 2 — Búsqueda por descripción
//**Request:** `GET /api/productos?buscar=maletín`
//**Respuesta esperada:** `200 OK` con el Taladro. El `buscar` aplica LIKE sobre
//`nombre` **y** `descripcion`.
//
//---
//
//### Caso 3 — Filtro por categoría
//**Request:** `GET /api/productos?categoria=Papelería`
//**Respuesta esperada:** `200 OK` con 2 productos (Cuaderno y Cartuchera).
//
//---
//
//### Caso 4 — Filtro por rango de precio
//**Request:** `GET /api/productos?precioMin=5000`
//**Respuesta esperada:** `200 OK` con 2 productos (Taladro 32000 y Cartuchera 5300).
//**Request:** `GET /api/productos?precioMin=1000&precioMax=5000`
//**Respuesta esperada:** `200 OK` con 3 productos (Martillo 4500, Tornillos 1200, Cuaderno 2100).
//
//---
//
//### Caso 5 — Filtro por comercio
//**Request:** `GET /api/productos?comercioId=2`
//**Respuesta esperada:** `200 OK` con los 2 productos de la Librería.
//
//---
//
//### Caso 6 — Parámetro numérico inválido
//**Request:** `GET /api/productos?precioMin=hola`
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El precioMin debe ser un número" }
//}
//```
//
//---
//
//### Caso 7 — Sin resultados
//**Request:** `GET /api/productos?buscar=zzzzz`
//**Respuesta esperada:** `200 OK` con `productos: []` y `total: 0` (no es un 404).
//
//---
//
//## GET /api/productos/:id
//
//### Caso 1 — Detalle
//**Request:** `GET /api/productos/1`
//**Respuesta esperada:** `200 OK` con el producto más `comercio_nombre`,
//`comercio_direccion` y `comercio_horario`.
//
//---
//
//### Caso 2 — Producto dado de baja
//**Precondición:** `UPDATE productos SET activo = FALSE WHERE id = 1;`
//**Request:** `GET /api/productos/1`
//**Respuesta esperada:** `404 Not Found`, `"Producto no encontrado"`.
//**Para revertir:** `UPDATE productos SET activo = TRUE WHERE id = 1;`
//
//---
//---
//
//# CU13 a CU16 — Gestión del catálogo (requiere token de comercio)
//
//Todos los endpoints de esta sección llevan el header `Authorization: <token>`.
//
//## POST /api/productos
//
//### Body (raw JSON)
//```json
//{
//  "nombre": "Destornillador Phillips",
//  "descripcion": "Destornillador punta cruz mango ergonómico",
//  "categoria": "Herramientas",
//  "precio": 3200,
//  "stock": 15
//}
//```
//> `descripcion` y `stock` son opcionales (`stock` arranca en 0 si no se manda).
//> El `comercio_id` **no** se manda: sale del token. Si lo incluís en el body, se ignora.
//
//### Caso 1 — Alta exitosa
//**Precondición:** token de Ferretería Central, sin otro producto activo con ese nombre.
//**Respuesta esperada:** `201 Created`
//```json
//{
//  "codigo": 201,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Producto creado exitosamente",
//    "producto": {
//      "id": 6,
//      "comercio_id": 1,
//      "nombre": "Destornillador Phillips",
//      "descripcion": "Destornillador punta cruz mango ergonómico",
//      "categoria": "Herramientas",
//      "precio": "3200.00",
//      "stock": 15,
//      "activo": 1,
//      "created_at": "...",
//      "updated_at": "..."
//    }
//  }
//}
//```
//**Verificación en base:** una fila nueva en `productos` con `comercio_id = 1`, y una fila
//en `auditoria_productos` con `accion = 'INSERT'`, `usuario_id = 3` y `administrador_id = NULL`.
//
//---
//
//### Caso 2 — Intento de crear producto para otro comercio
//**Body:** el mismo del Caso 1 pero agregando `"comercio_id": 2`.
//**Respuesta esperada:** `201 Created`, con `datos.producto.comercio_id = 1`.
//> El `comercio_id` del body se ignora por completo. Es la validación que impide que un
//> comercio cargue productos en el catálogo de otro.
//
//---
//
//### Caso 3 — Nombre duplicado
//**Precondición:** repetir el Caso 1 con el mismo `nombre`.
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "Ya tenés un producto activo con ese nombre" }
//}
//```
//> El chequeo es por comercio: la Librería sí puede tener un producto con ese mismo nombre.
//> Solo cuenta contra productos `activo = TRUE`.
//
//---
//
//### Caso 4 — Campo obligatorio faltante
//**Body:** omitir `nombre`.
//**Respuesta esperada:** `400 Bad Request`, `"El nombre del producto es obligatorio"`.
//**Body:** omitir `categoria` → `"La categoría es obligatoria"`.
//**Body:** omitir `precio` → `"El precio debe ser un número"`.
//
//---
//
//### Caso 5 — Campo vacío o solo espacios
//**Body:** `"nombre": "   "`
//**Respuesta esperada:** `400 Bad Request`, `"El nombre del producto es obligatorio"`.
//
//---
//
//### Caso 6 — Precio inválido
//| Body | Respuesta | `datos.mensaje` |
//|---|---|---|
//| `"precio": 0` | `400` | `"El precio debe ser mayor a 0"` |
//| `"precio": -50` | `400` | `"El precio debe ser mayor a 0"` |
//| `"precio": "abc"` | `400` | `"El precio debe ser un número"` |
//| `"precio": 100000000` | `400` | `"El precio no puede superar 99999999.99"` |
//> El tope sale de que la columna es `DECIMAL(10,2)`.
//
//---
//
//### Caso 7 — Stock inválido
//| Body | Respuesta | `datos.mensaje` |
//|---|---|---|
//| `"stock": -3` | `400` | `"El stock no puede ser negativo"` |
//| `"stock": 2.5` | `400` | `"El stock debe ser un número entero"` |
//| `"stock": "muchos"` | `400` | `"El stock debe ser un número entero"` |
//
//---
//
//### Caso 8 — Sin token
//**Request:** el Caso 1 sin el header `Authorization`.
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{ "codigo": 401, "estado": "Token no proporcionado", "datos": null }
//```
//
//---
//
//### Caso 9 — Token inválido o vencido
//**Request:** header `Authorization: abc.def.ghi`
//**Respuesta esperada:** `401 Unauthorized`
//```json
//{ "codigo": 401, "estado": "Token inválido o expirado", "datos": null }
//```
//
//---
//
//### Caso 10 — Rol equivocado
//**Precondición:** loguearse con `juan.perez@test.com` (rol `cliente`) y usar ese token.
//**Respuesta esperada:** `403 Forbidden`
//```json
//{ "codigo": 403, "estado": "No tenés permisos para acceder a este recurso", "datos": null }
//```
//
//---
//
//## PUT /api/productos/:id
//
//Actualización completa. Todos los campos de validación son obligatorios (`nombre`,
//`categoria`, `precio`, `stock`); `descripcion` y `activo` son opcionales.
//
//### Body (raw JSON)
//```json
//{
//  "nombre": "Destornillador Phillips reforzado",
//  "descripcion": "Punta cruz, mango antideslizante",
//  "categoria": "Herramientas",
//  "precio": 3900,
//  "stock": 20
//}
//```
//
//### Caso 1 — Edición exitosa
//**Respuesta esperada:** `200 OK` con `datos.mensaje = "Producto actualizado exitosamente"`
//y el producto completo en `datos.producto`.
//**Verificación en base:** fila nueva en `auditoria_productos` con `accion = 'UPDATE'`.
//
//---
//
//### Caso 2 — Producto de otro comercio
//**Precondición:** token de Ferretería Central (comercio 1), pedir el producto 4 (Librería).
//**Request:** `PUT /api/productos/4`
//**Respuesta esperada:** `403 Forbidden`
//```json
//{
//  "codigo": 403,
//  "estado": "error",
//  "datos": { "mensaje": "El producto no pertenece a tu comercio" }
//}
//```
//**Verificación en base:** `SELECT * FROM auditoria_productos WHERE producto_id = 4;` no
//debe tener filas nuevas — el rechazo pasa antes de abrir la transacción.
//
//---
//
//### Caso 3 — Producto inexistente
//**Request:** `PUT /api/productos/9999`
//**Respuesta esperada:** `404 Not Found`, `"Producto no encontrado"`.
//
//---
//
//### Caso 4 — Nombre repetido de otro producto propio
//**Precondición:** poner en `nombre` el nombre de otro producto activo del mismo comercio.
//**Respuesta esperada:** `400 Bad Request`, `"Ya tenés otro producto activo con ese nombre"`.
//> Mandar el mismo nombre que ya tiene el producto que se está editando **sí** funciona:
//> el chequeo excluye al propio producto.
//
//---
//
//## PATCH /api/productos/:id/stock — CU13, CU14
//
//Acepta una de dos formas, nunca las dos juntas:
//
//| Body | Efecto |
//|---|---|
//| `{ "stock": 30 }` | Fija el stock en 30 (valor absoluto) |
//| `{ "ajuste": -5 }` | Descuenta 5 del stock actual |
//| `{ "ajuste": 12 }` | Suma 12 al stock actual |
//
//### Caso 1 — Fijar stock absoluto
//**Precondición:** producto 1 (Martillo) con `stock = 25`.
//**Body:** `{ "stock": 30 }`
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Stock actualizado exitosamente",
//    "producto": { "id": 1, "stockAnterior": 25, "stock": 30 }
//  }
//}
//```
//**Verificación en base:** `SELECT stock FROM productos WHERE id = 1;` → 30, más una fila
//`UPDATE` en `auditoria_productos`.
//**Para revertir:** `UPDATE productos SET stock = 25 WHERE id = 1;`
//
//---
//
//### Caso 2 — Ajuste negativo (descuento de stock)
//**Body:** `{ "ajuste": -5 }` sobre un producto con stock 30.
//**Respuesta esperada:** `200 OK` con `"stockAnterior": 30, "stock": 25`.
//
//---
//
//### Caso 3 — Ajuste que deja el stock en negativo
//**Body:** `{ "ajuste": -100 }` sobre un producto con stock 25.
//**Respuesta esperada:** `400 Bad Request`
//```json
//{
//  "codigo": 400,
//  "estado": "error",
//  "datos": { "mensaje": "El ajuste deja el stock en negativo. Stock disponible: 25" }
//}
//```
//**Verificación en base:** el stock no cambió y no se agregó fila de auditoría.
//
//---
//
//### Caso 4 — Los dos campos a la vez
//**Body:** `{ "stock": 10, "ajuste": 5 }`
//**Respuesta esperada:** `400 Bad Request`, `"Enviá stock o ajuste, no los dos a la vez"`.
//
//---
//
//### Caso 5 — Body vacío
//**Body:** `{}`
//**Respuesta esperada:** `400 Bad Request`,
//`"Tenés que enviar stock (valor nuevo) o ajuste (cantidad a sumar o restar)"`.
//
//---
//
//### Caso 6 — Ajuste no entero
//**Body:** `{ "ajuste": 2.5 }`
//**Respuesta esperada:** `400 Bad Request`, `"El ajuste debe ser un número entero"`.
//
//---
//
//## PATCH /api/productos/:id/precio — CU15, CU16
//
//### Body (raw JSON)
//```json
//{ "precio": 5200 }
//```
//
//### Caso 1 — Cambio de precio exitoso
//**Precondición:** producto 1 (Martillo) con `precio = 4500.00`.
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Precio actualizado exitosamente",
//    "producto": { "id": 1, "precioAnterior": "4500.00", "precio": "5200.00" }
//  }
//}
//```
//**Verificación en base:** `SELECT precio FROM productos WHERE id = 1;` → `5200.00`, más
//una fila `UPDATE` en `auditoria_productos`.
//**Para revertir:** `UPDATE productos SET precio = 4500.00 WHERE id = 1;`
//
//---
//
//### Caso 2 — Precio inválido
//Mismos casos que el Caso 6 del POST: `0`, negativo, texto y mayor a `99999999.99`
//devuelven `400` sin tocar la base.
//
//---
//
//### Caso 3 — Precio de un producto ajeno
//**Precondición:** token de Ferretería, `PATCH /api/productos/4/precio`.
//**Respuesta esperada:** `403 Forbidden`, `"El producto no pertenece a tu comercio"`.
//
//---
//
//## DELETE /api/productos/:id
//
//Es una **baja lógica**: pone `activo = FALSE`, no borra la fila.
//Dos motivos: `items_pedido.producto_id` es `ON DELETE RESTRICT` (un producto que ya está
//en un pedido no se puede borrar) y `auditoria_productos.producto_id` es `ON DELETE CASCADE`
//(un borrado físico se llevaría puesta su propia auditoría).
//
//### Caso 1 — Baja exitosa
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": { "mensaje": "Producto dado de baja exitosamente" }
//}
//```
//**Verificación en base:** `SELECT activo FROM productos WHERE id = <id>;` → `0`.
//La fila **sigue existiendo**, y hay una fila `DELETE` en `auditoria_productos`.
//**Verificación por API:** `GET /api/productos/<id>` ahora devuelve `404`, y el producto
//desaparece de `GET /api/comercios/1/productos`.
//**Para revertir:** `UPDATE productos SET activo = TRUE WHERE id = <id>;`
//
//---
//
//### Caso 2 — Baja repetida
//**Precondición:** repetir el Caso 1 sobre el mismo producto.
//**Respuesta esperada:** `400 Bad Request`, `"El producto ya está dado de baja"`.
//
//---
//
//### Caso 3 — Baja de un producto ajeno
//**Respuesta esperada:** `403 Forbidden`, `"El producto no pertenece a tu comercio"`.
//
//---
//
//## GET /api/productos/:id/auditoria
//
//Trazabilidad de los cambios de un producto propio. Requiere token de comercio.
//
//### Caso 1 — Historial completo
//**Precondición:** haber corrido los casos anteriores sobre un producto.
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "auditoria": [
//      {
//        "id": 7,
//        "producto_id": 6,
//        "accion": "DELETE",
//        "fecha": "2026-09-02",
//        "hora": "18:52:29",
//        "usuario_id": 3,
//        "usuario_nombre": "Ferretería Central",
//        "usuario_rol": "comercio",
//        "administrador_id": null
//      }
//    ]
//  }
//}
//```
//> Ordenado del cambio más nuevo al más viejo.
//> `administrador_id` queda en `NULL` cuando el cambio lo hace un comercio; se va a usar
//> desde el panel de administración (semana 13). El actor real siempre está en `usuario_id`.
//
//---
//
//### Caso 2 — Auditoría de un producto ajeno
//**Respuesta esperada:** `403 Forbidden`, `"El producto no pertenece a tu comercio"`.
//
//---
//
//## Verificación general de la auditoría
//
//Después de correr toda la guía, en phpMyAdmin:
//
//```sql
//SELECT a.id, a.producto_id, a.accion, a.fecha, a.hora,
//       a.usuario_id, u.nombre, u.rol, a.administrador_id
//FROM auditoria_productos a
//LEFT JOIN usuarios u ON a.usuario_id = u.id
//ORDER BY a.id;
//```
//
//Tiene que haber **una fila por cada escritura** (alta, edición, cambio de stock, cambio de
//precio y baja), con la `accion` correcta, `fecha` y `hora` pobladas, y el `usuario_id` del
//comercio que hizo el cambio.
//
//---
//
//### Caso — Error interno y rollback (para verificar el catch y la transacción)
//**Cómo forzarlo:** apagar MySQL/XAMPP y repetir cualquier alta.
//**Respuesta esperada:** `500 Internal Server Error`
//```json
//{
//  "codigo": 500,
//  "estado": "error",
//  "datos": { "mensaje": "Error interno del servidor" }
//}
//```
//**Verificación en base (al volver a prender MySQL):** no puede haber quedado un producto
//sin su fila de auditoría, ni una fila de auditoría sin su producto. Cada escritura corre
//dentro de una transacción: se guardan las dos cosas o ninguna.
//
//---
//
//## Checklist rápido antes de correr esta guía
//
//- [ ] `npm install` corrido.
//- [ ] Script `aTuPuerta.sql` **re-importado** en phpMyAdmin (trae la columna
//      `auditoria_productos.usuario_id` y los hashes bcrypt de los usuarios de prueba).
//- [ ] `.env` creado a partir de `.env.example`, con `DATABASE=aTuPuerta` y la contraseña
//      de MySQL que corresponda a tu instalación (en XAMPP por defecto `root` va sin contraseña).
//- [ ] Servidor corriendo (`npm run dev`) y `GET /health` respondiendo `200`.
//- [ ] Login de comercio hecho y token copiado en el header `Authorization` (sin `Bearer `).
