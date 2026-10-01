// A dónde va cada rol después de iniciar sesión, y cómo se llama en pantalla
export const ROLES = {
  cliente: { etiqueta: 'Cliente', inicio: '/comercios' },
  comercio: { etiqueta: 'Comercio', inicio: '/comercio' },
  repartidor: { etiqueta: 'Repartidor', inicio: '/repartidor' },
  administrador: { etiqueta: 'Administrador', inicio: '/admin' },
}

export const inicioDelRol = (rol) => ROLES[rol]?.inicio ?? '/'

export const etiquetaDelRol = (rol) => ROLES[rol]?.etiqueta ?? rol

const PLURALES = { cliente: 'clientes', comercio: 'comercios', repartidor: 'repartidores', administrador: 'administradores' }

export const pluralDelRol = (rol) => PLURALES[rol] ?? rol

// Solo se vuelve a rutas internas: un ?volver=https://otro-sitio no tiene que llevar afuera
export const esRutaInterna = (ruta) =>
  typeof ruta === 'string' && ruta.startsWith('/') && !ruta.startsWith('//')
