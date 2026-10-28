# DECISIONES: El Portero

Bitácora del asistente de ayuda de ATuPuerta: el RAG de la clase 8 de Desarrollo con IA,
adentro del backend. Cada decisión va con la evidencia que la respalda. Se completa fase
por fase.

## Entorno y base (Fase 1)

| Pieza | Qué es | Dónde corre |
|---|---|---|
| Postgres 17 + pgvector 0.8.7 | La base de los vectores: contenedor `rag-db` (imagen `pgvector/pgvector:pg17`), puerto 5433 | Mi compu, en Docker |
| `bge-m3` | El modelo de embeddings, servido por Ollama 0.40.12 | Mi compu |
| `gemini-3.5-flash-lite` | El modelo que redacta la respuesta, por la API de Google AI Studio | La nube |
| `pg` 8.23.1 | El cliente de Postgres para Node: la única librería del RAG | — |
| Node v24.22.1 | Corre todos los programas | Mi compu |

- `backend/rag/` tiene su propio `package.json`, con `pg` como única dependencia. El
  `package.json` del backend no cambia, y quien no usa el asistente no instala nada.
- `api.mjs`, `db.mjs`, `lotes.mjs`, `similitud.mjs`, `trocear.mjs`, `esquema.sql`,
  `crear-tabla.mjs` y `prueba.mjs` son una copia textual del código de la clase, sin
  cambios.
- La clave de Google vive solo en `backend/rag/.env`. Git lo ignora dos veces: por el
  `.gitignore` de `backend/` y por el de `backend/rag/`. Se sube `.env.example`, sin la
  clave.

### Ficha 1: cuántos números devuelve el modelo

`node --env-file=.env prueba.mjs`:

```
Cantidad de números de cada vector: 1024 1024
Los primeros cinco de 'hola': [ 0.0093696965, 0.022879595, -0.043145973, 0.0008707718, -0.0313651 ]
Pedidos: 1
```

- `bge-m3` devuelve **1024 números por texto**, sea "hola" o un párrafo entero. El largo
  del vector lo fija el modelo, no el texto. Lo que cambia entre un texto y otro son los
  valores.
- Los dos textos viajaron en **un solo pedido** (`embeddingsEnLote`). Así se indexa el
  corpus sin hacer un pedido por fragmento.
- El 1024 tiene que coincidir en dos lugares:
  1. `DIMENSIONES=1024` en el `.env`. `revisarDimension` (`api.mjs:48`) compara cada
     vector que llega con ese número y, si no coincide, corta con un error que lo dice.
  2. `VECTOR(1024)` en `esquema.sql:14`. Postgres rechaza guardar un vector de otro
     tamaño ("expected 1024 dimensions").

### La tabla

`node --env-file=.env crear-tabla.mjs` imprimió "Listo: extensión vector activa, tabla
fragmentos e índice HNSW creados." En la consola de `psql`, `\d fragmentos` muestra la
columna `embedding vector(1024)` y el índice `fragmentos_embedding_idx`, de tipo `hnsw`
con `vector_cosine_ops`.

## Corpus (Fase 2)

**Qué es:** el Centro de ayuda de ATuPuerta, con 35 preguntas frecuentes escritas para
quienes usan la app.

| Archivo | Para quién y qué temas | Preguntas |
|---|---|---|
| `ayuda-clientes.md` | Clientes: registrarse, pedir, carrito, pagar, estados, seguimiento, código de entrega y repetir | 10 |
| `ayuda-comercios.md` | Comercios: registro, entrar con CUIL o CUIT, productos, precio y stock, preparar y avisar que está listo, ventas y datos | 8 |
| `ayuda-repartidores.md` | Repartidores: registro, vehículo, ponerse en servicio, tomar, retirar, entregar, comisión e historial | 8 |
| `politicas-y-cuenta.md` | Todos: cancelaciones y devoluciones, reclamos, sesión, contraseña y datos, eliminar la cuenta, notificaciones e intentos fallidos | 9 |

**Por qué este corpus:** las reglas de la app existen, pero están repartidas en el código
y en el readme técnico, que nadie que usa la app va a leer. El Portero las pone al
alcance de clientes, comercios y repartidores, adentro de la misma app.

**Cómo se escribió:**
- Cada afirmación se verificó contra el código antes de escribirla. Las pantallas del
  front dan los nombres exactos de botones y secciones, y el backend da las reglas.
- Cada pregunta es un título `## ¿…?` en un renglón propio. Cada archivo arranca directo
  con la primera pregunta y no tiene otros títulos. Así la marca reconoce todas las
  partes.
