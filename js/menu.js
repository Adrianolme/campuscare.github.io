// Menú hamburguesa (compartido por todas las páginas)
(() => {
  const btn = document.getElementById('btn-menu');
  const menu = document.getElementById('menu');
  if (!btn || !menu) return;

  function cerrarMenu() {
    menu.classList.remove('abierto');
    btn.classList.remove('activo');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Abrir menú');
  }

  btn.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    btn.classList.toggle('activo', abierto);
    btn.setAttribute('aria-expanded', abierto);
    btn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });

  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', cerrarMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarMenu(); });
})();
