// El RAG de la clase 8 convertido en una función, para usarlo desde cualquier front.
// Parte del rag.mjs del anexo de la consigna; los cambios están anotados en DECISIONES.md.
import { readFile } from "node:fs/promises";
import { embedding, responder } from "./api.mjs";
import { buscar } from "./buscar.mjs";

// La ruta sale de este archivo y no de la carpeta desde donde se corre: así funciona igual
// con preguntar.mjs, parado en backend/rag, que desde el backend de ATuPuerta.
const PLANTILLA = await readFile(new URL("./prompt.txt", import.meta.url), "utf8");

export const NO_LO_ENCUENTRO = "No lo encuentro en los documentos.";

// Se lee en cada pregunta. Vacío vale 0, como en la clase: no se descarta nada. Escrito
// con coma daría NaN, ningún fragmento llegaría nunca y el Portero diría siempre que no
// lo encuentra sin que nada avise: por eso corta con un error que lo dice.
function leerUmbral() {
  const texto = (process.env.UMBRAL ?? "").trim();
  if (texto === "") return 0;
  const umbral = Number(texto);
  if (Number.isNaN(umbral)) {
    throw new Error(`UMBRAL tiene que ser un número con punto decimal (por ejemplo 0.57) y el .env dice "${texto}"`);
  }
  return umbral;
}

// La etiqueta con la que se cita cada fragmento: archivo y sección
export const etiqueta = r => `${r.fuente} · ${r.seccion ?? `fragmento ${r.posicion}`}`;

// El único lugar del proyecto donde se arma el prompt. El reemplazo va con una función
// porque, con un texto, replace interpreta los "$" de lo que escribió la persona ("$$"
// queda "$", "$'" pega el resto de la plantilla).
export function armarPrompt(pregunta, utiles) {
  const fragmentos = utiles.map(r => `--- ${etiqueta(r)} ---\n${r.texto}`).join("\n\n");
  return PLANTILLA
    .replace("{{fragmentos}}", () => fragmentos)
    .replace("{{pregunta}}", () => pregunta);
}

// Cada fragmento empieza con su título ("## ¿…?"): en modo faq se muestra solo la respuesta
function sinTitulo(r) {
  return r.seccion && r.texto.startsWith(r.seccion) ? r.texto.slice(r.seccion.length).trim() : r.texto;
}

// modo "rag": la respuesta la redacta el modelo, con los fragmentos que pasan el umbral.
// modo "faq": la respuesta es el mejor fragmento tal cual, sin llamar al modelo.
// sinModelo: arma el prompt y lo devuelve sin mandarlo, para ver qué recibiría el modelo.
// No cierra la conexión a la base: el pool lo sigue usando quien llama.
export async function preguntarRAG(pregunta, { modo = "rag", sinModelo = false } = {}) {
  if (modo !== "rag" && modo !== "faq") throw new Error(`modo tiene que ser "rag" o "faq", no "${modo}"`);

  const umbral = leerUmbral();
  const resultados = await buscar(await embedding(pregunta), 3);

  const recuperados = resultados.map(r => ({
    fuente: r.fuente,
    seccion: r.seccion,
    posicion: r.posicion,
    similitud: r.similitud,
    texto: r.texto,
    util: r.similitud >= umbral,
  }));
  const utiles = recuperados.filter(r => r.util);
  const fuentes = utiles.map(r => ({ fuente: r.fuente, seccion: r.seccion, similitud: r.similitud }));
  const base = { fuentes, recuperados, umbral, modo, llamoAlModelo: false };

  // Ningún fragmento llegó al umbral: se contesta que no está, sin gastar una llamada al modelo
  if (utiles.length === 0) return { ...base, respuesta: NO_LO_ENCUENTRO };

  // La respuesta sale de un solo fragmento, así que esa es la única fuente que se cita
  if (modo === "faq") return { ...base, fuentes: fuentes.slice(0, 1), respuesta: sinTitulo(utiles[0]) };

  const prompt = armarPrompt(pregunta, utiles);
  if (sinModelo) return { ...base, respuesta: null, prompt };

  return { ...base, respuesta: await responder(prompt), llamoAlModelo: true };
}
