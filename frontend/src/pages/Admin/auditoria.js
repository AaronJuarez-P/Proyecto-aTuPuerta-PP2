// Quién hizo un cambio registrado en la auditoría. Cuando actúa un administrador vienen
// los dos (su usuario y su perfil de administrador), y se muestra que fue desde el panel.
// Sin ninguno, fue el sistema: por ejemplo, el webhook de un pago.
export function autorDeAuditoria({ usuario, administrador }) {
  if (administrador) {
    return `Administrador ${administrador}`
  }

  return usuario ?? 'Sistema'
}
