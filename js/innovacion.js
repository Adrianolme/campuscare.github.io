/* CampusCare Lab
   - Clasificación automática (categoría + severidad + tiempo de atención)
   - Dictado por voz (Web Speech API), geolocalización, foto con miniatura
   - Mapa de calor en <canvas>
   - Tickets guardados en localStorage con ciclo de vida y notificaciones */
(() => {
  'use strict';

  // ---------- Datos base ----------
  const KEY = 'campuscare.tickets.v1';
  const KEY_N = 'campuscare.contador.v1';
  const ESTADOS = ['Abierto', 'Asignado', 'En proceso', 'Resuelto', 'Cerrado'];
  const SLA_HORAS = { 'Crítica': 2, 'Alta': 8, 'Media': 24, 'Baja': 72 };
  const PESO = { 'Crítica': 4, 'Alta': 3, 'Media': 2, 'Baja': 1 };
  const CLASE_SEV = { 'Crítica': 'crit', 'Alta': 'alta', 'Media': 'media', 'Baja': 'baja' };

  const ZONAS = [
    { id: 'edA',  nombre: 'Edificio A',    x: .06, y: .07, w: .24, h: .28, ejemplo: 5 },
    { id: 'edB',  nombre: 'Edificio B',    x: .38, y: .07, w: .24, h: .28, ejemplo: 3 },
    { id: 'edC',  nombre: 'Edificio C',    x: .70, y: .07, w: .24, h: .28, ejemplo: 9 },
    { id: 'labs', nombre: 'Laboratorios',  x: .06, y: .63, w: .24, h: .28, ejemplo: 6 },
    { id: 'bib',  nombre: 'Biblioteca',    x: .38, y: .63, w: .24, h: .28, ejemplo: 2 },
    { id: 'caf',  nombre: 'Cafetería',     x: .70, y: .63, w: .24, h: .28, ejemplo: 1 }
  ];

  const CATEGORIAS = [
    { nombre: 'Eléctrica', icono: '⚡', pal: ['luz', 'luces', 'luminaria', 'foco', 'lampara', 'apag', 'contacto', 'enchufe', 'chispa', 'cable', 'corriente', 'electric', 'tablero', 'energia', 'corto'] },
    { nombre: 'Hidráulica', icono: '💧', pal: ['fuga', 'agua', 'gotea', 'bano', 'sanitario', 'llave', 'tuberia', 'inunda', 'drenaje', 'coladera', 'tinaco', 'lavabo'] },
    { nombre: 'Mobiliario', icono: '🪑', pal: ['butaca', 'silla', 'mesa', 'banca', 'pizarron', 'puerta', 'ventana', 'cerradura', 'escritorio', 'armario', 'vidrio', 'pupitre'] },
    { nombre: 'Equipo y red', icono: '📽️', pal: ['proyector', 'computadora', 'internet', 'wifi', 'pantalla', 'bocina', 'monitor', 'teclado', 'router'] },
    { nombre: 'Climatización', icono: '❄️', pal: ['aire', 'clima', 'ventilador', 'calor', 'frio', 'ventilacion'] }
  ];

  const SEV_CRITICA = ['chispa', 'humo', 'cortocircuito', 'corto circuito', 'descarga', 'electrocut', 'incendio', 'fuego', 'gas', 'inundac', 'expuesto', 'expuestos', 'peligro', 'riesgo', 'herido', 'lesion', 'colaps', 'derrumb'];
  const SEV_ALTA = ['sin luz', 'sin corriente', 'sin energia', 'no funciona', 'no prende', 'no enciende', 'fuga', 'se apago', 'apagon', 'roto', 'rota', 'rotos', 'rotas', 'urgente', 'no hay agua', 'tapado', 'tapada', 'atascad'];
  const SEV_BAJA = ['rayad', 'sucio', 'sucia', 'pintura', 'estetic', 'despintad', 'mancha', 'chicle'];

  // Técnicos (datos de ejemplo) para el despacho inteligente
  const TECNICOS = [
    { id: 't1', nombre: 'Luis', rol: 'electricista', esp: ['Eléctrica'], zona: 'edA' },
    { id: 't2', nombre: 'Diego', rol: 'electricista', esp: ['Eléctrica'], zona: 'edC' },
    { id: 't3', nombre: 'Marta', rol: 'plomería', esp: ['Hidráulica'], zona: 'labs' },
    { id: 't4', nombre: 'Iván', rol: 'mantenimiento general', esp: ['Mobiliario', 'General'], zona: 'edB' },
    { id: 't5', nombre: 'Sofía', rol: 'equipo y climatización', esp: ['Equipo y red', 'Climatización'], zona: 'caf' }
  ];
  const POS = { edA: [0, 0], edB: [1, 0], edC: [2, 0], labs: [0, 1], bib: [1, 1], caf: [2, 1] };
  const distancia = (a, b) => Math.abs(POS[a][0] - POS[b][0]) + Math.abs(POS[a][1] - POS[b][1]);
  const cambios = []; // funciones que se ejecutan cuando cambian los tickets

  // ---------- Utilidades ----------
  const $ = (id) => document.getElementById(id);
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function el(tag, props = {}, hijos = []) {
    const nodo = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') nodo.className = v;
      else if (k === 'text') nodo.textContent = v;
      else nodo.setAttribute(k, v);
    });
    [].concat(hijos).forEach((h) => nodo.append(h));
    return nodo;
  }

  let memoria = {}; // respaldo por si localStorage no está disponible
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { memoria[k] = v; } };
  const leer = (k, def) => {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : def; } catch { return k in memoria ? memoria[k] : def; }
  };

  let avisoTimer;
  function aviso(msg) {
    const a = $('aviso');
    a.textContent = msg;
    a.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { a.hidden = true; }, 3500);
  }

  // ---------- Clasificación automática ----------
  function analizar(texto) {
    const t = norm(texto);
    const encontradas = new Set();

    let mejor = null, mejorPuntos = 0;
    CATEGORIAS.forEach((c) => {
      const hits = c.pal.filter((p) => t.includes(p));
      hits.forEach((h) => encontradas.add(h));
      if (hits.length > mejorPuntos) { mejor = c; mejorPuntos = hits.length; }
    });
    const cat = mejor || { nombre: 'General', icono: '🛠️' };

    const crit = SEV_CRITICA.filter((p) => t.includes(p));
    const alta = SEV_ALTA.filter((p) => t.includes(p));
    const baja = SEV_BAJA.filter((p) => t.includes(p));
    [...crit, ...alta, ...baja].forEach((p) => encontradas.add(p));

    let sev = 'Media';
    if (crit.length) sev = 'Crítica';
    else if (alta.length) sev = 'Alta';
    else if (baja.length) sev = 'Baja';

    return { categoria: cat.nombre, icono: cat.icono, severidad: sev, horas: SLA_HORAS[sev], terminos: [...encontradas] };
  }

  const textoHoras = (h) => (h >= 24 ? `${h / 24} día${h / 24 > 1 ? 's' : ''}` : `${h} h`);

  function pintarAnalisis() {
    const salida = $('analisis');
    const texto = $('descripcion').value.trim();
    salida.replaceChildren();
    if (texto.length < 4) {
      salida.append(el('p', { class: 'nota', text: 'Empieza a escribir y CampusCare clasificará tu reporte automáticamente.' }));
      return null;
    }
    const a = analizar(texto);
    salida.append(
      el('p', {}, [
        el('span', { class: 'chip', text: `${a.icono} ${a.categoria}` }), ' ',
        el('span', { class: `chip sev-${CLASE_SEV[a.severidad]}`, text: `Severidad ${a.severidad}` }), ' ',
        el('span', { class: 'chip', text: `⏱️ Atención en ≤ ${textoHoras(a.horas)}` })
      ])
    );
    const det = el('p', { class: 'nota' });
    det.append('Palabras detectadas: ');
    if (a.terminos.length) a.terminos.forEach((p, i) => { det.append(el('mark', { text: p })); if (i < a.terminos.length - 1) det.append(' '); });
    else det.append('ninguna (se usará categoría General y severidad Media).');
    salida.append(det);
    return a;
  }

  // ---------- Dictado por voz ----------
  const btnVoz = $('btn-voz');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btnVoz.disabled = true;
    btnVoz.title = 'Tu navegador no soporta dictado por voz (prueba con Chrome o Edge)';
    btnVoz.textContent = '🎤 Voz no disponible';
  } else {
    const rec = new SR();
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.continuous = false;
    let base = '', escuchando = false;

    btnVoz.addEventListener('click', () => {
      if (escuchando) { rec.stop(); return; }
      base = $('descripcion').value.trim();
      base = base ? base + ' ' : '';
      try { rec.start(); } catch { /* ya estaba iniciado */ }
    });
    rec.onstart = () => { escuchando = true; btnVoz.textContent = '⏹️ Escuchando... (toca para parar)'; btnVoz.classList.add('grabando'); };
    rec.onend = () => { escuchando = false; btnVoz.textContent = '🎤 Dictar por voz'; btnVoz.classList.remove('grabando'); };
    rec.onerror = (e) => aviso('Dictado no disponible: ' + e.error + '. Necesita micrófono y abrir la página con https o localhost.');
    rec.onresult = (e) => {
      let t = '';
      for (const r of e.results) t += r[0].transcript;
      $('descripcion').value = base + t;
      pintarAnalisis();
    };
  }

  // ---------- Geolocalización ----------
  let ubicacion = '';
  $('btn-ubicacion').addEventListener('click', () => {
    const msg = $('msg-extra');
    if (!('geolocation' in navigator)) { msg.textContent = 'Tu navegador no soporta geolocalización.'; return; }
    msg.textContent = 'Obteniendo ubicación...';
    navigator.geolocation.getCurrentPosition(
      (p) => {
        ubicacion = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
        msg.textContent = `📍 Ubicación adjunta: ${ubicacion}`;
      },
      () => { ubicacion = ''; msg.textContent = 'No se pudo obtener la ubicación (permiso denegado o sin señal).'; },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // ---------- Foto con miniatura ----------
  let miniaturaFoto = '';
  function crearMiniatura(archivo) {
    return new Promise((resolver) => {
      const img = new Image();
      const url = URL.createObjectURL(archivo);
      img.onload = () => {
        const max = 160, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolver(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolver(''); };
      img.src = url;
    });
  }
  $('foto').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    const fig = $('vista-foto');
    if (!f) { miniaturaFoto = ''; fig.hidden = true; return; }
    miniaturaFoto = await crearMiniatura(f);
    if (miniaturaFoto) { $('miniatura').src = miniaturaFoto; fig.hidden = false; } else { fig.hidden = true; }
  });

  // ---------- Tickets ----------
  let tickets = leer(KEY, []);
  const guardarTickets = () => guardar(KEY, tickets);

  function nuevoFolio() {
    const n = leer(KEY_N, 42) + 1;
    guardar(KEY_N, n);
    return `TCK-2026-${String(n).padStart(4, '0')}`;
  }

  // Despacho inteligente: puntaje = especialidad (+50), cercanía (-10 por zona), carga (-15 por orden activa)
  function asignarTecnico(t) {
    let mejor = null;
    TECNICOS.forEach((tec) => {
      const carga = tickets.filter((x) => x.tecnico === tec.id && x.estado < 3).length;
      const espOk = tec.esp.includes(t.cat);
      const d = distancia(tec.zona, t.zona);
      const puntos = (espOk ? 50 : 0) - 10 * d - 15 * carga;
      if (!mejor || puntos > mejor.puntos) mejor = { tec, puntos, carga, espOk, d };
    });
    t.tecnico = mejor.tec.id;
    t.tecnicoNombre = `${mejor.tec.nombre} (${mejor.tec.rol})`;
    t.motivo = `${mejor.espOk ? 'especialidad ✔' : 'sin especialidad exacta'}, a ${mejor.d} zona${mejor.d === 1 ? '' : 's'}, ${mejor.carga} orden${mejor.carga === 1 ? '' : 'es'} activa${mejor.carga === 1 ? '' : 's'}`;
    t.estado = 1; // Asignado
  }

  function registrar(base) {
    const t = Object.assign({ espacio: '', ubicacion: '', foto: '', origen: 'Reporte de usuario', estado: 0, fecha: new Date().toISOString() }, base, { folio: nuevoFolio() });
    asignarTecnico(t);
    tickets.unshift(t);
    guardarTickets();
    render();
    notificar(`${t.folio} asignado`, `${t.cat} · ${t.tecnicoNombre}`);
    return t;
  }

  $('descripcion').addEventListener('input', pintarAnalisis);

  $('form-reporte').addEventListener('submit', (e) => {
    e.preventDefault();
    const desc = $('descripcion'), edif = $('edificio');
    if (desc.value.trim().length < 10) { aviso('Describe la falla con al menos 10 caracteres.'); desc.focus(); return; }
    if (!edif.value) { aviso('Selecciona el edificio o zona.'); edif.focus(); return; }

    const a = analizar(desc.value);
    const ticket = registrar({
      desc: desc.value.trim(),
      cat: a.categoria, icono: a.icono, sev: a.severidad,
      zona: edif.value,
      espacio: $('espacio').value.trim(),
      ubicacion,
      foto: miniaturaFoto
    });
    mostrarResultado(ticket);

    e.target.reset();
    ubicacion = ''; miniaturaFoto = '';
    $('vista-foto').hidden = true;
    $('msg-extra').textContent = '';
    pintarAnalisis();
  });

  function nombreZona(id) { const z = ZONAS.find((z) => z.id === id); return z ? z.nombre : id; }

  function mostrarResultado(t) {
    const r = $('resultado');
    r.hidden = false;
    r.replaceChildren(
      el('h3', { text: '✅ Reporte enviado' }),
      el('p', { class: 'folio', text: t.folio }),
      el('p', {}, [
        el('span', { class: 'chip', text: `${t.icono} ${t.cat}` }), ' ',
        el('span', { class: `chip sev-${CLASE_SEV[t.sev]}`, text: `Severidad ${t.sev}` })
      ]),
      el('p', { class: 'nota', text: `${nombreZona(t.zona)}${t.espacio ? ' · ' + t.espacio : ''}. Tiempo de atención esperado: ${textoHoras(SLA_HORAS[t.sev])}.` }),
      el('p', { class: 'nota', text: `🧑‍🔧 Asignado automáticamente a ${t.tecnicoNombre}: ${t.motivo}.` })
    );
  }

  function render() {
    const lista = $('lista-tickets');
    lista.replaceChildren();
    $('sin-tickets').hidden = tickets.length > 0;

    tickets.forEach((t) => {
      const fecha = new Date(t.fecha);
      const cierre = t.estado >= ESTADOS.length - 1;
      const btn = el('button', { class: 'boton boton-sec', type: 'button', text: cierre ? 'Ciclo completado' : `Avanzar a "${ESTADOS[t.estado + 1]}"` });
      btn.disabled = cierre;
      btn.addEventListener('click', () => avanzar(t.folio));

      const cuerpo = el('div', { class: 'ticket-cuerpo' }, [
        el('h3', {}, [t.folio, ' ', el('span', { class: `chip sev-${CLASE_SEV[t.sev]}`, text: t.sev })]),
        el('p', {}, [el('span', { class: 'chip', text: `${t.icono} ${t.cat}` }), ' ', el('span', { class: 'chip', text: nombreZona(t.zona) + (t.espacio ? ' · ' + t.espacio : '') }), ' ', el('span', { class: 'chip', text: t.origen === 'Sensor IoT' ? '📡 Sensor IoT' : '🗣️ Usuario' })]),
        el('p', { class: 'ticket-desc', text: t.desc }),
        t.tecnicoNombre ? el('p', { class: 'nota', text: `🧑‍🔧 ${t.tecnicoNombre} — ${t.motivo}` }) : '',
        el('p', { class: 'nota' }, [el('time', { datetime: t.fecha, text: fecha.toLocaleString('es-MX') }), t.ubicacion ? ` · 📍 ${t.ubicacion}` : '']),
        el('label', { class: 'estado-lbl', text: `Estado: ${ESTADOS[t.estado]}` }),
        el('progress', { max: String(ESTADOS.length - 1), value: String(t.estado), 'aria-label': `Progreso de ${t.folio}` }),
        btn
      ]);

      const hijos = [];
      if (t.foto) hijos.push(el('img', { src: t.foto, alt: `Foto del reporte ${t.folio}`, width: '110', class: 'ticket-foto' }));
      hijos.push(cuerpo);
      lista.append(el('article', { class: 'ticket' }, hijos));
    });

    // KPIs
    $('k-total').textContent = tickets.length;
    $('k-abiertos').textContent = tickets.filter((t) => t.estado < 3).length;
    $('k-criticos').textContent = tickets.filter((t) => t.sev === 'Crítica' && t.estado < 3).length;

    dibujarMapa();
    cambios.forEach((f) => f());
  }

  function avanzar(folio) {
    const t = tickets.find((x) => x.folio === folio);
    if (!t || t.estado >= ESTADOS.length - 1) return;
    t.estado += 1;
    guardarTickets();
    render();
    notificar(`${t.folio}: ${ESTADOS[t.estado]}`, t.estado === 3 ? 'Tu reporte fue resuelto. ¡Califica el servicio!' : 'Tu reporte cambió de estado.');
    aviso(`${t.folio} → ${ESTADOS[t.estado]}`);
  }

  $('btn-borrar').addEventListener('click', () => {
    if (!tickets.length) return;
    if (confirm('¿Borrar todos tus reportes de este navegador?')) {
      tickets = [];
      guardarTickets();
      $('resultado').hidden = true;
      render();
    }
  });

  // ---------- Notificaciones ----------
  const btnNotif = $('btn-notif');
  if (!('Notification' in window)) {
    btnNotif.disabled = true;
    btnNotif.textContent = '🔔 No disponible en este navegador';
  } else {
    if (Notification.permission === 'granted') btnNotif.textContent = '🔔 Notificaciones activadas';
    btnNotif.addEventListener('click', async () => {
      const p = await Notification.requestPermission();
      btnNotif.textContent = p === 'granted' ? '🔔 Notificaciones activadas' : '🔕 Notificaciones bloqueadas';
    });
  }
  function notificar(titulo, cuerpo) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(titulo, { body: cuerpo, icon: 'img/logo.png' }); } catch { /* ignorar */ }
    }
  }

  // ---------- Mapa de calor (canvas) ----------
  const canvas = $('mapa-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  function puntajes() {
    const p = {};
    ZONAS.forEach((z) => { p[z.id] = $('chk-ejemplo').checked ? z.ejemplo : 0; });
    tickets.filter((t) => t.estado < 3).forEach((t) => { p[t.zona] = (p[t.zona] || 0) + PESO[t.sev]; });
    return p;
  }

  function colorCalor(v) { // 0..1 → verde, amarillo, naranja, rojo
    if (v < 0.25) return '34,197,94';
    if (v < 0.5) return '250,204,21';
    if (v < 0.75) return '249,115,22';
    return '220,38,38';
  }

  function rectZona(z) { return { x: z.x * W, y: z.y * H, w: z.w * W, h: z.h * H }; }

  function dibujarMapa() {
    const p = puntajes();
    ctx.clearRect(0, 0, W, H);

    // césped y senderos
    ctx.fillStyle = '#e8f5ec';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d5e6db';
    ctx.fillRect(0, H * 0.38, W, H * 0.21);
    ctx.fillRect(W * 0.31, 0, W * 0.06, H);
    ctx.fillRect(W * 0.63, 0, W * 0.06, H);

    // edificios
    ZONAS.forEach((z) => {
      const r = rectZona(z);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0f5132';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, 12); else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.stroke();
    });

    // calor
    ZONAS.forEach((z) => {
      const r = rectZona(z);
      const v = Math.min(1, (p[z.id] || 0) / 12);
      if (v <= 0) return;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, radio = 60 + v * 90;
      const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, radio);
      const c = colorCalor(v);
      g.addColorStop(0, `rgba(${c},0.85)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - radio, cy - radio, radio * 2, radio * 2);
    });

    // etiquetas
    ctx.textAlign = 'center';
    ZONAS.forEach((z) => {
      const r = rectZona(z);
      ctx.fillStyle = '#1c2b24';
      ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
      ctx.fillText(z.nombre, r.x + r.w / 2, r.y + r.h / 2 - 4);
      ctx.font = '15px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`Calor: ${p[z.id] || 0}`, r.x + r.w / 2, r.y + r.h / 2 + 20);
    });
  }

  function zonaEn(evt) {
    const b = canvas.getBoundingClientRect();
    const pt = evt.touches ? evt.touches[0] : evt;
    const x = (pt.clientX - b.left) * (W / b.width);
    const y = (pt.clientY - b.top) * (H / b.height);
    return ZONAS.find((z) => { const r = rectZona(z); return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; });
  }
  function infoZona(evt) {
    const z = zonaEn(evt);
    const salida = $('mapa-info');
    if (!z) { salida.textContent = 'Selecciona una zona del mapa.'; return; }
    const activos = tickets.filter((t) => t.zona === z.id && t.estado < 3);
    const p = puntajes()[z.id] || 0;
    const nivel = p >= 9 ? 'crítico' : p >= 6 ? 'alto' : p >= 3 ? 'medio' : 'bajo';
    salida.textContent = `${z.nombre}: nivel ${nivel} (calor ${p}). Tus reportes activos aquí: ${activos.length}.`;
  }
  canvas.addEventListener('mousemove', infoZona);
  canvas.addEventListener('click', infoZona);
  canvas.addEventListener('touchstart', infoZona, { passive: true });
  $('chk-ejemplo').addEventListener('change', dibujarMapa);

  // ---------- Inicio ----------
  window.CampusCare = { ZONAS, registrar, tickets: () => tickets, aviso, onChange: (f) => cambios.push(f) };
  render();
})();
