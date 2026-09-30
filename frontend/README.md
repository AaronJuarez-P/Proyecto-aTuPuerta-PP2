# ATuPuerta — Frontend

React con JavaScript y CSS. Desarrollo en `ramajero`, separado del backend.

## Ejecutar

Requiere Node.js compatible con Vite 8 (20.19+ o 22.12+). Se utilizó Node 24.16.
Desde la raíz del repositorio:

```sh
cd frontend
npm install
npm run dev
```

Abrir la URL que imprime Vite. Para detenerlo: Ctrl+C. En Windows, si PowerShell bloquea npm.ps1, utilizar `npm.cmd` en lugar de `npm`.

```sh
npm run lint
npm run build
npm run preview
```

- `lint`: revisión estática con Oxlint.
- `build`: compilación de producción en `dist/`.
- `preview`: servidor local para revisar esa compilación; no es un servidor de producción.
- `npm ci`: instala exactamente las dependencias del lockfile en futuras instalaciones.

## Inicialización utilizada

```sh
npm create vite@latest frontend -- --template react --no-interactive
cd frontend
npm install
```

El primer comando se ejecutó desde la raíz. No repetirlo sobre el proyecto existente. El inicializador utilizado fue create-vite 9.2.0; las versiones resueltas se registran en package-lock.json.

## Estructura

```text
src/
  pages/
    Landing/
      Landing.jsx
      Landing.css
  components/
    Header/
      Header.jsx
      Header.css
    Footer/
      Footer.jsx
      Footer.css
  App.jsx
  main.jsx
  index.css
```

Cada nueva pantalla tendrá su carpeta dentro de `pages/`, con componente y CSS propios. Las secciones internas de la Landing no son pantallas independientes. Header y Footer pueden reutilizarse.

## Alcance

Landing de presentación basada en la POC: hero, rubros, cómo funciona, roles públicos y pie de página. Incluye navegación por anclas, menú móvil, foco visible, enlace para saltar al contenido y respeto de movimiento reducido.

Se conservaron paleta verde/naranja, Inter/Sora, degradados y tarjetas de la POC. Las fuentes utilizan Google Fonts con alternativa sans-serif. Se reemplazaron cifras ficticias y el porcentaje de comisión sin contrato confirmado por información descriptiva.

Catálogo, carrito, autenticación y paneles quedan para sus entregas. Los enlaces actuales tienen destinos dentro de la Landing: el acceso al login se incorporará junto con esa pantalla. No se simulan registros, pagos ni pedidos. Las tres tarjetas públicas siguen la POC; administrador continúa siendo un rol del sistema sin registro público.

No consume API ni necesita variables de entorno. No se agregaron librerías de rutas, HTTP o componentes. No se modificó el backend.
