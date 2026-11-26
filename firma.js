/**
 * FirmaPad: área de firma con dedo, lápiz o mouse (sin librerías).
 *   const pad = new FirmaPad(canvas);
 *   pad.estaVacia(); pad.limpiar(); pad.aPNG();  // dataURL PNG recortado al trazo
 */
(function () {
  function FirmaPad(canvas, opciones) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.op = Object.assign({ grosor: 2.4, color: '#14183F' }, opciones || {});
    this.trazos = [];
    this.actual = null;
    this._onDown = this._down.bind(this);
    this._onMove = this._move.bind(this);
    this._onUp = this._up.bind(this);
    this._onResize = this.ajustar.bind(this);
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);
    canvas.addEventListener('pointerleave', this._onUp);
    window.addEventListener('resize', this._onResize);
    this.ajustar();
  }

  FirmaPad.prototype.ajustar = function () {
    const r = this.c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._redibujar();
  };

  FirmaPad.prototype._punto = function (e) {
    const r = this.c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  FirmaPad.prototype._down = function (e) {
    e.preventDefault();
    try { this.c.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    this.actual = [this._punto(e)];
    this.trazos.push(this.actual);
    this._redibujar();
  };

  FirmaPad.prototype._move = function (e) {
    if (!this.actual) return;
    e.preventDefault();
    const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (let i = 0; i < eventos.length; i++) this.actual.push(this._punto(eventos[i]));
    this._redibujar();
  };

  FirmaPad.prototype._up = function () {
    this.actual = null;
    if (this.onCambio) this.onCambio();
  };

  FirmaPad.prototype._dibujarTrazo = function (ctx, pts, k, dx, dy) {
    k = k || 1; dx = dx || 0; dy = dy || 0;
    ctx.strokeStyle = this.op.color;
    ctx.fillStyle = this.op.color;
    ctx.lineWidth = this.op.grosor * k;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const X = function (p) { return (p.x - dx) * k; };
    const Y = function (p) { return (p.y - dy) * k; };
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(X(pts[0]), Y(pts[0]), (this.op.grosor * k) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(X(pts[0]), Y(pts[0]));
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (X(pts[i]) + X(pts[i + 1])) / 2, my = (Y(pts[i]) + Y(pts[i + 1])) / 2;
      ctx.quadraticCurveTo(X(pts[i]), Y(pts[i]), mx, my);
    }
    const u = pts[pts.length - 1];
    ctx.lineTo(X(u), Y(u));
    ctx.stroke();
  };

  FirmaPad.prototype._redibujar = function () {
    const r = this.c.getBoundingClientRect();
    this.ctx.clearRect(0, 0, r.width, r.height);
    for (let i = 0; i < this.trazos.length; i++) this._dibujarTrazo(this.ctx, this.trazos[i]);
  };

  FirmaPad.prototype.limpiar = function () {
    this.trazos = [];
    this.actual = null;
    this._redibujar();
    if (this.onCambio) this.onCambio();
  };

  /** Vacía si no hay trazos o si el trazo es tan pequeño que no parece firma. */
  FirmaPad.prototype.estaVacia = function () {
    const b = this._caja();
    return !b || (b.w < 12 && b.h < 12);
  };

  FirmaPad.prototype._caja = function () {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    this.trazos.forEach(function (t) {
      t.forEach(function (p) {
        n++;
        if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
      });
    });
    return n ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };

  /** PNG transparente recortado al trazo, a 3x de resolución para que se vea nítido en el PDF. */
  FirmaPad.prototype.aPNG = function () {
    const b = this._caja();
    if (!b) return '';
    const pad = 8, k = 3;
    const w = Math.ceil((b.w + pad * 2) * k), h = Math.ceil((b.h + pad * 2) * k);
    const off = document.createElement('canvas');
    off.width = Math.min(w, 2400);
    off.height = Math.min(h, 1200);
    const ctx = off.getContext('2d');
    const kk = Math.min(k, off.width / (b.w + pad * 2), off.height / (b.h + pad * 2));
    const self = this;
    this.trazos.forEach(function (t) { self._dibujarTrazo(ctx, t, kk, b.x - pad, b.y - pad); });
    return off.toDataURL('image/png');
  };

  FirmaPad.prototype.destruir = function () {
    this.c.removeEventListener('pointerdown', this._onDown);
    this.c.removeEventListener('pointermove', this._onMove);
    this.c.removeEventListener('pointerup', this._onUp);
    this.c.removeEventListener('pointercancel', this._onUp);
    this.c.removeEventListener('pointerleave', this._onUp);
    window.removeEventListener('resize', this._onResize);
  };

  window.FirmaPad = FirmaPad;
})();
