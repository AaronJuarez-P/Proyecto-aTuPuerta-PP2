const database = require("../database/database");
const { calcularRuta, geocodificarDireccion, estimarMinutos } = require("../services/maps.service");
const { asegurarCoordenadasComercio, asegurarCoordenadasCliente } = require("../services/ubicacion.service");
const { calcularComision } = require("../services/pedido.service");

// Tope de pedidos.distancia_km, que es DECIMAL(6,2). Una direccion mal geocodificada
// del otro lado del mundo daria miles de km y MySQL en modo estricto cortaria el
// INSERT con "Out of range value", rompiendo la confirmacion con un 500.
const DISTANCIA_MAXIMA_KM = 9999.99;

const distanciaFallbackKm = () => {
    const valor = Number(process.env.MAPS_DISTANCIA_FALLBACK_KM);
    return Number.isFinite(valor) ? valor : 3;
};

// Distancia, tiempo y comision del envio de un comercio al domicilio del cliente.
//
// NUNCA tira y NUNCA deja de devolver un valor. distancia_km, tiempo_estimado y
// comision son NOT NULL, asi que hay que poner algo si o si, y un pedido que no se
// puede crear porque Mapbox no contesto es una caida de produccion regalada. Los tres
// valores son informativos mas una comision que el negocio puede absorber.
//
// origen_datos dice de donde salio cada numero ('mapbox', 'mock', 'estimado' o
// 'fallback'), para que la degradacion no sea silenciosa.
const calcularEnvio = async (origen, destino) => {
    if (!origen || !destino) {
        const distanciaKm = distanciaFallbackKm();

        return {
            distancia_km: distanciaKm,
            tiempo_estimado: estimarMinutos(distanciaKm),
            comision: calcularComision(distanciaKm),
            origen_datos: 'fallback'
        };
    }

    const ruta = await calcularRuta({ origen, destino });
    const distanciaKm = Math.min(ruta.distanciaKm, DISTANCIA_MAXIMA_KM);

    return {
        distancia_km: distanciaKm,
        tiempo_estimado: ruta.duracionMinutos,
        comision: calcularComision(distanciaKm),
        origen_datos: ruta.origenDatos
    };
};

