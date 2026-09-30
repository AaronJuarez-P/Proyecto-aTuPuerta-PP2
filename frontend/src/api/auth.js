import { pedir } from './cliente'

// Los cuatro logins del backend contestan cosas distintas: el de comercio devuelve
// datos.comercio (la fila del comercio, con usuario_id y email) y los otros tres
// datos.usuario. Acá se normalizan a una sola forma para que el resto del front no
// tenga que saberlo:
//   { token, usuario: { id, nombre, email, rol, comercioId?, repartidorId?, administradorId? } }
// id es siempre el id de la CUENTA (usuarios.id).
export async function iniciarSesion(rol, { email, contrasena, cuil }) {
  const credenciales = { email: email.trim(), contrasena }

  if (rol === 'comercio') {
    const datos = await pedir('/inicioSesionComercio', {
      metodo: 'POST',
      body: { ...credenciales, cuil: cuil.trim() },
      token: null,
    })
    const comercio = datos.comercio

    return {
      token: datos.token,
      usuario: {
        id: comercio.usuario_id,
        nombre: comercio.nombre,
        email: comercio.email,
        rol: 'comercio',
        comercioId: comercio.id,
      },
    }
  }

  const rutas = {
    cliente: '/inicioSesion',
    repartidor: '/inicioSesionRepartidor',
    administrador: '/inicioSesionAdministrador',
  }

  if (!rutas[rol]) {
    throw new Error(`Rol desconocido: ${rol}`)
  }

  const datos = await pedir(rutas[rol], { metodo: 'POST', body: credenciales, token: null })

  return { token: datos.token, usuario: datos.usuario }
}

// Comercio y repartidor tienen que avisarle al backend al salir: la sesión abierta es
// una columna de la cuenta (usuarios.rol), y cerrarla la devuelve a 'cliente'. Cliente
// y administrador no tienen endpoint: alcanza con olvidar el token.
export async function cerrarSesionEnServidor(rol) {
  if (rol === 'comercio') {
    await pedir('/cerrarSesionComercio', { metodo: 'POST' })
  } else if (rol === 'repartidor') {
    await pedir('/cerrarSesionRepartidor', { metodo: 'POST' })
  }
}

// { nombre, email, contrasena, telefono, direccion_entrega }
export const registrarCliente = (datos) =>
  pedir('/registro', { metodo: 'POST', body: datos, token: null })

// Sobre una cuenta que ya existe: email y contrasena son los de esa cuenta.
// { nombre, email, contrasena, telefono, cuit_cuil, categoria, direccion, horario_atencion }
export const registrarComercio = (datos) =>
  pedir('/registroComercio', { metodo: 'POST', body: datos, token: null })

// { nombre, email, contrasena, telefono, dni, tipo_vehiculo, patente, numero_licencia }
export const registrarRepartidor = (datos) =>
  pedir('/registroRepartidor', { metodo: 'POST', body: datos, token: null })
