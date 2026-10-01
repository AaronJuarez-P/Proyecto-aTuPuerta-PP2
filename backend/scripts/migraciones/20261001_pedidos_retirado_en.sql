-- =====================================================================
-- Retiro del pedido en el comercio — para una base que YA tiene datos.
--
-- Si importás aTuPuerta.sql de cero no hace falta: ya trae esta columna.
--
-- Cuándo retiró el repartidor el pedido del comercio (PATCH /api/pedido/retiro).
-- Hasta que lo retira, la ruta del repartidor y la del seguimiento del cliente
-- pasan por el comercio. NULL = todavía no lo retiró, que es lo correcto para los
-- pedidos que ya existen.
--
-- Ejecutar una sola vez: el ALTER TABLE ... ADD falla si se repite.
-- =====================================================================
ALTER TABLE pedidos
  ADD COLUMN retirado_en TIMESTAMP NULL AFTER repartidor_id;
