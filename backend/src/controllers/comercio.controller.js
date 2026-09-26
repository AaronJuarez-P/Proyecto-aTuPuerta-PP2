const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');
const { enviarNotificaciones } = require('./notificaciones.controller');

// CU03 - Explorar comercios
// GET /api/comercios?categoria=&buscar=&pagina=&limite=
const listarComercios = async (req, res) => {
    try {
        const { categoria, buscar } = req.query;
        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        // Se arman las condiciones dinamicamente segun los filtros que llegaron
        const condiciones = ['activo = TRUE'];
        const parametros = [];

        if (categoria && categoria.trim() !== "") {
            condiciones.push('categoria = ?');
            parametros.push(categoria.trim());
        }

        if (buscar && buscar.trim() !== "") {
            condiciones.push('nombre LIKE ?');
            parametros.push(`%${buscar.trim()}%`);
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM comercios ${where}`,
            parametros
        );

        const [comercios] = await database.query(
            `SELECT id, nombre, categoria, direccion, horario_atencion
            FROM comercios
            ${where}
            ORDER BY nombre ASC
            LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                comercios,
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// CU03 - Ver el detalle de un comercio
// GET /api/comercios/:id
const obtenerComercio = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id) || id < 1) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del comercio debe ser un número válido" }
            });
        }

        const [comercios] = await database.query(
            `SELECT id, nombre, categoria, direccion, horario_atencion
            FROM comercios
            WHERE id = ? AND activo = TRUE`,
            [id]
        );

        if (comercios.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Comercio no encontrado" }
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { comercio: comercios[0] }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// CU03 - Listar los productos de un comercio
// GET /api/comercios/:id/productos?categoria=&buscar=&pagina=&limite=
const listarProductosDeComercio = async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);

        if (isNaN(id) || id < 1) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del comercio debe ser un número válido" }
            });
        }

        // Se valida que el comercio exista para poder distinguir un comercio
        // inexistente (404) de un comercio que todavia no cargo productos (lista vacia)
        const [comercios] = await database.query(
            `SELECT id, nombre FROM comercios WHERE id = ? AND activo = TRUE`,
            [id]
        );

        if (comercios.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Comercio no encontrado" }
            });
        }

        const { categoria, buscar } = req.query;
        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        const condiciones = ['comercio_id = ?', 'activo = TRUE'];
        const parametros = [id];

        if (categoria && categoria.trim() !== "") {
            condiciones.push('categoria = ?');
            parametros.push(categoria.trim());
        }

        if (buscar && buscar.trim() !== "") {
            condiciones.push('(nombre LIKE ? OR descripcion LIKE ?)');
            parametros.push(`%${buscar.trim()}%`, `%${buscar.trim()}%`);
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad FROM productos ${where}`,
            parametros
        );

        const [productos] = await database.query(
            `SELECT id, comercio_id, nombre, descripcion, categoria, precio, stock
            FROM productos
            ${where}
            ORDER BY nombre ASC
            LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                comercio: comercios[0],
                productos,
                paginacion: { pagina, limite, total: total[0].cantidad }
            }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// CU - El comercio confirma que un pedido propio fue preparado.
// PATCH /api/comercios/pedidos/:id/subir
// Transición de estado: 'en_preparacion' -> 'preparado'
// (el pedido solo llega a 'en_preparacion' una vez que el pago fue aprobado,
// ver aplicarResultadoPago en pago.controller.js)
// Efectos: notifica al cliente y a todos los repartidores.
// NOTA: el código de entrega lo genera pedido.controller.js (asignarPedido),
// no este archivo.
const subirPedido = async (req, res) => {
    let connection;
    try {
        const idUsuario = req.usuario.id;
        const idPedido = parseInt(req.params.id, 10);

        if (isNaN(idPedido) || idPedido < 1) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del pedido debe ser un número válido" }
            });
        }

        connection = await database.getConnection();
        await connection.beginTransaction();

        // 1. Comercio asociado al usuario del token
        const [comercios] = await connection.query(
            `SELECT id, nombre FROM comercios WHERE usuario_id = ?`,
            [idUsuario]
        );

        if (comercios.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No existe un perfil de comercio para este usuario" }
            });
        }
        const comercio = comercios[0];

        // 2. Traer el pedido, bloqueando la fila para evitar confirmaciones concurrentes
        const [pedidos] = await connection.query(
            `SELECT p.id, p.estado, p.comercio_id, p.cliente_id, c.usuario_id AS cliente_usuario_id
             FROM pedidos p
             INNER JOIN clientes c ON c.id = p.cliente_id
             WHERE p.id = ?
             FOR UPDATE`,
            [idPedido]
        );

        if (pedidos.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Pedido no encontrado" }
            });
        }
        const pedido = pedidos[0];

        // 3. Verificar que el pedido pertenece a este comercio
        if (pedido.comercio_id !== comercio.id) {
            await connection.rollback();
            return res.status(403).json({
                codigo: 403,
                estado: "error",
                datos: { mensaje: "Este pedido no pertenece a tu comercio" }
            });
        }

        // 4. Verificar que el pedido está en el estado correcto para subirse.
        //    El pago tiene que estar aprobado (estado = 'en_preparacion') antes
        //    de que el comercio pueda confirmarlo como preparado.
        if (pedido.estado !== 'en_preparacion') {
            await connection.rollback();
            return res.status(409).json({
                codigo: 409,
                estado: "error",
                datos: { mensaje: `El pedido está en estado "${pedido.estado}" y no se puede subir como preparado` }
            });
        }

        // 5. Subir el pedido como preparado
        await connection.query(
            `UPDATE pedidos SET estado = 'preparado' WHERE id = ?`,
            [idPedido]
        );

        await connection.commit();

        // 6. Notificar al cliente que su pedido está listo
        await enviarNotificaciones(pedido.cliente_usuario_id, {
            titulo: "Tu pedido está listo",
            mensaje: `Tu pedido #${pedido.id} fue preparado y ya va a salir hacia tu domicilio`,
            url: `/cliente/pedidos/${pedido.id}`
        });

        // 7. Notificar a todos los repartidores registrados que hay un pedido disponible
        const [repartidores] = await database.query(
            `SELECT usuario_id FROM repartidores`
        );

        for (const repartidor of repartidores) {
            await enviarNotificaciones(repartidor.usuario_id, {
                titulo: "Nuevo pedido disponible",
                mensaje: `Hay un pedido listo para retirar en ${comercio.nombre}`,
                url: `/repartidor/pedidos-disponibles`
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Pedido subido correctamente como preparado",
                pedidoId: pedido.id
            }
        });

    } catch (error) {
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
    listarComercios,
    obtenerComercio,
    listarProductosDeComercio,
    subirPedido
};