-- =====================================================================
-- ATuPuerta — Script de base de datos completo
-- Motor: MySQL 8+ / InnoDB / utf8mb4
-- Coincide con el DER, diagrama de tablas y arquitectura del proyecto
-- Incluye usuarios de prueba de los 4 roles para probar con Postman
-- =====================================================================

DROP DATABASE IF EXISTS aTuPuerta;
CREATE DATABASE aTuPuerta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aTuPuerta;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. USUARIOS (tabla base para los 4 roles)
-- =====================================================================
CREATE TABLE usuarios (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  email       VARCHAR(150) NOT NULL,
  contrasena  VARCHAR(255) NOT NULL,
  telefono    VARCHAR(20)  NOT NULL,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email)
) ENGINE=InnoDB;

ALTER TABLE usuarios
  ADD COLUMN rol ENUM('cliente','comercio','repartidor','administrador')
  DEFAULT NULL AFTER telefono;

-- =====================================================================
-- 2. CLIENTES
-- =====================================================================
CREATE TABLE clientes (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id         INT NOT NULL,
  direccion_entrega  VARCHAR(200) NOT NULL,
  UNIQUE KEY uq_clientes_usuario (usuario_id),
  CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 3. COMERCIOS
-- =====================================================================
CREATE TABLE comercios (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT NOT NULL,
  nombre            VARCHAR(100) NOT NULL,
  cuit_cuil         CHAR(11) NOT NULL,
  categoria         VARCHAR(50) NOT NULL,
  direccion         VARCHAR(200) NOT NULL,
  horario_atencion  VARCHAR(100) NOT NULL,
  activo            BOOLEAN DEFAULT TRUE,
  UNIQUE KEY uq_comercios_usuario (usuario_id),
  UNIQUE KEY uq_comercios_cuit (cuit_cuil),
  CONSTRAINT fk_comercios_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 4. REPARTIDORES
-- =====================================================================
CREATE TABLE repartidores (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT NOT NULL,
  dni               VARCHAR(8) NOT NULL,
  tipo_vehiculo     ENUM('moto','bicicleta','auto','otro') NOT NULL,
  patente           VARCHAR(10) NOT NULL,
  numero_licencia   VARCHAR(30) NOT NULL,
  disponible        BOOLEAN DEFAULT TRUE,
  latitud_actual    DECIMAL(10,7),
  longitud_actual   DECIMAL(10,7),
  UNIQUE KEY uq_repartidores_usuario (usuario_id),
  UNIQUE KEY uq_repartidores_patente (patente),
  CONSTRAINT fk_repartidores_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 5. ADMINISTRADORES
-- =====================================================================
CREATE TABLE administradores (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_administradores_usuario (usuario_id),
  CONSTRAINT fk_administradores_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 6. PRODUCTOS
-- =====================================================================
CREATE TABLE productos (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  comercio_id  INT NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  descripcion  TEXT,
  categoria    VARCHAR(50) NOT NULL,
  precio       DECIMAL(10,2) NOT NULL,
  stock        INT NOT NULL DEFAULT 0,
  activo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_productos_comercio FOREIGN KEY (comercio_id)
    REFERENCES comercios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 7. PEDIDOS
-- =====================================================================
CREATE TABLE pedidos (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id         INT NOT NULL,
  comercio_id        INT NOT NULL,
  repartidor_id      INT NULL,
  estado             ENUM('pendiente_pago','en_preparacion','en_camino','entregado','cancelado')
                       NOT NULL DEFAULT 'pendiente_pago',
  direccion_entrega  VARCHAR(200) NOT NULL,
  total              DECIMAL(10,2) NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id)
    REFERENCES clientes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_pedidos_comercio FOREIGN KEY (comercio_id)
    REFERENCES comercios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_pedidos_repartidor FOREIGN KEY (repartidor_id)
    REFERENCES repartidores(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 8. ITEMS_PEDIDO
-- =====================================================================
CREATE TABLE items_pedido (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id     INT NOT NULL,
  producto_id   INT NOT NULL,
  cantidad      INT NOT NULL,
  precio_unit   DECIMAL(10,2) NOT NULL,
  subtotal      DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_items_pedido_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_items_pedido_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 9. PAGOS
-- =====================================================================
CREATE TABLE pagos (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id           INT NOT NULL,
  metodo              ENUM('tarjeta_credito','tarjeta_debito','mercadopago') NOT NULL,
  estado              ENUM('pendiente','aprobado','rechazado','fallido') NOT NULL DEFAULT 'pendiente',
  monto               DECIMAL(10,2) NOT NULL,
  referencia_externa  VARCHAR(100),
  motivo_rechazo      VARCHAR(255),
  fecha_pago          TIMESTAMP NULL,
  UNIQUE KEY uq_pagos_pedido (pedido_id),
  CONSTRAINT fk_pagos_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 10. UBICACIONES_REPARTIDOR
-- =====================================================================
CREATE TABLE ubicaciones_repartidor (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  repartidor_id  INT NOT NULL,
  pedido_id      INT NOT NULL,
  latitud        DECIMAL(10,7) NOT NULL,
  longitud       DECIMAL(10,7) NOT NULL,
  registrado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ubicaciones_repartidor FOREIGN KEY (repartidor_id)
    REFERENCES repartidores(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ubicaciones_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 11. RECLAMOS
-- =====================================================================
CREATE TABLE reclamos (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id          INT NOT NULL,
  pedido_id           INT NULL,
  descripcion         TEXT NOT NULL,
  estado              ENUM('pendiente','en_revision','resuelto','rechazado') NOT NULL DEFAULT 'pendiente',
  admin_asignado_id   INT NULL,
  resolucion          TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reclamos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_reclamos_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_reclamos_admin FOREIGN KEY (admin_asignado_id)
    REFERENCES administradores(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 12. AUDITORIA_PRODUCTOS
-- =====================================================================
CREATE TABLE auditoria_productos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  producto_id       INT NOT NULL,
  administrador_id  INT NULL,
  accion            ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  fecha             DATE NOT NULL,
  hora              TIME NOT NULL,
  CONSTRAINT fk_auditoria_productos_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_auditoria_productos_admin FOREIGN KEY (administrador_id)
    REFERENCES administradores(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Los productos los gestiona el propio comercio (CU13-CU16), no solo un administrador.
-- administrador_id se conserva para el panel de administracion (semana 13); usuario_id
-- guarda al actor real de cada cambio, sea comercio o administrador.
ALTER TABLE auditoria_productos
  ADD COLUMN usuario_id INT NULL AFTER producto_id,
  ADD CONSTRAINT fk_auditoria_productos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- =====================================================================
-- 13. AUDITORIA_PEDIDOS
-- =====================================================================
CREATE TABLE auditoria_pedidos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id         INT NOT NULL,
  administrador_id  INT NULL,
  accion            ENUM('INSERT','UPDATE','DELETE') NOT NULL,
  fecha             DATE NOT NULL,
  hora              TIME NOT NULL,
  CONSTRAINT fk_auditoria_pedidos_pedido FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_auditoria_pedidos_admin FOREIGN KEY (administrador_id)
    REFERENCES administradores(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 14. NOTIFICACIONES
-- =====================================================================
CREATE TABLE notificaciones (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  tipo        VARCHAR(50) NOT NULL,
  mensaje     TEXT NOT NULL,
  leida       BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notificaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- DATOS DE PRUEBA
-- Contraseña en texto plano para TODOS los usuarios de prueba: Test1234!
-- El valor almacenado es el hash bcrypt (costo 10) de esa contraseña, para que
-- bcrypt.compare funcione y se pueda obtener un token con los datos semilla.
-- Para regenerarlo: node -e "console.log(require('bcryptjs').hashSync('Test1234!', 10))"
-- =====================================================================

-- ---------- USUARIOS (uno o más de cada rol) ----------
INSERT INTO usuarios (id, nombre, email, contrasena, telefono, rol, activo) VALUES
(1, 'Juan Pérez',              'juan.perez@test.com',        '$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm', '3421000001', 'cliente',       TRUE),
(2, 'María Gómez',             'maria.gomez@test.com',       '$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm', '3421000002', 'cliente',       TRUE),
(3, 'Ferretería Central',      'ferreteria.central@test.com','$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm', '3421000003', 'comercio',      TRUE),
(4, 'Librería del Sur',        'libreria.sur@test.com',      '$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm', '3421000004', 'comercio',      TRUE),
(5, 'Carlos Rodríguez',        'carlos.repartidor@test.com', '$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm', '3421000005', 'repartidor',    TRUE),
(6, 'Lucía Fernández',         'lucia.repartidor@test.com',  '$2b$10$PhAKBbYVLxzWp1Uad8EMiOepg81e9rV1WSb7aQM8cS69BgfbXQSXm', '3421000006', 'repartidor',    TRUE);
-- ---------- CLIENTES ----------
INSERT INTO clientes (id, usuario_id, direccion_entrega) VALUES
(1, 1, 'San Martín 1234, Santo Tomé, Santa Fe'),
(2, 2, 'Belgrano 567, Santo Tomé, Santa Fe');

-- ---------- COMERCIOS ----------
INSERT INTO comercios (id, usuario_id, nombre, cuit_cuil, categoria, direccion, horario_atencion, activo) VALUES
(1, 3, 'Ferretería Central', '20304050607', 'Ferretería', 'Av. Rivadavia 800, Santo Tomé', 'Lun a Sáb 08:00-20:00', TRUE),
(2, 4, 'Librería del Sur',   '20405060708', 'Librería',   'Mitre 450, Santo Tomé',        'Lun a Vie 09:00-19:00', TRUE);

-- ---------- REPARTIDORES ----------
INSERT INTO repartidores (id, usuario_id, dni, tipo_vehiculo, patente, numero_licencia, disponible, latitud_actual, longitud_actual) VALUES
(1, 5, '35123456', 'moto',    'A123BCD', 'LIC-000111', TRUE,  -31.6730, -60.7830),
(2, 6, '36987654', 'bicicleta','SINPAT1', 'LIC-000222', FALSE, -31.6710, -60.7810);

-- ---------- PRODUCTOS ----------
INSERT INTO productos (id, comercio_id, nombre, descripcion, categoria, precio, stock, activo) VALUES
(1, 1, 'Martillo carpintero',        'Martillo de acero, mango de fibra de vidrio', 'Herramientas', 4500.00, 25, TRUE),
(2, 1, 'Taladro percutor 650W',      'Taladro percutor con maletín y accesorios',   'Herramientas', 32000.00, 10, TRUE),
(3, 1, 'Caja de tornillos (100u)',   'Tornillos autorroscantes 3/4 pulgada',        'Ferretería',   1200.00, 60, TRUE),
(4, 2, 'Cuaderno A4 tapa dura',      'Cuaderno rayado 100 hojas',                   'Papelería',    2100.00, 40, TRUE),
(5, 2, 'Cartuchera triple',         'Cartuchera de tela con 3 compartimentos',      'Papelería',    5300.00, 15, TRUE);

-- ---------- PEDIDOS ----------
-- Pedido 1: cliente 1 le compra a la ferretería, ya asignado a un repartidor, en camino
INSERT INTO pedidos (id, cliente_id, comercio_id, repartidor_id, estado, direccion_entrega, total) VALUES
(1, 1, 1, 1, 'en_camino', 'San Martín 1234, Santo Tomé, Santa Fe', 36500.00);

-- Pedido 2: cliente 2 le compra a la librería, recién creado, pendiente de pago
INSERT INTO pedidos (id, cliente_id, comercio_id, repartidor_id, estado, direccion_entrega, total) VALUES
(2, 2, 2, NULL, 'pendiente_pago', 'Belgrano 567, Santo Tomé, Santa Fe', 5300.00);

-- ---------- ITEMS_PEDIDO ----------
INSERT INTO items_pedido (id, pedido_id, producto_id, cantidad, precio_unit, subtotal) VALUES
(1, 1, 1, 1, 4500.00,  4500.00),
(2, 1, 2, 1, 32000.00, 32000.00),
(3, 2, 5, 1, 5300.00,  5300.00);

-- ---------- PAGOS ----------
INSERT INTO pagos (id, pedido_id, metodo, estado, monto, referencia_externa, motivo_rechazo, fecha_pago) VALUES
(1, 1, 'mercadopago',     'aprobado',  36500.00, 'MP-REF-000123', NULL, '2026-08-27 10:15:00'),
(2, 2, 'tarjeta_credito', 'pendiente', 5300.00,  NULL,            NULL, NULL);

-- ---------- UBICACIONES_REPARTIDOR ----------
INSERT INTO ubicaciones_repartidor (id, repartidor_id, pedido_id, latitud, longitud) VALUES
(1, 1, 1, -31.6725, -60.7825),
(2, 1, 1, -31.6720, -60.7818);

-- ---------- RECLAMOS ----------
-- ---------- RECLAMOS ----------
INSERT INTO reclamos (id, usuario_id, pedido_id, descripcion, estado, admin_asignado_id, resolucion) VALUES
(1, 2, 2, 'El pedido figura como pendiente de pago pero ya se descontó dinero de la tarjeta.', 'en_revision', NULL, NULL);

-- ---------- NOTIFICACIONES ----------
INSERT INTO notificaciones (id, usuario_id, tipo, mensaje, leida) VALUES
(1, 1, 'pedido_en_camino', 'Tu pedido #1 salió de Ferretería Central y está en camino.', FALSE),
(2, 1, 'pago_aprobado',    'Tu pago del pedido #1 fue aprobado.',                        TRUE),
(3, 2, 'pedido_creado',    'Creaste el pedido #2, falta confirmar el pago.',            FALSE);