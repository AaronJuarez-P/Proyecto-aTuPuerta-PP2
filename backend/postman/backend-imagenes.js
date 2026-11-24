//# Guía de pruebas Postman — Logo del comercio y fotos de los productos
//
//Cubre la carga de imágenes: el logo del comercio (al registrarlo y desde su perfil) y la
//foto de cada producto (al darlo de alta y después). En la colección están en la carpeta
//"15 · Imágenes (logo y fotos)", que se corre en orden y crea su propia cuenta.
//
//Base URL local: `http://localhost:4000/api`. Las imágenes se sirven **fuera** de `/api`:
//`http://localhost:4000/imagenes/<nombre>`.
//
//Las respuestas siguen el formato uniforme del proyecto:
//```json
//{ "codigo": 0, "estado": "", "datos": {} }
//```
//
//---
//
//## Cómo mandar una imagen desde Postman
//
//1. Body → **form-data**.
//2. Una fila con la clave `imagen` y, en el desplegable que aparece a la derecha de la
//   clave, **File** en vez de Text. Después, **Select Files** y elegir un JPG, PNG o WebP.
//   En `postman/archivos/logo-prueba.png` hay uno de prueba.
//3. Los demás campos, si el endpoint los pide, van como filas de tipo Text.
//4. **No** agregar el header `Content-Type` a mano: Postman lo arma solo, con el
//   "boundary" que separa las partes del formulario. Si queda el `application/json` de
//   otro request, el backend no encuentra la imagen.
//
//> Postman avisa cuando el archivo está fuera de su carpeta de trabajo (Settings → General
//> → Working directory). Para correr la carpeta 15 tal cual, se puede poner ahí la carpeta
//> `backend/postman`, o volver a elegir el archivo en cada request. Con newman:
//> `--working-dir backend/postman`.
//
//Para ver una imagen, abrir en el navegador `http://localhost:4000/imagenes/<nombre>` con el
//`logo` o la `imagen` que devolvió la respuesta. La colección no tiene un request para eso:
//su test general espera el formato `{ codigo, estado, datos }`, y una imagen no lo tiene.
//
//---
//
//## Reglas que valen para todos
//
//- **Tipos:** JPEG, PNG y WebP. El backend los reconoce por los primeros bytes del archivo,
//  no por la extensión ni por el `Content-Type`: un texto renombrado a `.png` da `400`. SVG
//  no se acepta, porque es texto y puede llevar scripts.
//- **Tope:** `IMAGENES_MAX_MB`, 2 MB por defecto. Pasarse da `413`.
//- **Una sola imagen por pedido**, en el campo `imagen`. Con otro nombre de campo, o con dos
//  archivos, da `400`.
//- **El nombre lo arma el backend:** `comercio-<uuid>.png`, `producto-<uuid>.webp`. Cambiar
//  la imagen cambia el nombre, y el archivo anterior se borra: su URL pasa a dar `404`.
//- **Dónde quedan:** en `backend/uploads/` (`IMAGENES_CARPETA`), que no se sube al repo. Si
//  reimportás la base, podés vaciar esa carpeta.
//
//---
//---
//
//# Logo del comercio
//
//## POST /api/registroComercio, con logo
//
//El registro de comercio de siempre, pero como form-data: todos los campos como Text
//(`nombre`, `email`, `contrasena`, `telefono`, `cuit_cuil`, `categoria`, `direccion`,
//`horario_atencion`) y, además, `imagen` como File.
//
//### Caso 1 — Registro con logo
//**Precondición:** una cuenta de cliente sin comercio (la carpeta 15 crea la de Rosa,
//`rosa.imagenes@test.com`) y un CUIT válido que no esté usado, por ejemplo `20123456786`.
//**Respuesta esperada:** `201 Created`, con `"Comercio registrado exitosamente ..."`.
//**Verificación en base:**
//`SELECT logo FROM comercios WHERE cuit_cuil = '20123456786';` trae `comercio-<uuid>.png`, y
//ese archivo está en `backend/uploads/`.
//
//### Caso 2 — Sin logo
//El mismo pedido sin la fila `imagen`, o como JSON (raw), registra el comercio con
//`logo = NULL`: el logo es opcional.
//
//### Caso 3 — Un registro que falla no deja archivos
//**Request:** repetir el Caso 1.
//**Respuesta esperada:** `400 Bad Request`, "El comercio ya está registrado".
//> El logo de este segundo intento se escribió en el disco antes de abrir la transacción,
//> y se borra solo cuando el registro no se confirma: en `backend/uploads/` no queda un
//> archivo de más. Lo mismo pasa con una contraseña incorrecta (`401`).
//
//---
//
//## PUT /api/comercio/logo
//
//Header `Authorization` con un token de comercio. Body: form-data con `imagen` (File).
//
//### Caso 1 — Cambiar el logo
//**Respuesta esperada:** `200 OK`
//```json
//{
//  "codigo": 200,
//  "estado": "exito",
//  "datos": {
//    "mensaje": "Logo del comercio actualizado",
//    "comercio": {
//      "nombre": "Vivero de Rosa",
//      "logo": "comercio-1f0c2b6e-....png",
//      "...": "el resto del perfil, igual que GET /api/comercio/perfil"
//    }
//  }
//}
//```
//El archivo del logo anterior se borra antes de que llegue la respuesta.
//
//### Caso 2 — Sin archivo
//Body vacío, o un JSON: `400`, "Falta la imagen: mandala en el campo imagen, como
//multipart/form-data".
//
//### Caso 3 — Un archivo que no es una imagen
//Un `.txt` renombrado a `.png`: `400`, "El archivo no es una imagen JPG, PNG o WebP".
//
//### Caso 4 — Más de 2 MB
//`413`, "La imagen no puede pesar más de 2 MB".
//
//### Caso 5 — Token de cliente
//`403`: el logo es del comercio de la sesión, y la sesión tiene que ser de comercio.
//
//---
//
//## DELETE /api/comercio/logo
//
//### Caso 1 — Quitar el logo
//`200`, "Quitaste el logo del comercio", con `comercio.logo = null`. El front vuelve a
//mostrar el ícono del rubro.
//
//### Caso 2 — Un comercio sin logo
//`400`, "Tu comercio no tiene logo".
//
//---
//---
//
//# Foto de los productos
//
//## POST /api/productos, con foto
//
//Header `Authorization` con un token de comercio. Body: form-data con `nombre`,
//`descripcion`, `categoria`, `precio` y `stock` como Text, e `imagen` como File.
//
//### Caso 1 — Alta con foto
//**Respuesta esperada:** `201 Created`, con `datos.producto.imagen = "producto-<uuid>.png"`.
//> `precio` y `stock` llegan como texto (`"1500"`) y se validan igual que en JSON.
//**Verificación en base:** una sola fila nueva en `auditoria_productos`, con `accion =
//'INSERT'`: la foto entra en el mismo `INSERT` que el producto.
//
//### Caso 2 — Sin foto
//Como siempre, por JSON: `201` con `datos.producto.imagen = null`.
//
//---
//
//## PUT /api/productos/:id/imagen
//
//### Caso 1 — Cambiar la foto
//**Respuesta esperada:** `200 OK`, "Imagen del producto actualizada", con el producto
//completo en `datos.producto`. La foto anterior se borra.
//**Verificación en base:** una fila nueva en `auditoria_productos` con `accion = 'UPDATE'`.
//
//### Caso 2 — Producto de otro comercio
//**Precondición:** token de Ferretería Central, pedir un producto de otro comercio.
//**Respuesta esperada:** `403`, "El producto no pertenece a tu comercio".
//> El dueño se revisa antes de escribir nada en el disco.
//
//### Caso 3 — Producto que no existe
//`404`, "Producto no encontrado".
//
//---
//
//## DELETE /api/productos/:id/imagen
//
//### Caso 1 — Quitar la foto
//`200`, "Quitaste la imagen del producto", con `datos.producto.imagen = null` y una fila
//`UPDATE` en `auditoria_productos`.
//
//### Caso 2 — Un producto sin foto
//`400`, "El producto no tiene imagen".
//
//---
//---
//
//# Dónde aparecen
//
//- `logo`: `GET /api/comercios`, `GET /api/comercios/:id` y `GET /api/comercio/perfil`.
//- `imagen`, en cada producto: `GET /api/comercios/:id/productos`, `GET /api/productos`,
//  `GET /api/productos/:id`, `GET /api/comercio/productos`, `GET /api/carrito/listar` y el
//  detalle de un pedido del cliente (`GET /api/pedidos/:id`).
//
//# Eliminar la cuenta
//
//`DELETE /api/perfil` (la propia) y `DELETE /api/admin/usuarios/:id` borran también el logo y
//las fotos de los productos del comercio de esa cuenta: después, sus URLs dan `404`.
//
//---
//
//## Checklist rápido
//
//- [ ] Body en form-data, `imagen` como File y sin `Content-Type` a mano.
//- [ ] La carpeta 15 en orden: crea la cuenta de Rosa, registra el vivero con logo, inicia
//      sesión y prueba el logo y las fotos. Correrla dos veces sobre la misma base falla en
//      el registro: reimportar la base o cambiar el email y el CUIT.
//- [ ] La prueba automática (`node scripts/prueba-flujos.js`) cubre todos estos casos en la
//      sección "Imágenes: logo y fotos".
