const database = require('../database/database');
const { registrarAuditoriaProducto } = require('../services/auditoria.service');
const { obtenerPaginacion } = require('../utils/paginacion');

// La columna precio es DECIMAL(10,2), o sea que no entra un valor mas grande que este
const PRECIO_MAXIMO = 99999999.99;

// Columnas que se devuelven al cliente en todas las respuestas de producto
const COLUMNAS_PRODUCTO = `id, comercio_id, nombre, descripcion, categoria, precio, stock, activo, created_at, updated_at`;

// ---------------------------------------------------------------------------
// Validaciones. Devuelven el mensaje de error o null si el valor esta bien
// ---------------------------------------------------------------------------

const validarPrecio = (precio) => {
    if (typeof precio !== "number" && typeof precio !== "string") {
        return "El precio debe ser un número";
    }

    const valor = Number(precio);
    if (precio === "" || isNaN(valor)) {
        return "El precio debe ser un número";
    }
    if (valor <= 0) {
        return "El precio debe ser mayor a 0";
    }
    if (valor > PRECIO_MAXIMO) {
        return `El precio no puede superar ${PRECIO_MAXIMO}`;
    }
    return null;
};

const validarStock = (stock) => {
    if (typeof stock !== "number" && typeof stock !== "string") {
        return "El stock debe ser un número entero";
    }

    const valor = Number(stock);
    if (stock === "" || isNaN(valor) || !Number.isInteger(valor)) {
        return "El stock debe ser un número entero";
    }
    if (valor < 0) {
        return "El stock no puede ser negativo";
    }
    return null;
};

const validarDatosProducto = ({ nombre, descripcion, categoria, precio, stock }) => {
    if (typeof nombre !== "string" || nombre.trim() === "") {
        return "El nombre del producto es obligatorio";
    }
    if (nombre.trim().length > 100) {
        return "El nombre no puede superar los 100 caracteres";
    }

    if (descripcion !== undefined && descripcion !== null && typeof descripcion !== "string") {
        return "La descripción debe ser texto";
    }

    if (typeof categoria !== "string" || categoria.trim() === "") {
        return "La categoría es obligatoria";
    }
    if (categoria.trim().length > 50) {
        return "La categoría no puede superar los 50 caracteres";
    }

    return validarPrecio(precio) || validarStock(stock);
};

// Valida el :id de la ruta. Devuelve el numero o null si no sirve
const obtenerIdValido = (valor) => {
    const id = parseInt(valor, 10);
    return (isNaN(id) || id < 1) ? null : id;
};

// Busca un producto y verifica que sea del comercio autenticado.
// Sirve tanto con el pool como con una conexion de transaccion.
// Devuelve { producto } o { error: { codigo, mensaje } }
const buscarProductoDelComercio = async (conexion, productoId, comercioId) => {
    const [productos] = await conexion.query(
        `SELECT ${COLUMNAS_PRODUCTO} FROM productos WHERE id = ?`,
        [productoId]
    );

    if (productos.length === 0) {
        return { error: { codigo: 404, mensaje: "Producto no encontrado" } };
    }

    if (productos[0].comercio_id !== comercioId) {
        return { error: { codigo: 403, mensaje: "El producto no pertenece a tu comercio" } };
    }

    return { producto: productos[0] };
};

// ---------------------------------------------------------------------------
// CU04 - Buscar productos (publico)
// ---------------------------------------------------------------------------

