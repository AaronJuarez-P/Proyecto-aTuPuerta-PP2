import { db, comoVector } from "./db.mjs";

// Los k fragmentos más parecidos a la pregunta, de mayor a menor similitud.
// La cuenta la hace Postgres: <=> es la distancia coseno, y similitud = 1 - distancia.
export async function buscar(vectorPregunta, k = 3) {
  const { rows } = await db.query(
    `SELECT id, fuente, seccion, posicion, texto,
            1 - (embedding <=> $1) AS similitud
       FROM fragmentos
      ORDER BY embedding <=> $1
      LIMIT $2`,
    [comoVector(vectorPregunta), k],
  );
  return rows;
}
