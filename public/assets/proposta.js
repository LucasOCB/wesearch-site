/* ========== Volume switch (2025 / 2026 / Média mensal) ========== */
/* Volumes consolidados (mar/2025 a abr/2026) */
const VOL_DATA = {
  '2025': {
    title: 'Acumulado 2025 · mar–dez',
    small: [
      { lbl: 'Lives',       fmt: '30' },
      { lbl: 'Comentários', fmt: '232' },
      { lbl: 'Artigos',     fmt: '80'  }
    ],
    bars: [
      { lbl: 'Views',    val: 60496, fmt: '60.496' },
      { lbl: 'Leituras', val: 45707, fmt: '45.707' }
    ],
    max: 65000,
    ticks: ['0','15K','30K','45K','65K'],
    kpis: [
      { b: '30', s: 'Lives' }, { b: '60.496', s: 'Views' },
      { b: '232', s: 'Comentários' }, { b: '80', s: 'Artigos' },
      { b: '45.707', s: 'Leituras' }
    ]
  },
  '2026': {
    title: 'Acumulado 2026 · jan–abr (parcial)',
    small: [
      { lbl: 'Lives',       fmt: '17' },
      { lbl: 'Comentários', fmt: '99' },
      { lbl: 'Artigos',     fmt: '27' }
    ],
    bars: [
      { lbl: 'Views',    val: 37966, fmt: '37.966' },
      { lbl: 'Leituras', val: 17537, fmt: '17.537' }
    ],
    max: 40000,
    ticks: ['0','10K','20K','30K','40K'],
    kpis: [
      { b: '17', s: 'Lives' }, { b: '37.966', s: 'Views' },
      { b: '99', s: 'Comentários' }, { b: '27', s: 'Artigos' },
      { b: '17.537', s: 'Leituras' }
    ]
  },
  media: {
    title: 'Média mensal · 14 meses',
    small: [
      { lbl: 'Lives',       fmt: '4'  },
      { lbl: 'Comentários', fmt: '24' },
      { lbl: 'Artigos',     fmt: '9'  }
    ],
    bars: [
      { lbl: 'Views',    val: 7033, fmt: '7.033' },
      { lbl: 'Leituras', val: 5270, fmt: '5.270' }
    ],
    max: 8000,
    ticks: ['0','2K','4K','6K','8K'],
    kpis: [
      { b: '4', s: 'Lives' }, { b: '7.033', s: 'Views' },
      { b: '24', s: 'Comentários' }, { b: '9', s: 'Artigos' },
      { b: '5.270', s: 'Leituras' }
    ]
  }
};
function renderVolume(key) {
  const d = VOL_DATA[key]; if (!d) return;
  document.getElementById('vol-title').textContent = d.title;

  const small = document.getElementById('vol-small');
  if (small) {
    small.innerHTML = d.small.map(s =>
      `<div class="ss-card"><span class="ss-num">${s.fmt}</span><span class="ss-lbl">${s.lbl}</span></div>`
    ).join('');
  }

  const bars = document.getElementById('vol-bars');
  bars.innerHTML = d.bars.map(r =>
    `<div class="lbl">${r.lbl}</div><div class="barwrap"><div class="fill">${r.fmt}</div></div>`
  ).join('');
  // Aplica width via DOM API (CSP não permite inline style="..." em string HTML)
  const fills = bars.querySelectorAll('.fill');
  d.bars.forEach((r, i) => {
    if (!fills[i]) return;
    const pct = Math.max(1.5, (r.val / d.max) * 100);
    fills[i].style.width = pct + '%';
  });

  document.getElementById('vol-ticks').innerHTML = d.ticks.map(t => `<span>${t}</span>`).join('');
  document.getElementById('vol-kpis').innerHTML = d.kpis.map(k => `<div class="kpi"><b>${k.b}</b><span>${k.s}</span></div>`).join('');
  document.querySelectorAll('.vol-tab').forEach(b => {
    const on = b.dataset.vol === key;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}
document.querySelectorAll('.vol-tab').forEach(btn => {
  btn.addEventListener('click', () => renderVolume(btn.dataset.vol));
});
renderVolume('2026');

/* ========== Channel hover backgrounds ========== */
/* Real photos when available; generative SVG fallback otherwise. */
const CH_PHOTOS = {
  '0xcokinha':     `url("assets/analysts/0xcokinha.webp")`,
  'thutski':       `url("assets/analysts/arthur-victorio.webp")`,
  'castacrypto':   `url("assets/analysts/rafael-castaneda.webp")`,
  'victor_alfa':   `url("assets/analysts/victor-alfa.webp")`,
  'obrunoliman':   `url("assets/analysts/bruno-liman.webp")`,
  'andreiamartinbr': `url("assets/analysts/andreia-martinbr.webp")`,
  'editorial':     `url("assets/wesearch-logo.webp")`
};
function gradPhoto(c1, c2, initials) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>
    <defs>
      <radialGradient id='g' cx='30%' cy='30%' r='80%'>
        <stop offset='0%' stop-color='${c1}' stop-opacity='0.95'/>
        <stop offset='55%' stop-color='${c1}' stop-opacity='0.35'/>
        <stop offset='100%' stop-color='${c2}' stop-opacity='1'/>
      </radialGradient>
      <pattern id='p' width='14' height='14' patternUnits='userSpaceOnUse'>
        <circle cx='1' cy='1' r='0.7' fill='${c1}' opacity='0.18'/>
      </pattern>
    </defs>
    <rect width='400' height='400' fill='${c2}'/>
    <rect width='400' height='400' fill='url(#g)'/>
    <rect width='400' height='400' fill='url(#p)'/>
    <text x='50%' y='54%' text-anchor='middle' font-family='Fraunces, Georgia, serif' font-size='180' font-weight='500' fill='${c1}' opacity='0.55' letter-spacing='-6'>${initials}</text>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
document.querySelectorAll('.ch-card[data-photo]').forEach(card => {
  const key = card.dataset.photo;
  const bg  = card.querySelector('.ch-bg');
  if (bg && CH_PHOTOS[key]) bg.style.backgroundImage = CH_PHOTOS[key];
});

/* ========== Trend chart animation ========== */
(() => {
  const svg = document.querySelector('.trend-svg');
  const counters = document.querySelectorAll('.trend-meta b[data-target]');
  if (!svg && !counters.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const animateCount = (el, to, duration = 1800, delay = 1200) => {
    if (reduceMotion) { el.textContent = to; return; }
    const start = performance.now() + delay;
    const tick = now => {
      const elapsed = now - start;
      if (elapsed < 0) { requestAnimationFrame(tick); return; }
      const t = Math.min(elapsed / duration, 1);
      el.textContent = Math.round(easeOutCubic(t) * to);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const triggered = new WeakSet();
  const trigger = (target) => {
    if (triggered.has(target)) return;
    triggered.add(target);
    if (svg) svg.classList.add('is-visible');
    counters.forEach(el => animateCount(el, parseInt(el.dataset.target, 10)));
  };

  const target = svg || counters[0]?.closest('.hv-card') || document.body;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) trigger(target); });
    }, { threshold: 0.35 });
    io.observe(target);
  } else {
    trigger(target);
  }
})();

