import { preguntarRAG, etiqueta } from "./rag.mjs";
import { db } from "./db.mjs";

// "Para saber quién falló: corré la pregunta con --sin-modelo. Si el fragmento correcto
// no está entre los tres, falló la búsqueda. Si está y la respuesta igual es mala, falló
// el modelo." (guía de la clase 8)
const pregunta = process.argv[2];
if (!pregunta) {
  console.log('Uso: node --env-file=.env preguntar.mjs "tu pregunta" [--sin-modelo | --faq]');
  process.exit(1);
}
if (!process.env.UMBRAL) console.log("(sin UMBRAL en el .env: no se descarta ningún fragmento)");

// --sin-modelo: la búsqueda y el prompt que recibiría el modelo, sin gastar la llamada
// --faq: el texto del mejor fragmento, sin llamar al modelo
const sinModelo = process.argv.includes("--sin-modelo");
const modo = process.argv.includes("--faq") ? "faq" : "rag";

let r;
try {
  r = await preguntarRAG(pregunta, { modo, sinModelo });
} finally {
  await db.end();
}

console.log("\nFRAGMENTOS RECUPERADOS");
for (const f of r.recuperados) {
  const marca = f.util ? "  " : "✗ ";
  console.log(`  ${marca}${f.similitud.toFixed(3)}  ${etiqueta(f)}`);
}

if (r.prompt) {
  console.log("\nPROMPT QUE RECIBIRÍA EL MODELO (no se mandó)");
  console.log(r.prompt);
} else {
  console.log("\nRESPUESTA");
  console.log(r.respuesta);
  if (r.fuentes.length === 0) {
    console.log(`(ningún fragmento llegó al umbral de ${r.umbral}: no se llamó al modelo)`);
  } else if (modo === "faq") {
    console.log(`(modo faq: es el texto de ${etiqueta(r.fuentes[0])}, sin llamar al modelo)`);
  }
}
