# DECISIONES: El Portero

Bitácora del asistente de ayuda de ATuPuerta: el RAG de la clase 8 de Desarrollo con IA,
adentro del backend. Cada decisión va con la evidencia que la respalda. Se escribió fase
por fase, a medida que se tomaba cada decisión.

**Índice:**
1. [Entorno y base](#entorno-y-base-fase-1)
2. [Corpus](#corpus-fase-2): qué es, por qué y quién lo usa
3. [Troceado](#troceado-fase-2)
4. [Indexado](#indexado-fase-3)
5. [Umbral](#umbral-fase-4), con la recta
6. [Prompt](#prompt-fase-5), con los cambios
7. [rag.mjs y preguntar.mjs](#ragmjs-y-preguntarmjs-fase-5), la [Ficha 5](#ficha-5) y
   las [preguntas de la demo](#preguntas-de-la-demo)
8. [Backend](#backend-fase-6) y [front](#front-fase-7)
9. [Documentación y prueba final](#documentación-y-prueba-final-fase-8)
10. [Extras](#extras-fase-9): la medición propia, troceado por pregunta contra fijo, y
    `faq` contra `rag`
11. [Qué probé y descarté](#qué-probé-y-descarté)

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

**Quién lo usa:** las personas que usan ATuPuerta, desde adentro de la app, en la pantalla
donde les surge la duda. Son clientes, comercios y repartidores, y también quien todavía
no tiene cuenta y quiere saber cómo registrarse o cómo funciona. Por eso cada archivo
está escrito para un rol, y el front sugiere preguntas según el rol de la sesión (Fase
7).

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
- **Medido en la Fase 9:** con 15 preguntas nuevas, el fragmento correcto le llega al
  modelo en 13 de 15 con el troceado por pregunta, y en 9 de 15 con el fijo (ver
  "Extras").

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
- **Dónde quedó:** en `backend/rag/.env` y, desde la Fase 8, también en
  `backend/rag/.env.example`. Así, quien copie el ejemplo arranca con el valor calibrado y
  no con el vacío de la clase, que vale 0 y no descarta nada.

## Prompt (Fase 5)

`prompt.txt` parte de la plantilla de la clase 8.

**Se mantiene tal cual:**
- La restricción de responder usando EXCLUSIVAMENTE los fragmentos, sin conocimiento
  propio.
- La frase exacta "No lo encuentro en los documentos.".
- El máximo de tres oraciones.
- El renglón "Fuente:" con la etiqueta del fragmento, tal como aparece entre guiones.
- Los marcadores `{{fragmentos}}` y `{{pregunta}}`.

**Cambios respecto de la plantilla:**

| # | Cambio | Por qué |
|---|---|---|
| 1 | El primer renglón dice quién es: "Sos El Portero de ATuPuerta, el asistente de ayuda de una app de delivery de Santo Tomé (Santa Fe). Respondés consultas de clientes, comercios y repartidores sobre cómo usar la app." | Es el cambio que pide la clase: el primer renglón dice de qué trata el corpus. Además, nombra a quiénes responde. |
| 2 | Un párrafo nuevo de tono: español rioplatense, de "vos", amable y directo, "como el portero de un edificio que conoce a todos los vecinos". Aclara que el tono nunca cambia la frase exacta. | Le da la personalidad del Portero. La aclaración protege la frase exacta, porque el backend y el front la reconocen para mostrar la respuesta distinta. |
| 3 | Un párrafo nuevo de roles: cada fragmento está escrito para un rol, y si el que usa es para otro rol que el de quien pregunta, lo tiene que aclarar. | Hay temas que se repiten entre roles, por ejemplo la comisión del repartidor y lo que paga el cliente. El modelo no tiene que pasar la información de un rol como si fuera de otro. |
| 4 | Una viñeta nueva en el formato: si no encuentra la respuesta, escribe solo la frase exacta, sin el renglón "Fuente:". | Una fuente al lado de "No lo encuentro" confunde, porque cita algo que no se usó. |

**Observación:** el modelo copia parte de los guiones en la fuente, por ejemplo
`Fuente: -- ayuda-clientes.md · ## ¿Cómo pago mi pedido? ---`. No se cambió la regla de
la plantilla: el front limpia los guiones y el "##" al mostrar la fuente (Fase 7).

## rag.mjs y preguntar.mjs (Fase 5)

`rag.mjs` parte del rag.mjs del anexo de la consigna, con estos cambios:

- Lee `prompt.txt` con `new URL("./prompt.txt", import.meta.url)` (`rag.mjs:9`). La ruta
  sale del archivo y no de la carpeta desde donde se corre, así funciona también desde
  el backend.
- Exporta `NO_LO_ENCUENTRO` (`rag.mjs:11`). La frase vive en un solo lugar del código.
- Exporta `armarPrompt(pregunta, utiles)` (`rag.mjs:32`), que es **el único lugar del
  proyecto donde se arma el prompt**. Reemplaza los marcadores con funciones y no con
  texto. Con texto, `replace` interpretaría los "$" que escribe la persona: "$$" quedaría
  "$", y "$'" pegaría el resto de la plantilla.
- Exporta `preguntarRAG(pregunta, { modo, sinModelo })` (`rag.mjs:48`), que devuelve
  `{ respuesta, fuentes, recuperados, umbral, modo, llamoAlModelo }`:
  - `recuperados`: los 3 fragmentos que trae `buscar()`, cada uno con `util`, que dice
    si pasa el umbral.
  - `fuentes`: solo los útiles.
  - Si ninguno pasa el umbral, devuelve la frase exacta y **no llama al modelo**
    (`rag.mjs:67`).
  - En modo `faq`, devuelve el texto del mejor fragmento sin su título, sin llamar al
    modelo, y cita solo ese fragmento, porque es el único que se usó (`rag.mjs:70`).
  - Con `sinModelo`, devuelve el prompt armado en el campo `prompt`, sin mandarlo
    (`rag.mjs:73`).
- Lee `UMBRAL` en cada pregunta (`leerUmbral`, `rag.mjs:16`). Si está vacío vale 0, como
  en la clase. Si está escrito con coma, corta con un error que lo dice. Prueba con
  `UMBRAL=0,57`: `Error: UMBRAL tiene que ser un número con punto decimal (por ejemplo
  0.57) y el .env dice "0,57"`. Sin esa validación, el Portero diría siempre "No lo
  encuentro" sin ningún aviso.
- Exporta `etiqueta` (`rag.mjs:27`): el formato "archivo · sección" es el mismo en el
  prompt, en la consola y en el front.
- No cierra la conexión a la base, porque el pool lo sigue usando el backend.
  `preguntar.mjs` la cierra en un `finally`.

`preguntar.mjs` usa `preguntarRAG` e imprime como el de la clase: "FRAGMENTOS
RECUPERADOS", con `✗` en los que no llegan al umbral, la etiqueta "archivo · sección" y
"RESPUESTA". Mantiene `--sin-modelo`, que ahora además muestra el prompt que recibiría
el modelo, y agrega `--faq`.

**Pruebas:**
- **"¿Cómo pago mi pedido?":** responde con el fragmento correcto, en tono rioplatense
  ("¡Hola, vecino!"), y cita `ayuda-clientes.md · ## ¿Cómo pago mi pedido?`.
- **"¿Tienen descuentos para estudiantes?":** los tres fragmentos quedan con `✗` (el mejor
  saca 0.457) y responde "No lo encuentro en los documentos." sin llamar al modelo.
- **"¿Cómo pago mi pedido?" con `--sin-modelo`:** muestra el prompt completo, de 3205
  caracteres.
- **"¿Cómo pago mi pedido?" con `--faq`:** responde con el texto del fragmento, sin el
  título y sin llamar al modelo.

### Ficha 5

Para diagnosticar se usó la lista de FRAGMENTOS RECUPERADOS, que es lo mismo que muestra
`--sin-modelo`. Si el fragmento correcto no está entre los tres, falló la búsqueda. Si
está y la respuesta igual es mala, falló el modelo.

| Pregunta | Similitud del primero | Fuente citada | ¿Correcta? | Si falló, ¿quién? |
|---|---|---|---|---|
| ¿Cómo pago mi pedido? | 0.752 | clientes · ¿Cómo pago mi pedido? | Sí | — |
| me rebotó la tarjeta, ¿qué hago? | 0.583 | clientes · ¿Qué pasa si me rechazan el pago? | Sí, y está reformulada | — |
| ¿Cuánto cuesta el envío? | 0.632 (pasa el umbral) | ninguna: "No lo encuentro" | Sí: el costo de envío no está en el corpus | El umbral dejó pasar la comisión del repartidor y **el prompt lo frenó** |
| ¿puedo pagar en efectivo? | 0.616 | ninguna: "No lo encuentro" (igual en dos corridas) | No: el fragmento dice que el único medio de pago es MercadoPago | **El modelo**: la búsqueda trajo primero el fragmento correcto, pero el modelo no saca la conclusión |
| ¿y si ya pagué? | 0.484 (✗) | ninguna, no se llamó al modelo | No: depende de una pregunta anterior | **La búsqueda**: sola, sin la conversación, la pregunta no se parece a nada |
| ¿por qué me sacó de la cuenta si no toqué nada? | 0.547 (✗) | ninguna, no se llamó al modelo | No: la respuesta está en "¿Por qué se me cerró la sesión?" | **La búsqueda**: el fragmento correcto queda en el puesto 5, con 0.450 |

**Lectura:**
- **Dos barreras contra los inventos.** Con el envío, el umbral dejó pasar un fragmento
  que no contestaba la pregunta, y el prompt hizo que el modelo dijera "No lo encuentro".
  Con los descuentos, el umbral solo alcanzó, y ni siquiera se llamó al modelo.
- **El costo de un prompt estricto.** Con el efectivo, el dato estaba en el fragmento,
  pero el modelo no infiere: "EXCLUSIVAMENTE" lo vuelve muy literal. Es el precio de la
  misma regla que frenó el envío.
- **Las fallas de la búsqueda tienen dos causas:**
  - Las palabras de la gente no son las del corpus: "me sacó de la cuenta" contra "se
    cerró la sesión".
  - Falta de contexto: "¿y si ya pagué?" no dice de qué habla. Cada pregunta viaja sola,
    sin el historial.

### Preguntas de la demo

Las eligió Santiago, entre las candidatas de la Ficha 5:

| Para mostrar | Pregunta | Qué pasa |
|---|---|---|
| Una que funciona | "¿Cómo pago?" | Trae primero "¿Cómo pago mi pedido?", con 0.699, y el modelo responde citando ese fragmento. |
| Una que no está | "¿Tienen descuentos para estudiantes?" | Ningún fragmento llega al umbral (el mejor saca 0.457). Responde "No lo encuentro en los documentos." sin llamar al modelo, así que sale igual siempre. Si preguntan por la segunda barrera, se cuenta el caso del envío. |
| Una que falla | "¿por qué me sacó de la cuenta si no toqué nada?" | Falla la búsqueda: el fragmento correcto queda en el puesto 5. Sale igual siempre, porque no llega al modelo. |
| De reserva, si sobra tiempo | "¿puedo pagar en efectivo?" | Falla el modelo: el fragmento correcto llega primero y el modelo igual dice "No lo encuentro". Puede variar de una corrida a otra. |

**Ensayo (Fase 8, 28/10/2026):** se levantó un backend nuevo en modo `rag` y se le hicieron
las cuatro, en orden, por la API. Salieron como se esperaba:

| Pregunta | Mejor fragmento | ¿Llamó al modelo? | Respuesta | Tiempo |
|---|---|---|---|---|
| "¿Cómo pago?" | 0.699, "¿Cómo pago mi pedido?" | Sí | La correcta, citando "¿Cómo pago mi pedido?" | 2,4 s, contando la carga del RAG |
| "¿Tienen descuentos para estudiantes?" | ✗ 0.457 | No | "No lo encuentro en los documentos." | 0,1 s |
| "¿por qué me sacó de la cuenta si no toqué nada?" | ✗ 0.547, "¿Cómo elimino mi cuenta?" | No | "No lo encuentro en los documentos." | 0,1 s |
| "¿puedo pagar en efectivo?" | 0.616, "¿Cómo pago mi pedido?" | Sí | "No lo encuentro en los documentos.", igual que en las dos corridas de la Fase 5 | 0,9 s |

La primera pregunta del día tarda más: con `bge-m3` fuera de memoria, una pregunta con
`--sin-modelo` tardó 2,5 s, contra 0,34 s con el modelo ya cargado. Ollama lo saca de la
memoria a los 5 minutos sin uso.

## Backend (Fase 6)

**Archivos nuevos:**
- `backend/src/services/ayuda.service.js`: es el único archivo del backend que sabe que
  existe `backend/rag`. Lee `AYUDA_MODO`, carga el RAG y traduce los errores.
- `backend/src/controllers/ayuda.controller.js`: valida la pregunta y arma las
  respuestas con el sobre `{ codigo, estado, datos }`.
- `backend/src/routes/ayuda.routes.js`: `GET /api/ayuda/estado` y
  `POST /api/ayuda/preguntar`. Las dos son públicas, porque puede preguntar cualquiera,
  también sin sesión.

**Archivos compartidos que se tocaron:**
- `app.js`: dos renglones, el `require` (`app.js:25`) y el `app.use("/api", ayudaRoutes)`
  (`app.js:107`). La consigna dice "una línea", pero sin el `require` no hay qué usar.
- `limites.middleware.js`: `limitadorAyuda` (`limites.middleware.js:57`), con el mismo
  patrón que los otros dos limitadores y `RATE_LIMIT_AYUDA_MAX` (30 por ventana, por
  defecto). Cuenta todas las preguntas, no solo las fallidas, porque lo que se gasta es
  el cupo de Gemini.
- `backend/.env.example`: la sección "Asistente de ayuda El Portero (RAG)", con
  `AYUDA_MODO=off` y `RATE_LIMIT_AYUDA_MAX=30`.

**Cambio respecto de la consigna:** se agregó `ayuda.controller.js`. La consigna nombra
solo el service y las rutas. Pero en el proyecto las rutas solo enganchan middlewares y
controladores (por ejemplo, `reclamo.routes.js`). El service le pasa al controlador el
código HTTP en `error.codigoHttp`, igual que `crearErrorPedido` en `pedido.service.js`.

**Decisiones:**
- **El modo** se lee una sola vez, al arrancar (`ayuda.service.js:24`). Vacío o sin
  definir vale `off`. Un valor mal escrito también vale `off`, y el log lo avisa una vez.
- **Carga perezosa** (`cargarRag`, `ayuda.service.js:90`): el RAG se importa con la
  primera pregunta, no al arrancar. Con `off` no se importa nunca, así que el backend
  arranca sin Docker, sin Ollama y sin el `npm install` de `backend/rag`.
- **Por qué `import()` y no `require()`:** `rag.mjs` es ESM y tiene un `await` afuera de
  toda función, porque lee `prompt.txt` al cargarse. Node 24 ya puede hacer `require()`
  de un ESM, pero no de uno así. `node -e "require('backend/rag/rag.mjs')"` responde
  `ERR_REQUIRE_ASYNC_MODULE: require() cannot be used on an ESM graph with top-level
  await. Use import() instead.` En Windows, `import()` necesita la ruta como URL
  `file://`, y eso lo hace `pathToFileURL` (`ayuda.service.js:69`).
- **Se guarda la promesa de la carga, no el módulo:** si dos preguntas llegan juntas,
  esperan la misma carga. Si la carga falla, no se guarda nada y la próxima pregunta lo
  vuelve a intentar.
- **Chequeos antes del `import()`** (`ayuda.service.js:55-61`): que existan
  `backend/rag/.env` y `backend/rag/node_modules/pg`. Si un `import()` falla, Node guarda
  el error, y reintentar no lo arregla hasta reiniciar el backend. Con los chequeos, los
  dos olvidos más comunes se arreglan sin reiniciar.
- **`process.loadEnvFile`** (`ayuda.service.js:65`) suma las variables de
  `backend/rag/.env` a las del backend, sin pisar ninguna que ya exista. `backend/src` no
  lee ninguna variable con el nombre de una del RAG, así que no hay choques.
- **Dónde está la clave:** en `backend/rag/.env`, que no se sube a Git, y en la memoria
  del proceso del backend. El navegador habla solo con `/api/ayuda`, nunca con Google.
  Todo lo que llega al navegador se puede ver con F12, y con la clave cualquiera podría
  gastar el cupo.
- **`db.on("error")`** (`ayuda.service.js:77`): si Postgres corta una conexión que el
  pool tiene ociosa, el pool emite `'error'`, y un `'error'` que nadie escucha termina el
  proceso. Sin el listener, se caería el backend entero, no solo el Portero. Se probó
  con un pool sin listener, en un script temporal: `error: terminating connection due to
  administrator command`, `Emitted 'error' event on BoundPool instance` y código de
  salida 1. Con el listener, el backend lo anota en el log y sigue andando (prueba 3).
- **Los errores:** el error real va al log, con `[ayuda]` adelante, y la persona recibe
  un 503 con un mensaje que entiende:

| Qué falla | Qué ve la persona | Qué queda en el log |
|---|---|---|
| Ollama cerrado | "El Portero no está disponible en este momento" | `No contesta nadie en http://localhost:11999/v1. ¿Está abierto Ollama?` |
| Postgres caído | "El Portero no está disponible en este momento" | `AggregateError [ECONNREFUSED]`, con `::1:5999` y `127.0.0.1:5999` |
| Google limita los pedidos (429) | "El Portero está con mucha gente, probá en un rato" | Los tres reintentos de `api.mjs` y `La API respondió 429: …` |
| Falta `backend/rag/.env` o el `npm install` | "El Portero no está disponible en este momento" | `Falta backend/rag/.env: …` o `Faltan las dependencias del RAG: …` |
| El Portero está en `off` | "El Portero está apagado" | Nada |

  El 429 se reconoce por el texto del error de `api.mjs` ("respondió 429",
  `ayuda.service.js:120`), porque `api.mjs` no guarda el código. Si ese texto cambiara,
  un 429 saldría como "no disponible".
- **La validación** usa `obtenerTextoValido` (`validacion.js:57`): de 3 a 300 caracteres
  después de `trim()`. Se valida antes de mirar el modo.
- **La respuesta** es `{ respuesta, fuentes, recuperados, umbral, modo }`.
  - `recuperados` lleva el texto de los tres fragmentos, que es el Centro de ayuda,
    público. Lo usa el panel "¿De dónde lo saqué?" del front.
  - `llamoAlModelo` no viaja: sin fuentes, o en modo `faq`, no se llamó al modelo.

### Pruebas

Se corrieron con un script temporal, fuera del repo. El script levanta el backend en el
puerto 4100 con variables de la terminal, sin tocar ningún `.env`, y gastó una sola
llamada a Gemini.

| # | Escenario | Resultado |
|---|---|---|
| 1 | `AYUDA_MODO` sin definir | `/health` da 200 y `estado` da `{ activo: false, modo: "off" }`. Preguntar da 503 "El Portero está apagado". "  a  " y 301 caracteres dan 400. Con `RATE_LIMIT_AYUDA_MAX=3`, la cuarta pregunta da 429. No hay ninguna línea `[ayuda]` en el log y hay 0 conexiones a Postgres. |
| 2 | `AYUDA_MODO=rga` | Aviso en el log y `{ activo: false, modo: "off" }`. |
| 3 | `rag` | Al arrancar no carga el RAG. Con `curl`, "¿Cómo pago?" da 200 en 4,1 segundos, contando la carga del RAG, con la respuesta de Gemini y la fuente correcta. "¿Tienen descuentos para estudiantes?" da 200 "No lo encuentro en los documentos." en 0,14 segundos, sin llamar al modelo. Después de cortar la conexión ociosa desde Postgres, el backend sigue vivo y la pregunta siguiente anda. |
| 4 | `faq`, dos preguntas al mismo tiempo | Las dos dan 200 con el texto del fragmento. El RAG se cargó una sola vez. |
| 5 | Ollama caído | 503 "no disponible", y `/health` sigue en 200. |
| 6 | Postgres caído | 503 "no disponible". |
| 7 | 429 simulado | 503 "con mucha gente", a los 60 segundos. |

**Cómo se simuló cada falla sin tocar nada:** `process.loadEnvFile` no pisa las variables
que ya existen, así que una variable de la terminal le gana a `backend/rag/.env`.
- Ollama caído: `URL_EMBEDDINGS=http://localhost:11999/v1`, un puerto donde no escucha
  nadie.
- Postgres caído: `DATABASE_URL` hacia el puerto 5999, donde tampoco escucha nadie.
- 429: `PROVEEDOR_CHAT=openai`, con `URL_CHAT` hacia un servidor falso que siempre
  contesta 429 y una `API_KEY` falsa, así la clave de verdad no viaja a ningún lado. Pasa
  por el mismo `pedir()` de `api.mjs` que usa Gemini.
- Corte de Postgres: `pg_terminate_backend` sobre la conexión ociosa del Portero.

**Lo que no se probó:** que falte `backend/rag/.env` o el `npm install`. Habría que mover
el `.env` de Santiago o borrar `node_modules`. Son dos `fs.existsSync`.

**Para tener en cuenta:**
- Un 429 de Google tarda unos 60 segundos en llegarle a la persona, porque `api.mjs`
  reintenta a los 10, 20 y 30 segundos. Mientras tanto, el front sigue mostrando que
  está buscando.
- Si cambia `backend/rag/.env`, por ejemplo el umbral, hay que reiniciar el backend:
  `loadEnvFile` corre una sola vez, con la primera pregunta.

## Front (Fase 7)

**Archivos nuevos:**
- `frontend/src/api/ayuda.js`: `estadoAyuda()` y `preguntarAlPortero(pregunta)`, con
  `pedir()` y `token: null` (`ayuda.js:11` y `:16`). Las rutas son públicas, así que
  una respuesta del Portero nunca dispara "sesión vencida".
- `frontend/src/components/Portero/Portero.jsx` y `Portero.css`: el botón flotante y el
  panel.
- `frontend/src/utils/portero.js`: cómo se muestra una respuesta. Limpia la fuente,
  reconoce "No lo encuentro" y arma la etiqueta.

**Archivo compartido que se tocó:** `Layout.jsx`. Tiene el import, `<Portero />` después
del footer y el comentario de arriba. Así el Portero está en todas las pantallas menos
el login.

**Cambio respecto de la consigna:** se agregó `utils/portero.js`. Son funciones sin
imports, que se pueden probar con Node, sin navegador, contra las respuestas reales
del modelo. En el proyecto, lo que da formato vive en `utils/` (`estados.js`,
`formato.js`).

**Decisiones:**
- **Si está apagado o falla, no hay nada** (`Portero.jsx:53`): al montar consulta
  `estadoAyuda()` con `useCarga`. Si no recibe `activo: true`, devuelve `null`.
- **Preguntas sugeridas según el rol** (`Portero.jsx:18`). Se probaron las 14 con Ollama
  y Postgres, sin Gemini. Todas traen primero su parte del Centro de ayuda, con
  similitudes de 0.695 a 0.789, por encima del umbral. El administrador recibe
  preguntas generales sobre cómo funciona la app.
- **Una charla por cuenta** (`Portero.jsx:64`): el panel se monta con `key` igual al id
  del usuario, o "anonimo" sin sesión. Al entrar o salir arranca una charla nueva, con
  las sugeridas del rol, y el historial de una cuenta no se ve en otra.
- **Historial** (`Portero.jsx:35`):
  - Se guarda en `sessionStorage`, con try/catch, bajo `atupuerta:portero:<id>`.
  - Guarda las últimas 20 preguntas.
  - Si una pregunta estaba esperando cuando se recargó la página, se descarta.
  - **Nunca viaja al backend**: cada pregunta se busca sola. Por eso "¿y si ya pagué?"
    falla (Ficha 5).
- **La fuente, bien visible** (`Respuesta`, `Portero.jsx:258`):
  - Muestra una etiqueta 📄 `archivo · sección`, sin "##", por cada fragmento que pasó
    el umbral. La que cita el modelo aparece resaltada en verde.
  - El renglón "Fuente:" del modelo va aparte, como pie de la burbuja. `separarFuente`
    (`utils/portero.js:29`) lo saca del texto y le limpia los guiones, el "##" y los
    `**` que copia el modelo (la observación de la Fase 5).
- **"¿De dónde lo saqué?"** (`Portero.jsx:328`) es un desplegable con los 3 fragmentos
  que trajo la búsqueda:
  - de cada uno, la similitud en número y en barra, con una rayita naranja en el umbral
    y ✗ en los que no lo pasaron;
  - en cada uno, "Leer esta parte" muestra el texto del fragmento: por eso
    `recuperados` trae el texto;
  - una nota explica lo que pasó. Si ninguno pasó el umbral, dice que "ni se le preguntó
    al modelo". Si alguno pasó y la respuesta igual es "No lo encuentro", dice que "el
    Portero prefirió no inventar": son las dos barreras de la Fase 5.
- **"No lo encuentro"** (`Portero.jsx:262`) se ve con borde naranja punteado y sugiere
  reformular la pregunta. A cliente, comercio y repartidor les ofrece "Hacé un reclamo",
  que lleva a `/reclamos`. Se reconoce por el comienzo de la frase exacta
  (`esNoLoEncuentro`, `utils/portero.js:20`).
- **Estados:**
  - mientras espera muestra "El Portero está buscando en sus papeles…", con la rueda de
    `Comunes.css`;
  - los errores del backend se ven en una burbuja roja;
  - "Preguntar" se desactiva mientras espera y con menos de 3 caracteres;
  - el campo no deja escribir más de 300.
- **Accesibilidad:**
  - el panel es un `dialog` no modal, y la charla es un `log` (`aria-live`), así un
    lector de pantalla lee cada respuesta nueva;
  - Escape cierra el panel cuando el foco está adentro (`Portero.jsx:105`);
  - al abrir, el foco va al campo, y al cerrar vuelve al botón;
  - el campo tiene una `label` oculta, y las ✗ tienen un texto para lectores de
    pantalla.
- **Estilo:**
  - usa las variables de `index.css`, Sora en el título y, en el encabezado, el mismo
    verde que la portada;
  - la escoba 🧹 borra la charla: el portero barre;
  - `z-index` 1500: arriba del header (1000) y abajo de los modales (2000) y de los
    avisos (3000);
  - en el celular el panel ocupa toda la pantalla, y a 320 px el botón queda en "🚪
    ¿Dudas?".
- **El id de cada pregunta** sale del historial: es el de la última más uno
  (`Portero.jsx:123`). No sale de `Date.now()`, porque oxlint avisaba que es una
  función impura y que así el compilador de React no optimiza el componente.

### Pruebas

- `npm run lint`: 0 avisos y 0 errores, en 72 archivos. Antes eran 69, también sin
  avisos.
- `npm run build`: sin errores.
- `utils/portero.js` con Node: 12 casos. Entre ellos están las dos respuestas reales del
  modelo, una con "Fuente: --- …" y otra con "Fuente: -- …".
- **En un navegador de verdad:** un script temporal levantó el backend en el puerto
  4100, el front con Vite en el 5180 y Edge sin ventana, y lo manejó como lo haría una
  persona. Cada corrida gastó una llamada a Gemini: dos en toda la fase.

| Qué se probó | Resultado |
|---|---|
| Backend en `rag`, sin sesión | Aparece "🚪 ¿Dudas? Preguntale al Portero". Al abrir, el foco va al campo y aparecen las 4 sugeridas sin sesión. |
| La sugerida "¿Cómo pago mi pedido?" | Mientras espera dice "El Portero está buscando en sus papeles…" y "Preguntar" sigue desactivado aunque haya texto. La respuesta llega sin "Fuente:", "##" ni guiones, con 3 etiquetas y la citada resaltada. El pie dice "Fuente: ayuda-clientes.md · ¿Cómo pago mi pedido?", y "¿De dónde lo saqué?" muestra 0.752, 0.672 y 0.662. |
| "¿Tienen descuentos para estudiantes?", escrita a mano | Burbuja distinta con "No lo encuentro en los documentos.", sin link a reclamos porque no hay sesión. Los 3 fragmentos tienen ✗ y la nota dice que ni se le preguntó al modelo. |
| Escape | Cierra el panel, y el foco vuelve al botón. |
| Recargar la página | La charla sigue: `sessionStorage` tiene las dos preguntas. |
| Celular, 320 × 640 | El botón queda entre x=171 y x=308, sin scroll horizontal. El panel ocupa [8, 8, 312, 632]. |
| Backend con `AYUDA_MODO=off` | `estado` da `{ activo: false, modo: "off" }`, y no hay botón ni panel. |
| Consola del navegador | Sin errores ni avisos. |

**Lo que se corrigió con la prueba del celular:** el encabezado se partía en muchos
renglones y el texto gris del campo ("Escribí tu pregunta…") se cortaba. Se acortó el
subtítulo, se achicó el ícono del encabezado y el texto del campo pasó a "Escribí tu
duda…". Este último cambio se probó en la Fase 8: entra entero a 320 px.

**Lo que no se probó acá:** las sugeridas y el link a reclamos con sesión de cliente,
comercio, repartidor y administrador, porque hacen falta cuentas. Tampoco se probó en
un celular de verdad. Las dos cosas quedan para la prueba de Santiago.

## Documentación y prueba final (Fase 8)

- **`README.md`**, sección "Asistente de ayuda: El Portero". Cuenta:
  - qué es, y que es opcional;
  - cómo prenderlo, con el `docker run` de la clase;
  - cómo agregar una pregunta nueva;
  - que cambiar `backend/rag/.env` obliga a reiniciar el backend;
  - la regla del grupo: si cambia una regla de la app, se actualiza el corpus y se vuelve
    a indexar.
- **`backend/rag/.env.example`:** `UMBRAL=0.57`, en vez de vacío (ver "Umbral").
- **Ensayo de la demo:** las cuatro preguntas, por la API (ver "Preguntas de la demo").
- **Prueba de punta a punta en el navegador:** se repitió la de la Fase 7. Pasaron todos
  los chequeos, y la consola quedó sin errores.
- **El modelo no contesta siempre con las mismas palabras.** En tres corridas de "¿Cómo
  pago mi pedido?" salieron tres redacciones distintas: "¡Hola, vecino! Por ahora, el
  único medio de pago…", "Hola, vecino. Para pagar tu pedido, por ahora el único medio
  disponible…" y otra parecida. Las tres dijeron lo mismo y citaron la misma fuente. Por
  eso la pregunta que falla en la demo es una falla de la búsqueda, que no depende del
  modelo.

## Extras (Fase 9)

### evaluar.mjs: la medición propia

`node --env-file=.env evaluar.mjs` mide la búsqueda sin llamar a Gemini. Para cada
pregunta, dice en qué puesto de los 3 sale el fragmento correcto y si le llega al modelo.

**Cómo se armó:**
- **20 preguntas, que aprobó Santiago.** Todas son nuevas: ninguna se usó para elegir el
  umbral (Fase 4) ni es una sugerida del front. Así, la medición dice si 0.57 sirve con
  preguntas que el umbral nunca "vio". Se fijaron antes de ver cualquier resultado.
  - **15 que están**, escritas como las haría la gente: 4 de clientes, 3 de comercios, 3
    de repartidores y 5 de políticas. Cada una tiene su sección esperada.
  - **5 que no están.** Cuatro se parecen a algo que sí está: los envíos a Santa Fe
    capital, el monotributo, el monto mínimo y el remís. La quinta, el asado, no tiene
    nada que ver.
- **El criterio es una frase clave.** Para cada pregunta se anotó una frase de la
  respuesta correcta, y un fragmento acierta si la contiene.
  - No se usó la sección porque el troceado fijo no tiene secciones. Así, los dos
    troceados se miden con la misma vara.
  - Cada clave mide menos de 150 caracteres, que es el solapamiento del troceado fijo,
    así que entra entera en algún fragmento.
  - Antes de medir, el script verifica que cada clave esté una sola vez en el corpus y en
    la sección esperada. Con `--solo-claves` hace solo eso.
- **Qué no mide:** si el modelo contesta bien con lo que recibe. Eso se revisó a mano en
  la Ficha 5.

### Troceado por pregunta contra troceado fijo

`indexar.mjs --fijo` ignora la marca y corta cada 1000 caracteres, con 150 de
solapamiento: son dos renglones nuevos (`indexar.mjs:10-11` y `:20`). Se midió con los dos
troceados y después se volvió a indexar con la marca. La segunda medición con la marca dio
exactamente igual que la primera.

| Medida | Por pregunta (la marca) | Fijo, de 1000 caracteres |
|---|---|---|
| Fragmentos | 35, todos con sección | 24, ninguno con sección |
| La correcta sale primera | 9 de 15 | 8 de 15 |
| La correcta está entre las 3 | 14 de 15 | 12 de 15 |
| La correcta le llega al modelo (está entre las 3 y pasa el umbral) | 13 de 15 | 9 de 15 |
| Las que no están, rechazadas por el umbral | 5 de 5 | 4 de 5: el remís pasa, con 0.577 |

**Lectura:**
- **El troceado por pregunta gana en todo.** En "sale primera" la diferencia es de una
  sola pregunta, y con 15 preguntas eso no alcanza para concluir nada. La diferencia
  grande está en lo que le llega al modelo: 13 contra 9.
- **Por qué:** un fragmento fijo junta el final de una pregunta con el principio de
  otra, y su vector queda a mitad de camino entre los dos temas. Por eso la parte
  correcta se parece menos a la pregunta:
  - "¿dónde veo cuánta plata vendí este mes?" baja de 0.536 a 0.477;
  - "mandé una queja hace dos días…" baja de 0.581 a 0.568, y ya no pasa el umbral;
  - "puse mal la contraseña varias veces…" pasa de primera, con 0.620, a tercera, con
    0.551.
- **Y la fuente no dice nada:** el fijo cita "politicas-y-cuenta.md · fragmento 3" en vez
  de la pregunta.
- **Una salvedad:** el umbral se calibró con el troceado por pregunta, y con el fijo
  habría que recalibrarlo. Pero "sale primera" y "está entre las 3" no dependen del
  umbral, y ahí también gana el troceado por pregunta.

**Lo que mostró la medición del troceado de hoy:**
- **Dos fallas nuevas.**
  - "ahora cierro los domingos, ¿cómo lo actualizo en la app?": la correcta ni está
    entre las 3. Primero trae "¿Por qué se me cerró la sesión?" (0.511), porque "cierro"
    se parece a "cerró" y el corpus dice "horario de atención". Es otra falla de
    vocabulario, como la de la sesión en la Ficha 5.
  - "¿dónde veo cuánta plata vendí este mes?": la correcta sale primera, pero con 0.536
    no pasa el umbral. Es un falso negativo.
- **El margen del umbral es finito de los dos lados.** El remís, que no está, sacó 0.566:
  apenas 0.004 abajo de 0.57. Es lo que avisaba la Fase 4, con un margen de 0.02.
- **Traer 3 compensa una búsqueda imperfecta.** En 5 de las 15 la correcta salió segunda
  o tercera, y le llegó igual al modelo porque pasaba el umbral. Con un solo fragmento se
  habría perdido.

### faq contra rag

- **En la medición:** el modo `faq` muestra el primer fragmento que pasa el umbral. Solo
  contesta bien si la correcta sale primera y pasa el umbral: 8 de 15. En `rag`, la
  correcta le llega al modelo en 13 de 15. Si después el modelo la usa bien, eso
  `evaluar.mjs` no lo mide.
- **Con una pregunta que necesita dos documentos.** Se corrieron dos versiones, que
  aprobó Santiago (2 llamadas a Gemini):

| Pregunta | faq | rag |
|---|---|---|
| "Soy repartidor: ¿cómo le llega el código al cliente y cómo confirmo la entrega?", la de la consigna | Muestra "¿Cómo confirmo la entrega…?" (0.813), que ya dice que el código "le llegó por notificación". Alcanza con un fragmento | Junta los dos: que le llega por notificación cuando un repartidor toma el pedido, y cómo confirmar |
| "Soy repartidor: ¿en qué momento le llega el código al cliente y cómo confirmo la entrega?" | El mismo fragmento, que no dice en qué momento: la respuesta queda incompleta | Junta los dos: "en qué momento" sale del archivo de clientes ("cuando un repartidor toma su pedido"), y cómo confirmar, del de repartidores |

- **Hallazgo: cuando junta dos fragmentos, el modelo cita uno solo.**
  - En la primera citó `ayuda-clientes.md` y en la segunda `ayuda-repartidores.md`,
    aunque en las dos usó los dos archivos. El prompt pide "la etiqueta del fragmento",
    en singular.
  - En el front no se pierde, porque las etiquetas 📄 muestran todos los fragmentos que
    pasaron el umbral. Pero el pie dice menos de lo que se usó.
  - Cambiar la regla del prompt para que cite cada fragmento que usó queda como decisión
    pendiente de Santiago.

## Qué probé y descarté

### Probado y descartado, con evidencia

| Qué se probó | Qué pasó | Qué quedó |
|---|---|---|
| Troceado fijo de 1000 caracteres, con 150 de solapamiento (Fase 9) | Con `evaluar.mjs` y 15 preguntas nuevas, la correcta le llega al modelo en 9 de 15, contra 13 con la marca, y la fuente dice "fragmento 3" | La marca `/^## .+/` (`marca.mjs:8`) |
| Indexar dos veces sin `TRUNCATE` (Fase 3) | 70 filas en vez de 35, con "¿Cómo pago mi pedido?" guardada dos veces (Ficha 3) | `TRUNCATE fragmentos RESTART IDENTITY` al empezar (`indexar.mjs:9`) |
| Umbral 0.64 (Fase 4) | Bloquea las tres preguntas reformuladas: plata, tarjeta y sesión | 0.57 |
| Umbral 0.54 (Fase 4) | Deja pasar envío, wifi y horario, que no están | 0.57 |
| Umbral vacío, que vale 0, como en la clase (Fase 4) | No descarta nada: hasta "cómo se hace una milanesa" (0.334) le llegaría al modelo | 0.57, también en `.env.example` |
| `ORDER BY` por la similitud en vez de por la distancia (Fase 8, con `EXPLAIN`) | Prohibiéndole a Postgres leer la tabla entera, como pasaría con miles de filas: por la distancia usa el índice (`Index Scan using fragmentos_embedding_idx`); por la similitud no puede (`Seq Scan` + `Sort`). Con las 35 filas de hoy, las dos leen todo, porque es más barato | `ORDER BY embedding <=> $1` (`buscar.mjs:10`) |
| "¿puedo pagar en efectivo?" como la pregunta que falla en la demo (Fase 5) | Falla siempre igual (tres corridas), pero depende del modelo, que puede cambiar | Una falla de la búsqueda, que no llega al modelo y sale siempre igual. La del efectivo queda de reserva |
| Cargar el RAG con `require()` (Fase 6) | `ERR_REQUIRE_ASYNC_MODULE`: `rag.mjs` es ESM y tiene un `await` afuera de toda función | `import()` dinámico (`ayuda.service.js:69`) |
| El pool de `pg` sin `db.on("error")` (Fase 6) | Al cortar la conexión ociosa, el proceso se cae: `Unhandled 'error' event`, código 1 | El listener (`ayuda.service.js:77`) |
| `Date.now()` para el id de cada pregunta (Fase 7) | Aviso de oxlint: es una función impura y el compilador de React no optimiza el componente | El id sale del historial (`Portero.jsx:123`) |
| El encabezado y el campo del Portero a 320 px (Fase 7) | El título se partía en varios renglones y el texto gris del campo se cortaba | Subtítulo más corto, ícono más chico y "Escribí tu duda…" |

### Pensado y descartado, sin probar

- **Aflojar el "EXCLUSIVAMENTE" del prompt** para que el modelo saque conclusiones, como la
  del efectivo. La misma regla frenó el envío, y en una app con plata de por medio una
  respuesta inventada hace más daño que un "No lo encuentro".
- **Cambiar la regla de "Fuente:" del prompt** para que el modelo no copie los guiones. Se
  dejó la plantilla de la clase y el front limpia la fuente (`utils/portero.js:29`).
- **Mandarle el historial al backend**, para que el Portero entienda "¿y si ya pagué?". La
  consigna pide preguntas independientes, y hacerlo bien exige reescribir la pregunta con
  la charla antes de buscar. Queda anotado como algo que le falta.
- **Poner en el corpus los temas que el grupo no definió**: costo de envío, horarios,
  contacto, promociones y efectivo. No se inventan reglas. Sirven como preguntas cuya
  respuesta no está.
