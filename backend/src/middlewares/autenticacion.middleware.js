const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({
      codigo: 401,
      estado: "error",
      datos: { mensaje: "Token no proporcionado" }
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario   = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      codigo: 401,
      estado: "error",
      datos: { mensaje: "Token inválido o expirado" }
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

module.exports = { verificarToken, verificarRol };
