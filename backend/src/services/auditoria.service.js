// Registra un cambio de producto en auditoria_productos (semana 4, CU13-CU16).
//
// Recibe la CONEXION del controlador (no el pool) para que el insert participe de
// la misma transaccion que el cambio sobre productos: o se guardan los dos, o ninguno.
//
// accion: 'INSERT' | 'UPDATE' | 'DELETE' (el ENUM de la tabla, en mayusculas)
// usuarioId: quien hizo el cambio, sea comercio o administrador
// administradorId: solo cuando el cambio lo hace un administrador (panel, semana 13)
//
// fecha y hora son dos columnas separadas en el esquema, de ahi CURDATE() y CURTIME()
const registrarAuditoriaProducto = async (conexion, { productoId, usuarioId, administradorId = null, accion }) => {
    await conexion.query(
        `INSERT INTO auditoria_productos (producto_id, usuario_id, administrador_id, accion, fecha, hora)
        VALUES (?, ?, ?, ?, CURDATE(), CURTIME())`,
        [productoId, usuarioId, administradorId, accion]
    );
};

module.exports = { registrarAuditoriaProducto };
