/* CampusCare Lab - módulos: sensores IoT (gemelo digital), mantenimiento predictivo, impacto */
(() => {
  'use strict';
  const CC = window.CampusCare;
  if (!CC) return;
  const $ = (id) => document.getElementById(id);
  const ZONAS = CC.ZONAS;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ============ 1. Sensores IoT + gemelo digital ============ */
  const TIPOS = {
    energia: { nombre: 'Energía', u: 'kW', base: [8, 18], umbral: 30, pico: [38, 48], icono: '⚡', cat: 'Eléctrica', sev: 'Crítica', txt: 'pico de consumo eléctrico', color: '#f59e0b' },
    agua: { nombre: 'Agua', u: 'L/min', base: [5, 14], umbral: 35, pico: [45, 60], icono: '💧', cat: 'Hidráulica', sev: 'Alta', txt: 'flujo de agua anormal (posible fuga)', color: '#0ea5e9' },
    temp: { nombre: 'Temperatura', u: '°C', base: [22, 27], umbral: 33, pico: [36, 42], icono: '🌡️', cat: 'Climatización', sev: 'Media', txt: 'temperatura elevada', color: '#ef4444' }
  };
  const estado = {};
  ZONAS.forEach((z) => {
    estado[z.id] = {};
    Object.entries(TIPOS).forEach(([k, t]) => { estado[z.id][k] = { v: rnd(...t.base), hist: [], anom: 0, abierto: false }; });
  });

  let sel = 'edC';
  const feed = $('twin-feed');

  function evento(txt, clase) {
    const li = document.createElement('li');
    if (clase) li.className = clase;
    li.textContent = `${new Date().toLocaleTimeString('es-MX')} · ${txt}`;
    feed.prepend(li);
    while (feed.children.length > 6) feed.lastChild.remove();
  }

  function tick() {
    ZONAS.forEach((z) => Object.entries(TIPOS).forEach(([k, t]) => {
      const s = estado[z.id][k];
      const medio = (t.base[0] + t.base[1]) / 2;
      if (s.anom > 0) { s.v += (rnd(...t.pico) - s.v) * 0.5; s.anom--; }
      else s.v += (medio - s.v) * 0.25 + rnd(-1, 1) * (t.base[1] - t.base[0]) * 0.08;
      s.hist.push(s.v);
      if (s.hist.length > 40) s.hist.shift();

      if (s.v > t.umbral && !s.abierto) {
        s.abierto = true;
        const tk = CC.registrar({
          desc: `Sensor IoT: ${t.txt} (${s.v.toFixed(0)} ${t.u}) en ${z.nombre}.`,
          cat: t.cat, icono: t.icono, sev: t.sev, zona: z.id,
          espacio: `Sensor de ${t.nombre.toLowerCase()}`, origen: 'Sensor IoT'
        });
        evento(`${t.icono} ${z.nombre}: ${t.txt} → ${tk.folio} asignado a ${tk.tecnicoNombre}`, 'alerta');
        CC.aviso(`📡 Un sensor detectó una falla en ${z.nombre}. ${tk.folio} se creó automáticamente.`);
      } else if (s.abierto && s.v < t.umbral * 0.8) {
        s.abierto = false;
      }
    }));
    pintarSpark();
    actualizarLecturas();
  }

  function provocar(zid, k) {
    estado[zid][k].anom = 6;
    const z = ZONAS.find((x) => x.id === zid);
    evento(`${TIPOS[k].icono} Provocaste una falla de ${TIPOS[k].nombre.toLowerCase()} en ${z.nombre}`);
  }

  // --- mapa (gemelo digital) ---
  const cv = $('twin-canvas'), cx = cv.getContext('2d'), W = cv.width, H = cv.height;
  const rectZ = (z) => ({ x: z.x * W, y: z.y * H, w: z.w * W, h: z.h * H });

  function nivelZona(zid) {
    let n = 0;
    Object.entries(TIPOS).forEach(([k, t]) => {
      const s = estado[zid][k];
      if (s.abierto || s.v > t.umbral) n = 2;
      else if (s.v > t.umbral * 0.8) n = Math.max(n, 1);
    });
    return n;
  }

  function dibujarTwin() {
    const fase = (Date.now() % 1200) / 1200;
    cx.clearRect(0, 0, W, H);
    cx.fillStyle = '#0f2a20';
    cx.fillRect(0, 0, W, H);
    cx.strokeStyle = 'rgba(184,233,134,.08)';
    cx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    for (let y = 0; y < H; y += 40) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }

    ZONAS.forEach((z) => {
      const r = rectZ(z), n = nivelZona(z.id);
      const col = ['#22c55e', '#facc15', '#ef4444'][n];
      if (n === 2) {
        cx.strokeStyle = `rgba(239,68,68,${1 - fase})`;
        cx.lineWidth = 3;
        cx.strokeRect(r.x - 6 - fase * 14, r.y - 6 - fase * 14, r.w + 12 + fase * 28, r.h + 12 + fase * 28);
      }
      cx.fillStyle = n === 2 ? 'rgba(239,68,68,.18)' : 'rgba(255,255,255,.06)';
      cx.fillRect(r.x, r.y, r.w, r.h);
      cx.strokeStyle = z.id === sel ? '#b8e986' : col;
      cx.lineWidth = z.id === sel ? 4 : 2;
      cx.strokeRect(r.x, r.y, r.w, r.h);

      cx.textAlign = 'center';
      cx.fillStyle = '#ffffff';
      cx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
      cx.fillText(z.nombre, r.x + r.w / 2, r.y + 28);
      cx.font = '14px "Segoe UI", Arial, sans-serif';
      let y = r.y + 56;
      Object.entries(TIPOS).forEach(([k, t]) => {
        const s = estado[z.id][k];
        cx.fillStyle = s.v > t.umbral ? '#fca5a5' : '#d1fae5';
        cx.fillText(`${t.icono} ${s.v.toFixed(0)} ${t.u}`, r.x + r.w / 2, y);
        y += 22;
      });
      cx.fillStyle = col;
      cx.beginPath();
      cx.arc(r.x + r.w - 16, r.y + 16, 7, 0, Math.PI * 2);
      cx.fill();
    });
  }

  // --- gráfica de lecturas ---
  const sp = $('spark'), sx = sp.getContext('2d');
  function pintarSpark() {
    const w = sp.width, h = sp.height;
    sx.clearRect(0, 0, w, h);
    sx.fillStyle = '#f4faf6';
    sx.fillRect(0, 0, w, h);
    const yv = (r) => h - 12 - (Math.min(r, 1.8) / 1.8) * (h - 24);
    sx.strokeStyle = '#dc2626';
    sx.lineWidth = 1.5;
    sx.setLineDash([6, 4]);
    sx.beginPath(); sx.moveTo(0, yv(1)); sx.lineTo(w, yv(1)); sx.stroke();
    sx.setLineDash([]);
    sx.fillStyle = '#dc2626';
    sx.font = '12px sans-serif';
    sx.textAlign = 'left';
    sx.fillText('límite', 6, yv(1) - 5);
    Object.entries(TIPOS).forEach(([k, t]) => {
      sx.strokeStyle = t.color;
      sx.lineWidth = 2;
      sx.beginPath();
      estado[sel][k].hist.forEach((v, i) => {
        const x = (i / 39) * w, y = yv(v / t.umbral);
        if (i) sx.lineTo(x, y); else sx.moveTo(x, y);
      });
      sx.stroke();
    });
  }

  function actualizarLecturas() {
    const z = ZONAS.find((x) => x.id === sel);
    $('twin-nombre').textContent = z.nombre;
    $('twin-lect').textContent = Object.entries(TIPOS)
      .map(([k, t]) => `${t.icono} ${t.nombre}: ${estado[sel][k].v.toFixed(1)} ${t.u} (límite ${t.umbral})`)
      .join('  ·  ');
  }

  function elegir(zid) {
    sel = zid;
    $('twin-zona').value = zid;
    pintarSpark();
    actualizarLecturas();
  }

  ZONAS.forEach((z) => $('twin-zona').append(new Option(z.nombre, z.id)));
  $('twin-zona').value = sel;
  $('twin-zona').addEventListener('change', (e) => elegir(e.target.value));
  cv.addEventListener('click', (e) => {
    const b = cv.getBoundingClientRect();
    const x = (e.clientX - b.left) * (W / b.width), y = (e.clientY - b.top) * (H / b.height);
    const z = ZONAS.find((q) => { const r = rectZ(q); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; });
    if (z) elegir(z.id);
  });
  document.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => provocar(sel, b.dataset.tipo)));

  for (let i = 0; i < 30; i++) tick(); // historial inicial
  setInterval(tick, 1000);
  setInterval(dibujarTwin, 100);
  setInterval(() => {
    if (!$('twin-auto').checked) return;
    provocar(ZONAS[Math.floor(Math.random() * ZONAS.length)].id, Object.keys(TIPOS)[Math.floor(Math.random() * 3)]);
  }, 12000);

  /* ============ 5. Mantenimiento predictivo ============ */
  const HIST = { edA: [2, 3, 2, 3, 3, 4, 3, 4], edB: [3, 2, 3, 2, 2, 3, 2, 2], edC: [1, 2, 3, 3, 5, 6, 7, 9], labs: [2, 2, 3, 4, 4, 5, 5, 6], bib: [1, 1, 2, 1, 1, 2, 1, 1], caf: [2, 1, 1, 2, 1, 1, 2, 1] };
  const DOM = { edA: 'mobiliario', edB: 'de equipo y red', edC: 'eléctrico', labs: 'hidráulico', bib: 'de climatización', caf: 'hidráulico' };

  function regresion(ys) {
    const n = ys.length, xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    ys.forEach((y, i) => { num += (i - xm) * (y - ym); den += (i - xm) ** 2; });
    const m = num / den;
    return { m, b: ym - m * xm };
  }

  function riesgo(zid) {
    const ys = HIST[zid], r = regresion(ys);
    const rec = ys.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const abiertos = CC.tickets().filter((t) => t.zona === zid && t.estado < 3).length;
    return Math.min(100, Math.round(rec * 7 + Math.max(0, r.m) * 12 + abiertos * 8));
  }

  const pc = $('pred-canvas'), px = pc.getContext('2d');
  function pintarPred() {
    const ys = HIST[$('pred-zona').value], r = regresion(ys), n = ys.length;
    const fut = [n, n + 1].map((x) => Math.max(0, r.m * x + r.b));
    const todos = [...ys, ...fut];
    const max = Math.max(10, ...todos) * 1.15;
    const w = pc.width, h = pc.height, pad = 36, bw = (w - pad * 2) / todos.length;
    px.clearRect(0, 0, w, h);
    px.fillStyle = '#ffffff';
    px.fillRect(0, 0, w, h);
    px.font = '12px sans-serif';
    px.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = h - pad - (i / 4) * (h - pad * 2);
      px.strokeStyle = '#e0eee6';
      px.beginPath(); px.moveTo(pad, y); px.lineTo(w - pad + 10, y); px.stroke();
      px.fillStyle = '#5b6b63';
      px.textAlign = 'right';
      px.fillText(Math.round((max * i) / 4), pad - 6, y + 4);
    }
    px.textAlign = 'center';
    todos.forEach((v, i) => {
      const bh = (v / max) * (h - pad * 2), x = pad + i * bw + bw * 0.15, y = h - pad - bh, esFut = i >= n;
      px.fillStyle = esFut ? 'rgba(220,38,38,.3)' : '#198754';
      px.fillRect(x, y, bw * 0.7, bh);
      if (esFut) { px.strokeStyle = '#dc2626'; px.setLineDash([4, 3]); px.strokeRect(x, y, bw * 0.7, bh); px.setLineDash([]); }
      px.fillStyle = '#1c2b24';
      px.fillText(v.toFixed(esFut ? 1 : 0), x + bw * 0.35, y - 5);
      px.fillStyle = '#5b6b63';
      px.fillText(esFut ? `+${i - n + 1} sem` : `S${i + 1}`, x + bw * 0.35, h - pad + 16);
    });
    px.strokeStyle = '#0f5132';
    px.lineWidth = 2;
    px.beginPath();
    todos.forEach((_, i) => {
      const x = pad + i * bw + bw / 2, y = h - pad - (Math.max(0, r.m * i + r.b) / max) * (h - pad * 2);
      if (i) px.lineTo(x, y); else px.moveTo(x, y);
    });
    px.stroke();
  }

  function pintarRanking() {
    const ol = $('pred-rank');
    ol.replaceChildren();
    const lista = ZONAS.map((z) => ({ z, r: riesgo(z.id) })).sort((a, b) => b.r - a.r);
    lista.forEach(({ z, r }) => {
      const nivel = r >= 70 ? 'Crítico' : r >= 50 ? 'Alto' : r >= 30 ? 'Medio' : 'Bajo';
      const li = document.createElement('li');
      const et = document.createElement('span');
      et.textContent = `${z.nombre} · ${nivel} (${r}/100)`;
      const m = document.createElement('meter');
      Object.assign(m, { min: 0, max: 100, low: 30, high: 60, optimum: 0, value: r });
      li.append(et, m);
      ol.append(li);
    });
    const top = lista[0], ys = HIST[top.z.id], rg = regresion(ys);
    $('pred-reco').textContent = `Recomendación: programar mantenimiento preventivo ${DOM[top.z.id]} en ${top.z.nombre} esta semana. Riesgo ${top.r}/100; se proyectan ${Math.max(0, rg.m * ys.length + rg.b).toFixed(0)} incidencias la próxima semana si no se interviene.`;
  }

  ZONAS.forEach((z) => $('pred-zona').append(new Option(z.nombre, z.id)));
  $('pred-zona').value = 'edC';
  $('pred-zona').addEventListener('change', pintarPred);
  CC.onChange(() => { pintarRanking(); pintarPred(); });
  pintarRanking();
  pintarPred();

  /* ============ 6. Calculadora de impacto ============ */
  const moneda = (n) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  function calcular() {
    const rep = +$('c-rep').value, act = +$('c-act').value, costo = +$('c-costo').value;
    let meta = +$('c-meta').value;
    if (meta > act) { meta = act; $('c-meta').value = act; }
    ['c-rep', 'c-act', 'c-meta', 'c-costo'].forEach((id) => { $(id + '-v').textContent = $(id).value; });
    const horas = (act - meta) * rep;
    $('c-red').textContent = `${Math.round(((act - meta) / act) * 100)}%`;
    $('c-horas').textContent = horas.toLocaleString('es-MX');
    $('c-ahorro').textContent = moneda(horas * costo);
    $('bar-hoy').style.width = '100%';
    $('bar-lab').style.width = `${Math.max(3, (meta / act) * 100)}%`;
    $('t-hoy').textContent = `· ${act} h`;
    $('t-lab').textContent = `· ${meta} h`;
  }
  ['c-rep', 'c-act', 'c-meta', 'c-costo'].forEach((id) => $(id).addEventListener('input', calcular));
  calcular();
})();
