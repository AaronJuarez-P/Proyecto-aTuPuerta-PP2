-- =====================================================================
-- Semanas 11 a 14 — para una base que YA tiene datos.
--
-- Si importás aTuPuerta.sql de cero no hace falta: ya trae todo esto.
--
-- Orden:
--   1. Si tu base no tiene la columna notificaciones.destinatario_rol, corré antes
--      20260927_notificaciones_generales_por_rol.sql.
--   2. Esta. No hace falta correr antes 20260927_renombrar_estado_pago_espera.sql:
--      el paso 1 de acá la reemplaza y además cubre las bases que venían de ramaSanti
--      (con 'pendiente_pago'), que esa migración dejaba con el estado vacío.
--
-- Ejecutar una sola vez: los ALTER TABLE ... ADD fallan si se repiten.
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- 1. Estado del pedido: un solo nombre para "esperando el pago"
--
-- Según de qué rama venga la base, ese estado se llama 'pendiente_pago' (ramaSanti),
-- 'pago' o 'pago_espera' (ramAaron), o quedó vacío (''): XAMPP no usa el modo
-- estricto, así que cuando confirmarCarrito insertaba 'pendiente_pago' en una columna
-- que ya no lo tenía, MariaDB guardaba el estado vacío en vez de fallar.
--
-- Primero se abre el ENUM a todos los nombres, después se pasan todos a 'pago_espera'
-- y al final se cierra el ENUM definitivo. Hacerlo en otro orden perdería los datos:
-- achicar el ENUM primero convierte en '' los valores que salen.
-- ---------------------------------------------------------------------
ALTER TABLE pedidos
  MODIFY COLUMN estado ENUM(
    'pendiente_pago', 'pago', 'pago_espera', 'en_preparacion', 'preparado',
    'en_camino', 'entregado', 'cancelado'
  ) NULL;

UPDATE pedidos
SET estado = 'pago_espera'
WHERE estado IS NULL OR estado IN ('pendiente_pago', 'pago', '');

ALTER TABLE pedidos
  MODIFY COLUMN estado ENUM(
    'pago_espera', 'en_preparacion', 'preparado', 'en_camino', 'entregado', 'cancelado'
  ) NOT NULL DEFAULT 'pago_espera';

-- ---------------------------------------------------------------------
-- 2. Suscripciones push (semana 11). Venía solo en el script de ramAaron, sin
--    migración: una base de ramaSanti no la tiene.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suscripciones_push (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  endpoint    VARCHAR(500) NOT NULL,
  p256dh      VARCHAR(255) NOT NULL,
  auth        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_suscripciones_push_endpoint (endpoint),
  CONSTRAINT fk_suscripciones_push_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Lecturas de las notificaciones generales (semana 11)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones_leidas (
  notificacion_id  INT NOT NULL,
  usuario_id       INT NOT NULL,
  leida_en         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (notificacion_id, usuario_id),
  KEY idx_notificaciones_leidas_usuario (usuario_id),
  CONSTRAINT fk_notificaciones_leidas_notificacion FOREIGN KEY (notificacion_id)
    REFERENCES notificaciones(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notificaciones_leidas_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. Cancelaciones, trazabilidad e índices de los historiales (semanas 12 y 13)
-- ---------------------------------------------------------------------
ALTER TABLE pedidos
  ADD COLUMN motivo_cancelacion VARCHAR(255) NULL AFTER estado;

ALTER TABLE auditoria_pedidos
  ADD COLUMN detalle VARCHAR(255) NULL AFTER accion;

ALTER TABLE pedidos
  ADD INDEX idx_pedidos_cliente_fecha (cliente_id, created_at),
  ADD INDEX idx_pedidos_comercio_fecha (comercio_id, created_at);

-- ---------------------------------------------------------------------
-- 5. Datos
-- ---------------------------------------------------------------------

-- Un reclamo 'en_revision' sin administrador asignado no lo puede cerrar nadie
-- (resolver exige ser el asignado): vuelve a la cola.
UPDATE reclamos
SET estado = 'pendiente'
WHERE estado = 'en_revision' AND admin_asignado_id IS NULL;

-- El primer administrador (contraseña Test1234!, el mismo hash que el resto de los
-- usuarios de prueba). Los INSERT ... SELECT ... WHERE NOT EXISTS lo hacen idempotente:
-- si ya existe, no hacen nada.
INSERT INTO usuarios (nombre, email, contrasena, telefono, rol, activo)
SELECT 'Admin ATuPuerta', 'admin@test.com',
       '$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm',
       '3421000007', 'administrador', TRUE
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@test.com');

INSERT INTO administradores (usuario_id)
SELECT u.id
FROM usuarios u
WHERE u.email = 'admin@test.com'
  AND NOT EXISTS (SELECT 1 FROM administradores a WHERE a.usuario_id = u.id);
