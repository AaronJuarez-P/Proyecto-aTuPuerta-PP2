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
// libre, decide qué ícono se muestra. Se guarda el componente de lucide, no el ícono armado.
const ICONOS = [
  [/super|almacen|mercado/, ShoppingCart],
  [/herramienta/, Hammer],
  [/ferreter|construcc/, Wrench],
  [/librer|papeler|libro/, BookOpen],
  [/ropa|indumentaria|moda|calzado/, Shirt],
  [/farmacia|perfumer|salud/, Pill],
  [/verduler|fruta/, Carrot],
  [/panader|pasteler/, Croissant],
  [/kiosco|golosina/, Candy],
  [/mascota|veterinar/, PawPrint],
  [/electronica|tecnologia|computacion/, Laptop],
  [/bebida/, CupSoda],
  [/jugueter/, ToyBrick],
]

const normalizar = (texto) =>
  (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function iconoDeCategoria(categoria, porDefecto = Store) {
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
