-- Ejecutar una sola vez en bases de datos existentes para habilitar
-- notificaciones generales dirigidas a todos los usuarios de un rol.
ALTER TABLE notificaciones
  MODIFY COLUMN usuario_id INT NULL,
  ADD COLUMN destinatario_rol ENUM('cliente','comercio','repartidor','administrador') NULL
    AFTER usuario_id,
  ADD INDEX idx_notificaciones_rol_fecha (destinatario_rol, created_at);