- Cada respuesta se entiende sola y nombra el rol ("Como repartidor, …"). El modelo ve
  fragmentos sueltos, y hay temas que aparecen en más de un archivo.
- Hay una idea por pregunta, con las palabras que usaría la gente: "plata", "tarjeta",
  "devolución".
- Las respuestas miden entre 376 y 660 caracteres, dentro del rango pedido de 300 a
  1200.

**Diferencias con lo que suponíamos. Manda el código:**
- El login de comercio pide "CUIL / CUIT del comercio" (`Login.jsx:154`), no solo CUIL.
- El botón para repetir un pedido se llama "↻ Volver a pedir lo mismo" (`Pedido.jsx:448`).
- El registro de comercio exige una cuenta que ya exista: el backend responde "Debés
  registrarte primero como usuario antes de crear un comercio"
  (`registroComercio.controller.js:103`). `backend/readme.md` todavía dice "alta de
  usuario + comercio en una transacción": ese renglón del readme quedó desactualizado.
- Sobre el efectivo: la app ofrece solo MercadoPago (`Checkout.jsx:188`). Pero adentro
  de MercadoPago un pago puede quedar pendiente, por ejemplo uno en efectivo, y el
  backend lo contempla (`pago.controller.js:177`). Por eso el corpus dice "por ahora, el
  único medio de pago de la app es MercadoPago", con la confirmación de Santiago, y no
  afirma nada sobre el efectivo.

**"Cancelar" está en `politicas-y-cuenta.md`,** junto con la devolución del dinero. Así
el archivo de clientes no pasa de 10 preguntas.

**Temas que quedaron afuera a propósito:** costo de envío para el cliente, horarios de
la plataforma, teléfono o mail de contacto, tiempos de entrega garantizados, zona de
reparto exacta, promociones y pago en efectivo. El grupo todavía no los definió. Sirven
como preguntas cuya respuesta no está, que el Portero tiene que rechazar.

## Troceado (Fase 2)

**Marca:** `/^## .+/` en `marca.mjs`.
- `^## ` reconoce el párrafo que arranca con un título de nivel 2, es decir, cada
  pregunta.
- `.+` toma el resto del renglón, porque el punto no cruza un salto de línea. Así la
  sección guardada es la pregunta entera, por ejemplo "## ¿Cómo pago mi pedido?", y no
  solo "##". Esa sección es la que se cita como fuente (`trocear.mjs:75`).

**Ficha 2** (`node --env-file=.env probar-trocear.mjs`):

| Archivo | Caracteres | Fragmentos | Con sección | Más corto | Más largo |
|---|---|---|---|---|---|
| `ayuda-clientes.md` | 5664 | 10 | 10 | 473 | 700 |
| `ayuda-comercios.md` | 4379 | 8 | 8 | 473 | 697 |
| `ayuda-repartidores.md` | 4156 | 8 | 8 | 428 | 650 |
| `politicas-y-cuenta.md` | 5289 | 9 | 9 | 494 | 665 |
| **Total** | **19488** | **35** | **35** | **428** | **700** |

- Salió un fragmento por pregunta, y todos tienen la sección reconocida: ninguno se va a
  citar como "fragmento N".
- El fragmento más largo, de 700 caracteres, queda lejos del máximo de 2000. Ninguna
  parte se corta con el troceo fijo (`trocear.mjs:60`).
- **Por qué por pregunta y no con tamaño fijo:** un corte cada 1000 caracteres parte las
  respuestas por la mitad y mezcla dos temas en un mismo fragmento. Su vector queda a
  mitad de camino entre los dos temas, y la fuente no dice nada útil. Cortado por
  pregunta, cada fragmento es una idea completa, con la pregunta adentro, que se parece
  a cómo pregunta la gente, y con una etiqueta que se entiende.

## Indexado (Fase 3)

`node --env-file=.env indexar.mjs` trocea cada archivo con la marca, pide los vectores a
Ollama en lotes de hasta 32 fragmentos y guarda cada fragmento con un `INSERT`
parametrizado (`$1` a `$5`) y su vector pasado por `comoVector`.

**Primera corrida:** 35 fragmentos, 4 pedidos a Ollama (uno por archivo, porque cada uno
entra en un solo lote) y unos 17 segundos. El conteo por fuente en Postgres coincide con
la Ficha 2:

```
        fuente         | count
-----------------------+-------
 ayuda-clientes.md     |    10
 ayuda-comercios.md    |     8
 ayuda-repartidores.md |     8
 politicas-y-cuenta.md |     9
```

