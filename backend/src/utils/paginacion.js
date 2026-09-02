// Normaliza la paginacion que llega por query string en los listados.
// limite por defecto 20, tope 100; pagina por defecto 1.
// Devuelve numeros ya validados para poder usarlos directo en LIMIT ? OFFSET ?
const obtenerPaginacion = (query) => {
    let limite = parseInt(query.limite, 10);
    let pagina = parseInt(query.pagina, 10);

    if (isNaN(limite) || limite < 1) limite = 20;
    if (limite > 100) limite = 100;
    if (isNaN(pagina) || pagina < 1) pagina = 1;

    return { limite, pagina, offset: (pagina - 1) * limite };
};

module.exports = { obtenerPaginacion };
