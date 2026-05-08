/* Scroll progress bar — vertical na esquerda no desktop, horizontal no topo no mobile.
   O CSS controla o eixo via media query; o JS apenas seta --progress (0 a 1). */
(() => {
  const fill = document.querySelector('.scroll-progress > .fill');
  if (!fill) return;

  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    fill.style.setProperty('--progress', ratio);
    ticking = false;
  };

  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();
