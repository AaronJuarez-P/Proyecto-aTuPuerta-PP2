const database = require('../database/database');
const { obtenerPaginacion } = require('../utils/paginacion');

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

module.exports = { listarComercios, obtenerComercio, listarProductosDeComercio };
