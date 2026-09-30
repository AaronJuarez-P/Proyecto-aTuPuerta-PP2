const jwt = require("jsonwebtoken");
const database = require("../database/database");

// Saca el token del header Authorization. Acepta el token crudo, que es la convencion
// del proyecto desde la semana 2, y tambien "Bearer <token>" (semana 14), que es lo que
// manda casi cualquier cliente HTTP por defecto: Postman con Auth -> Bearer Token, un
// fetch del front copiado de cualquier ejemplo. Rechazarlo no protegia nada y costaba un
// 401 dificil de entender.
const extraerToken = (valor) => {
  if (typeof valor !== "string" || !valor.trim()) {
    return null;
  }

  const limpio = valor.trim();
  return /^bearer\s+/i.test(limpio) ? limpio.replace(/^bearer\s+/i, "") : limpio;
};

// Verifica el JWT y, contra la base, que la sesion siga viva (semana 14). Devuelve
// { payload } o { error: { codigo, mensaje } }.
//
// Un JWT valido no alcanza, porque se firma una vez y vale hasta que expira. Por eso se
// chequea ademas:
// - que la cuenta siga activa: una suspension o una baja (CU23) cortan todas las rutas
//   al instante y no recien a las 8 horas;
// - que la sesion del token sea la sesion abierta (usuarios.rol). cerrarSesionComercio
//   y cerrarSesionRepartidor dejan la cuenta en 'cliente', y cada login escribe su rol:
//   el token de la sesion anterior deja de servir en TODAS las rutas. Antes solo
//   dejaba de servir donde corria resolverComercio o resolverRepartidor.
//
// Es una consulta por PK en cada request. La usa tambien el handshake del socket
// (tiemporeal.service.js), asi las dos puertas de entrada aplican las mismas reglas.
const validarSesion = async (token) => {
  if (!token) {
    return { error: { codigo: 401, mensaje: "Token no proporcionado" } };
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return { error: { codigo: 401, mensaje: "Token inválido o expirado" } };
  }

  const [usuarios] = await database.query(
    `SELECT activo, rol FROM usuarios WHERE id = ?`,
    [payload.id]
  );

  if (usuarios.length === 0) {
    return { error: { codigo: 401, mensaje: "Token inválido o expirado" } };
  }

  if (!usuarios[0].activo) {
    return { error: { codigo: 403, mensaje: "Tu cuenta está suspendida o dada de baja" } };
  }

  if (usuarios[0].rol !== payload.rol) {
    return { error: { codigo: 401, mensaje: "La sesión ya no es válida: iniciá sesión de nuevo" } };
  }

  return { payload };
};

const verificarToken = async (req, res, next) => {
  try {
    const { payload, error } = await validarSesion(extraerToken(req.headers.authorization));

    if (error) {
      return res.status(error.codigo).json({
        codigo: error.codigo,
        estado: "error",
        datos: { mensaje: error.mensaje }
      });
    }

    req.usuario = payload;
    next();

  } catch (error) {
    return res.status(500).json({
      codigo: 500,
      estado: "error",
      datos: { mensaje: "Error interno del servidor" }
    });
  }
};

const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        codigo: 403,
        estado: "error",
        datos: { mensaje: "No tenés permisos para acceder a este recurso" }
      });
    }
    next();
  };
};

module.exports = { verificarToken, verificarRol, validarSesion, extraerToken };
