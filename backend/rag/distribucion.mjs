import { embeddingsEnLote } from "./api.mjs";
import { buscar } from "./buscar.mjs";
import { db } from "./db.mjs";

// Preguntas cuya respuesta SÍ está en tu corpus: tres con las palabras del texto y tres
// reformuladas como las escribiría alguien que no lo leyó.
const ESTAN = [
  "¿Cómo pago mi pedido?",
  "¿Cómo doy de baja un producto?",
  "¿Cómo confirmo la entrega de un pedido?",
  "me rebotó la tarjeta, ¿qué hago?",
  "¿cuánta plata me queda por cada viaje?",
  "¿por qué me sacó de la cuenta si no toqué nada?",
];

// Preguntas cuya respuesta NO está: cuatro de los temas que quedaron afuera del corpus,
// y tres que sirven para casi cualquier corpus.
// Si alguna de las tres está en el tuyo, cambiala por otra.
const NO_ESTAN = [
  "¿Tienen descuentos para estudiantes?",
  "¿Cuál es el teléfono de atención?",
  "¿Cuánto cuesta el envío?",
  "¿Hasta qué hora reparten?",
  "cuál es la contraseña del wifi",
  "quién ganó el último mundial",
  "cómo se hace una milanesa",
];
const preguntas = [...ESTAN, ...NO_ESTAN];
const vectores = await embeddingsEnLote(preguntas);   // todas las preguntas, un solo pedido

const filas = [];
for (const [i, p] of preguntas.entries()) {
  const [mejor] = await buscar(vectores[i], 1);
  filas.push({ pregunta: p, esta: i < ESTAN.length, mejor: mejor.similitud });
}
await db.end();

filas.sort((a, b) => b.mejor - a.mejor);
for (const f of filas) {
  console.log(`${f.mejor.toFixed(3)}  ${f.esta ? "[está]   " : "[NO está]"}  ${f.pregunta}`);
}
