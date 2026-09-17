// Valida un id numerico que llega por la ruta, el body o la query.
// Devuelve el numero o null si no sirve.
const obtenerIdValido = (valor) => {
    const id = parseInt(valor, 10);
    return (isNaN(id) || id < 1) ? null : id;
};

module.exports = { obtenerIdValido };
