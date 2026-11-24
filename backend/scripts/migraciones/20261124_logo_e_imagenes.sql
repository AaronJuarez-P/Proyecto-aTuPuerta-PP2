-- =====================================================================
-- Logo del comercio y foto del producto — para una base que YA tiene datos.
--
-- Si importás aTuPuerta.sql de cero no hace falta: ya trae estas columnas.
--
-- Guardan solo el nombre del archivo (por ejemplo producto-<uuid>.webp). El
-- archivo vive en la carpeta IMAGENES_CARPETA del backend (backend/uploads, que
-- no se sube al repo) y se sirve en /imagenes/<nombre>. NULL = sin imagen, que es
-- lo correcto para los comercios y productos que ya existen: el front les sigue
-- mostrando el ícono del rubro.
--
-- Ejecutar una sola vez: el ALTER TABLE ... ADD falla si se repite.
-- =====================================================================
ALTER TABLE comercios
  ADD COLUMN logo VARCHAR(100) NULL AFTER horario_atencion;

ALTER TABLE productos
  ADD COLUMN imagen VARCHAR(100) NULL AFTER descripcion;
