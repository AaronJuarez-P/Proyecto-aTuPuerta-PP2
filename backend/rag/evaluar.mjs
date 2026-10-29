// Fase 9: la medición propia. ¿La búsqueda trae la parte correcta del Centro de ayuda?
// Mide lo que haya en la tabla: indexá antes con la marca (node --env-file=.env indexar.mjs)
// o con el troceado fijo (node --env-file=.env indexar.mjs --fijo).
// No llama a Gemini: solo a Ollama y a Postgres.
// --solo-claves: revisa las claves y termina, sin medir.
import { readFile, readdir } from "node:fs/promises";
import { embeddingsEnLote } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";
import { MARCA } from "./marca.mjs";
import { trocearPorMarca } from "./trocear.mjs";

// Preguntas nuevas: ninguna se usó para elegir el umbral (Fase 4) ni es una sugerida del
// front. "clave" es una frase de la respuesta correcta, y un fragmento acierta si la
// contiene: así se mide igual con los dos troceados, porque el fijo no tiene secciones.
// Cada clave mide menos de 150 caracteres, el solapamiento del troceado fijo: entra
// entera en algún fragmento.
const ESTAN = [
  { pregunta: "¿puedo ver por dónde viene el repartidor con mi pedido?", seccion: "## ¿Cómo sigo mi pedido en el mapa?", clave: "cuando el repartidor comparte su ubicación, por dónde va" },
  { pregunta: "compré en dos negocios distintos y me aparecen dos pedidos, ¿está bien?", seccion: "## ¿Por qué mi compra se dividió en varios pedidos?", clave: "al confirmar se crea un pedido por cada comercio" },
  { pregunta: "en el carrito me dice que no quedan más unidades de algo, ¿qué hago?", seccion: "## ¿Qué pasa si un producto de mi carrito se queda sin stock?", clave: "no podés continuar con el pedido hasta sacarlo o ajustar la cantidad" },
  { pregunta: "¿cómo vuelvo a comprar lo mismo que la otra vez?", seccion: "## ¿Cómo repito un pedido anterior?", clave: "se suman a tu carrito, sin borrar lo que ya tenías" },
  { pregunta: "¿cómo subo mis productos para que los vean los clientes?", seccion: "## ¿Cómo cargo un producto nuevo?", clave: "el producto queda a la venta enseguida" },
  { pregunta: "¿dónde veo cuánta plata vendí este mes?", seccion: "## ¿Dónde veo mis ventas?", clave: "total vendido y ticket promedio" },
  { pregunta: "ahora cierro los domingos, ¿cómo lo actualizo en la app?", seccion: "## ¿Cómo cambio el horario de atención o los datos de mi comercio?", clave: "el rubro, la dirección del local y el horario de atención" },
  { pregunta: "¿puedo repartir en bici o necesito moto?", seccion: "## ¿Qué vehículos puedo usar para repartir?", clave: "podés registrarte con moto, bicicleta, auto u otro vehículo" },
  { pregunta: "no me aparece ningún pedido para llevar, ¿qué tengo que hacer?", seccion: "## ¿Cómo me pongo en servicio para recibir pedidos?", clave: "Solo en servicio ves la lista de pedidos disponibles" },
  { pregunta: "ya pasé por el local a buscar el pedido, ¿y ahora qué toco?", seccion: "## ¿Qué hago cuando retiro el pedido del comercio?", clave: "Ya retiré el pedido del comercio" },
  { pregunta: "me equivoqué con un pedido, ¿lo puedo anular?", seccion: "## ¿Puedo cancelar un pedido?", clave: "podés cancelar un pedido solo mientras está en" },
  { pregunta: "mandé una queja hace dos días, ¿cuándo me responden?", seccion: "## ¿Qué pasa con mi reclamo después de enviarlo?", clave: "Cuando un administrador de ATuPuerta lo toma" },
  { pregunta: "cambié de número de celular, ¿dónde lo actualizo?", seccion: "## ¿Cómo cambio mi contraseña o mis datos?", clave: "podés cambiar tu nombre y tu teléfono" },
  { pregunta: "la app me echó y me pide entrar de nuevo, ¿por qué?", seccion: "## ¿Por qué se me cerró la sesión?", clave: "Cada cuenta de ATuPuerta tiene una sola sesión abierta a la vez" },
  { pregunta: "puse mal la contraseña varias veces y ahora no me deja entrar", seccion: "## ¿Por qué me dice \"Demasiados intentos fallidos\"?", clave: "después de 10 intentos fallidos en 15 minutos" },
];

