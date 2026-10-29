import {
  BookOpen,
  Candy,
  Carrot,
  Croissant,
  CupSoda,
  Hammer,
  Laptop,
  PawPrint,
  Pill,
  Shirt,
  ShoppingCart,
  Store,
  ToyBrick,
  Wrench,
} from 'lucide-react'

// El backend no guarda imágenes de comercios ni de productos: la categoría, que es texto
// libre, decide qué ícono se muestra y con qué tono. Se guarda el componente de lucide, no
// el ícono armado; el tono es una de las clases .rubro-* de Comunes.css.
const RUBROS = [
  [/super|almacen|mercado/, ShoppingCart, 'verde'],
  [/herramienta/, Hammer, 'naranja'],
  [/ferreter|construcc/, Wrench, 'naranja'],
  [/librer|papeler|libro/, BookOpen, 'azul'],
  [/ropa|indumentaria|moda|calzado/, Shirt, 'rosa'],
  [/farmacia|perfumer|salud/, Pill, 'turquesa'],
  [/verduler|fruta/, Carrot, 'verde'],
  [/panader|pasteler/, Croissant, 'amarillo'],
  [/kiosco|golosina/, Candy, 'amarillo'],
  [/mascota|veterinar/, PawPrint, 'amarillo'],
  [/electronica|tecnologia|computacion/, Laptop, 'violeta'],
  [/bebida/, CupSoda, 'azul'],
  [/jugueter/, ToyBrick, 'violeta'],
]

const normalizar = (texto) =>
  (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const rubroDe = (categoria) => {
  const texto = normalizar(categoria)
  return RUBROS.find(([patron]) => patron.test(texto))
}

export function iconoDeCategoria(categoria, porDefecto = Store) {
  return rubroDe(categoria)?.[1] ?? porDefecto
}

// Lo que no es de un rubro conocido va con el menta de la marca
export const tonoDeCategoria = (categoria) => rubroDe(categoria)?.[2] ?? 'menta'

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
