# ATuPuerta — Frontend

React 19 con Vite. Consume la API REST del backend (`backend/`) y su canal de Socket.IO para
el seguimiento en vivo. No guarda datos propios: todo lo que muestra viene de la API.

## Ejecutar

Requiere Node.js 22.22 o más nuevo (lo pide React Router 8); se usó Node 24. El backend
tiene que estar corriendo: ver "Cómo levantar todo" en el README de la raíz.

```sh
cd frontend
npm install
npm run dev
```

Abrir la URL que imprime Vite (`http://localhost:5173`). Para detenerlo: Ctrl+C. En Windows,
si PowerShell bloquea `npm.ps1`, usar `npm.cmd` en lugar de `npm`.

```sh
npm run lint      # revisión estática con Oxlint
npm run build     # compilación de producción en dist/
npm run preview   # sirve dist/ para revisarla; no es un servidor de producción
```

## Variables de entorno

Se copian de `.env.example` a `.env`, que no se sube al repositorio. Vite las lee al
arrancar: si se cambian, hay que reiniciar `npm run dev`.

| Variable | Por defecto | Para qué |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000/api` | URL base de la API. El socket se conecta al mismo servidor, sin el `/api` |

Del lado del backend, `CORS_ORIGEN` tiene que incluir el origen del front
(`http://localhost:5173`, que es el valor de su `.env.example`).

## Estructura

```text
src/
  api/          una función por endpoint, agrupadas por módulo
    cliente.js    fetch con el token, el sobre { codigo, estado, datos } y los errores
    tiempoReal.js Socket.IO: seguir un pedido en vivo
  context/      sesión, carrito (contador del header), notificaciones (campanita) y avisos
  hooks/        useCarga (pedir datos con estado de carga y error) y useFiltrosUrl
                (filtros de los listados guardados en la URL)
  assets/       marca/: el isotipo en SVG, el pin y las líneas de velocidad sueltos (los
                usa el CSS como máscara) y el logo original en PNG (solo de referencia, la
                app no lo usa). ilustraciones/: la de la página 404
  components/   Header, Footer, Layout, Marca (isotipo y nombre), RutaProtegida,
                MapaSeguimiento, FormularioReclamo, VerificarCorreo (el paso del código
                al registrarse) y Comunes (Cargando, MensajeError, EstadoVacio,
                IlustracionVacia, MiniaturaRubro, IconoRubro, EstadoBadge, Paginacion,
                Modal, Confirmacion)
  utils/        formato (precios y fechas), estados, roles, categorías, notificaciones,
                push y polilínea
  pages/        una carpeta por pantalla, con su .jsx y su .css
public/
  sw.js         service worker de las notificaciones push del navegador
  favicon.svg, icon-192.png, icon-512.png y apple-touch-icon.png: el isotipo sobre el
                fondo oscuro de la marca (los PNG salen de renderizar el SVG)
```

Cada página tiene su propio CSS, con las reglas acotadas a su clase raíz
(`.pedido-page .pedido-card`) para que no choquen entre pantallas. Lo compartido (botones,
tarjetas, formularios, tablas, pestañas, modales y los cartelitos de estado) está en
`components/Comunes/Comunes.css`. Los colores, la tinta y las letras son variables de
`index.css` (`--brand`, `--brand-menta`, `--ink`, `--display`...): no se escriben a mano.

Los íconos son de `lucide-react`, todos con el mismo trazo. Los que dependen de un dato salen
de `utils/categorias.js` (el rubro) y `utils/notificaciones.js` (el tipo de aviso), que guardan
el componente; `EstadoVacio` también recibe el componente (`icono={Package}`). lucide los
oculta para los lectores de pantalla: un botón que solo tiene un ícono lleva `aria-label`.

## Rutas

