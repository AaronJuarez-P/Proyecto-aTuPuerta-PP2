# Backend — Sistema de delivery

Backend del proyecto anual Practica Profesionalizante 2. Node.js + Express + MySQL.

---

## Estructura

```
backend/
├── scripts/
│   ├── 
├── postman/
│   ├── 
│   ├── 
│   └── 
├── src/
│   ├── controllers/
│   │   ├── 
│   ├── database/
│   │   └── 
│   ├── middlewares/
│   │   └── 
│   ├── routes/
│   │   ├── 
│   ├── app.js
│   └── index.js
├── .env.example
├── .gitignore
└── package.json
```

---

## Instrucciones para ejecutar

### 1 — Base de datos

- Encender XAMPP
- Importar `scripts/` en phpMyAdmin

### 2 — Variables de entorno

Crear `.env` en la raíz de `backend/` copiando `.env.example`:

```
HOST=localhost
DATABASE=clinica
USER=root
PASSWORD=
JWT_SECRET=ClaveSecretaTP2026
JWT_EXPIRES_IN=8h
PORT=4000
```

### 3 — Instalar y correr

```bash
npm install
npm run dev
```

Servidor en `http://localhost:4000`

---

## Endpoints

### Semana 1 — Autenticación


    
### Formato de respuesta uniforme

```json
{
  "codigo": 200,
  "estado": "ok",
  "datos": { }
}
```