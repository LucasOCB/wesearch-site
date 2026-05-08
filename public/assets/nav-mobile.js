/* Menu mobile (sanduíche). Drawer com focus trap, ARIA dialog e inert no resto da página.
   Best practices: WCAG 2.2, ARIA Authoring Practices Guide. */
(() => {
  const nav = document.querySelector('.nav');
  const toggle = document.querySelector('.nav-toggle');
  const backdrop = document.querySelector('.nav-backdrop');
  const menu = document.getElementById('nav-menu');
  const main = document.getElementById('main');
  if (!nav || !toggle || !menu) return;

  // Conformidade ARIA do drawer (dialog modal)
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-modal', 'true');
  menu.setAttribute('aria-label', 'Menu de navegação');

  let lastFocus = null;

  const focusables = () => Array.from(
    menu.querySelectorAll('a[href], button:not([disabled])')
  );

  const trapFocus = (e) => {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const close = () => {
    nav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapFocus);
    if (main) main.removeAttribute('inert');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  };

  const open = () => {
    lastFocus = document.activeElement;
    nav.classList.add('is-open');
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    if (main) main.setAttribute('inert', '');
    document.addEventListener('keydown', trapFocus);
    // Move focus pro primeiro link do drawer (espera transição)
    setTimeout(() => focusables()[0]?.focus(), 120);
  };

  toggle.addEventListener('click', () => {
    nav.classList.contains('is-open') ? close() : open();
  });

  backdrop?.addEventListener('click', close);

  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) close();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760 && nav.classList.contains('is-open')) close();
  }, { passive: true });
})();
