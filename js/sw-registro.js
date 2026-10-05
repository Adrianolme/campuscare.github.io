// Registra el service worker (solo funciona con https o en localhost)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then((registro) => console.log('Service worker registrado. Alcance:', registro.scope))
      .catch((error) => console.warn('No se pudo registrar el service worker:', error));
  });
}
