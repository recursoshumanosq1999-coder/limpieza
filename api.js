/**
 * Cliente de la API de Apps Script.
 * Se envía como text/plain para evitar la verificación CORS previa (preflight),
 * que Apps Script no responde.
 */
(function () {
  async function llamar(action, datos) {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.API_URL || cfg.API_URL.indexOf('PEGA_AQUI') >= 0) {
      throw new Error('Falta configurar API_URL en js/config.js');
    }
    let res;
    try {
      res = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action, token: cfg.API_TOKEN }, datos || {})),
        redirect: 'follow'
      });
    } catch (e) {
      throw new Error('Sin conexión con el servidor. Revisa tu internet.');
    }
    if (!res.ok) throw new Error('Error del servidor (' + res.status + ')');
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Respuesta no válida del servidor. ¿La implementación es "Cualquier usuario"?'); }
    if (!j.ok) throw new Error(j.error || 'Error desconocido');
    return j.data;
  }

  window.Api = {
    dia: function (fecha) { return llamar('dia', { fecha: fecha }); },
    marcar: function (d) { return llamar('marcar', d); },
    cerrarArea: function (d) { return llamar('cerrarArea', d); },
    reabrirArea: function (d) { return llamar('reabrirArea', d); },
    generarPdf: function (d) { return llamar('generarPdf', d); },
    plan: function () { return llamar('plan'); },
    mes: function (anio, mes) { return llamar('mes', { anio: anio, mes: mes }); },
    reportes: function () { return llamar('reportes', { limite: 15 }); }
  };
})();