// Temas que el corpus no cubre. Cuatro se parecen a algo que sí está (el reparto, el
// registro del comercio, el carrito y los vehículos) y una no tiene nada que ver.
const NO_ESTAN = [
  "¿hacen envíos a Santa Fe capital?",
  "¿necesito ser monotributista para vender en la app?",
  "¿hay un monto mínimo de compra?",
  "¿puedo pedir un remís por la app?",
  "¿cómo se hace un asado?",
];

// Antes de medir: cada clave tiene que estar una sola vez en el corpus, en la sección
// esperada. Si no, un acierto podría venir de otra parte y la medición no valdría.
const partes = [];
for (const archivo of (await readdir("corpus")).filter(a => /\.(txt|md)$/i.test(a))) {
  const texto = await readFile(`corpus/${archivo}`, "utf8");
  for (const f of trocearPorMarca(texto, MARCA)) partes.push(f);
}
for (const e of ESTAN) {
  const donde = partes.filter(p => p.texto.includes(e.clave));
  if (donde.length !== 1 || donde[0].seccion !== e.seccion || e.clave.length >= 150) {
    throw new Error(`La clave "${e.clave}" tiene que estar una sola vez, en "${e.seccion}", y medir menos de 150 caracteres`);
  }
}
if (process.argv.includes("--solo-claves")) {
  console.log(`Las ${ESTAN.length} claves están bien: cada una aparece una sola vez, en su sección.`);
  await db.end();
  process.exit(0);
}

const umbral = Number(process.env.UMBRAL || 0);
const { rows: [tabla] } = await db.query(
  "SELECT count(*)::int AS total, count(seccion)::int AS con_seccion FROM fragmentos",
);
console.log(`En la tabla: ${tabla.total} fragmentos, ${tabla.con_seccion} con sección. Umbral: ${umbral}`);

const vectores = await embeddingsEnLote([...ESTAN.map(e => e.pregunta), ...NO_ESTAN]);
const etiqueta = r => `${r.fuente} · ${r.seccion ?? `fragmento ${r.posicion}`}`;

// Para cada una: en qué puesto de los 3 sale el fragmento correcto, y si llega al modelo
// (si está entre los 3 y pasa el umbral)
let primera = 0, entreTres = 0, llegan = 0;
console.log("\nLAS QUE ESTÁN: puesto de la correcta entre las 3 y su similitud (✗ = no pasa el umbral)");
for (const [i, e] of ESTAN.entries()) {
  const resultados = await buscar(vectores[i], 3);
  const puesto = resultados.findIndex(r => r.texto.includes(e.clave)) + 1;
  const correcto = resultados[puesto - 1];
  const llega = Boolean(correcto) && correcto.similitud >= umbral;
  if (puesto === 1) primera++;
  if (puesto >= 1) entreTres++;
  if (llega) llegan++;
  const similitud = correcto ? correcto.similitud.toFixed(3) : "  -  ";
  console.log(`  ${puesto ? `${puesto}º` : "--"}  ${similitud} ${correcto && !llega ? "✗" : " "} ${e.pregunta}`);
  if (puesto !== 1) console.log(`              primero trajo: ${etiqueta(resultados[0])} (${resultados[0].similitud.toFixed(3)})`);
}

let rechazadas = 0;
console.log("\nLAS QUE NO ESTÁN: similitud del primero (✓ = el umbral la rechaza)");
for (const [i, pregunta] of NO_ESTAN.entries()) {
  const [primero] = await buscar(vectores[ESTAN.length + i], 3);
  const rechazada = primero.similitud < umbral;
  if (rechazada) rechazadas++;
  console.log(`  ${rechazada ? "✓" : "✗"}  ${primero.similitud.toFixed(3)}  ${pregunta}  (trajo: ${etiqueta(primero)})`);
}

console.log("\nRESUMEN");
console.log(`  La correcta sale primera:              ${primera} de ${ESTAN.length}`);
console.log(`  La correcta está entre las 3:          ${entreTres} de ${ESTAN.length}`);
console.log(`  La correcta le llega al modelo:        ${llegan} de ${ESTAN.length}  (está entre las 3 y pasa el umbral)`);
console.log(`  Las que no están, rechazadas:          ${rechazadas} de ${NO_ESTAN.length}`);
await db.end();
