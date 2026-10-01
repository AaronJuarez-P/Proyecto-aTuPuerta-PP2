// Service worker de las notificaciones push (CU27). El backend manda { title, body, url }
// (ver enviarASuscripciones en backend/src/services/notificacion.service.js). Las URLs
// son rutas del front: /cliente/pedidos/5, /comercio/pedidos/5, /reclamos/3...

self.addEventListener('push', (evento) => {
  let datos = {}

  try {
    datos = evento.data ? evento.data.json() : {}
  } catch {
    datos = { body: evento.data ? evento.data.text() : '' }
  }

  evento.waitUntil(
    self.registration.showNotification(datos.title || 'ATuPuerta', {
      body: datos.body || '',
      icon: '/favicon.svg',
      data: { url: datos.url || '/' },
    })
  )
})

// Al tocar la notificación: si ya hay una pestaña de ATuPuerta abierta se usa esa, si no
// se abre una nueva
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()

  const url = new URL(evento.notification.data?.url || '/', self.location.origin).href

  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const abierta = ventanas.find((ventana) => ventana.url.startsWith(self.location.origin))

      if (abierta) {
        await abierta.focus()
        return abierta.navigate(url)
      }

      return self.clients.openWindow(url)
    })()
  )
})
