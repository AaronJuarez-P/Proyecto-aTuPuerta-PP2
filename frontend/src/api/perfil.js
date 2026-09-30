import { pedir } from './cliente'

// La cuenta y los perfiles que tiene (cliente, comercio, repartidor, administrador).
// Sirve también para validar la sesión al abrir la app: si el token ya no sirve, el
// cliente HTTP la cierra.
export const obtenerPerfil = () => pedir('/perfil')

// Cualquier subconjunto de { nombre, telefono, direccion_entrega }
export const actualizarPerfil = (cambios) => pedir('/perfil', { metodo: 'PATCH', body: cambios })

export const cambiarContrasena = (contrasenaActual, contrasenaNueva) =>
  pedir('/perfil/contrasena', {
    metodo: 'PATCH',
    body: { contrasena_actual: contrasenaActual, contrasena_nueva: contrasenaNueva },
  })

export const darDeBajaCuenta = (contrasena) =>
  pedir('/perfil', { metodo: 'DELETE', body: { contrasena } })
