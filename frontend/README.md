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
  components/   Header, Footer, Layout, RutaProtegida, MapaSeguimiento, FormularioReclamo
                y Comunes (Cargando, MensajeError, EstadoVacio, EstadoBadge, Paginacion,
                Modal, Confirmacion)
  utils/        formato (precios y fechas), estados, roles, categorías, notificaciones,
                push y polilínea
  pages/        una carpeta por pantalla, con su .jsx y su .css
public/
  sw.js         service worker de las notificaciones push del navegador
```

Cada página tiene su propio CSS, con las reglas acotadas a su clase raíz
(`.pedido-page .pedido-card`) para que no choquen entre pantallas. Lo compartido (botones,
tarjetas, formularios, tablas, pestañas, modales y los cartelitos de estado) está en
`components/Comunes/Comunes.css`.

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
- **Push**: el botón para activar las notificaciones del navegador aparece solo si el backend
  tiene `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. Las ventanas de incógnito no las permiten.