const agregarAlCarrito = async (req, res) => {
    let connection;
    try {
        // 1. Usuario desde el token
        const idUsuario = req.usuario.id;

        // 2. Datos que llegan del click "+"
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

        // 3. Cliente asociado al usuario del token
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

        // 4. Producto elegido: validar que existe y esté activo (el stock se valida más abajo,
        //    una vez que sabemos cuánto tiene ya el cliente en el carrito)
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

        // 5. Buscar o crear el carrito del cliente (uno solo, general, sin comercio).
        //    Si dos requests chocan por el UNIQUE KEY (cliente_id), se recupera
        //    el carrito ya creado por la otra en vez de devolver un 500.
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

        // 6. Ver cuánto tiene ya el cliente de este producto en el carrito,
        //    para validar el stock contra el total acumulado (previo + nuevo)
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

        // 7. Insertar el item, o sumar cantidad si ya estaba en el carrito
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
        // 1. Usuario desde el token
        const idUsuario = req.usuario?.id;

        if (!idUsuario) {
            return res.status(401).json({
                codigo: 401,
                estado: "error",
                datos: { mensaje: "No autenticado" }
            });
        }

        connection = await database.getConnection();

        // 2. Cliente asociado al usuario del token
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

        // 3. Carrito del cliente
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

        // 4. Traer todos los items del carrito con datos de producto y comercio
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

        // 5. Armar cada item con subtotal y estado de disponibilidad,
        //    agrupado por comercio para que el frontend lo pueda mostrar separado
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

// POST /api/carrito/confirmar
//
// Va en DOS FASES a proposito (semana 9).
//
// La fase 1 lee el carrito y calcula las rutas SIN transaccion abierta. La fase 2
// abre la transaccion, lockea los productos y crea los pedidos. Tienen que estar
// separadas porque la fase 1 habla con Mapbox: si la llamada quedara adentro de la
// transaccion, habria filas de productos lockeadas mientras se espera la red, y con
// varios comercios y el timeout de 5 s eso son varios segundos de lock sobre
// productos que otros clientes estan intentando comprar.
//
// La regla que sale de ahi: adentro de la transaccion NUNCA hay una llamada de red.
const confirmarCarrito = async (req, res) => {
    let connection;
    try {
        const idUsuario = req.usuario.id;

        // ---------------------------------------------------------------
        // FASE 1 - lectura y calculo de rutas, contra el pool
        // ---------------------------------------------------------------

        const [clientes] = await database.query(
            `SELECT id, direccion_entrega, latitud, longitud FROM clientes WHERE usuario_id = ?`,
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

        const [carritos] = await database.query(
            `SELECT id FROM carritos WHERE cliente_id = ?`,
            [cliente.id]
        );

        if (carritos.length === 0) {
            return res.status(404).json({
                codigo: 404,
                estado: "error",
                datos: { mensaje: "No tenés un carrito activo" }
            });
        }
        const carritoId = carritos[0].id;

        // La direccion se resuelve aca arriba porque es lo que define el destino de
        // todas las rutas. Antes se validaba adentro de la transaccion, donde no
        // necesitaba estar.
        let direccionEntrega = cliente.direccion_entrega;
        let usaDireccionDelPerfil = true;

        if (req.body?.direccion_entrega !== undefined) {
            const direccionBody = String(req.body.direccion_entrega).trim();

            if (direccionBody.length === 0 || direccionBody.length > 200) {
                return res.status(400).json({
                    codigo: 400,
                    estado: "error",
                    datos: { mensaje: "direccion_entrega inválida (debe tener entre 1 y 200 caracteres)" }
                });
            }

            direccionEntrega = direccionBody;
            usaDireccionDelPerfil = false;
        }

        // Si usa la direccion de su perfil y el cliente ya tiene coordenadas, se
        // reusan sin gastar una llamada. Una direccion puntual del body se geocodifica
        // pero NO se guarda en clientes: es una entrega suelta, no un cambio de perfil.
        const destino = usaDireccionDelPerfil
            ? await asegurarCoordenadasCliente(database, cliente)
            : await geocodificarDireccion(direccionEntrega);

        // Los comercios del carrito, sin lockear nada: solo para saber cuantas rutas
        // hay que calcular y desde donde.
        const [comerciosCarrito] = await database.query(
            `SELECT DISTINCT c.id, c.direccion, c.latitud, c.longitud
             FROM items_carrito ic
             INNER JOIN productos p ON p.id = ic.producto_id
             INNER JOIN comercios c ON c.id = p.comercio_id
             WHERE ic.carrito_id = ?`,
            [carritoId]
        );

        if (comerciosCarrito.length === 0) {
            return res.status(400).json({
                codigo: 400,
                estado: "error",
                datos: { mensaje: "El carrito está vacío" }
            });
        }

        // En paralelo: las rutas de comercios distintos son independientes entre si.
        // Con N comercios la espera del peor caso es un timeout, no N timeouts.
        const envios = await Promise.all(
            comerciosCarrito.map(async (comercio) => {
                const origen = await asegurarCoordenadasComercio(database, comercio);
                return [String(comercio.id), await calcularEnvio(origen, destino)];
            })
        );

        // Las claves se normalizan con String() en los dos lados porque mas abajo se
        // busca con Object.keys(), que devuelve strings.
        const envioPorComercio = new Map(envios);

        // ---------------------------------------------------------------
        // FASE 2 - transaccion: lock de productos, stock y alta de pedidos
        // ---------------------------------------------------------------

        connection = await database.getConnection();
        await connection.beginTransaction();

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
                c.activo AS comercio_activo
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

        const pedidosCreados = [];

        for (const comercioId of Object.keys(itemsPorComercio)) {
            const itemsDelComercio = itemsPorComercio[comercioId];

            const totalComercio = Number(
                itemsDelComercio
                    .reduce((acumulado, item) => acumulado + Number(item.precio) * item.cantidad, 0)
                    .toFixed(2)
            );

            // El envio ya viene calculado de la fase 1. Si este comercio no esta en el
            // Map es porque el carrito cambio entre las dos fases (un doble submit):
            // se usa el fallback, que es calculo local. Nunca una llamada de red aca
            // adentro.
            const envio = envioPorComercio.get(String(comercioId)) ?? await calcularEnvio(null, null);

            const [resultadoPedido] = await connection.query(
                `INSERT INTO pedidos
                    (cliente_id, comercio_id, estado, direccion_entrega,
                     destino_latitud, destino_longitud, total,
                     distancia_km, tiempo_estimado, comision)
                 VALUES (?, ?, 'pendiente_pago', ?, ?, ?, ?, ?, ?, ?)`,
                [
                    cliente.id, comercioId, direccionEntrega,
                    destino?.latitud ?? null, destino?.longitud ?? null,
                    totalComercio,
                    envio.distancia_km, envio.tiempo_estimado, envio.comision
                ]
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

            pedidosCreados.push({
                pedidoId,
                comercioId,
                total: totalComercio,
                distancia_km: envio.distancia_km,
                tiempo_estimado: envio.tiempo_estimado,
                comision: envio.comision,
                origen_datos: envio.origen_datos
            });
        }

        await connection.query(`DELETE FROM items_carrito WHERE carrito_id = ?`, [carritoId]);
        await connection.query(`DELETE FROM carritos WHERE id = ?`, [carritoId]);

        await connection.commit();

        return res.status(201).json({
            codigo: 201,
            estado: "exito",
            datos: {
                mensaje: "Pedido(s) confirmado(s) correctamente",
                pedidos: pedidosCreados
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
    agregarAlCarrito,
    eliminarProductoCarrito,
    confirmarCarrito,
    listarProductosCarrito
};