### Ficha 3: correr el indexado dos veces

- **Sin `TRUNCATE`**, la segunda corrida dejó **70 filas**, con ids del 1 al 70. Las
  cantidades por fuente se duplicaron (20, 16, 16, 18), y "## ¿Cómo pago mi pedido?"
  quedó guardada dos veces, con los ids 5 y 40. El `INSERT` solo agrega filas: nada
  borra lo que había. Con duplicados, la búsqueda devuelve dos veces el mismo
  fragmento y ocupa dos de los tres lugares con la misma información.
- **Con `TRUNCATE fragmentos RESTART IDENTITY`** (`indexar.mjs:9`), dos corridas seguidas
  dejaron **35 filas** cada una, con ids del 1 al 35. `TRUNCATE` vacía la tabla y
  `RESTART IDENTITY` vuelve a numerar desde 1.
- La diferencia con la clase 7: ahí el índice era un archivo, que se pisa entero cada
  vez que se escribe. Una base de datos acumula: lo que no se borra, queda.

### Verificación: Postgres contra el coseno de la clase 6

`node --env-file=.env verificar-sql.mjs "¿Cómo pago mi pedido?"`:

```
id 5   Postgres: 0.751995   tu coseno: 0.751995
id 2   Postgres: 0.672324   tu coseno: 0.672324
id 3   Postgres: 0.661651   tu coseno: 0.661651
```

- Las dos columnas coinciden hasta el sexto decimal: `1 - (embedding <=> $1)` en
  Postgres hace la misma cuenta que `coseno()` de `similitud.mjs`.
- El primero (id 5) es justo "## ¿Cómo pago mi pedido?". Los otros dos son temas
  vecinos: "## ¿Cómo hago un pedido?" (id 2) y "## ¿Por qué mi compra se dividió en
  varios pedidos?" (id 3).

## Umbral (Fase 4)

### Las preguntas de prueba

Las aprobó Santiago. Son 13: 6 cuya respuesta está en el corpus y 7 cuya respuesta no
está.

- **Están, con las palabras del corpus (3):** "¿Cómo pago mi pedido?", "¿Cómo doy de baja
  un producto?" y "¿Cómo confirmo la entrega de un pedido?". Hay una de cada uno de los
  primeros tres archivos.
- **Están, reformuladas como las diría alguien que no leyó el corpus (3):** "me rebotó
  la tarjeta, ¿qué hago?", "¿cuánta plata me queda por cada viaje?" y "¿por qué me sacó
  de la cuenta si no toqué nada?".
- **No están, de los temas que quedaron afuera (4):** descuentos, teléfono de atención,
  costo de envío y horario de reparto. Tres son trampas a propósito: se parecen a algo
  que sí está. El envío se parece a la comisión del repartidor; el horario de reparto, a
  los horarios de los comercios; y "contraseña", a las respuestas sobre la cuenta.
- **No están, las genéricas de la clase (3):** la contraseña del wifi, el último mundial
  y la milanesa.

### La distribución

`node --env-file=.env distribucion.mjs` muestra la similitud del mejor fragmento de cada
pregunta. La última columna sale de un script temporal que no está en el repo: dice qué
fragmento trajo cada una (x = está, o = no está).

| Similitud | | Pregunta | Mejor fragmento |
|---|---|---|---|
| 0.752 | x | ¿Cómo pago mi pedido? | el correcto |
| 0.743 | x | ¿Cómo doy de baja un producto? | el correcto |
| 0.738 | x | ¿Cómo confirmo la entrega de un pedido? | el correcto |
| 0.632 | o | ¿Cuánto cuesta el envío? | repartidores · ¿Cuánto gano por cada entrega? |
| 0.607 | x | ¿cuánta plata me queda por cada viaje? | el correcto |
| 0.583 | x | me rebotó la tarjeta, ¿qué hago? | el correcto |
| 0.564 | o | cuál es la contraseña del wifi | políticas · ¿Cómo cambio mi contraseña o mis datos? |
| 0.547 | x | ¿por qué me sacó de la cuenta si no toqué nada? | **el equivocado**: políticas · ¿Cómo elimino mi cuenta? |
| 0.546 | o | ¿Hasta qué hora reparten? | repartidores · ¿Cómo tomo un pedido para repartir? |
| 0.501 | o | ¿Cuál es el teléfono de atención? | comercios · ¿Cómo cambio el horario de atención…? |
| 0.457 | o | ¿Tienen descuentos para estudiantes? | políticas · ¿Me devuelven la plata…? |
| 0.334 | o | cómo se hace una milanesa | políticas · ¿Cómo elimino mi cuenta? |
| 0.290 | o | quién ganó el último mundial | clientes · ¿Qué significa cada estado de mi pedido? |

