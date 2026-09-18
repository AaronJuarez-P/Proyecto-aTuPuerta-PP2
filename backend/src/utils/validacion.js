// Valida un id numerico que llega por la ruta, el body o la query.
// Devuelve el numero o null si no sirve.
const obtenerIdValido = (valor) => {
    const id = parseInt(valor, 10);
    return (isNaN(id) || id < 1) ? null : id;
};

// Valida una coordenada (semana 9). Devuelve el numero redondeado a 7 decimales,
// que es la precision de las columnas DECIMAL(10,7), o null si no sirve.
//
// Exige typeof number y no acepta strings numericos a proposito, igual que el
// chequeo de "disponible" en repartidor.controller.js: si aceptara strings, un
// cliente que manda "" o "abc" tendria una coordenada convertida en 0 o NaN sin
// enterarse, y 0 es una latitud perfectamente valida (el ecuador). Que falle
// ruidoso con un 400 es mejor que registrar al repartidor en el Golfo de Guinea.
const obtenerCoordenadaValida = (valor, maximo) => {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return null;
    }

    if (valor < -maximo || valor > maximo) {
        return null;
    }

    return Math.round(valor * 1e7) / 1e7;
};

// Atajos para no tener que acordarse de los limites en cada controlador
const obtenerLatitudValida = (valor) => obtenerCoordenadaValida(valor, 90);
const obtenerLongitudValida = (valor) => obtenerCoordenadaValida(valor, 180);

module.exports = {
    obtenerIdValido,
    obtenerCoordenadaValida,
    obtenerLatitudValida,
    obtenerLongitudValida
};