| Ruta | Pantalla | Quién |
|---|---|---|
| `/` | Landing | Todos |
| `/comercios`, `/comercios/:id` | Catálogo con filtros y búsqueda de productos; comercio con sus productos | Todos |
| `/login`, `/registro`, `/registro/comercio`, `/registro/repartidor` | Login y registros | Todos |
| `/carrito`, `/checkout` | Carrito y confirmación (un pedido por comercio) | Cliente |
| `/pedidos`, `/pedidos/:id` | Historial y detalle: pago, seguimiento en vivo con mapa, código de entrega, repetir, reclamar | Cliente |
| `/perfil`, `/notificaciones` | Perfil, contraseña, baja de la cuenta y notificaciones | Cualquier sesión |
| `/reclamos`, `/reclamos/:id` | Reclamos propios | Cliente, comercio y repartidor |
| `/comercio`, `/comercio/ventas/:id`, `/comercio/productos` | Pedidos para preparar, ventas y gestión de productos | Comercio |
| `/repartidor` | Servicio, pedidos disponibles, entrega en curso e historial | Repartidor |
| `/admin` | Tablero | Administrador |
| `/admin/pedidos`, `/admin/pedidos/:id` | Supervisión y cancelación de pedidos | Administrador |
| `/admin/usuarios`, `/admin/usuarios/:id` | Gestión de cuentas y comercios | Administrador |
| `/admin/reclamos`, `/admin/reclamos/:id` | Cola de reclamos | Administrador |
| `/admin/auditoria` | Auditoría de pedidos y de productos | Administrador |

Las URLs que mandan las notificaciones del backend (`/cliente/pedidos/:id`,
`/comercio/pedidos/:id`, `/repartidor/pedidos`) redirigen a la pantalla que corresponde.
Una ruta protegida sin sesión manda al login y, después de entrar, vuelve a donde estaba.

## Verificación del correo

Registrarse como cliente tiene dos pasos: el formulario y el código de 6 dígitos que llega
al correo. La cuenta se crea recién con el código.

- El paso "Verificá tu correo" **no tiene ruta propia**: es el componente
  `VerificarCorreo`, que `/registro` muestra en lugar del formulario. El backend pide la
  contraseña junto con el código, y así sale de la memoria de la pantalla en vez de
  viajar por la URL o quedar en el historial.
- Quien se registró y cerró la pestaña antes de ingresar el código lo retoma desde
  `/login`: al entrar como cliente con su correo y su contraseña, el backend avisa que
  falta verificar y el login muestra el mismo componente.
- "Reenviar código" se habilita cuando pasa la espera que indica el backend (60 segundos).
  "Usar otro correo" vuelve al formulario con los datos cargados.
- Si el código es correcto pero falla el inicio de sesión que viene después, la cuenta ya
  quedó creada: el botón pasa a reintentar solo el ingreso.
- El front no se configura: si la respuesta del registro no trae `verificacion_pendiente`
  (backend con `EMAIL_MODO=off`), entra directo como antes.

## Sesión

- Se guarda en `localStorage` como `sesion = { token, usuario }` y se confirma contra
  `GET /perfil` cada vez que se abre la app.
- El backend admite una sola sesión por cuenta. Si la cuenta entra con otro rol, o un
  administrador la suspende, la próxima respuesta de la API la invalida y el front vuelve al
  login explicando el motivo.
- Al cerrar sesión como comercio o repartidor se le avisa al backend, que la libera.
- En desarrollo (`npm run dev`) el login muestra las cuentas de la semilla para entrar con un
  clic. En el build de producción esa lista no existe.

## Modos de prueba del backend

- **Pago (`MP_MODO=mock`)**: el detalle del pedido muestra un simulador para aprobar o
  rechazar el pago. Con `sandbox`, el front redirige a MercadoPago, y el backend devuelve al
  navegador al pedido si tiene `FRONT_URL` en su `.env`.
- **Mapas (`MAPS_MODO=mock`)**: no llega una ruta real y el mapa dibuja una línea recta
  punteada. El panel del repartidor muestra "Simular avance" para la demo sin GPS (también
  aparece siempre en desarrollo). Con `MAPS_MODO=real` el mapa dibuja la ruta de Mapbox y
  "Simular avance" avanza por esas mismas calles.
- **Correo (`EMAIL_MODO=mock`)**: el backend no manda correos y devuelve el código en la
  respuesta, así que el paso "Verificá tu correo" lo muestra en un recuadro de modo de
  prueba. Con `off` ese paso no aparece: el registro entra directo. Con `smtp` el código
  llega por correo y no se muestra.
- **Push**: el botón para activar las notificaciones del navegador aparece solo si el backend
  tiene `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. Las ventanas de incógnito no las permiten.