La recta de 0 a 1, con una columna por cada 0.01. Un `*` es una x y una o en la misma
columna (0.547 y 0.546):

```
-----------------------------o---o------------o---o----*o-x--x-o----------xx-------------------------
0.0       0.1       0.2       0.3       0.4       0.5       0.6       0.7       0.8       0.9       1
                                                       [-------]
                                                       se pisan: de 0.547 a 0.632
```

### Lectura

- **No hay un hueco limpio.** Las que están van de 0.547 a 0.752, y las que no, de 0.290
  a 0.632. En la zona de 0.547 a 0.632 se pisan.
- **Del lado equivocado:**
  - "¿Cuánto cuesta el envío?" (0.632) queda por encima de tres preguntas que sí están.
    El fragmento que trae es el de la comisión del repartidor. Es el caso más
    peligroso: si pasa el umbral, el modelo recibe "$500 más $80 por km" y podría
    contestarlo como si fuera el costo de envío.
  - "cuál es la contraseña del wifi" (0.564) queda por encima de "¿por qué me sacó de la
    cuenta…?" (0.547), por la palabra "contraseña".
- **La búsqueda falla con "¿por qué me sacó de la cuenta si no toqué nada?".** La palabra
  "cuenta" la lleva a "¿Cómo elimino mi cuenta?". El fragmento correcto, "¿Por qué se me
  cerró la sesión?", queda en el puesto 5 de 35, con 0.450. Esto no lo arregla ningún
  umbral: la gente dice "me sacó" y el corpus dice "se cerró la sesión". Es candidata a
  pregunta que falla en la demo.
- **Cada modelo tiene su propia escala.** Con `bge-m3`, hasta la milanesa saca 0.334, y
  las preguntas relacionadas se juntan entre 0.55 y 0.75. Otro modelo daría otros
  números, así que el umbral no se puede copiar de la clase ni de otro proyecto: se mide
  con el modelo y el corpus de cada uno.

### Los dos errores y las opciones

- **Falso positivo:** pasa una pregunta cuya respuesta no está. El modelo recibe
  fragmentos que no la contestan y puede armar una respuesta con lo que tiene. Lo único
  que queda para frenarlo es el prompt.
- **Falso negativo:** se bloquea una pregunta cuya respuesta sí está. El Portero dice "No
  lo encuentro en los documentos." sin llamar al modelo, aunque la ayuda existía.

| Umbral | Falsos positivos (pasan sin estar) | Falsos negativos (se bloquean estando) |
|---|---|---|
| 0.64 | ninguno | 3: todas las reformuladas (plata, tarjeta y sesión) |
| **0.57** | **1: envío** | **1: sesión, que de todos modos traía el fragmento equivocado** |
| 0.54 | 3: envío, wifi y horario | ninguno |

### Umbral elegido: `UMBRAL=0.57`

Lo eligió Santiago, entre las tres opciones.

- **Por qué 0.57:** cae en el hueco chico entre "wifi" (0.564, la que no está con más
  similitud después del envío) y "tarjeta" (0.583, la que está y trae su fragmento
  correcto con menos similitud). Con 0.57 pasan cinco de las seis que están: las tres
  literales y dos de las tres reformuladas.
- **Qué error prefiero: el falso negativo.** En una app con plata de por medio (pagos,
  devoluciones y comisiones), una respuesta inventada hace más daño que un "No lo
  encuentro". Además, el front va a sugerir reformular la pregunta. Pero no al punto de
  0.64, que deja afuera a todos los que preguntan con sus propias palabras.
- **El falso negativo que queda** ("sesión") habría contestado con el fragmento de
  eliminar la cuenta. Bloquearlo es mejor que contestar mal.
- **El falso positivo que queda** ("envío") queda a cargo de la segunda barrera, el
  prompt. Se prueba en la Fase 5: el Portero tiene que aclarar que ese dato es del
  repartidor, o decir que no lo encuentra.
- **Cuándo recalibrar:** el margen es de apenas 0.02, entre 0.564 y 0.583. Hay que volver
  a correr `distribucion.mjs` si cambia el modelo de embeddings (cambia la escala), si
  cambia el corpus (por ejemplo, al agregar muchas preguntas) o si cambia el troceado
  (cambian los fragmentos y sus vectores).
