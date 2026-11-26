/**
 * Control de Aseo — Mdreieck S.A de C.V
 * App web (GitHub Pages) que usa la API de Google Apps Script.
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const ESTADOS = ['', '✔', 'Pendiente', 'N/A'];
  const CLASE = { '': 'vacio', '✔': 'ok', 'Pendiente': 'pend', 'N/A': 'na' };
  const TEXTO_ESTADO = { '': 'Sin marcar', '✔': 'Realizado', 'Pendiente': 'Pendiente', 'N/A': 'No aplica' };
  const DIA_CORTO = { L: 'Lu', M: 'Ma', X: 'Mi', J: 'Ju', V: 'Vi' };
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ICONO_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* ---------------- Utilidades ---------------- */
  function hoyISO() { return new Date().toLocaleDateString('en-CA', { timeZone: cfg.ZONA }); }
  function horaLocal() {
    return new Date().toLocaleTimeString('es-MX', { timeZone: cfg.ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function fechaLarga(f) {
    const s = new Date(f + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function frecuencia(d) { return d === 'LMXJV' ? 'Diario' : String(d || '').split('').map(function (c) { return DIA_CORTO[c]; }).join(' · '); }
  function leer(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

  let toastTimer = null;
  function toast(msg, error) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (error ? ' toast-error' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, error ? 6000 : 3000);
  }

  /* ---------------- Estado ---------------- */
  const hoy = hoyISO();
  const st = {
    vista: 'hoy',
    fecha: hoy,
    nivel: null,
    dia: null,
    cargando: false,
    error: '',
    plan: null,
    areaPlan: '',
    mesAnio: Number(hoy.slice(0, 4)),
    mesNum: Number(hoy.slice(5, 7)),
    mesDatos: {},
    reportes: null,
    pdf: null,
    generando: false
  };

  function areaPorId(id) {
    return st.dia ? st.dia.areas.filter(function (a) { return a.id === id; })[0] : null;
  }

  /* ---------------- Carga de datos ---------------- */
  async function cargarDia() {
    st.cargando = true; st.error = '';
    render();
    try {
      st.dia = await Api.dia(st.fecha);
      const niveles = nivelesDe(st.dia);
      if (niveles.indexOf(st.nivel) < 0) st.nivel = niveles[0] || null;
    } catch (e) {
      st.error = e.message;
    } finally {
      st.cargando = false;
      render();
    }
  }

  async function cargarPlan() {
    if (st.plan) return render();
    st.cargando = true; st.error = ''; render();
    try {
      st.plan = await Api.plan();
      if (!st.areaPlan && st.plan.areas.length) st.areaPlan = st.plan.areas[0].id;
    } catch (e) { st.error = e.message; } finally { st.cargando = false; render(); }
  }

  async function cargarMes() {
    const k = st.mesAnio + '-' + st.mesNum;
    st.cargando = true; st.error = ''; render();
    try { st.mesDatos[k] = await Api.mes(st.mesAnio, st.mesNum); }
    catch (e) { st.error = e.message; } finally { st.cargando = false; render(); }
  }

  async function cargarReporte() {
    st.cargando = true; st.error = ''; render();
    try {
      const r = await Promise.all([Api.dia(st.fecha), Api.reportes()]);
      st.dia = r[0]; st.reportes = r[1];
    } catch (e) { st.error = e.message; } finally { st.cargando = false; render(); }
  }

  function nivelesDe(dia) {
    const n = [];
    (dia ? dia.areas : []).forEach(function (a) { if (n.indexOf(a.nivel) < 0) n.push(a.nivel); });
    return n.sort();
  }

  /* ---------------- Guardado de marcas (con espera para clics rápidos) ---------------- */
  const cola = new Map();

  function programarGuardado(a, t) {
    const k = a.id + '|' + t.elemento;
    const previo = cola.get(k);
    if (previo) clearTimeout(previo.timer);
    const fecha = st.fecha;
    const job = { area: a.id, cuerpo: function () { return { fecha: fecha, areaId: a.id, elemento: t.elemento, estado: t.estado }; } };
    job.run = function () {
      cola.delete(k);
      return Api.marcar(job.cuerpo())
        .then(function (r) { t.hora = r.hora; })
        .catch(function (e) { toast(e.message, true); cargarDia(); });
    };
    job.timer = setTimeout(job.run, 700);
    cola.set(k, job);
  }

  function vaciarCola(areaId) {
    const p = [];
    Array.from(cola.values()).forEach(function (j) {
      if (!areaId || j.area === areaId) { clearTimeout(j.timer); p.push(j.run()); }
    });
    return Promise.all(p);
  }

  // Si se cierra la pestaña con marcas sin enviar, se mandan en segundo plano.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'hidden' || !cola.size || !navigator.sendBeacon) return;
    Array.from(cola.values()).forEach(function (j) {
      clearTimeout(j.timer);
      const cuerpo = Object.assign({ action: 'marcar', token: cfg.API_TOKEN }, j.cuerpo());
      navigator.sendBeacon(cfg.API_URL, new Blob([JSON.stringify(cuerpo)], { type: 'text/plain;charset=utf-8' }));
    });
    cola.clear();
  });

  function ciclar(areaId, i) {
    const a = areaPorId(areaId);
    const t = a && a.tareas[i];
    if (!t || a.cierre) return;
    t.estado = ESTADOS[(ESTADOS.indexOf(t.estado) + 1) % ESTADOS.length];
    t.hora = t.estado ? horaLocal() : '';
    render();
    programarGuardado(a, t);
  }

  /* ---------------- Vistas ---------------- */
  function cargandoHTML() { return '<div class="vacio-msg">Cargando…</div>'; }
  function errorHTML() {
    return '<div class="error-box"><p>' + esc(st.error) + '</p><button class="btn btn-sec" data-act="reintentar">Reintentar</button></div>';
  }

  function filaFecha() {
    return '<div class="fila-fecha">' +
      '<label for="in-fecha" class="sr">Fecha</label>' +
      '<input type="date" id="in-fecha" class="campo campo-fecha" value="' + st.fecha + '" max="' + hoyISO() + '">' +
      '<button class="btn-icono" data-act="reintentar" aria-label="Actualizar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg></button>' +
      '</div>';
  }

  function vistaHoy() {
    let h = filaFecha();
    if (st.error) return h + errorHTML();
    if (!st.dia || st.dia.fecha !== st.fecha) return h + cargandoHTML();
    const d = st.dia, R = d.resumen;
    if (d.festivo) return h + '<div class="vacio-msg"><strong>Día festivo</strong><br>' + esc(d.festivo) + '. No hay tareas de aseo.</div>';
    if (!d.areas.length) return h + '<div class="vacio-msg">No hay tareas programadas para este día.</div>';

    const hechas = d.areas.reduce(function (s, a) { return s + a.tareas.filter(function (t) { return t.estado; }).length; }, 0);
    const pct = R.total ? Math.round((hechas / R.total) * 100) : 0;
    h += '<div class="progreso"><div class="progreso-txt"><strong>' + hechas + ' de ' + R.total + ' marcadas</strong>' +
      '<span>' + R.areasCerradas + ' de ' + R.areas + ' áreas cerradas</span></div>' +
      '<div class="barra-prog"><div style="width:' + pct + '%"></div></div></div>';

    h += '<div class="chips" role="group" aria-label="Nivel">';
    nivelesDe(d).forEach(function (n) {
      const as = d.areas.filter(function (a) { return a.nivel === n; });
      const c = as.filter(function (a) { return a.cierre; }).length;
      h += '<button class="chip' + (n === st.nivel ? ' activo' : '') + '" aria-pressed="' + (n === st.nivel) + '" data-act="nivel" data-n="' + n + '">' +
        '<span>Nivel ' + n + '</span><small>' + c + '/' + as.length + ' cerradas</small></button>';
    });
    h += '</div><p class="ayuda">Toca un elemento para cambiarlo: ✔ Realizado → Pendiente → N/A → sin marcar.</p>';

    d.areas.filter(function (a) { return a.nivel === st.nivel; }).forEach(function (a) { h += tarjetaArea(a); });
    return h;
  }

  function tarjetaArea(a) {
    const marcadas = a.tareas.filter(function (t) { return t.estado; }).length;
    let h = '<section class="tarjeta' + (a.cierre ? ' cerrada' : '') + '">' +
      '<div class="tarjeta-cab"><h2>' + esc(a.nombre) + '</h2>' +
      (a.cierre ? '<span class="pill pill-ok">Cerrada</span>' : '<span class="pill">' + marcadas + '/' + a.tareas.length + '</span>') +
      '</div>';
    a.tareas.forEach(function (t, i) {
      const cls = CLASE[t.estado] || 'vacio';
      const icono = cls === 'ok' ? ICONO_OK : cls === 'pend' ? '!' : cls === 'na' ? 'N/A' : '';
      h += '<button class="tarea" data-act="ciclar" data-area="' + esc(a.id) + '" data-i="' + i + '"' + (a.cierre ? ' disabled' : '') +
        ' aria-label="' + esc(t.elemento + ': ' + TEXTO_ESTADO[t.estado]) + '">' +
        '<span class="caja est-' + cls + '">' + icono + '</span>' +
        '<span class="tarea-txt"><span class="tarea-nom">' + esc(t.elemento) + '</span>' +
        '<span class="tarea-sub">' + esc(frecuencia(t.dias)) + (t.obs ? ' · ' + esc(t.obs) : '') + '</span></span>' +
        '<span class="tarea-est est-txt-' + cls + '">' + (t.estado ? esc(TEXTO_ESTADO[t.estado]) + (t.hora ? '<br>' + esc(t.hora) : '') : '') + '</span>' +
        '</button>';
    });
    if (a.cierre) {
      h += '<div class="cierre-ok">' + ICONO_OK + '<span>Cerrada por <strong>' + esc(a.cierre.responsable) + '</strong> a las ' + esc(a.cierre.hora) +
        (a.cierre.pendientes ? ' · ' + a.cierre.pendientes + ' pendiente(s)' : '') + '</span></div>';
    } else {
      h += '<div class="tarjeta-pie"><button class="btn btn-pri btn-bloque" data-act="abrir-cierre" data-area="' + esc(a.id) + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17c3-1 4-6 6-6s1 5 3 5 2-3 4-3 2 2 3 2"/><path d="M4 21h16"/></svg>Cerrar revisión con firma</button></div>';
    }
    return h + '</section>';
  }

  function vistaPlan() {
    if (st.error) return errorHTML();
    if (!st.plan) return cargandoHTML();
    const a = st.plan.areas.filter(function (x) { return x.id === st.areaPlan; })[0] || st.plan.areas[0];
    if (!a) return '<div class="vacio-msg">No hay áreas registradas.</div>';
    const hoyCod = ['', 'L', 'M', 'X', 'J', 'V', ''][new Date(hoyISO() + 'T12:00:00').getDay()];
    let h = '<label for="sel-area" class="etiqueta">Área / departamento</label><select id="sel-area" class="campo">';
    st.plan.areas.forEach(function (x) {
      h += '<option value="' + esc(x.id) + '"' + (x.id === a.id ? ' selected' : '') + '>' + esc(x.nombre) + ' · Nivel ' + x.nivel + '</option>';
    });
    h += '</select><section class="tarjeta"><div class="matriz"><div class="matriz-fila matriz-cab"><span>Elemento</span>';
    'LMXJV'.split('').forEach(function (c) { h += '<span class="' + (c === hoyCod ? 'hoy' : '') + '">' + DIA_CORTO[c] + '</span>'; });
    h += '</div>';
    let porSemana = 0;
    a.elementos.forEach(function (e) {
      h += '<div class="matriz-fila"><span class="matriz-el"><strong>' + esc(e.elemento) + '</strong><small>' + esc(frecuencia(e.dias)) + '</small></span>';
      'LMXJV'.split('').forEach(function (c) {
        const on = e.dias.indexOf(c) >= 0;
        if (on) porSemana++;
        h += '<span>' + (on ? '<i class="punto-si" aria-label="Sí">' + ICONO_OK + '</i>' : '<i class="punto-no" aria-label="No"></i>') + '</span>';
      });
      h += '</div>';
    });
    h += '</div></section><p class="ayuda">' + porSemana + ' tareas por semana en esta área. Los días se editan en la hoja <strong>Elementos</strong> de Google Sheets (L, M, X = miércoles, J, V).</p>';
    return h;
  }

  function vistaCalendario() {
    let h = '<div class="mes-nav"><button class="btn-icono" data-act="mes" data-d="-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<h2>' + MESES[st.mesNum - 1] + ' ' + st.mesAnio + '</h2>' +
      '<button class="btn-icono" data-act="mes" data-d="1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>';
    if (st.error) return h + errorHTML();
    const datos = st.mesDatos[st.mesAnio + '-' + st.mesNum];
    if (!datos) return h + cargandoHTML();
    const hoyF = hoyISO();
    let prog = 0, hech = 0;
    h += '<section class="tarjeta pad"><div class="cal cal-cab"><span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span></div><div class="cal">';
    if (datos.dias.length) for (let i = 0; i < 'LMXJV'.indexOf(datos.dias[0].dia); i++) h += '<span></span>';
    datos.dias.forEach(function (d) {
      const n = Number(d.fecha.slice(8));
      let cls = 'fut', tag = '—';
      if (d.festivo || !d.programadas) { cls = 'fest'; tag = 'N/A'; }
      else if (d.fecha <= hoyF) {
        prog += d.programadas; hech += d.realizadas + d.na;
        const p = Math.round(((d.realizadas + d.na) / d.programadas) * 100);
        if (p >= 100) { cls = 'ok'; tag = '✔'; }
        else if (d.realizadas + d.pendientes + d.na > 0) { cls = 'parcial'; tag = p + '%'; }
        else { cls = 'sin'; tag = '0%'; }
        if (d.fecha === hoyF) { cls += ' hoy'; if (p < 100) tag = 'Hoy'; }
      }
      h += '<button class="cal-dia ' + cls + '" data-act="ir-dia" data-f="' + d.fecha + '" aria-label="' + esc(fechaLarga(d.fecha) + ': ' + (d.festivo || tag)) + '">' +
        '<strong>' + n + '</strong><small>' + tag + '</small></button>';
    });
    h += '</div><div class="leyenda"><span><i class="l-ok"></i>Completo</span><span><i class="l-par"></i>Con pendientes</span><span><i class="l-fest"></i>Festivo / N/A</span></div></section>';
    const pm = prog ? Math.round((hech / prog) * 1000) / 10 : 0;
    h += '<p class="ayuda">Cumplimiento del mes hasta hoy: <strong>' + pm + '%</strong> (' + hech + ' de ' + prog + ' tareas). Toca un día para ver o completar sus revisiones.</p>';
    return h;
  }

  function vistaReporte() {
    let h = filaFecha();
    if (st.error) return h + errorHTML();
    if (!st.dia || st.dia.fecha !== st.fecha || st.reportes === null) return h + cargandoHTML();
    const d = st.dia, R = d.resumen;
    h += '<section class="tarjeta pad"><h2 class="tit">Revisiones del ' + esc(fechaLarga(d.fecha)) + '</h2>' +
      '<div class="kpis"><div><strong>' + R.areasCerradas + '/' + R.areas + '</strong><span>áreas cerradas</span></div>' +
      '<div><strong>' + R.realizadas + '</strong><span>realizadas</span></div>' +
      '<div><strong>' + R.pendientes + '</strong><span>pendientes</span></div></div><ul class="lista-areas">';
    d.areas.forEach(function (a) {
      h += '<li><span>' + esc(a.nombre) + '</span>' + (a.cierre
        ? '<span class="pill pill-ok">' + esc(a.cierre.responsable) + ' · ' + esc(a.cierre.hora) + '</span>'
        : '<span class="pill pill-pend">Sin cerrar</span>') + '</li>';
    });
    if (!d.areas.length) h += '<li><span>' + (d.festivo ? 'Día festivo: ' + esc(d.festivo) : 'Sin tareas programadas') + '</span></li>';
    h += '</ul></section>';

    h += '<section class="tarjeta pad"><h2 class="tit">Vo.Bo. de supervisión (opcional)</h2>' +
      '<label for="sup-nombre" class="etiqueta">Nombre</label>' +
      '<input id="sup-nombre" class="campo" type="text" maxlength="120" value="' + esc(leer('aseo_supervisor')) + '" placeholder="Ej. Esperanza R.">' +
      '<div class="firma-cab"><span class="etiqueta">Firma</span><button type="button" class="btn-texto" data-act="borrar-sup">Borrar firma</button></div>' +
      '<canvas id="firma-sup" class="firma" aria-label="Firma de supervisión"></canvas>' +
      '<button class="btn btn-pri btn-bloque" data-act="pdf"' + (st.generando ? ' disabled' : '') + '>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>' +
      (st.generando ? 'Generando PDF… (puede tardar hasta 1 minuto)' : 'Generar PDF del día en hoja membretada') + '</button>';
    if (st.pdf && st.pdf.fecha === st.fecha) {
      h += '<a class="pdf-ok" href="' + esc(st.pdf.url) + '" target="_blank" rel="noopener">' + ICONO_OK +
        '<span><strong>' + esc(st.pdf.nombre) + '</strong><br>' + st.pdf.areasCerradas + ' de ' + st.pdf.areas + ' áreas cerradas · Abrir PDF</span></a>';
    }
    h += '</section>';

    h += '<section class="tarjeta pad"><h2 class="tit">PDF generados</h2><ul class="lista-areas">';
    (st.reportes || []).forEach(function (r) {
      h += '<li><a href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.fecha) + '</a>' +
        '<span class="sub">' + esc(r.generado.slice(11, 16)) + ' · ' + esc(r.cerradas) + '/' + esc(r.areas) + (r.supervisor ? ' · ' + esc(r.supervisor) : '') + '</span></li>';
    });
    if (!(st.reportes || []).length) h += '<li><span class="sub">Aún no hay PDF generados.</span></li>';
    return h + '</ul></section>';
  }

  /* ---------------- Render ---------------- */
  let padSup = null;
  const TITULOS = {
    hoy: function () { return [fechaLarga(st.fecha), st.fecha === hoyISO() ? 'Aseo de hoy' : 'Aseo del día']; },
    plan: function () { return ['Lunes a viernes', 'Plan por área']; },
    calendario: function () { return ['Control mensual', 'Calendario']; },
    reporte: function () { return ['Cierre del día', 'Reporte y PDF']; }
  };
  const VISTAS = { hoy: vistaHoy, plan: vistaPlan, calendario: vistaCalendario, reporte: vistaReporte };

  function render() {
    const t = TITULOS[st.vista]();
    $('#barra-sub').textContent = t[0];
    $('#barra-titulo').textContent = t[1];
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      const act = b.getAttribute('data-vista') === st.vista;
      b.classList.toggle('activo', act);
      if (act) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (padSup) { padSup.destruir(); padSup = null; }
    $('#vista').innerHTML = VISTAS[st.vista]();
    const c = $('#firma-sup');
    if (c) padSup = new FirmaPad(c);
  }

  function irA(vista) {
    vaciarCola();
    st.vista = vista; st.error = '';
    window.scrollTo(0, 0);
    if (vista === 'hoy') return (st.dia && st.dia.fecha === st.fecha) ? render() : cargarDia();
    if (vista === 'plan') return cargarPlan();
    if (vista === 'calendario') return cargarMes();
    if (vista === 'reporte') return cargarReporte();
  }

  function recargar() {
    st.error = '';
    if (st.vista === 'hoy') return cargarDia();
    if (st.vista === 'plan') { st.plan = null; return cargarPlan(); }
    if (st.vista === 'calendario') return cargarMes();
    return cargarReporte();
  }

  /* ---------------- Cierre con firma ---------------- */
  const dlg = $('#dlg-cierre');
  let pad = null, areaCierre = null;

  function abrirCierre(areaId) {
    const a = areaPorId(areaId);
    if (!a || a.cierre) return;
    areaCierre = a;
    $('#dlg-titulo').textContent = a.nombre;
    const sin = a.tareas.filter(function (t) { return !t.estado; }).length;
    const aviso = $('#dlg-aviso');
    aviso.hidden = !sin;
    aviso.textContent = sin ? 'Hay ' + sin + ' elemento(s) sin marcar. Al cerrar quedarán como "Pendiente".' : '';
    $('#cierre-nombre').value = leer('aseo_nombre');
    $('#cierre-obs').value = '';
    dlg.showModal();
    if (!pad) pad = new FirmaPad($('#cierre-firma'));
    else { pad.ajustar(); pad.limpiar(); }
    if (!$('#cierre-nombre').value) $('#cierre-nombre').focus();
  }

  $('#cierre-limpiar').addEventListener('click', function () { if (pad) pad.limpiar(); });
  $('#cierre-cancelar').addEventListener('click', function () { dlg.close(); });

  $('#form-cierre').addEventListener('submit', async function (e) {
    e.preventDefault();
    const a = areaCierre;
    const nombre = $('#cierre-nombre').value.trim().replace(/\s+/g, ' ');
    if (nombre.length < 3) { toast('Escribe tu nombre completo.', true); $('#cierre-nombre').focus(); return; }
    if (!pad || pad.estaVacia()) { toast('Falta la firma.', true); return; }
    const btn = $('#cierre-guardar');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await vaciarCola(a.id);
      await Api.cerrarArea({ fecha: st.fecha, areaId: a.id, nombre: nombre, firma: pad.aPNG(), obs: $('#cierre-obs').value.trim() });
      guardar('aseo_nombre', nombre);
      dlg.close();
      toast('Revisión cerrada: ' + a.nombre);
      await cargarDia();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = 'Firmar y cerrar';
    }
  });

  /* ---------------- PDF del día ---------------- */
  async function generarPdf() {
    const R = st.dia.resumen;
    const nombre = ($('#sup-nombre') || {}).value ? $('#sup-nombre').value.trim() : '';
    const firma = padSup && !padSup.estaVacia() ? padSup.aPNG() : '';
    const faltan = R.areas - R.areasCerradas;
    if (faltan > 0 && !window.confirm('Faltan ' + faltan + ' área(s) por cerrar. Aparecerán como "Revisión sin cerrar" en el PDF. ¿Generar de todos modos?')) return;
    if (nombre) guardar('aseo_supervisor', nombre);
    st.generando = true; render();
    try {
      st.pdf = await Api.generarPdf({ fecha: st.fecha, supervisor: nombre, firmaSupervisor: firma });
      st.reportes = await Api.reportes();
      toast('PDF generado');
    } catch (e) {
      toast(e.message, true);
    } finally {
      st.generando = false; render();
    }
  }

  /* ---------------- Eventos ---------------- */
  document.addEventListener('click', function (e) {
    const nav = e.target.closest('.nav-btn');
    if (nav) return irA(nav.getAttribute('data-vista'));
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.getAttribute('data-act');
    if (act === 'ciclar') ciclar(b.getAttribute('data-area'), Number(b.getAttribute('data-i')));
    else if (act === 'nivel') { st.nivel = Number(b.getAttribute('data-n')); render(); }
    else if (act === 'abrir-cierre') abrirCierre(b.getAttribute('data-area'));
    else if (act === 'reintentar') recargar();
    else if (act === 'mes') {
      st.mesNum += Number(b.getAttribute('data-d'));
      if (st.mesNum < 1) { st.mesNum = 12; st.mesAnio--; }
      if (st.mesNum > 12) { st.mesNum = 1; st.mesAnio++; }
      cargarMes();
    }
    else if (act === 'ir-dia') { st.fecha = b.getAttribute('data-f'); st.vista = 'hoy'; cargarDia(); }
    else if (act === 'borrar-sup') { if (padSup) padSup.limpiar(); }
    else if (act === 'pdf') generarPdf();
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'in-fecha' && e.target.value) {
      vaciarCola();
      st.fecha = e.target.value; st.pdf = null;
      if (st.vista === 'reporte') cargarReporte(); else cargarDia();
    } else if (e.target.id === 'sel-area') {
      st.areaPlan = e.target.value; render();
    }
  });

  irA('hoy');
})();
