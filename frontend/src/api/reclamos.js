import { pedir } from './cliente'

// Reclamos del lado de quien reclama (CU25): cliente, comercio o repartidor

export const LARGO_MINIMO_RECLAMO = 10

// pedidoId es opcional: se puede reclamar sin que sea por un pedido
export const crearReclamo = ({ descripcion, pedidoId }) =>
  pedir('/reclamos', {
    metodo: 'POST',
    body: { descripcion, ...(pedidoId ? { pedido_id: Number(pedidoId) } : {}) },
  })

// { estado, pagina, limite } -> { reclamos, paginacion }
export const listarMisReclamos = (filtros = {}) => pedir('/reclamos', { query: filtros })

export const obtenerMiReclamo = (id) => pedir(`/reclamos/${id}`)
