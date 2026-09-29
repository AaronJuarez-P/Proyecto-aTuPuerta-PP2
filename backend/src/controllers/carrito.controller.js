const database = require("../database/database");
const { enviarNotificaciones } = require("./notificaciones.controller");

const agregarAlCarrito = async (req, res) => {
    let connection;
    try {
        const idUsuario = req.usuario.id;
        const { id_producto, cantidad } = req.body;

        if (!Number.isInteger(id_producto) || !Number.isInteger(cantidad) || cantidad <= 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "id_producto y cantidad deben ser números válidos" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [clientes] = await connection.query(
            `SELECT id FROM clientes WHERE usuario_id = ?`,
            [idUsuario]
        );

        if (clientes.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe un perfil de cliente para este usuario" }
            });
        }
        const cliente = clientes[0];

        const [productos] = await connection.query(
            `SELECT id, precio, stock, activo FROM productos WHERE id = ? FOR UPDATE`,
            [id_producto]
        );

        if (productos.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Producto no encontrado" }
            });
        }
        const producto = productos[0];

        if (!producto.activo) {
            await connection.rollback();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El producto no está disponible" }
            });
        }

        const [carritos] = await connection.query(
            `SELECT id FROM carritos WHERE cliente_id = ?`,
            [cliente.id]
        );

        let carritoId;
        if (carritos.length > 0) {
            carritoId = carritos[0].id;
        } else {
            try {
                const [nuevoCarrito] = await connection.query(
                    `INSERT INTO carritos (cliente_id) VALUES (?)`,
                    [cliente.id]
                );
                carritoId = nuevoCarrito.insertId;
            } catch (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    const [carritoExistente] = await connection.query(
                        `SELECT id FROM carritos WHERE cliente_id = ?`,
                        [cliente.id]
                    );
                    carritoId = carritoExistente[0].id;
                } else {
                    throw err;
                }
            }
        }

        const [itemsExistentes] = await connection.query(
            `SELECT cantidad FROM items_carrito WHERE carrito_id = ? AND producto_id = ? FOR UPDATE`,
            [carritoId, id_producto]
        );

        const cantidadPrevia = itemsExistentes.length > 0 ? itemsExistentes[0].cantidad : 0;
        const cantidadTotal = cantidadPrevia + cantidad;

        if (producto.stock < cantidadTotal) {
            await connection.rollback();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: {
                    mensaje: `Stock insuficiente (disponible: ${producto.stock}, ya tenés ${cantidadPrevia} en el carrito)`
                }
            });
        }

        await connection.query(
            `INSERT INTO items_carrito (carrito_id, producto_id, cantidad)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
            [carritoId, id_producto, cantidad]
        );

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: { carritoId, mensaje: "Producto agregado al carrito" }
        });

    } catch (error) {
        console.error(error);
        if (connection) await connection.rollback();
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

const listarProductosCarrito = async (req, res) => {
    let connection;
    try {
        const idUsuario = req.usuario?.id;

        if (!idUsuario) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "No autenticado" }
            });
        }

        connection = await database.getConnection();

        const [clientes] = await connection.query(
            `SELECT id, direccion_entrega FROM clientes WHERE usuario_id = ?`,
            [idUsuario]
        );

        if (clientes.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe un perfil de cliente para este usuario" }
            });
        }
        const cliente = clientes[0];

        const [carritos] = await connection.query(
            `SELECT id FROM carritos WHERE cliente_id = ?`,
            [cliente.id]
        );

        if (carritos.length === 0) {
            return res.status(200).json({
                codigo: 200,
                estado: "exito",
                datos: {
                    vacio: true,
                    comercios: [],
                    total_general: 0
                }
            });
        }
        const carritoId = carritos[0].id;

        const [items] = await connection.query(
            `SELECT
                ic.id AS item_carrito_id,
                ic.cantidad,
                p.id AS producto_id,
                p.nombre AS producto_nombre,
                p.descripcion,
                p.categoria,
                p.precio,
                p.stock,
                p.activo AS producto_activo,
                c.id AS comercio_id,
                c.nombre AS comercio_nombre,
                c.activo AS comercio_activo
             FROM items_carrito ic
             INNER JOIN productos p ON p.id = ic.producto_id
             INNER JOIN comercios c ON c.id = p.comercio_id
             WHERE ic.carrito_id = ?
             ORDER BY c.nombre, p.nombre`,
            [carritoId]
        );

        if (items.length === 0) {
            return res.status(200).json({
                codigo: 200,
                estado: "exito",
                datos: {
                    vacio: true,
                    comercios: [],
                    total_general: 0
                }
            });
        }

        const comerciosMap = {};
        let totalGeneral = 0;

        for (const item of items) {
            const precioUnitario = Number(item.precio);
            const subtotal = Number((precioUnitario * item.cantidad).toFixed(2));

            const disponible =
                Boolean(item.producto_activo) &&
                Boolean(item.comercio_activo) &&
                item.stock >= item.cantidad;

            if (!comerciosMap[item.comercio_id]) {
                comerciosMap[item.comercio_id] = {
                    comercio_id: item.comercio_id,
                    comercio_nombre: item.comercio_nombre,
                    comercio_activo: Boolean(item.comercio_activo),
                    items: [],
                    subtotal_comercio: 0
                };
            }

            comerciosMap[item.comercio_id].items.push({
                item_carrito_id: item.item_carrito_id,
                producto_id: item.producto_id,
                nombre: item.producto_nombre,
                descripcion: item.descripcion,
                categoria: item.categoria,
                precio_unitario: precioUnitario,
                cantidad: item.cantidad,
                subtotal,
                stock_disponible: item.stock,
                producto_activo: Boolean(item.producto_activo),
                disponible
            });

            if (disponible) {
                comerciosMap[item.comercio_id].subtotal_comercio = Number(
                    (comerciosMap[item.comercio_id].subtotal_comercio + subtotal).toFixed(2)
                );
                totalGeneral = Number((totalGeneral + subtotal).toFixed(2));
            }
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                vacio: false,
                direccion_entrega_default: cliente.direccion_entrega,
                comercios: Object.values(comerciosMap),
                total_general: totalGeneral
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

const eliminarProductoCarrito = async (req, res) => {
    let connection;
    try {
        const idUsuario = req.usuario.id;
        const { id_producto } = req.params;

        if (!id_producto || isNaN(Number(id_producto))) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "id_producto inválido" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [clientes] = await connection.query(
            `SELECT id FROM clientes WHERE usuario_id = ?`,
            [idUsuario]
        );

        if (clientes.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe un perfil de cliente para este usuario" }
            });
        }
        const cliente = clientes[0];

        const [carritos] = await connection.query(
            `SELECT id FROM carritos WHERE cliente_id = ?`,
            [cliente.id]
        );

        if (carritos.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No tenés un carrito activo" }
            });
        }
        const carritoId = carritos[0].id;

        const [item] = await connection.query(
            `SELECT id FROM items_carrito WHERE carrito_id = ? AND producto_id = ?`,
            [carritoId, id_producto]
        );

        if (item.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Ese producto no está en tu carrito" }
            });
        }

        await connection.query(
            `DELETE FROM items_carrito WHERE id = ?`,
            [item[0].id]
        );

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "Producto eliminado del carrito" }
        });

    } catch (error) {
        console.error(error);
        if (connection) await connection.rollback();
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

const confirmarCarrito = async (req, res) => {
    let connection;
    try {
        const idUsuario = req.usuario.id;

        connection = await database.getConnection();
        await connection.beginTransaction();

        const [clientes] = await connection.query(
            `SELECT id, direccion_entrega FROM clientes WHERE usuario_id = ?`,
            [idUsuario]
        );

        if (clientes.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe un perfil de cliente para este usuario" }
            });
        }
        const cliente = clientes[0];

        const [carritos] = await connection.query(
            `SELECT id FROM carritos WHERE cliente_id = ?`,
            [cliente.id]
        );

        if (carritos.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No tenés un carrito activo" }
            });
        }
        const carritoId = carritos[0].id;

        const [items] = await connection.query(
            `SELECT
                ic.id AS item_carrito_id,
                ic.producto_id,
                ic.cantidad,
                p.nombre AS producto_nombre,
                p.precio,
                p.stock,
                p.activo AS producto_activo,
                p.comercio_id,
                c.activo AS comercio_activo,
                c.usuario_id AS comercio_usuario_id
             FROM items_carrito ic
             INNER JOIN productos p ON p.id = ic.producto_id
             INNER JOIN comercios c ON c.id = p.comercio_id
             WHERE ic.carrito_id = ?
             FOR UPDATE`,
            [carritoId]
        );

        if (items.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El carrito está vacío" }
            });
        }

        const errores = [];

        for (const item of items) {
            if (!item.producto_activo) {
                errores.push({
                    producto_id: item.producto_id,
                    mensaje: `El producto "${item.producto_nombre}" ya no está disponible`
                });
            } else if (!item.comercio_activo) {
                errores.push({
                    producto_id: item.producto_id,
                    mensaje: `El comercio del producto "${item.producto_nombre}" no está disponible`
                });
            } else if (item.stock < item.cantidad) {
                errores.push({
                    producto_id: item.producto_id,
                    mensaje: `Stock insuficiente para "${item.producto_nombre}" (disponible: ${item.stock})`
                });
            }
        }

        if (errores.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: {
                    mensaje: "Hay productos en tu carrito que no se pueden confirmar. Eliminalos para continuar.",
                    errores
                }
            });
        }

        const itemsPorComercio = {};
        for (const item of items) {
            if (!itemsPorComercio[item.comercio_id]) {
                itemsPorComercio[item.comercio_id] = [];
            }
            itemsPorComercio[item.comercio_id].push(item);
        }

        let direccionEntrega = cliente.direccion_entrega;

        if (req.body?.direccion_entrega !== undefined) {
            const direccionBody = String(req.body.direccion_entrega).trim();

            if (direccionBody.length === 0 || direccionBody.length > 200) {
                await connection.rollback();
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "direccion_entrega inválida (debe tener entre 1 y 200 caracteres)" }
                });
            }

            direccionEntrega = direccionBody;
        }

        const pedidosCreados = [];

        // Un pedido por cada comercio presente en el carrito.
        for (const comercioId of Object.keys(itemsPorComercio)) {
            const itemsDelComercio = itemsPorComercio[comercioId];

            const totalComercio = Number(
                itemsDelComercio
                    .reduce((acumulado, item) => acumulado + Number(item.precio) * item.cantidad, 0)
                    .toFixed(2)
            );

            // El pedido nace en 'pago_espera': recién existe para el cliente, que todavía
            // tiene que pagarlo. El comercio se entera cuando el pago se aprueba
            // (ver aplicarResultadoPago en pago.controller.js), no acá.
            const [resultadoPedido] = await connection.query(
                `INSERT INTO pedidos (cliente_id, comercio_id, estado, direccion_entrega, total)
                 VALUES (?, ?, 'pago_espera', ?, ?)`,
                [cliente.id, comercioId, direccionEntrega, totalComercio]
            );
            const pedidoId = resultadoPedido.insertId;

            for (const item of itemsDelComercio) {
                const subtotal = Number((Number(item.precio) * item.cantidad).toFixed(2));

                await connection.query(
                    `INSERT INTO items_pedido (pedido_id, producto_id, cantidad, precio_unit, subtotal)
                     VALUES (?, ?, ?, ?, ?)`,
                    [pedidoId, item.producto_id, item.cantidad, item.precio, subtotal]
                );

                await connection.query(
                    `UPDATE productos SET stock = stock - ? WHERE id = ?`,
                    [item.cantidad, item.producto_id]
                );
            }

            pedidosCreados.push({ pedidoId, comercioId, total: totalComercio });

            // Sin notificación al comercio acá: todavía no hay pago confirmado.
        }

        await connection.query(`DELETE FROM items_carrito WHERE carrito_id = ?`, [carritoId]);
        await connection.query(`DELETE FROM carritos WHERE id = ?`, [carritoId]);

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Pedido confirmado correctamente, listo para pagar",
                pedidos: pedidosCreados
            }
        });

    } catch (error) {
        console.error(error);
        if (connection) await connection.rollback();
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        if (connection) connection.release();
    }
};

module.exports = {
    agregarAlCarrito,
    eliminarProductoCarrito,
    confirmarCarrito,
    listarProductosCarrito
};