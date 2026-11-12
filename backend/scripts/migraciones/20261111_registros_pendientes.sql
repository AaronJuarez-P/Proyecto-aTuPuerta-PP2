-- =====================================================================
-- Verificación del correo al registrarse — para una base que YA tiene datos.
--
-- Si importás aTuPuerta.sql de cero no hace falta: ya trae esta tabla.
--
-- POST /api/registro ya no crea la cuenta: guarda acá los datos del formulario
-- y manda un código de 6 dígitos al correo. La fila de usuarios (y la de
-- clientes) se crea recién cuando la persona ingresa el código, y esta se
-- borra. El detalle de cada columna está en el comentario de la tabla en
-- aTuPuerta.sql.
--
-- Sin esta tabla, POST /api/registro responde 500. La excepción es
-- EMAIL_MODO=off, que crea la cuenta directo y no la usa.
--
-- No toca ninguna tabla existente ni borra datos, y las cuentas que ya están
-- no tienen que verificar nada. Se puede correr más de una vez: con
-- IF NOT EXISTS, si la tabla ya está no hace nada.
-- =====================================================================
CREATE TABLE IF NOT EXISTS registros_pendientes (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  email              VARCHAR(150) NOT NULL,
  nombre             VARCHAR(100) NOT NULL,
  contrasena         VARCHAR(255) NOT NULL,
  telefono           VARCHAR(20)  NOT NULL,
  direccion_entrega  VARCHAR(200) NOT NULL,
  latitud            DECIMAL(10,7) NULL,
  longitud           DECIMAL(10,7) NULL,
  codigo_hash        CHAR(64)     NOT NULL,
  codigo_expira_en   DATETIME     NOT NULL,
  intentos_fallidos  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ultimo_envio_en    DATETIME     NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_registros_pendientes_email (email)
) ENGINE=InnoDB;