// GET /api/productos?buscar=&categoria=&comercioId=&precioMin=&precioMax=&pagina=&limite=
const buscarProductos = async (req, res) => {
    try {
        const { buscar, categoria, comercioId, precioMin, precioMax } = req.query;
        const { limite, pagina, offset } = obtenerPaginacion(req.query);

        // Solo productos activos de comercios activos: un comercio dado de baja
        // no tiene que seguir apareciendo en el catalogo
        const condiciones = ['p.activo = TRUE', 'c.activo = TRUE'];
        const parametros = [];

        if (buscar && buscar.trim() !== "") {
            condiciones.push('(p.nombre LIKE ? OR p.descripcion LIKE ?)');
            parametros.push(`%${buscar.trim()}%`, `%${buscar.trim()}%`);
        }

        if (categoria && categoria.trim() !== "") {
            condiciones.push('p.categoria = ?');
            parametros.push(categoria.trim());
        }

        if (comercioId !== undefined && comercioId !== "") {
            const id = obtenerIdValido(comercioId);
            if (id === null) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "El comercioId debe ser un número válido" }
                });
            }
            condiciones.push('p.comercio_id = ?');
            parametros.push(id);
        }

        if (precioMin !== undefined && precioMin !== "") {
            if (isNaN(Number(precioMin))) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "El precioMin debe ser un número" }
                });
            }
            condiciones.push('p.precio >= ?');
            parametros.push(Number(precioMin));
        }

        if (precioMax !== undefined && precioMax !== "") {
            if (isNaN(Number(precioMax))) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "El precioMax debe ser un número" }
                });
            }
            condiciones.push('p.precio <= ?');
            parametros.push(Number(precioMax));
        }

        const where = `WHERE ${condiciones.join(' AND ')}`;

        const [total] = await database.query(
            `SELECT COUNT(*) AS cantidad
            FROM productos p
            INNER JOIN comercios c ON p.comercio_id = c.id
            ${where}`,
            parametros
        );

        const [productos] = await database.query(
            `SELECT p.id, p.comercio_id, p.nombre, p.descripcion, p.categoria, p.precio, p.stock,
                    c.nombre AS comercio_nombre, c.categoria AS comercio_categoria
            FROM productos p
            INNER JOIN comercios c ON p.comercio_id = c.id
            ${where}
            ORDER BY p.nombre ASC
            LIMIT ? OFFSET ?`,
            [...parametros, limite, offset]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
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

// GET /api/productos/:id
const obtenerProducto = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del producto debe ser un número válido" }
            });
        }

        const [productos] = await database.query(
            `SELECT p.id, p.comercio_id, p.nombre, p.descripcion, p.categoria, p.precio, p.stock,
                    c.nombre AS comercio_nombre, c.direccion AS comercio_direccion,
                    c.horario_atencion AS comercio_horario
            FROM productos p
            INNER JOIN comercios c ON p.comercio_id = c.id
            WHERE p.id = ? AND p.activo = TRUE AND c.activo = TRUE`,
            [id]
        );

        if (productos.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "Producto no encontrado" }
            });
        }

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { producto: productos[0] }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

// ---------------------------------------------------------------------------
// CU13 a CU16 - Gestion del catalogo (solo el comercio dueño)
// El comercio_id sale siempre de req.comercioId, nunca del body
// ---------------------------------------------------------------------------

