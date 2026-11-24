import { pedir } from './cliente'
import { aFormulario } from '../utils/imagenes'

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
//
// Con la verificación del correo prendida en el backend (EMAIL_MODO=mock, consola o smtp) todavía
// no crea la cuenta: contesta { verificacion_pendiente: true, email, minutos_vigencia,
// segundos_reenvio, codigo_mock? } y falta verificarCorreo(). Con EMAIL_MODO=off la crea
// directo y la respuesta no trae verificacion_pendiente. El front no se configura: mira
// qué contestó.
export const registrarCliente = (datos) =>
  pedir('/registro', { metodo: 'POST', body: datos, token: null })

// Segundo paso del registro: con el código correcto el backend crea la cuenta.
// Pide también la contraseña: el código prueba que el correo es tuyo; la contraseña, que
// el registro que estás confirmando es el tuyo y no el de alguien que se anotó encima.
export const verificarCorreo = ({ email, contrasena, codigo }) =>
  pedir('/registro/verificar', {
    metodo: 'POST',
    body: { email: email.trim(), contrasena, codigo },
    token: null,
  })

// Pide un código nuevo para un registro que todavía no se verificó. Contesta
// { mensaje, email, minutos_vigencia, segundos_reenvio, codigo_mock? }, o un 429 con
// segundos_restantes si todavía no pasó la espera entre un código y el siguiente.
export const reenviarCodigo = ({ email, contrasena }) =>
  pedir('/registro/reenviar', {
    metodo: 'POST',
    body: { email: email.trim(), contrasena },
    token: null,
  })

// Sobre una cuenta que ya existe: email y contrasena son los de esa cuenta.
// { nombre, email, contrasena, telefono, cuit_cuil, categoria, direccion, horario_atencion }
// logo es opcional: un Blob ya achicado por prepararImagen. Con logo viaja como
// multipart/form-data y el comercio nace con él; sin logo, como JSON.
export const registrarComercio = (datos, logo) =>
  pedir('/registroComercio', { metodo: 'POST', body: logo ? aFormulario(datos, logo) : datos, token: null })

// { nombre, email, contrasena, telefono, dni, tipo_vehiculo, patente, numero_licencia }
export const registrarRepartidor = (datos) =>
  pedir('/registroRepartidor', { metodo: 'POST', body: datos, token: null })
