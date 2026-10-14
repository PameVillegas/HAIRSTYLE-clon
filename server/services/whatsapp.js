import dotenv from 'dotenv';

dotenv.config();

// Este módulo NO envía mensajes: las notificaciones de turnos a la administradora
// se generan en el cliente vía enlace wa.me (ver client/dist/assets/whatsapp-notify.js).
// Se mantiene como no-op explícito para no simular envíos exitosos.

export function inicializarWhatsApp() {
  return null;
}

export function getWhatsAppStatus() {
  return {
    initialized: false,
    ready: false,
    provider: 'wa.me (cliente)'
  };
}

export async function enviarMensajeTurno() {
  return {
    success: false,
    error: 'No implementado: las notificaciones se generan en el cliente vía wa.me.'
  };
}