// POST /api/productos
const crearProducto = async (req, res) => {

    const connection = await database.getConnection();

    try {
        const { nombre, descripcion, categoria, precio } = req.body;

        // El stock es opcional al dar de alta, la columna tiene DEFAULT 0
        const stock = (req.body.stock === undefined || req.body.stock === null || req.body.stock === "")
            ? 0
            : req.body.stock;

        const errorValidacion = validarDatosProducto({ nombre, descripcion, categoria, precio, stock });
        if (errorValidacion) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: errorValidacion }
            });
        }

        // El esquema no tiene UNIQUE sobre (comercio_id, nombre), asi que se
        // verifica a mano para no permitir dos productos activos con el mismo nombre
        const [existentes] = await connection.query(
            `SELECT id FROM productos WHERE comercio_id = ? AND nombre = ? AND activo = TRUE`,
            [req.comercioId, nombre.trim()]
        );
        if (existentes.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ya tenés un producto activo con ese nombre" }
            });
        }

        await connection.beginTransaction();

        const [resultado] = await connection.query(
            `INSERT INTO productos (comercio_id, nombre, descripcion, categoria, precio, stock)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.comercioId,
                nombre.trim(),
                descripcion ? descripcion.trim() : null,
                categoria.trim(),
                Number(precio),
                Number(stock)
            ]
        );

        await registrarAuditoriaProducto(connection, {
            productoId: resultado.insertId,
            usuarioId: req.usuario.id,
            accion: 'INSERT'
        });

        await connection.commit();

        const [productoCreado] = await connection.query(
            `SELECT ${COLUMNAS_PRODUCTO} FROM productos WHERE id = ?`,
            [resultado.insertId]
        );

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Producto creado exitosamente",
                producto: productoCreado[0]
            }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// PUT /api/productos/:id
const actualizarProducto = async (req, res) => {

    const connection = await database.getConnection();

    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del producto debe ser un número válido" }
            });
        }

        const { nombre, descripcion, categoria, precio, stock, activo } = req.body;

        const errorValidacion = validarDatosProducto({ nombre, descripcion, categoria, precio, stock });
        if (errorValidacion) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: errorValidacion }
            });
        }

        if (activo !== undefined && typeof activo !== "boolean") {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El campo activo debe ser true o false" }
            });
        }

        const { producto, error } = await buscarProductoDelComercio(connection, id, req.comercioId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        // Se excluye el propio producto del chequeo de nombre repetido
        const [existentes] = await connection.query(
            `SELECT id FROM productos WHERE comercio_id = ? AND nombre = ? AND activo = TRUE AND id != ?`,
            [req.comercioId, nombre.trim(), id]
        );
        if (existentes.length > 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Ya tenés otro producto activo con ese nombre" }
            });
        }

        await connection.beginTransaction();

        await connection.query(
            `UPDATE productos
            SET nombre = ?, descripcion = ?, categoria = ?, precio = ?, stock = ?, activo = ?
            WHERE id = ?`,
            [
                nombre.trim(),
                descripcion ? descripcion.trim() : null,
                categoria.trim(),
                Number(precio),
                Number(stock),
                activo === undefined ? producto.activo : activo,
                id
            ]
        );

        await registrarAuditoriaProducto(connection, {
            productoId: id,
            usuarioId: req.usuario.id,
            accion: 'UPDATE'
        });

        await connection.commit();

        const [productoActualizado] = await connection.query(
            `SELECT ${COLUMNAS_PRODUCTO} FROM productos WHERE id = ?`,
            [id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Producto actualizado exitosamente",
                producto: productoActualizado[0]
            }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// CU13, CU14 - Gestionar y actualizar stock
// PATCH /api/productos/:id/stock
// Acepta { stock } para fijar un valor absoluto o { ajuste } para sumar/restar
const actualizarStock = async (req, res) => {

    const connection = await database.getConnection();

    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del producto debe ser un número válido" }
            });
        }

        const { stock, ajuste } = req.body;

        if (stock === undefined && ajuste === undefined) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Tenés que enviar stock (valor nuevo) o ajuste (cantidad a sumar o restar)" }
            });
        }

        if (stock !== undefined && ajuste !== undefined) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "Enviá stock o ajuste, no los dos a la vez" }
            });
        }

        if (stock !== undefined) {
            const errorStock = validarStock(stock);
            if (errorStock) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: errorStock }
                });
            }
        } else if (!Number.isInteger(Number(ajuste)) || ajuste === "" || ajuste === null) {
            // El ajuste si puede ser negativo, por eso no usa validarStock
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El ajuste debe ser un número entero" }
            });
        }

        const { producto, error } = await buscarProductoDelComercio(connection, id, req.comercioId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        const stockAnterior = producto.stock;
        const stockNuevo = stock !== undefined
            ? Number(stock)
            : stockAnterior + Number(ajuste);

        if (stockNuevo < 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: `El ajuste deja el stock en negativo. Stock disponible: ${stockAnterior}` }
            });
        }

        await connection.beginTransaction();

        await connection.query(
            `UPDATE productos SET stock = ? WHERE id = ?`,
            [stockNuevo, id]
        );

        await registrarAuditoriaProducto(connection, {
            productoId: id,
            usuarioId: req.usuario.id,
            accion: 'UPDATE'
        });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Stock actualizado exitosamente",
                producto: { id, stockAnterior, stock: stockNuevo }
            }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// CU15, CU16 - Gestionar y actualizar precios
// PATCH /api/productos/:id/precio
const actualizarPrecio = async (req, res) => {

    const connection = await database.getConnection();

    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del producto debe ser un número válido" }
            });
        }

        const { precio } = req.body;

        const errorPrecio = validarPrecio(precio);
        if (errorPrecio) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: errorPrecio }
            });
        }

        const { producto, error } = await buscarProductoDelComercio(connection, id, req.comercioId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        await connection.beginTransaction();

        await connection.query(
            `UPDATE productos SET precio = ? WHERE id = ?`,
            [Number(precio), id]
        );

        await registrarAuditoriaProducto(connection, {
            productoId: id,
            usuarioId: req.usuario.id,
            accion: 'UPDATE'
        });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: {
                mensaje: "Precio actualizado exitosamente",
                producto: { id, precioAnterior: producto.precio, precio: Number(precio).toFixed(2) }
            }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// DELETE /api/productos/:id
// Es una baja logica (activo = FALSE), no un DELETE fisico, por dos motivos:
// items_pedido.producto_id es ON DELETE RESTRICT (un producto ya pedido no se
// puede borrar) y auditoria_productos.producto_id es ON DELETE CASCADE (un
// borrado fisico se llevaria puesta su propia auditoria)
const eliminarProducto = async (req, res) => {

    const connection = await database.getConnection();

    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del producto debe ser un número válido" }
            });
        }

        const { producto, error } = await buscarProductoDelComercio(connection, id, req.comercioId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        if (!producto.activo) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El producto ya está dado de baja" }
            });
        }

        await connection.beginTransaction();

        await connection.query(
            `UPDATE productos SET activo = FALSE WHERE id = ?`,
            [id]
        );

        await registrarAuditoriaProducto(connection, {
            productoId: id,
            usuarioId: req.usuario.id,
            accion: 'DELETE'
        });

        await connection.commit();

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { mensaje: "Producto dado de baja exitosamente" }
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
        }

        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    } finally {
        connection.release();
    }
};

// Trazabilidad de un producto propio.
// GET /api/productos/:id/auditoria
const obtenerAuditoriaProducto = async (req, res) => {
    try {
        const id = obtenerIdValido(req.params.id);

        if (id === null) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El id del producto debe ser un número válido" }
            });
        }

        // Sin transaccion, alcanza con el pool
        const { error } = await buscarProductoDelComercio(database, id, req.comercioId);
        if (error) {
            return res.status(error.codigo).json({
                codigo: error.codigo,
                estado: "error",
                datos: { mensaje: error.mensaje }
            });
        }

        const [auditoria] = await database.query(
            `SELECT a.id, a.producto_id, a.accion, a.fecha, a.hora,
                    a.usuario_id, u.nombre AS usuario_nombre, u.rol AS usuario_rol,
                    a.administrador_id
            FROM auditoria_productos a
            LEFT JOIN usuarios u ON a.usuario_id = u.id
            WHERE a.producto_id = ?
            ORDER BY a.fecha DESC, a.hora DESC, a.id DESC`,
            [id]
        );

        return res.status(200).json({
            codigo: 200,
            estado: "exito",
            datos: { auditoria }
        });

    } catch (error) {
        return res.status(500).json({
            codigo: 500,
            estado: "error",
            datos: { mensaje: "Error interno del servidor" }
        });
    }
};

module.exports = {
    buscarProductos,
    obtenerProducto,
    crearProducto,
    actualizarProducto,
    actualizarStock,
    actualizarPrecio,
    eliminarProducto,
    obtenerAuditoriaProducto
};
