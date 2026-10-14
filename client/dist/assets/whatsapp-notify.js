(function (root, factory) {
  var api = factory(root || {});
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root && root.window === root) {
    root.WhatsAppNotify = api;
  }
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  function fmtFecha(fecha) {
    if (!fecha) return '';
    var s = String(fecha).substring(0, 10);
    var partes = s.split('-');
    if (partes.length === 3) return partes[2] + '/' + partes[1] + '/' + partes[0];
    return s;
  }

  function fmtHora(hora) {
    if (!hora) return '';
    return String(hora).substring(0, 5);
  }

  function lineaServicio(servicio) {
    return servicio ? '\n💆 Servicio: ' + servicio : '';
  }

  function buildNuevoTurno(d) {
    d = d || {};
    return '🔔 NUEVO TURNO\n\n' +
      'Se registró una nueva reserva.\n\n' +
      '👤 Clienta: ' + (d.cliente || '') + '\n' +
      '📅 Fecha: ' + fmtFecha(d.fecha) + '\n' +
      '🕐 Horario: ' + fmtHora(d.hora) +
      lineaServicio(d.servicio);
  }

  function buildTurnoModificado(antes, despues) {
    antes = antes || {};
    despues = despues || {};
    return '🔄 TURNO MODIFICADO\n\n' +
      'La clienta modificó su reserva.\n\n' +
      '👤 Clienta: ' + (despues.cliente || antes.cliente || '') + '\n' +
      '📅 Fecha anterior: ' + fmtFecha(antes.fecha) + '\n' +
      '🕐 Horario anterior: ' + fmtHora(antes.hora) + '\n' +
      '📅 Nueva fecha: ' + fmtFecha(despues.fecha) + '\n' +
      '🕐 Nuevo horario: ' + fmtHora(despues.hora) +
      lineaServicio(despues.servicio || antes.servicio);
  }

  function buildTurnoCancelado(d) {
    d = d || {};
    return '❌ TURNO CANCELADO\n\n' +
      'Una clienta canceló su reserva.\n\n' +
      '👤 Clienta: ' + (d.cliente || '') + '\n' +
      '📅 Fecha: ' + fmtFecha(d.fecha) + '\n' +
      '🕐 Horario: ' + fmtHora(d.hora) +
      lineaServicio(d.servicio);
  }

  function buildTurnoManual(d) {
    d = d || {};
    return '📝 NUEVO TURNO MANUAL\n\n' +
      'Se agregó un turno desde el panel administrativo.\n\n' +
      '👤 Clienta: ' + (d.cliente || '') + '\n' +
      '📅 Fecha: ' + fmtFecha(d.fecha) + '\n' +
      '🕐 Horario: ' + fmtHora(d.hora) +
      lineaServicio(d.servicio);
  }

  function buildMessage(tipo, datos) {
    switch (tipo) {
      case 'nuevo':
        return buildNuevoTurno(datos);
      case 'modificado':
        return buildTurnoModificado(datos && datos.antes, datos && datos.despues);
      case 'cancelado':
        return buildTurnoCancelado(datos);
      case 'manual':
        return buildTurnoManual(datos);
      default:
        throw new Error('Tipo de notificación desconocido: ' + tipo);
    }
  }

  function mostrarEnlace(url) {
    var doc = root && root.document;
    if (!doc) return;
    var id = 'wa-notify-fallback';
    var prev = doc.getElementById(id);
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    var box = doc.createElement('div');
    box.id = id;
    box.setAttribute('style', 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147483647;background:#25D366;color:#fff;padding:14px 34px 14px 18px;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,.25);font-family:Arial,sans-serif;font-size:14px;line-height:1.4;max-width:90%;text-align:center;');
    box.innerHTML = 'No se pudo abrir WhatsApp automáticamente.<br><a href="' + url +
      '" target="_blank" rel="noopener" style="color:#fff;font-weight:700;text-decoration:underline;">Tocá aquí para enviar la notificación</a>';
    var btn = doc.createElement('span');
    btn.textContent = '\u2715';
    btn.setAttribute('style', 'position:absolute;top:4px;right:10px;cursor:pointer;font-weight:700;');
    btn.onclick = function () { if (box.parentNode) box.parentNode.removeChild(box); };
    box.appendChild(btn);
    (doc.body || doc.documentElement).appendChild(box);
  }

  var numeroCache = null;

  function getNumeroAdmin() {
    if (numeroCache !== null) return Promise.resolve(numeroCache);
    var f = root.fetch || (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) return Promise.resolve('');
    return f('/api/config/contacto')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        numeroCache = String((data && data.whatsappAdmin) || '').replace(/[^0-9]/g, '');
        return numeroCache;
      })
      .catch(function () {
        numeroCache = '';
        return '';
      });
  }

  function notificarAdmin(tipo, datos) {
    return getNumeroAdmin().then(function (numero) {
      if (!numero) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[WhatsApp] ADMIN_WHATSAPP_NUMBER no está configurado. No se abrió la notificación.');
        }
        return { ok: false, reason: 'not-configured' };
      }
      var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(buildMessage(tipo, datos));
      var win = null;
      if (typeof root.open === 'function') {
        try { win = root.open(url, '_blank'); } catch (e) { win = null; }
      }
      if (!win) {
        mostrarEnlace(url);
        return { ok: true, url: url, popupBlocked: true };
      }
      return { ok: true, url: url, popupBlocked: false };
    });
  }

  return {
    fmtFecha: fmtFecha,
    fmtHora: fmtHora,
    buildNuevoTurno: buildNuevoTurno,
    buildTurnoModificado: buildTurnoModificado,
    buildTurnoCancelado: buildTurnoCancelado,
    buildTurnoManual: buildTurnoManual,
    buildMessage: buildMessage,
    getNumeroAdmin: getNumeroAdmin,
    notificarAdmin: notificarAdmin,
    _resetCache: function () { numeroCache = null; }
  };
});
