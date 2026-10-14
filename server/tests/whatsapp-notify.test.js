import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC_PATH = fileURLToPath(new URL('../../client/dist/assets/whatsapp-notify.js', import.meta.url));
const SRC = readFileSync(SRC_PATH, 'utf8');

function loadModule({ fetchImpl, openImpl, documentImpl } = {}) {
  const calls = { fetch: 0, open: [] };
  const sandbox = {
    window: {
      fetch: fetchImpl || function () { return Promise.resolve({ json: () => Promise.resolve({}) }); },
      open: openImpl || function (url) { calls.open.push(url); return {}; }
    },
    module: { exports: {} },
    console: { warn() {}, log() {}, error() {} },
    Promise,
    setTimeout,
    clearTimeout
  };
  if (documentImpl) sandbox.window.document = documentImpl;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { api: sandbox.module.exports, calls, sandbox };
}

function fakeDocument() {
  const created = [];
  const doc = {
    body: {
      appendChild(el) { created.push(el); el.parentNode = this; },
      removeChild(el) { el.parentNode = null; }
    },
    createElement(tag) {
      return {
        tag, innerHTML: '', textContent: '', parentNode: null,
        setAttribute() {}, appendChild() {}, set onclick(v) { this._onclick = v; }
      };
    },
    getElementById() { return null; }
  };
  return { doc, created };
}

function configFetch(numero) {
  return function (url) {
    if (url !== '/api/config/contacto') return Promise.reject(new Error('unexpected url ' + url));
    return Promise.resolve({ json: () => Promise.resolve({ whatsappAdmin: numero }) });
  };
}

test('fmtFecha y fmtHora formatean y truncan correctamente', () => {
  const { api } = loadModule();
  assert.equal(api.fmtFecha('2026-10-14'), '14/10/2026');
  assert.equal(api.fmtFecha('2026-10-14T09:30:00.000Z'), '14/10/2026');
  assert.equal(api.fmtHora('09:30:00'), '09:30');
  assert.equal(api.fmtHora('09:30'), '09:30');
  assert.equal(api.fmtFecha(''), '');
  assert.equal(api.fmtHora(null), '');
});

test('buildNuevoTurno incluye datos y servicio', () => {
  const { api } = loadModule();
  const msg = api.buildNuevoTurno({ cliente: 'Ana', fecha: '2026-10-14', hora: '09:30', servicio: 'Corte' });
  assert.match(msg, /NUEVO TURNO/);
  assert.match(msg, /Ana/);
  assert.match(msg, /14\/10\/2026/);
  assert.match(msg, /09:30/);
  assert.match(msg, /Corte/);
});

test('buildTurnoModificado muestra antes y despues', () => {
  const { api } = loadModule();
  const msg = api.buildTurnoModificado(
    { cliente: 'Ana', fecha: '2026-10-14', hora: '09:30' },
    { cliente: 'Ana', fecha: '2026-10-20', hora: '11:00', servicio: 'Corte' }
  );
  assert.match(msg, /TURNO MODIFICADO/);
  assert.match(msg, /14\/10\/2026/);
  assert.match(msg, /20\/10\/2026/);
  assert.match(msg, /11:00/);
  assert.match(msg, /Corte/);
});

test('buildTurnoCancelado y buildTurnoManual generan encabezados correctos', () => {
  const { api } = loadModule();
  const cancel = api.buildTurnoCancelado({ cliente: 'Ana', fecha: '2026-10-14', hora: '09:30', servicio: 'Color' });
  assert.match(cancel, /TURNO CANCELADO/);
  assert.match(cancel, /Color/);
  const manual = api.buildTurnoManual({ cliente: 'Ana', fecha: '2026-10-14', hora: '09:30', servicio: 'Color' });
  assert.match(manual, /NUEVO TURNO MANUAL/);
  assert.match(manual, /Color/);
});

test('buildMessage despacha por tipo y falla en tipo desconocido', () => {
  const { api } = loadModule();
  assert.match(api.buildMessage('nuevo', { cliente: 'X' }), /NUEVO TURNO/);
  assert.match(api.buildMessage('cancelado', { cliente: 'X' }), /CANCELADO/);
  assert.throws(() => api.buildMessage('desconocido', {}), /Tipo de notificación desconocido/);
});

test('getNumeroAdmin limpia el numero de caracteres no numericos y cachea', async () => {
  let fetches = 0;
  const { api } = loadModule({
    fetchImpl: function (url) {
      fetches++;
      return configFetch('+54 9 388 673-804')(url);
    }
  });
  const first = await api.getNumeroAdmin();
  const second = await api.getNumeroAdmin();
  assert.equal(first, '549388673804');
  assert.equal(second, '549388673804');
  assert.equal(fetches, 1, 'debe consultar la config una sola vez (cache)');
});

test('getNumeroAdmin devuelve vacio si no esta configurado', async () => {
  const { api } = loadModule({ fetchImpl: configFetch('') });
  assert.equal(await api.getNumeroAdmin(), '');
});

test('notificarAdmin abre wa.me con el mensaje cuando hay numero', async () => {
  const { api, calls } = loadModule({ fetchImpl: configFetch('549388673804') });
  const result = await api.notificarAdmin('nuevo', { cliente: 'Ana', fecha: '2026-10-14', hora: '09:30', servicio: 'Corte' });
  assert.equal(result.ok, true);
  assert.equal(result.popupBlocked, false);
  assert.equal(calls.open.length, 1);
  assert.match(calls.open[0], /^https:\/\/wa\.me\/549388673804\?text=/);
  assert.match(decodeURIComponent(calls.open[0]), /Ana/);
});

test('notificarAdmin muestra enlace de respaldo si el navegador bloquea el popup', async () => {
  const { doc, created } = fakeDocument();
  const { api } = loadModule({
    fetchImpl: configFetch('549388673804'),
    openImpl: function () { return null; },
    documentImpl: doc
  });
  const result = await api.notificarAdmin('cancelado', { cliente: 'Ana', fecha: '2026-10-14', hora: '09:30' });
  assert.equal(result.ok, true);
  assert.equal(result.popupBlocked, true);
  assert.equal(created.length, 1, 'debe mostrar un enlace de respaldo');
  assert.match(created[0].innerHTML, /https:\/\/wa\.me\/549388673804/);
});

test('notificarAdmin NO abre nada y reporta not-configured si falta el numero', async () => {
  const { api, calls } = loadModule({ fetchImpl: configFetch('') });
  const result = await api.notificarAdmin('nuevo', { cliente: 'Ana' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-configured');
  assert.equal(calls.open.length, 0, 'no debe abrir WhatsApp sin numero configurado');
});

test('_resetCache fuerza una nueva consulta de configuracion', async () => {
  let fetches = 0;
  const { api } = loadModule({
    fetchImpl: function (url) {
      fetches++;
      return configFetch('549388673804')(url);
    }
  });
  await api.getNumeroAdmin();
  api._resetCache();
  await api.getNumeroAdmin();
  assert.equal(fetches, 2);
});
