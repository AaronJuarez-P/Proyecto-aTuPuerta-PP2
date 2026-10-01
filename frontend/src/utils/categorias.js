// El backend no guarda imágenes de comercios ni de productos: la categoría, que es texto
// libre, decide qué ícono se muestra.
const ICONOS = [
  [/super|almacen|mercado/, '🛒'],
  [/herramienta/, '🔨'],
  [/ferreter|construcc/, '🔧'],
  [/librer|papeler|libro/, '📚'],
  [/ropa|indumentaria|moda|calzado/, '👕'],
  [/farmacia|perfumer|salud/, '💊'],
  [/verduler|fruta/, '🥬'],
  [/panader|pasteler/, '🥐'],
  [/kiosco|golosina/, '🍬'],
  [/mascota|veterinar/, '🐾'],
  [/electronica|tecnologia|computacion/, '💻'],
  [/bebida/, '🥤'],
  [/jugueter/, '🧸'],
]

const normalizar = (texto) =>
  (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function iconoDeCategoria(categoria, porDefecto = '🏪') {
  const texto = normalizar(categoria)
  return ICONOS.find(([patron]) => patron.test(texto))?.[1] ?? porDefecto
}

// Sugerencias para el alta de comercios. El backend acepta cualquier texto de hasta 50
// caracteres, así que esto es solo una ayuda para que no haya "Ferreteria" y "Ferretería".
export const CATEGORIAS_COMERCIO = [
  'Supermercado',
  'Almacén',
  'Ferretería',
  'Librería',
  'Indumentaria',
  'Farmacia',
  'Verdulería',
  'Panadería',
  'Kiosco',
  'Mascotas',
  'Electrónica',
]
