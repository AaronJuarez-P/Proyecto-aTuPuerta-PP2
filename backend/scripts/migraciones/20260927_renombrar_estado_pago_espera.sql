-- Migra pedidos existentes y reemplaza el estado 'pago' por 'pago_espera'.
-- La columna conserva su capacidad de admitir NULL.
ALTER TABLE pedidos
  MODIFY COLUMN estado ENUM(
    'pago',
    'pago_espera',
    'en_preparacion',
    'preparado',
    'en_camino',
    'entregado',
    'cancelado'
  ) NULL;

UPDATE pedidos
SET estado = 'pago_espera'
WHERE estado = 'pago';

ALTER TABLE pedidos
  MODIFY COLUMN estado ENUM(
    'pago_espera',
    'en_preparacion',
    'preparado',
    'en_camino',
    'entregado',
    'cancelado'
  ) NULL;
