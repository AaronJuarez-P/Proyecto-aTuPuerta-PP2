-- Activa pgvector en esta base (si ya estaba activo, no hace nada)
CREATE EXTENSION IF NOT EXISTS vector;

-- Arranca de cero: si la tabla ya existía, la borra con todo lo que tenía
DROP TABLE IF EXISTS fragmentos;

-- Cada fila es un fragmento de tu corpus. Cada metadato de la clase 7 es una columna.
CREATE TABLE fragmentos (
  id        SERIAL PRIMARY KEY,      -- número automático, lo pone Postgres
  fuente    TEXT NOT NULL,           -- de qué archivo salió
  seccion   TEXT,                    -- qué parte del archivo (puede quedar vacía)
  posicion  INTEGER NOT NULL,        -- qué número de fragmento es dentro del archivo
  texto     TEXT NOT NULL,           -- el fragmento en sí
  embedding VECTOR(1024) NOT NULL    -- su vector: tantos números como devuelve tu modelo
);

-- Índice HNSW para buscar rápido por distancia coseno
CREATE INDEX ON fragmentos USING hnsw (embedding vector_cosine_ops);
