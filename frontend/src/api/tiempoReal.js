import { io } from 'socket.io-client'
import { SERVIDOR_URL, avisarSesionVencida, esErrorDeSesion, leerSesionGuardada } from './cliente'

// Canal de Socket.IO del seguimiento (CU08, CU26). Va sobre el mismo servidor que la
// API; ver "Seguimiento en tiempo real" en backend/readme.md.
//
// Se entra a la sala de un pedido con seguir_pedido y el servidor empuja:
//   estado_actualizado    { pedido_id, estado, seguimiento_activo, mensaje, ocurrido_en }
//   ubicacion_actualizada { pedido_id, ubicacion: { id, latitud, longitud }, eta, ruta, retirado, emitido_en }
//
// Devuelve la función que corta la suscripción.
export function seguirPedidoEnVivo(pedidoId, { alCambiarEstado, alMoverse, alConectar, alError } = {}) {
  const id = Number(pedidoId)

  const socket = io(SERVIDOR_URL, {
    // Función y no objeto: cada reconexión toma el token vigente
    auth: (responder) => responder({ token: leerSesionGuardada()?.token }),
  })

  // En CADA connect, no solo el primero: la sala es estado del servidor y una
  // reconexión no vuelve a entrar sola (lo mismo hace scripts/cliente-seguimiento.js)
  socket.on('connect', () => {
    socket.emit('seguir_pedido', { pedidoId: id }, (respuesta) => {
      if (respuesta?.estado === 'error') {
        alError?.(respuesta.datos?.mensaje ?? 'No se pudo seguir el pedido')
        return
      }

      alConectar?.(respuesta?.datos)
    })
  })

  socket.on('estado_actualizado', (evento) => {
    if (Number(evento.pedido_id) === id) {
      alCambiarEstado?.(evento)
    }
  })

  socket.on('ubicacion_actualizada', (evento) => {
    if (Number(evento.pedido_id) === id) {
      alMoverse?.(evento)
    }
  })

  // El handshake valida la sesión igual que la API: un 401/403 de sesión la cierra
  socket.on('connect_error', (error) => {
    if (esErrorDeSesion(error.message)) {
      socket.disconnect()
      avisarSesionVencida(error.message)
      return
    }

    alError?.('Sin conexión en vivo: se reintenta sola.')
  })

  return () => {
    if (socket.connected) {
      socket.emit('dejar_pedido', { pedidoId: id })
    }

    socket.disconnect()
  }
}
