const jwt = require("jsonwebtoken");

const verificarToken = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ codigo: 401, estado: "Token no proporcionado", datos: null });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario   = payload;
    next();
  } catch (error) {
    return res.status(401).json({ codigo: 401, estado: "Token inválido o expirado", datos: null });
  }
};

const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ codigo: 403, estado: "No tenés permisos para acceder a este recurso", datos: null });
    }
    next();
  };
};

module.exports = { verificarToken, verificarRol };
