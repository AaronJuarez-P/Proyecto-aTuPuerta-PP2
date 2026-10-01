import { useSearchParams } from 'react-router'

// Filtros de un listado guardados en la URL (?estado=en_camino&pagina=2): sobreviven a
// una recarga y otras pantallas pueden linkear directo a una vista ya filtrada.
// Cambiar un filtro vuelve a la página 1.
//
// claves: los filtros que entiende la pantalla. Los valores vacíos no van a la URL.
export function useFiltrosUrl(claves) {
  const [parametros, setParametros] = useSearchParams()
  const filtros = Object.fromEntries(claves.map((clave) => [clave, parametros.get(clave) ?? '']))
  const pagina = Number(parametros.get('pagina')) || 1

  const aplicar = (valores, nuevaPagina = 1) => {
    const limpios = Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor))
    setParametros(nuevaPagina > 1 ? { ...limpios, pagina: String(nuevaPagina) } : limpios)
  }

  return {
    filtros,
    pagina,
    hayFiltros: claves.some((clave) => filtros[clave]),
    cambiar: (cambios) => aplicar({ ...filtros, ...cambios }),
    cambiarPagina: (nueva) => aplicar(filtros, nueva),
    // conservar: los filtros que no son de búsqueda, como la pestaña elegida
    limpiar: (conservar = {}) => aplicar(conservar),
  }
}
