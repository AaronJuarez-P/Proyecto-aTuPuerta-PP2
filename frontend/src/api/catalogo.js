import { pedir } from './cliente'

// Catálogo público (CU03, CU04): no hace falta sesión para mirar

// { categoria, buscar, pagina, limite } -> { comercios, paginacion }
export const listarComercios = (filtros = {}) => pedir('/comercios', { query: filtros })

// -> { comercio }
export const obtenerComercio = (id) => pedir(`/comercios/${id}`)

// { categoria, buscar, pagina, limite } -> { comercio, productos, paginacion }
export const listarProductosDeComercio = (id, filtros = {}) =>
  pedir(`/comercios/${id}/productos`, { query: filtros })

// Búsqueda global de productos (CU04).
// { buscar, categoria, comercioId, precioMin, precioMax, pagina, limite } -> { productos, paginacion }
// Cada producto trae comercio_nombre y comercio_categoria.
export const buscarProductos = (filtros = {}) => pedir('/productos', { query: filtros })
