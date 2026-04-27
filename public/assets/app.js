/* ==========================================================
   CONFIG (tweakable defaults; persisted by host via markers)
========================================================== */
// Fixed, non-configurable globe settings — gentle auto-rotation, no UI tweaks
const cfg = {
  globeSpeed: 36,       // 2x faster than before (~166s per full revolution)
  globeDensity: 2,      // 50% more dots (smaller step = denser)
  autoRotate: true,
  halftone: true
};

// Magic numbers nomeados (setInterval/setTimeout/filtros de tempo).
const CFG = {
  WORKER_URL: 'https://api.wesearchdao.xyz',
  GLOBE_REFRESH_MS: 10 * 60 * 1000,      // 10min — alinhado com Cache-Control do Worker /globe
  TICKER_REFRESH_MS: 5 * 60 * 1000,      // 5min — alinhado com Cache-Control do /ticker
  DRAG_RESUME_MS: 250,                   // delay pra retomar auto-rotate após drag
  FILTER_24H_MS: 24 * 60 * 60 * 1000,
  FILTER_7D_MS:  7 * 24 * 60 * 60 * 1000,
  FILTER_30D_MS: 30 * 24 * 60 * 60 * 1000, // teto absoluto: "Tudo" = últimos 30d
};

/* ==========================================================
   DATA LOADING
========================================================== */
let EVENTOS = [];
let ANALISTAS = [];
let ARTIGOS = [];
let PARCEIROS = [];

const MONTHS_PT = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const CATEGORY_MAP = {
  'on-chain':'ON-CHAIN','onchain':'ON-CHAIN','macro':'MACRO',
  'mercado':'MERCADO','market':'MERCADO',
  'geopolitica':'GEOPOLÍTICA','geopolítica':'GEOPOLÍTICA','geopolitics':'GEOPOLÍTICA'
};

function extractFirstImg(html) {
  if (!html) return null;
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m) return null;
  const src = m[1];
  return /^https?:\/\//i.test(src) ? src : null;
}

function safeUrl(u) {
  if (!u || !/^https?:\/\//i.test(u)) return '#';
  return u.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Fontes com anti-bot agressivo que rejeitam tráfego de domínios desconhecidos
// como referrer. Usar rel="noreferrer" faz browser não enviar Referer header,
// fazendo a Bloomberg/etc tratar como visita direta. Adicionar fontes conforme
// reportado por usuários.
const NO_REFERRER_SOURCES = new Set([
  'Bloomberg',
]);
function linkRel(source) {
  return NO_REFERRER_SOURCES.has(source) ? 'noopener noreferrer' : 'noopener';
}

function safeLocalAsset(u) {
  if (!u || typeof u !== 'string') return null;
  if (!/^assets\/[a-z0-9/_-]+\.(png|jpg|jpeg|webp|svg)$/i.test(u)) return null;
  return u.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function decodeEntities(s) {
  if (!s) return '';
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

async function fetchArtigosSubstack() {
  const url = `${CFG.WORKER_URL}/substack`;
  try {
    const data = await fetch(url).then(r => r.json());
    if (data.status !== 'ok' || !data.items?.length) throw new Error('sem itens');
    return data.items.map((item, i) => {
      const d = new Date(item.pubDate);
      const date = `${String(d.getDate()).padStart(2,'0')} ${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`;
      const cats = (item.categories || []).map(c => c.toLowerCase().trim());
      const category = cats.map(c => CATEGORY_MAP[c]).find(Boolean) || 'RESEARCH';
      const excerpt = decodeEntities(item.description)
        .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120)
        .replace(/\s\S*$/, '') + '.';
      const author = decodeEntities(item.author || '').replace(/\s*-.*$/, '').trim().toUpperCase();
      return {
        n: String(i+1).padStart(2,'0'), date, title: decodeEntities(item.title), category, url: item.link,
        excerpt, author,
        thumbnail: item.thumbnail || extractFirstImg(item.content) || extractFirstImg(item.description) || null
      };
    });
  } catch {
    // fallback: usa artigos.json estático
    return fetch('data/artigos.json').then(r => r.json());
  }
}

async function loadAll() {
  const [e, a, r, p, geo] = await Promise.all([
    fetch('data/eventos.json').then(r=>r.json()),
    fetch('data/analistas.json').then(r=>r.json()),
    fetchArtigosSubstack(),
    fetch('data/parceiros.json').then(r=>r.json()),
    fetch('data/geo-dict.json').then(r=>r.json()).catch(() => ({}))
  ]);
  EVENTOS = e; ANALISTAS = a; ARTIGOS = r; PARCEIROS = p;
  // Popular GEO_DICT global + GEO_ENTRIES (sorted longest-first pra evitar
  // 'iran' matchar dentro de 'ukraine'). Falha → dict vazio, geoFromText
  // sempre retorna null e fallback ISO assume.
  GEO_DICT = geo;
  GEO_ENTRIES = Object.entries(GEO_DICT).sort((a, b) => b[0].length - a[0].length);

  // Stats inline na section "Últimas análises" — count real do Substack (cache 12h no Worker).
  // Hardcode no HTML serve como fallback se o endpoint falhar.
  fetch(`${CFG.WORKER_URL}/post-count`)
    .then(r => r.json())
    .then(d => {
      const mArt = document.getElementById('m-articles');
      if (mArt && d?.count > 0) mArt.textContent = String(d.count);
    })
    .catch(() => {});

  // Globe stats
  document.getElementById('gs-events').textContent = String(EVENTOS.length).padStart(2,'0');
  const latest = EVENTOS.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
  document.getElementById('gs-latest').textContent = latest ? new Date(latest.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.','') : '—';

  // SR list
  const sr = document.getElementById('events-sr');
  sr.innerHTML = EVENTOS.map(e => `<li>${esc(e.date)} — ${esc(e.title)} (${esc(e.country)})</li>`).join('');

  renderArticles();
  renderAnalysts();
  renderPartners();
  await setupGlobe();
  setupGlobeFilters();
}

/* ==========================================================
   NAV (sticky at 80vh)
========================================================== */
const nav = document.getElementById('nav');

/* ==========================================================
   ARTICLES CAROUSEL
========================================================== */
function esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const THUMB_PALETTES = [
  ['#FF5500','#0a0a0a','#1a1a1a'],
  ['#B23C00','#0a0a0a','#141414'],
  ['#cc4400','#0a0a0a','#1a1a1a'],
  ['#FF5500','#141414','#0a0a0a'],
];

function makeThumb(article, idx) {
  if (article.thumbnail) {
    return `<img src="${esc(article.thumbnail)}" alt="" loading="lazy">`;
  }
  const p = THUMB_PALETTES[idx % THUMB_PALETTES.length];
  const cat  = esc(article.category);
  const num  = esc(article.n);
  const date = esc(article.date);
  const variants = [
    // Concentric arcs
    `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="${p[1]}"/>
      <g stroke="${p[0]}" fill="none" opacity="0.85">
        <circle cx="260" cy="170" r="20" stroke-width="1"/>
        <circle cx="260" cy="170" r="50" stroke-width="1" opacity="0.65"/>
        <circle cx="260" cy="170" r="90" stroke-width="1" opacity="0.45"/>
        <circle cx="260" cy="170" r="140" stroke-width="1" opacity="0.25"/>
        <circle cx="260" cy="170" r="200" stroke-width="1" opacity="0.12"/>
      </g>
      <circle cx="260" cy="170" r="4" fill="${p[0]}"/>
      <text x="20" y="40" font-family="IBM Plex Mono,monospace" font-size="10" fill="#8a8580" letter-spacing="2">${cat}</text>
      <text x="20" y="185" font-family="IBM Plex Mono,monospace" font-size="9" fill="#5c5853" letter-spacing="1.6">№ ${num} / ${date}</text>
    </svg>`,
    // Line chart
    `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="${p[1]}"/>
      <g stroke="#1f1f1f" stroke-width="1">
        <line x1="0" y1="50" x2="320" y2="50"/>
        <line x1="0" y1="100" x2="320" y2="100"/>
        <line x1="0" y1="150" x2="320" y2="150"/>
      </g>
      <path d="M 10 150 L 40 140 L 70 120 L 100 130 L 130 95 L 160 110 L 190 75 L 220 80 L 250 50 L 280 60 L 310 30" stroke="${p[0]}" stroke-width="1.6" fill="none"/>
      <path d="M 10 150 L 40 140 L 70 120 L 100 130 L 130 95 L 160 110 L 190 75 L 220 80 L 250 50 L 280 60 L 310 30 L 310 200 L 10 200 Z" fill="${p[0]}" opacity="0.08"/>
      <circle cx="310" cy="30" r="3" fill="${p[0]}"/>
      <text x="20" y="40" font-family="IBM Plex Mono,monospace" font-size="10" fill="#8a8580" letter-spacing="2">${cat}</text>
      <text x="20" y="185" font-family="IBM Plex Mono,monospace" font-size="9" fill="#5c5853" letter-spacing="1.6">№ ${num} / ${date}</text>
    </svg>`,
    // Dot grid (halftone)
    `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="${p[1]}"/>
      <defs>
        <radialGradient id="g${idx}" cx="70%" cy="50%" r="60%">
          <stop offset="0%" stop-color="${p[0]}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${p[0]}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill="url(#g${idx})"/>
      <g fill="${p[0]}">
        ${Array.from({length: 16}, (_, y) => Array.from({length: 28}, (_, x) => {
          const cx = 10 + x * 11; const cy = 12 + y * 11;
          const d2 = Math.pow(cx-225,2) + Math.pow(cy-95,2);
          const r = Math.max(0, 2.2 - d2/18000);
          return r > 0.2 ? `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" opacity="${(r/2.2).toFixed(2)}"/>` : '';
        }).join('')).join('')}
      </g>
      <text x="20" y="40" font-family="IBM Plex Mono,monospace" font-size="10" fill="#8a8580" letter-spacing="2">${cat}</text>
      <text x="20" y="185" font-family="IBM Plex Mono,monospace" font-size="9" fill="#5c5853" letter-spacing="1.6">№ ${num} / ${date}</text>
    </svg>`,
    // Typographic figure
    `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
      <rect width="320" height="200" fill="${p[1]}"/>
      <g stroke="${p[0]}" opacity="0.1" stroke-width="0.5">
        <line x1="0" y1="40" x2="320" y2="40"/>
        <line x1="0" y1="80" x2="320" y2="80"/>
        <line x1="0" y1="120" x2="320" y2="120"/>
        <line x1="0" y1="160" x2="320" y2="160"/>
        <line x1="80" y1="0" x2="80" y2="200"/>
        <line x1="160" y1="0" x2="160" y2="200"/>
        <line x1="240" y1="0" x2="240" y2="200"/>
      </g>
      <text x="160" y="135" font-family="Fraunces,serif" font-weight="400" font-size="130" fill="${p[0]}" text-anchor="middle" letter-spacing="-5">${num}</text>
      <text x="20" y="40" font-family="IBM Plex Mono,monospace" font-size="10" fill="#8a8580" letter-spacing="2">${cat}</text>
      <text x="20" y="185" font-family="IBM Plex Mono,monospace" font-size="9" fill="#5c5853" letter-spacing="1.6">${date}</text>
    </svg>`,
  ];
  return variants[idx % variants.length];
}

function renderArticles() {
  const container = document.getElementById('carousel-articles');
  container.innerHTML = ARTIGOS.map((a, i) => `
    <a class="card" href="${safeUrl(a.url)}" target="_blank" rel="noopener">
      <div class="thumb">${makeThumb(a, i)}</div>
      <div class="body">
        <div class="meta-line">
          <span class="n">№ ${esc(a.n)}</span>
          <span class="sep">·</span>
          <span>${esc(a.date)}</span>
          <span class="sep">·</span>
          <span>${esc(a.category)}</span>
        </div>
        <h3 class="ttl">${esc(a.title)}</h3>
        <p class="excerpt">${esc(a.excerpt)}</p>
        <div class="foot">
          <span>Por ${esc(a.author)}</span>
          <span class="arr">↗</span>
        </div>
      </div>
    </a>
  `).join('');

  setupCarousel(container, document.getElementById('art-prev'), document.getElementById('art-next'), document.getElementById('art-bar'));
}

/* ==========================================================
   ANALYSTS CAROUSEL
========================================================== */
function renderAnalysts() {
  const container = document.getElementById('carousel-analysts');
  // Filtra membros marcados como hidden (ex: aguardando foto). Numeração
  // do `i+1` segue a posição visível, não o índice no JSON.
  const visible = ANALISTAS.filter(an => !an.hidden);
  container.innerHTML = visible.map((an, i) => {
    const hasLink = !!an.linkUrl;
    const tag = hasLink ? 'a' : 'div';
    const attrs = hasLink
      ? `href="${safeUrl(an.linkUrl)}" target="_blank" rel="noopener"`
      : 'aria-disabled="true"';
    const photoSafe = safeLocalAsset(an.photoUrl);
    const portrait = photoSafe
      ? `<img class="portrait" src="${photoSafe}" alt="${esc(an.name)}" loading="lazy" decoding="async">`
      : `<span class="initials">${esc(an.initials)}</span>`;
    const linkLabel = an.linkLabel || 'LinkedIn';
    const footer = hasLink
      ? `<span>${esc(linkLabel)}</span><span class="arr">↗</span>`
      : `<span>Em breve</span><span class="arr">—</span>`;
    return `
    <${tag} class="analyst${hasLink ? '' : ' is-disabled'}" ${attrs}>
      <div class="frame">
        <span class="tag">№ ${String(i+1).padStart(2,'0')}</span>
        <span class="ticks"></span>
        ${portrait}
      </div>
      <div>
        <div class="name">${esc(an.name)}</div>
      </div>
      <div class="go">
        ${footer}
      </div>
    </${tag}>`;
  }).join('');

  setupCarousel(container, document.getElementById('an-prev'), document.getElementById('an-next'), document.getElementById('an-bar'));
}

function setupCarousel(container, prev, next, bar) {
  function update() {
    const max = container.scrollWidth - container.clientWidth;
    const pct = max > 0 ? (container.scrollLeft / max) : 0;
    const barW = Math.max(15, (container.clientWidth / container.scrollWidth) * 100);
    bar.style.width = barW + '%';
    bar.style.left = (pct * (100 - barW)) + '%';
    prev.disabled = container.scrollLeft < 2;
    next.disabled = container.scrollLeft > max - 2;
  }
  const step = () => container.clientWidth * 0.85;
  prev.addEventListener('click', () => container.scrollBy({ left: -step(), behavior: 'smooth' }));
  next.addEventListener('click', () => container.scrollBy({ left: step(), behavior: 'smooth' }));
  container.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ==========================================================
   PARTNERS (static wordmarks, white → orange on hover)
========================================================== */
function wordmark(name) {
  return `<div class="plogo">${esc(name)}</div>`;
}
function renderPartners() {
  const grid = document.getElementById('partners-grid');
  grid.innerHTML = PARCEIROS.map((p, i) => `
    <a class="partner" href="${safeUrl(p.url)}" target="_blank" rel="noopener" aria-label="${esc(p.name)}">
      <span class="ptag">Nº ${String(i+1).padStart(2,'0')}</span>
      ${wordmark(p.name)}
    </a>
  `).join('');
}

/* ==========================================================
   GLOBE — halftone dots over orthographic projection
========================================================== */
const GLOBE_SIZE = 600;
const GLOBE_R = 260;

let rotation = [-30, -15, 0];
let autoRotate = cfg.autoRotate;
let hoverPauseUntil = 0;
let landCache = null;

async function loadWorld() {
  const resp = await fetch('data/countries-110m.json');
  return resp.json();
}

async function setupGlobe() {
  const svg = document.getElementById('globe-svg');
  const SVGNS = 'http://www.w3.org/2000/svg';
  let countriesFC = { features: [] };
  try {
    const world_ = await loadWorld();
    landCache = topojson.feature(world_, world_.objects.land);
    if (world_.objects.countries) {
      try { countriesFC = topojson.feature(world_, world_.objects.countries); } catch(e) {}
    }
  } catch (err) {
    console.warn('world-atlas fetch failed; using empty land', err);
    landCache = { type: 'FeatureCollection', features: [] };
  }

  const projection = d3.geoOrthographic()
    .scale(GLOBE_R)
    .translate([GLOBE_SIZE/2, GLOBE_SIZE/2])
    .clipAngle(90)
    .rotate(rotation);

  const path = d3.geoPath(projection);

  // -------- Fast land mask via canvas equirectangular raster --------
  const MASK_W = 720, MASK_H = 360; // 0.5°/px
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = MASK_W; maskCanvas.height = MASK_H;
  const mctx = maskCanvas.getContext('2d');
  const maskProj = d3.geoEquirectangular()
    .scale(MASK_W / (2 * Math.PI))
    .translate([MASK_W/2, MASK_H/2])
    .precision(1);
  const maskPath = d3.geoPath(maskProj, mctx);
  mctx.fillStyle = '#000'; mctx.fillRect(0,0,MASK_W,MASK_H);
  mctx.fillStyle = '#fff';
  mctx.beginPath(); maskPath(landCache); mctx.fill();
  const maskData = mctx.getImageData(0,0,MASK_W,MASK_H).data;
  function isLandLonLat(lon, lat) {
    const x = Math.floor(((lon + 180) / 360) * MASK_W) % MASK_W;
    const y = Math.floor(((90 - lat) / 180) * MASK_H);
    if (y < 0 || y >= MASK_H) return false;
    return maskData[(y * MASK_W + x) * 4] > 128;
  }

  // -------- Zoom --------
  let zoomScale = 1;
  const ZOOM_MIN = 1, ZOOM_MAX = 4;
  function applyScale() { projection.scale(GLOBE_R * zoomScale); dirty = true; }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomScale * factor));
    applyScale();
  }, { passive: false });
  let pinchStart = null;
  svg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStart = { d: Math.hypot(dx, dy), z: zoomScale };
    }
  }, { passive: true });
  svg.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      zoomScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStart.z * (Math.hypot(dx, dy) / pinchStart.d)));
      applyScale();
    }
  }, { passive: true });

  // -------- Drag rotate --------
  let dragStart = null, dragRot = null, dragMoved = 0;
  const onDown = (x, y) => { dragStart = [x, y]; dragRot = [...rotation]; dragMoved = 0; autoRotate = false; dirty = true; };
  const onMove = (x, y) => {
    if (!dragStart) return;
    dragMoved = Math.max(dragMoved, Math.abs(x - dragStart[0]) + Math.abs(y - dragStart[1]));
    const k = 0.4 / Math.max(1, zoomScale);
    rotation = [dragRot[0] + (x - dragStart[0]) * k,
                Math.max(-85, Math.min(85, dragRot[1] - (y - dragStart[1]) * k)), 0];
    projection.rotate(rotation); dirty = true;
  };
  const onUp = () => { dragStart = null; setTimeout(() => { if (!dragStart) autoRotate = cfg.autoRotate; }, CFG.DRAG_RESUME_MS); };
  svg.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onUp);
  svg.addEventListener('touchstart', e => { if (e.touches.length === 1) { const t=e.touches[0]; onDown(t.clientX, t.clientY); } }, { passive: true });
  svg.addEventListener('touchmove',  e => { if (e.touches.length === 1) { const t=e.touches[0]; onMove(t.clientX, t.clientY); } }, { passive: true });
  svg.addEventListener('touchend', (e) => { pinchStart = null; onUp(); });

  // -------- Build halftone dot grid once (land only) --------
  let dotPoints = [];
  function buildDots() {
    const step = cfg.globeDensity;
    dotPoints = [];
    for (let lat = -82; lat <= 82; lat += step) {
      for (let lon = -180; lon <= 180; lon += step) {
        if (isLandLonLat(lon, lat)) dotPoints.push([lon, lat]);
      }
    }
  }
  buildDots();

  // -------- Sort events --------
  let sortedEvents = [];
  let latestId = null;

  // -------- Static scaffold (defs, sphere, glow) created ONCE --------
  svg.innerHTML = `
    <defs>
      <radialGradient id="spheregrad" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stop-color="#141414"/>
        <stop offset="70%" stop-color="#0a0a0a"/>
        <stop offset="100%" stop-color="#050505"/>
      </radialGradient>
      <radialGradient id="sphereglow" cx="50%" cy="50%" r="55%">
        <stop offset="85%" stop-color="#FF5500" stop-opacity="0"/>
        <stop offset="100%" stop-color="#FF5500" stop-opacity="0.12"/>
      </radialGradient>
    </defs>
    <circle cx="300" cy="300" r="${GLOBE_R+8}" fill="url(#sphereglow)"/>
    <path id="g-sphere" fill="url(#spheregrad)" stroke="#1f1f1f" stroke-width="1"/>
    <path id="g-grat" fill="none" stroke="#1f1f1f" stroke-width="0.5" opacity="0.5"/>
    <g id="g-dots"></g>
    <g id="g-hover"></g>
    <g id="g-evts"></g>
  `;
  const sphereEl = svg.querySelector('#g-sphere');
  const gratEl = svg.querySelector('#g-grat');
  const dotsG = svg.querySelector('#g-dots');
  const evtsG = svg.querySelector('#g-evts');

  sphereEl.setAttribute('d', path({ type: 'Sphere' }));
  gratEl.setAttribute('d', path(d3.geoGraticule10()));

  // Pre-create dot nodes (reused every frame)
  const dotNodes = [];
  function rebuildDotNodes() {
    dotsG.innerHTML = '';
    dotNodes.length = 0;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < dotPoints.length; i++) {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'land');
      c.setAttribute('r', '1.1');
      frag.appendChild(c);
      dotNodes.push(c);
    }
    dotsG.appendChild(frag);
  }
  rebuildDotNodes();

  // Pre-create event nodes — rebuilt via buildMarkersFromEvents()
  let dirty = true;
  const evtNodes = new Map();

  function buildMarkersFromEvents(events) {
    const fresh = events.filter(e => e.country !== 'Global')
      .sort((a,b) => b.date.localeCompare(a.date));
    sortedEvents = fresh;
    latestId = fresh[0]?.id;
    evtNodes.clear();
    evtsG.innerHTML = '';
    const frag = document.createDocumentFragment();
    fresh.forEach(ev => {
      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('class', 'evt' + (ev.id === latestId ? ' pulse' : ''));
      c.setAttribute('data-id', ev.id);
      c.setAttribute('r', ev.id === latestId ? 5 : 4);
      // Nasce invisível: cx/cy default é 0 (canto do SVG). Próxima frame
      // reposiciona via projeção antes de revelar, evitando flash fora do globo.
      c.style.display = 'none';
      c.addEventListener('mouseenter', () => showTip(ev, c));
      c.addEventListener('mouseleave', hideTip);
      c.addEventListener('click', () => {
        const u = safeUrl(ev.url);
        if (u !== '#') {
          const features = NO_REFERRER_SOURCES.has(ev.source) ? 'noopener,noreferrer' : 'noopener';
          window.open(u, '_blank', features);
        }
      });
      frag.appendChild(c);
      evtNodes.set(ev.id, c);
    });
    evtsG.appendChild(frag);
    dirty = true;
  }

  buildMarkersFromEvents(EVENTOS);

  // -------- topojson feature name → GEO_DICT tag --------
  const FEATURE_TO_TAG = {
    'Brazil':'brazil','United States of America':'united states','United States':'united states',
    'Russia':'russia','Russian Federation':'russia',
    'China':'china',"China, People's Republic":'china',
    'France':'france','Germany':'germany',
    'United Kingdom':'united kingdom','England':'united kingdom','Britain':'united kingdom',
    'India':'india','Japan':'japan',
    'South Korea':'south korea','Republic of Korea':'south korea','Korea, Republic of':'south korea',
    'North Korea':'north korea',"Korea, Democratic People's Republic":'north korea',
    'Iran':'iran','Islamic Republic of Iran':'iran',
    'Israel':'israel','Turkey':'turkey','Türkiye':'turkey',
    'Saudi Arabia':'saudi arabia','Egypt':'egypt','Ukraine':'ukraine',
    'Argentina':'argentina','Mexico':'mexico','Canada':'canada',
    'Australia':'australia','South Africa':'south africa',
    'Nigeria':'nigeria','Pakistan':'pakistan','Indonesia':'indonesia',
    'Vietnam':'vietnam','Viet Nam':'vietnam',
    'Thailand':'thailand','Malaysia':'malaysia','Philippines':'philippines',
    'Singapore':'singapore','Taiwan':'taiwan',
    'Colombia':'colombia','Venezuela':'venezuela','Chile':'chile','Peru':'peru',
    'Lebanon':'lebanon','Syria':'syria','Iraq':'iraq','Yemen':'yemen',
    'United Arab Emirates':'uae','Qatar':'qatar','Kuwait':'kuwait',
    'Ethiopia':'ethiopia','Kenya':'kenya','Morocco':'morocco','Ghana':'ghana',
    'Sudan':'sudan','South Sudan':'sudan','Democratic Republic of the Congo':'congo',
    'New Zealand':'new zealand','Greece':'greece','Poland':'poland',
    'Sweden':'sweden','Netherlands':'netherlands','Switzerland':'switzerland',
    'Portugal':'portugal','Spain':'spain','Italy':'italy',
    'Afghanistan':'afghanistan','Hong Kong S.A.R.':'hong kong','Hong Kong':'hong kong',
  };
  function featureToTag(feat) {
    const n = feat?.properties?.name || feat?.properties?.NAME || feat?.properties?.admin || '';
    return FEATURE_TO_TAG[n] || n.toLowerCase();
  }

  // -------- Country name map (topojson EN → PT-BR) --------
  const COUNTRY_NAME_MAP = {
    'Brazil':'Brasil','United States of America':'EUA','United States':'EUA',
    'Hong Kong S.A.R.':'Hong Kong','Hong Kong':'Hong Kong',
    'Argentina':'Argentina','Nigeria':'Nigéria','Japan':'Japão',
    'India':'Índia','Mexico':'México','South Africa':'África do Sul',
    'Australia':'Austrália','South Korea':'Coreia do Sul',
    'Republic of Korea':'Coreia do Sul','China':'China',
    'Russia':'Russia','Ukraine':'Ucrânia','France':'França',
    'Germany':'Alemanha','United Kingdom':'Reino Unido',
    'Israel':'Israel','Iran':'Irã','Turkey':'Turquia',
    'Saudi Arabia':'Arábia Saudita','Egypt':'Egito','Canada':'Canadá',
  };
  function ptCountryFromFeature(feat) {
    const n = feat?.properties?.name || feat?.properties?.NAME || feat?.properties?.admin;
    return n ? (COUNTRY_NAME_MAP[n] || n) : null;
  }

  // -------- Country hover + click --------
  let hoverFeat = null, hoverG = null, hoverPath = null;

  function ensureHoverNodes() {
    if (hoverG) return true;
    hoverG = svg.querySelector('#g-hover');
    if (!hoverG) return false;
    hoverPath = document.createElementNS(SVGNS, 'path');
    hoverPath.setAttribute('fill', 'rgba(255,85,0,0.10)');
    hoverPath.setAttribute('stroke', '#FF5500');
    hoverPath.setAttribute('stroke-width', '1.1');
    hoverPath.setAttribute('pointer-events', 'none');
    hoverG.appendChild(hoverPath);
    return true;
  }

  const countryLabelEl  = document.getElementById('country-label');
  const panel           = document.getElementById('country-panel');
  const panelTitle      = document.getElementById('cp-title');
  const panelCount      = document.getElementById('cp-count');
  const panelList       = document.getElementById('cp-list');
  const panelClose      = document.getElementById('cp-close');



  // Foco anterior — restaurado ao fechar o panel (a11y)
  let _prevFocus = null;
  function openCountryPanel(tag, displayName) {
    const items = EVENTOS.filter(e => e.tag === tag || (e.country||'').toLowerCase() === (tag||'').toLowerCase());
    panelTitle.textContent = displayName || tag;
    panelCount.textContent = items.length === 0
      ? 'Nenhuma publicação ainda'
      : items.length + ' publicaç' + (items.length === 1 ? 'ão' : 'ões');
    panelList.innerHTML = items.length
      ? items.map(ev => `<a class="cp-item" href="${safeUrl(ev.url)}" target="_blank" rel="${linkRel(ev.source)}">
          <span class="cp-cat">${esc(ev.category)}</span>
          <span class="cp-title">${esc(ev.title)}</span>
          <span class="cp-meta">${esc(ev.source||ev.author)} · ${esc(ev.date)}</span>
        </a>`).join('')
      : `<div class="cp-empty">Ainda não cobrimos esse país — volte em breve.</div>`;
    panel.classList.add('on');
    // A11y: salva foco anterior, move pro panel pra navegação por teclado
    _prevFocus = document.activeElement;
    setTimeout(() => panel.focus?.(), 50);
  }
  function closeCountryPanel() {
    panel.classList.remove('on');
    // Restaura foco pro elemento anterior (botão/marker que abriu o panel)
    if (_prevFocus && typeof _prevFocus.focus === 'function') {
      _prevFocus.focus();
      _prevFocus = null;
    }
  }
  if (panelClose) panelClose.addEventListener('click', closeCountryPanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCountryPanel(); });
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('on')) return;
    if (e.target.closest('#country-panel')) return;
    if (e.target.closest('#globe-svg')) return; // svg click handler já cuida
    closeCountryPanel();
  });

  function setHoverFeat(feat) {
    if (feat === hoverFeat) return;
    hoverFeat = feat;
    dirty = true;
    if (!ensureHoverNodes()) return;
    if (feat) {
      const display = feat.properties?.name || feat.properties?.NAME || 'Região';
      const tag     = featureToTag(feat);
      const count   = EVENTOS.filter(e => e.tag === tag || (e.country||'').toLowerCase() === tag).length;
      countryLabelEl.querySelector('.cl-name').textContent = display;
      const meta = countryLabelEl.querySelector('.cl-meta');
      meta.textContent = count === 0 ? 'sem publicações' : count + ' publicaç' + (count === 1 ? 'ão' : 'ões');
      meta.classList.toggle('has', count > 0);
      countryLabelEl.classList.add('on');
      svg.style.cursor = 'pointer';
    } else {
      countryLabelEl?.classList.remove('on');
      svg.style.cursor = '';
    }
  }

  svg.addEventListener('mousemove', (e) => {
    if (dragStart) { setHoverFeat(null); return; }
    if (!countriesFC.features.length) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * GLOBE_SIZE;
    const sy = ((e.clientY - rect.top)  / rect.height) * GLOBE_SIZE;
    const ll = projection.invert([sx, sy]);
    if (!ll || isNaN(ll[0])) { setHoverFeat(null); return; }
    if (hoverFeat && d3.geoContains(hoverFeat, ll)) {
      const stage = document.getElementById('globe-stage');
      const sr = stage.getBoundingClientRect();
      countryLabelEl.style.left = (e.clientX - sr.left + 14) + 'px';
      countryLabelEl.style.top  = (e.clientY - sr.top  + 14) + 'px';
      return;
    }
    let found = null;
    for (const feat of countriesFC.features) {
      if (d3.geoContains(feat, ll)) { found = feat; break; }
    }
    setHoverFeat(found);
    if (found) {
      const stage = document.getElementById('globe-stage');
      const sr = stage.getBoundingClientRect();
      countryLabelEl.style.left = (e.clientX - sr.left + 14) + 'px';
      countryLabelEl.style.top  = (e.clientY - sr.top  + 14) + 'px';
    }
  });
  svg.addEventListener('mouseleave', () => setHoverFeat(null));

  svg.addEventListener('click', (e) => {
    if (dragMoved > 4) return;
    if (e.target.closest?.('circle.evt')) return;
    if (!countriesFC.features.length) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * GLOBE_SIZE;
    const sy = ((e.clientY - rect.top)  / rect.height) * GLOBE_SIZE;
    const ll = projection.invert([sx, sy]);
    if (!ll || isNaN(ll[0])) return;
    for (const feat of countriesFC.features) {
      if (d3.geoContains(feat, ll)) {
        const display = feat.properties?.name || feat.properties?.NAME || 'Região';
        openCountryPanel(featureToTag(feat), display);
        autoRotate = false;
        return;
      }
    }
    closeCountryPanel();
  });

  // Tooltip (hover-only, auto-dismiss)
  const tip = document.getElementById('tip');
  const tipCat = tip.querySelector('#tip-cat');
  const tipTitle = tip.querySelector('#tip-title');
  const tipMeta = tip.querySelector('#tip-meta');
  function showTip(ev, el) {
    tipCat.textContent = ev.category;
    tipTitle.textContent = ev.title;
    tipMeta.textContent = `${ev.country} · ${ev.date}`;
    const stage = document.getElementById('globe-stage');
    const rect = stage.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    tip.style.left = ((cx / GLOBE_SIZE) * svgRect.width + (svgRect.left - rect.left)) + 'px';
    tip.style.top  = ((cy / GLOBE_SIZE) * svgRect.height + (svgRect.top - rect.top) - 10) + 'px';
    tip.classList.add('on');
    tip.setAttribute('aria-hidden', 'false');
    hoverPauseUntil = performance.now() + 4000;
  }
  function hideTip() {
    tip.classList.remove('on');
    tip.setAttribute('aria-hidden', 'true');
    hoverPauseUntil = performance.now() + 400;
  }
  // Safety: hide tooltip if user clicks elsewhere or scrolls away
  document.addEventListener('click', (e) => {
    if (!e.target.closest('circle.evt') && !e.target.closest('#tip')) hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  // -------- Animation loop (mutate attrs; rAF-throttled) --------
  let last = performance.now();
  const coords = document.getElementById('globe-coords');
  let coordTick = 0;

  function frame(t) {
    const dt = t - last; last = t;
    if (autoRotate && t > hoverPauseUntil && !dragStart) {
      const secPerRev = 60 * (100 / Math.max(10, cfg.globeSpeed));
      rotation[0] = (rotation[0] + (360 / (secPerRev * 1000)) * dt) % 360;
      projection.rotate(rotation);
      dirty = true;
    }
    if (dirty) {
      sphereEl.setAttribute('d', path({ type: 'Sphere' }));
      gratEl.setAttribute('d', path(d3.geoGraticule10()));

      // Update dots: write cx/cy/opacity; hide back-side via display
      const rLon = -rotation[0], rLat = -rotation[1];
      const cosRLat = Math.cos(rLat * Math.PI/180), sinRLat = Math.sin(rLat * Math.PI/180);
      for (let i = 0; i < dotPoints.length; i++) {
        const node = dotNodes[i];
        const [lon, lat] = dotPoints[i];
        // fast visibility: dot.product of unit vectors; cos(angularDistance)
        const dLon = (lon - rLon) * Math.PI/180;
        const latR = lat * Math.PI/180;
        const cosD = sinRLat * Math.sin(latR) + cosRLat * Math.cos(latR) * Math.cos(dLon);
        if (cosD <= 0.02) { node.style.display = 'none'; continue; }
        const p = projection([lon, lat]);
        if (!p) { node.style.display = 'none'; continue; }
        node.style.display = cfg.halftone ? '' : 'none';
        node.setAttribute('cx', p[0].toFixed(1));
        node.setAttribute('cy', p[1].toFixed(1));
        node.setAttribute('opacity', (0.28 + cosD * 0.42).toFixed(2));
      }

      // Update hover country path
      if (hoverPath) {
        hoverPath.setAttribute('d', hoverFeat ? (path(hoverFeat) || '') : '');
      }

      // Update events
      for (const ev of sortedEvents) {
        const node = evtNodes.get(ev.id);
        const dLon = (ev.lon - rLon) * Math.PI/180;
        const latR = ev.lat * Math.PI/180;
        const cosD = sinRLat * Math.sin(latR) + cosRLat * Math.cos(latR) * Math.cos(dLon);
        if (cosD <= 0.02) { node.style.display = 'none'; continue; }
        const p = projection([ev.lon, ev.lat]);
        if (!p) { node.style.display = 'none'; continue; }
        node.style.display = '';
        node.setAttribute('cx', p[0].toFixed(1));
        node.setAttribute('cy', p[1].toFixed(1));
      }

      // Coords display — throttle to 4fps
      if (++coordTick % 15 === 0) {
        coords.children[0].textContent = `LAT ${(-rotation[1]).toFixed(2)}°`;
        coords.children[1].textContent = `LON ${(-rotation[0]).toFixed(2)}°`;
      }
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window._globe = {
    rebuildDots: () => { buildDots(); rebuildDotNodes(); dirty = true; },
    setAutoRotate: (v) => { autoRotate = v; cfg.autoRotate = v; dirty = true; },
    markDirty: () => { dirty = true; },
    rebuildMarkers: (events) => { buildMarkersFromEvents(events); },
    geoTagArticles: (articles) => {
      if (!countriesFC.features.length) return;
      // Pool de pontos dispersos por feature. Dispersão é proporcional ao
      // bounding-box do país — países grandes (US, RU, BR) espalham naturalmente;
      // pequenos (SG, BH) ficam concentrados sem sair do polígono.
      const pool = new Map();
      function samplePoint(feat) {
        const [[lon0, lat0], [lon1, lat1]] = d3.geoBounds(feat);
        for (let i = 0; i < 60; i++) {
          const lon = lon0 + Math.random() * (lon1 - lon0);
          const lat = lat0 + Math.random() * (lat1 - lat0);
          if (d3.geoContains(feat, [lon, lat])) return [lat, lon];
        }
        return null;
      }
      for (const ev of articles) {
        if (ev.baseLat == null) continue;
        let foundFeat = null;
        for (const feat of countriesFC.features) {
          if (d3.geoContains(feat, [ev.baseLon, ev.baseLat])) { foundFeat = feat; break; }
        }
        if (foundFeat) {
          ev.tag     = featureToTag(foundFeat);
          ev.country = foundFeat.properties?.name || foundFeat.properties?.NAME || ev.country;
          const key = ev.tag;
          if (!pool.has(key)) pool.set(key, foundFeat);
          const p = samplePoint(pool.get(key));
          if (p) { ev.lat = Math.max(-85, Math.min(85, p[0])); ev.lon = ((p[1] + 180) % 360) - 180; }
        }
      }
    },
  };
}

/* ==========================================================
   GLOBE NEWS — geo dictionary + live fetch
========================================================== */
let GEO_DICT = {};
let GEO_ENTRIES = []; // Populado em loadAll() após fetch


// ISO 3166-1 alpha-2 → [lat, lon]
// Múltiplas cidades por país — pick aleatório para spread geográfico real
const ISO_CITIES = {
  'US':[[38.90,-77.03],[40.71,-74.01],[41.88,-87.63],[34.05,-118.24],[29.76,-95.37],[33.75,-84.39],[47.61,-122.33],[39.95,-75.17],[42.36,-71.06],[36.17,-86.78]],
  'BR':[[-15.78,-47.93],[-23.55,-46.63],[-22.91,-43.17],[-12.97,-38.50],[-3.72,-38.54],[-8.05,-34.88],[-30.03,-51.23],[-19.92,-43.94],[-1.46,-48.50],[-3.10,-60.02]],
  'GB':[[51.51,-0.13],[53.48,-2.24],[53.80,-1.55],[55.86,-4.25],[52.48,-1.90],[51.45,-2.58],[53.38,-1.47],[54.60,-5.93]],
  'DE':[[52.52,13.40],[48.14,11.58],[53.57,10.00],[51.23,6.79],[50.11,8.68],[48.78,9.18],[51.51,7.46],[53.07,8.80],[51.05,13.74]],
  'FR':[[48.85,2.35],[45.75,4.83],[43.30,5.37],[43.60,1.44],[44.84,-0.58],[47.22,-1.55],[50.63,3.06],[48.69,-1.68]],
  'RU':[[55.75,37.62],[59.93,30.32],[56.85,60.60],[43.12,131.89],[54.99,73.37],[56.84,53.20],[55.00,82.96],[57.62,39.86],[47.23,39.72]],
  'CN':[[39.91,116.39],[31.23,121.47],[23.13,113.26],[30.57,104.07],[22.54,114.06],[29.56,106.55],[43.80,87.60],[36.06,103.82],[34.27,108.95],[22.27,114.16]],
  'IN':[[28.61,77.21],[19.08,72.88],[12.97,77.59],[22.57,88.36],[13.08,80.27],[17.38,78.47],[23.03,72.58],[18.52,73.86],[26.85,80.94],[11.00,76.96]],
  'AU':[[-35.28,149.13],[-33.87,151.21],[-37.81,144.96],[-31.95,115.86],[-27.47,153.03],[-34.93,138.60],[-42.88,147.32],[-12.46,130.84]],
  'CA':[[45.42,-75.69],[43.65,-79.38],[45.51,-73.55],[51.04,-114.07],[49.28,-123.12],[44.65,-63.60],[53.54,-113.49],[47.56,-52.71]],
  'MX':[[19.43,-99.13],[20.97,-89.62],[20.68,-103.35],[25.67,-100.31],[29.07,-110.95],[19.18,-96.14],[16.86,-99.88]],
  'AR':[[-34.61,-58.37],[-31.42,-64.18],[-32.89,-68.83],[-38.00,-57.55],[-24.79,-65.41],[-27.45,-58.99],[-26.82,-65.22]],
  'ZA':[[-25.75,28.19],[-26.20,28.04],[-33.93,18.42],[-29.86,30.98],[-25.87,29.24],[-33.02,27.91]],
  'NG':[[9.07,7.40],[6.46,3.40],[11.85,13.16],[4.78,7.01],[12.00,8.52],[5.89,5.68],[5.52,7.03]],
  'ID':[[-6.21,106.85],[-7.25,112.75],[3.58,98.68],[-5.14,119.41],[-8.65,115.22],[-0.50,117.15]],
  'SA':[[24.69,46.72],[21.49,39.18],[26.43,50.09],[24.47,39.61],[21.43,39.83],[17.34,44.20]],
  'TR':[[39.93,32.86],[41.01,28.96],[37.88,32.49],[38.42,27.14],[36.89,30.70],[36.89,30.70]],
  'UA':[[50.45,30.52],[49.84,24.03],[49.99,36.23],[46.64,32.62],[48.00,37.80],[48.46,35.04]],
  'PL':[[52.23,21.01],[50.06,19.94],[51.11,17.03],[54.35,18.65],[53.13,23.16],[50.81,19.12]],
  'IT':[[41.90,12.49],[45.46,9.19],[40.85,14.27],[45.44,12.33],[43.77,11.25],[37.50,15.09]],
  'ES':[[40.42,-3.70],[41.39,2.15],[37.39,-5.99],[39.47,-0.38],[43.32,-1.98],[36.72,-4.42]],
  'JP':[[35.68,139.69],[34.69,135.50],[35.02,135.76],[43.06,141.35],[33.60,130.40],[34.39,132.45]],
  'KR':[[37.57,126.98],[35.10,129.04],[35.87,128.60],[37.45,126.70],[36.35,127.38]],
  'EG':[[30.06,31.25],[31.19,29.91],[29.97,32.53],[25.69,32.65],[31.02,31.38]],
  'EU':[[50.85,4.35],[52.37,4.90],[48.85,2.35],[52.52,13.40],[41.90,12.49],[40.42,-3.70]],
  'NG':[[9.07,7.40],[6.46,3.40],[11.85,13.16],[4.78,7.01],[12.00,8.52]],
  // Países com menos cidades ficam com capital apenas
  'IL':[[31.77,35.22],[32.08,34.78],[32.82,34.99]],
  'IR':[[35.69,51.39],[36.30,59.61],[29.61,52.53],[38.08,46.30]],
  'IQ':[[33.34,44.40],[36.34,43.13],[30.51,47.78],[32.54,44.42]],
  'PK':[[33.72,73.04],[24.86,67.01],[31.55,74.34],[25.37,68.37],[34.02,71.58]],
  'MA':[[34.01,-6.85],[33.59,-7.62],[32.31,-9.23],[33.99,-6.85],[35.77,-5.80]],
  'KE':[[-1.29,36.82],[-4.06,39.66],[0.52,35.27],[-0.10,34.75]],
  'NG':[[9.07,7.40],[6.46,3.40],[11.85,13.16],[4.78,7.01]],
  'PH':[[14.60,120.98],[10.72,122.56],[7.07,125.61],[8.50,124.65]],
  'MY':[[3.15,101.69],[5.41,100.33],[1.49,110.34],[6.12,102.24]],
  'TH':[[13.76,100.50],[18.79,98.98],[7.88,98.39],[16.87,100.52]],
  'VN':[[21.03,105.85],[10.82,106.63],[16.07,108.22],[10.34,107.08]],
  'CO':[[4.71,-74.07],[3.43,-76.54],[10.40,-75.51],[6.25,-75.56]],
  'PE':[[-12.04,-77.03],[-8.11,-79.03],[-16.39,-71.54],[-6.77,-79.84]],
  'CL':[[-33.45,-70.67],[-36.82,-73.05],[-23.65,-70.40],[-18.48,-70.33]],
};

// Fallback single-point para países não listados acima
const ISO_COORDS = {
  'US':[38.90,-77.03],'GB':[51.51,-0.13],'FR':[48.85,2.35],'DE':[52.52,13.40],
  'BR':[-15.78,-47.93],'JP':[35.68,139.69],'IN':[28.61,77.21],'AU':[-35.28,149.13],
  'CA':[45.42,-75.69],'RU':[55.75,37.62],'CN':[39.91,116.39],'ZA':[-25.75,28.19],
  'NG':[9.07,7.40],'EG':[30.06,31.25],'MX':[19.43,-99.13],'AR':[-34.61,-58.37],
  'KR':[37.57,126.98],'ID':[-6.21,106.85],'SA':[24.69,46.72],'TR':[39.93,32.86],
  'IL':[31.77,35.22],'UA':[50.45,30.52],'PL':[52.23,21.01],'NL':[52.37,4.90],
  'ES':[40.42,-3.70],'IT':[41.90,12.49],'PT':[38.72,-9.14],'SE':[59.33,18.07],
  'NO':[59.91,10.75],'CH':[46.95,7.44],'EU':[50.85,4.35],'BE':[50.85,4.35],
  'PK':[33.72,73.04],'AF':[34.52,69.18],'IQ':[33.34,44.40],'IR':[35.69,51.39],
  'SY':[33.51,36.29],'LB':[33.89,35.50],'YE':[15.55,44.21],'QA':[25.29,51.53],
  'AE':[24.45,54.37],'KE':[-1.29,36.82],'ET':[9.03,38.74],'MA':[34.01,-6.85],
  'GH':[5.55,-0.20],'SD':[15.55,32.53],'TW':[25.04,121.56],'HK':[22.30,114.17],
  'SG':[1.35,103.82],'MY':[3.15,101.69],'PH':[14.60,120.98],'VN':[21.03,105.85],
  'TH':[13.76,100.50],'NZ':[-41.29,174.78],'CL':[-33.45,-70.67],'CO':[4.71,-74.07],
  'PE':[-12.04,-77.03],'VE':[10.49,-66.88],'GR':[37.98,23.73],'HU':[47.50,19.04],
  'RO':[44.43,26.10],'CZ':[50.08,14.44],'AT':[48.21,16.37],'DK':[55.68,12.57],
  'FI':[60.17,24.94],'JO':[31.95,35.93],'KW':[29.37,47.98],'LY':[32.90,13.18],
  'DZ':[36.74,3.06],'TN':[36.82,10.17],'KZ':[51.18,71.45],'BD':[23.72,90.41],
};

// ISO-2 → tag canônico (bate com featureToTag do TopoJSON, pra que click no país agrupe certo)
const ISO_TO_CANONICAL_TAG = {
  US:'united states', GB:'united kingdom', FR:'france', DE:'germany',
  BR:'brazil', JP:'japan', IN:'india', AU:'australia', CA:'canada',
  RU:'russia', CN:'china', ZA:'south africa', NG:'nigeria',
  EG:'egypt', MX:'mexico', AR:'argentina', KR:'south korea',
  KP:'north korea', ID:'indonesia', SA:'saudi arabia', TR:'turkey',
  IL:'israel', UA:'ukraine', PL:'poland', NL:'netherlands',
  ES:'spain', IT:'italy', PT:'portugal', SE:'sweden', NO:'norway',
  CH:'switzerland', BE:'belgium', PK:'pakistan', AF:'afghanistan',
  IQ:'iraq', IR:'iran', SY:'syria', LB:'lebanon', YE:'yemen',
  QA:'qatar', AE:'uae', KE:'kenya', ET:'ethiopia', MA:'morocco',
  GH:'ghana', SD:'sudan', TW:'taiwan', HK:'hong kong', SG:'singapore',
  MY:'malaysia', PH:'philippines', VN:'vietnam', TH:'thailand',
  NZ:'new zealand', CL:'chile', CO:'colombia', PE:'peru', VE:'venezuela',
  GR:'greece', HU:'hungary', RO:'romania', CZ:'czech', AT:'austria',
  DK:'denmark', FI:'finland', JO:'jordan', KW:'kuwait', LY:'libya',
  DZ:'algeria', TN:'tunisia', KZ:'kazakhstan', BD:'bangladesh',
  EU:'european union',
};

function geoFromISO(code) {
  if (!code) return null;
  const cities = ISO_CITIES[code];
  let coord;
  if (cities?.length)        coord = cities[Math.floor(Math.random() * cities.length)];
  else if (ISO_COORDS[code]) coord = ISO_COORDS[code];
  else return null;
  const [lat, lon] = coord;
  const tag = ISO_TO_CANONICAL_TAG[code] || code.toLowerCase();
  const country = tag.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { lat, lon, tag, country };
}

// Aliases → canonical tag (para que trump/washington/paris batam no país certo)
const TAG_CANONICAL = {
  'trump':'united states','washington':'united states',
  'paris':'france','berlin':'germany',
  'london':'united kingdom','britain':'united kingdom',
  'moscow':'russia','putin':'russia',
  'beijing':'china','xi jinping':'china',
  'brasília':'brazil','brasil':'brazil',
  'buenos aires':'argentina','cairo':'egypt',
  'tel aviv':'israel','netanyahu':'israel',
  'zelensky':'ukraine','kyiv':'ukraine',
  'erdogan':'turkey','modi':'india','new delhi':'india',
  'tokyo':'japan','seoul':'south korea','kim jong':'north korea',
  'tehran':'iran','riyadh':'saudi arabia','dubai':'uae',
  'sydney':'australia','rome':'italy','lisbon':'portugal',
  'ottawa':'canada','mexico':'mexico',
};

function geoFromText(text) {
  const t = text.toLowerCase();
  for (const [kw, [lat, lon]] of GEO_ENTRIES) {
    const idx = t.indexOf(kw);
    if (idx === -1) continue;
    const before = idx === 0 || /\W/.test(t[idx - 1]);
    const after  = idx + kw.length >= t.length || /\W/.test(t[idx + kw.length]);
    if (before && after) {
      const tag = TAG_CANONICAL[kw] || kw;
      return { lat, lon, tag, country: tag.charAt(0).toUpperCase() + tag.slice(1) };
    }
  }
  return null;
}

const WORKER_URL = CFG.WORKER_URL;

// Tier interno por qualidade/relevância editorial. Limita quantas notícias cada
// fonte contribui ao globo para evitar dominância de fontes prolíficas.
const SOURCE_TIER = {
  // T1 — cripto-native + research
  'Decrypt': 1, 'CoinDesk': 1, 'CoinTelegraph': 1, 'The Block': 1,
  'Bankless': 1, 'The Defiant': 1, 'Blockworks': 1,
  // T1 — geopolítica/conflito
  'Ukrinform': 1, 'Jerusalem Post': 1, 'Deutsche Welle': 1, 'SCMP': 1,
  // T1 — mainstream global premium
  'BBC': 1, 'The Guardian': 1, 'France 24': 1, 'The Hindu': 1,
  'Reuters': 1, 'Al Jazeera': 1, 'Bloomberg': 1, 'Nikkei Asia': 1,
  // T1 — geopolítica analítica + tech
  'Foreign Policy': 1, 'Politico': 1, 'The Verge': 1, 'TechCrunch': 1,
  // T1 — Rússia primária
  'Moscow Times': 1,
  // T1 — Tech/Macro premium adicionados
  'Wired': 1, 'Stratechery': 1,
  'Financial Times': 1, 'The Economist': 1, 'Project Syndicate': 1,
  // T2 — regional relevante
  'G1 Globo': 2, 'La Nación': 2, 'ANSA': 2, 'Notes from Poland': 2,
  'Dawn': 2, 'Taipei Times': 2, 'CBC News': 2, 'CNA': 2,
  // T2 — analítico complementar
  'Foreign Affairs': 2, 'Axios': 2, 'Al-Monitor': 2, 'Middle East Eye': 2,
  'Meduza': 2, 'AllAfrica': 2, 'Ars Technica': 2, 'MIT Technology Review': 2,
  // T2 — Tech/Macro adicionados
  'The Register': 2, 'VentureBeat': 2, 'IEEE Spectrum': 2, 'Engadget': 2,
  'Rest of World': 2, 'Hacker News': 2,
  'MarketWatch': 2, 'CNBC': 2, 'Seeking Alpha': 2,
  // T3 — diversidade geográfica + macro agregador
  'El Universal': 3, 'The Punch': 3, 'ABC Australia': 3, 'DutchNews': 3,
  'Rappler': 3, 'Bangkok Post': 3, 'Morocco World News': 3,
  'Investing.com': 3, 'Crisis Group': 3,
  // T3 — Tech/Macro adicionados
  "Tom's Hardware": 3, '9to5Mac': 3, 'Yahoo Finance': 3, 'Calculated Risk': 3,
};
const TIER_CAP = { 1: 50, 2: 20, 3: 10 };

// Keyword classifiers — ordem importa: cripto > geo > tech > macro
// Match com \b (word boundary): keywords curtas como 'eth','dao','aws' ficam seguras.
const CRIPTO_KW = [
  // Tokens majors
  'bitcoin','btc','satoshi','ethereum','eth','solana','sol','xrp','ripple','cardano','ada',
  'polkadot','dot','chainlink','link','avalanche','avax','dogecoin','doge','shiba','shib',
  'toncoin','near protocol','polygon','matic','uniswap','uni','aave','cosmos','atom','optimism',
  'arbitrum','arb','sui','sei','injective','inj','fantom','ftm','lido','ldo','makerdao','mkr',
  'render','rndr','filecoin','fil','curve','crv','compound','synthetix','snx','hyperliquid',
  // Stablecoins
  'usdt','usdc','tether','circle','dai stablecoin','stablecoin','stablecoins','frax','busd','cbdc',
  // Conceitos
  'crypto','cryptocurrency','blockchain','defi','nft','nfts','web3','dao','dex','cex','amm',
  'mev','rollup','layer 2','l2 chain','layer 1','sidechain','sharding','zk-snark','zero-knowledge',
  'zk-rollup','smart contract','smart contracts','gas fee','mainnet','testnet','hard fork','soft fork',
  'tokenomics','tokenization','tokenized',
  // ETF/produtos
  'bitcoin etf','ethereum etf','spot etf','spot bitcoin','spot ethereum','gbtc','ibit','fbtc','ethe',
  // Mercado/cultura
  'altcoin','altcoins','altseason','halving','hashrate','hash rate','hodl','memecoin','meme coin',
  'shitcoin','rugpull','rug pull','presale','airdrop','staking','tvl','yield farming','liquidity pool',
  'lending protocol','impermanent loss',
  // Players/exchanges
  'binance','coinbase','kraken','bybit','okx','bitget','kucoin','gemini exchange','ftx','bitfinex',
  'changpeng zhao','brian armstrong','sbf','bankman-fried','vitalik','buterin','do kwon','satoshi nakamoto',
  // Eventos/regulação
  'sec crypto','crypto bill','crypto regulation','tornado cash','crypto mixer','crypto exchange',
  // Companhias cripto-adjacentes
  'microstrategy','saylor','michael saylor','grayscale','strategy hyper','metaplanet',
];

const GEO_KW = [
  // Conflito
  'war','conflict','military','militant','militants','militia','attack','attacks','missile','missiles',
  'troops','ceasefire','invasion','offensive','airstrike','drone strike','hostage','insurgent','insurgents',
  'rebel','rebels','jihadist','jihadists','terrorist','terrorism','terror attack','genocide','warfare',
  'shelling','bombing','bombardment',
  // Diplomático
  'diplomat','diplomatic','diplomacy','treaty','accord','alliance','embargo','blockade','expulsion',
  'sanction','sanctions','sanctioning','peace talks','peace deal','peace summit',
  // Orgs / blocos
  'nato','united nations','security council','european union','eu summit','brics','g7','g20','g7 summit',
  'g20 summit','opec','opec\\+','asean','african union','arab league','un assembly','un secretary',
  // Política / eleições
  'election','elections','presidential election','general election','vote','votes','ballot','referendum',
  'parliament','parliamentary','congress','senate','senator','prime minister','president','presidency',
  'cabinet','minister','government','impeachment','coup','junta','protest','protests','riot','riots',
  'uprising','revolution','dictator','dictatorship','authoritarian','democracy','democratic',
  // Líderes
  'putin','vladimir putin','zelensky','volodymyr zelensky','trump','donald trump','biden','joe biden',
  'kamala harris','xi jinping','modi','narendra modi','netanyahu','benjamin netanyahu','erdogan',
  'recep tayyip erdogan','macron','emmanuel macron','scholz','olaf scholz','sunak','rishi sunak',
  'starmer','keir starmer','meloni','giorgia meloni','milei','javier milei','sheinbaum','claudia sheinbaum',
  'lula','luiz inácio lula','bolsonaro','jair bolsonaro','kim jong','kim jong un','lukashenko',
  'aleksandr lukashenko','orban','viktor orban','duterte','marcos','ferdinand marcos','von der leyen',
  // Países / regiões em foco
  'russia','russian','ukraine','ukrainian','israel','israeli','palestine','palestinian','iran','iranian',
  'china','chinese','taiwan','taiwanese','north korea','south korea','syria','syrian','yemen','yemeni',
  'lebanon','lebanese','iraq','iraqi','afghanistan','afghan','pakistan','pakistani','sudan','sudanese',
  'myanmar','venezuela','cuba',
  // Hotspots
  'gaza','west bank','jerusalem','hamas','hezbollah','taliban','houthi','houthis','isis','al-qaeda',
  'wagner group','south china sea','taiwan strait','korean peninsula','kashmir','donbas','crimea',
  'strait of hormuz','red sea','suez canal','sahel','tigray',
  // Temas
  'border crisis','immigration','refugee','refugees','asylum','deportation','migration','migrant',
  'cyber attack','cyber-attack','disinformation','propaganda','espionage','spy agency','intelligence agency',
  // Macro-geo
  'trade war','tariffs','imposing tariffs','lifting sanctions','arms deal','arms sale','arms embargo',
  'nuclear weapon','nuclear test','nuclear program','nuclear deal',
];

const TECH_KW = [
  // IA / ML
  'artificial intelligence','a\\.i\\.','openai','anthropic','claude ai','chatgpt','gemini','google gemini',
  'deepseek','perplexity','large language model','llm','llms','machine learning','deep learning',
  'neural network','generative ai','genai','gpt-4','gpt-5','gpt-6','llama 3','llama 4','meta llama',
  'mistral ai','transformer model','agi','asi','multimodal model','foundation model','reasoning model',
  'midjourney','dall-e','stable diffusion','runway','hugging face','stability ai','google deepmind',
  'deepmind','xai','grok','copilot','microsoft copilot','character ai','character\\.ai',
  // AI agents/governance
  'ai agent','ai agents','ai chip','ai chips','ai model','ai safety','ai regulation','ai act',
  'ai pause','ai bias','ai alignment',
  // Big tech
  'apple','alphabet','google','microsoft','meta platforms','nvidia','tesla','spacex','starlink',
  'samsung','qualcomm','amazon web services','intel','amd','oracle','ibm','sony','sap',
  'adobe','salesforce','servicenow','palantir','snowflake','databricks',
  // Plataformas
  'iphone','macbook','vision pro','apple vision','android','ios update','windows 11','macos',
  'pixel phone','surface laptop','quest 3','oculus','meta quest','apple silicon','m4 chip','m3 chip',
  // Líderes tech
  'elon musk','sam altman','mark zuckerberg','sundar pichai','satya nadella','jensen huang','tim cook',
  'jeff bezos','andy jassy','dario amodei','demis hassabis','reid hoffman','peter thiel',
  // Semicondutores
  'semiconductor','semiconductors','tsmc','sk hynix','foundry','gpu chip','ai gpu','memory chip',
  'nand flash','dram','euv lithography','asml','arm holdings',
  // Robótica
  'robotics','humanoid','humanoid robot','self-driving','autonomous vehicle','autonomous vehicles',
  'robotaxi','optimus robot','tesla bot','figure ai',
  // Quantum/Bio
  'quantum computing','quantum computer','quantum supremacy','biotech','gene editing','crispr',
  'gene therapy','mrna vaccine','synthetic biology',
  // Cyber
  'cybersecurity','cyber security','cyberattack','cyber attack','data breach','ransomware','malware',
  'phishing','zero-day','zero day exploit','spyware','dark web','data leak','ransomware attack',
  // Cloud/infra
  'cloud computing','edge computing','kubernetes','docker','linux kernel','open source ai',
  'foundation model','data center','data centre','5g network','6g network','internet of things','iot',
  // Hardware/devices
  'wearable','smart glasses','vr headset','ar glasses','augmented reality','virtual reality',
  // Chips guerra
  'chip war','chip ban','chip export','chip sanction',
];

const MACRO_KW = [
  // Atual
  'inflation','gdp','recession','interest rate','interest rates','federal reserve','ecb','imf',
  'world bank','tariff','trade war','economy','economic','fiscal','monetary','bond yield','unemployment',
  'deficit','surplus','oil price','opec','central bank','rate cut','rate hike','earnings','stock market',
  'nasdaq','s&p 500','dow jones',
  // Fed
  'powell','jerome powell','fomc','jackson hole','fed rate','fed minutes','fed meeting','fed statement',
  'fed chair','fed governor','fed officials',
  // Treasury / yields
  'treasury','treasuries','yield curve','10-year','10 year','30-year','bond yields','treasury yields',
  'sovereign debt',
  // Markets
  'stocks','equities','equity','market rally','stock rally','asset rally','crypto rally',
  'market crash','sell-off','selloff','correction','bear market','bull market',
  'volatility','vix index','vix','market open','market close',
  // Indices
  'russell 2000','nyse','ftse','ftse 100','dax','cac 40','nikkei','hang seng','kospi',
  'shanghai composite','bovespa','ibovespa','msci','emerging markets','em equities',
  // Currencies
  'dollar index','dxy','us dollar','euro','japanese yen','pound sterling','brazilian real','chinese yuan',
  'currency market','forex','fx market','dollar rally','dollar weakness',
  // Inflation/CPI
  'cpi','core cpi','pce','core pce','ppi','deflation','disinflation','stagflation','price pressure',
  'price growth','headline inflation','core inflation',
  // Jobs
  'jobs report','jobless claims','nonfarm payrolls','payrolls','nfp','wage growth','wages','labor market',
  'labour market','employment data',
  // Activity
  'retail sales','consumer confidence','consumer sentiment','housing starts','home sales','existing home',
  'pmi','ism','durable goods','industrial production','factory output',
  // Commodities
  'crude oil','brent crude','wti crude','gold price','gold rush','gold trading','gold reserve',
  'silver price','copper price','lithium','natural gas','lng','wheat','corn','soybean','soybeans',
  'commodity','commodities',
  // Bond
  'high yield','junk bond','investment grade','credit spread','spread widening','default risk',
  // Banks
  'jpmorgan','jp morgan','jamie dimon','goldman sachs','goldman','morgan stanley','citi bank','citigroup',
  'ubs bank','deutsche bank','hsbc','bank of america','wells fargo','santander','bnp paribas',
  'societe generale','nomura','icbc',
  // Macro events
  'rate cuts','rate hikes','basis point','basis points','monetary policy','hawkish','dovish',
  'soft landing','hard landing','quantitative easing','quantitative tightening','balance sheet',
  'reverse repo','debt ceiling','government shutdown','budget deficit','fiscal stimulus',
  // Bancos centrais não-fed
  'lagarde','christine lagarde','andrew bailey','kazuo ueda','bank of england','bank of japan',
  'pboc','reserve bank of india','rbi','copom','selic','galipolo','campos neto',
  // Asset managers
  'vanguard','blackrock','larry fink','fidelity','vaneck','ark invest','cathie wood',
  // Política fiscal
  'tax cut','tax cuts','tax hike','tax reform','tax bill',
];

function _buildKwRegex(kws) {
  const escaped = kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // \b boundaries evitam falsos positivos tipo 'aws' em 'withdraws'.
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}
const RE_CRIPTO = _buildKwRegex(CRIPTO_KW);
const RE_GEO    = _buildKwRegex(GEO_KW);
const RE_TECH   = _buildKwRegex(TECH_KW);
const RE_MACRO  = _buildKwRegex(MACRO_KW);

// Fallback por fonte: artigo sem keyword óbvia mas vindo de fonte temática
// é catalogado pela natureza da fonte. Cobre casos como 'Bankless' artigos
// editoriais sem termo cripto explícito, ou Bloomberg sobre yields sem 'fed'.
const SOURCE_DEFAULT_CATEGORY = {
  // Cripto-native
  'CoinDesk': 'cripto', 'CoinTelegraph': 'cripto', 'The Block': 'cripto',
  'Decrypt': 'cripto', 'Bankless': 'cripto', 'The Defiant': 'cripto', 'Blockworks': 'cripto',
  'CryptoCompare': 'cripto',
  // Tech
  'The Verge': 'tech', 'TechCrunch': 'tech', 'Ars Technica': 'tech',
  'MIT Technology Review': 'tech',
  'Wired': 'tech', 'The Register': 'tech', 'VentureBeat': 'tech',
  'IEEE Spectrum': 'tech', 'Engadget': 'tech', "Tom's Hardware": 'tech',
  'Rest of World': 'tech', '9to5Mac': 'tech', 'Stratechery': 'tech',
  'Hacker News': 'tech',
  // Macro/Markets
  'Bloomberg': 'macro', 'Investing.com': 'macro', 'Reuters': 'macro',
  'Financial Times': 'macro', 'The Economist': 'macro', 'MarketWatch': 'macro',
  'CNBC': 'macro', 'Yahoo Finance': 'macro', 'Seeking Alpha': 'macro',
  'Project Syndicate': 'macro',
  'Calculated Risk': 'macro',
  // Geopolítica
  'Foreign Policy': 'geo', 'Foreign Affairs': 'geo', 'Crisis Group': 'geo',
  'Politico': 'geo', 'Axios': 'geo', 'Al Jazeera': 'geo',
  'Al-Monitor': 'geo', 'Middle East Eye': 'geo', 'Ukrinform': 'geo',
  'Moscow Times': 'geo', 'Meduza': 'geo',
};

function classifyTitle(title, sourceCategory, source) {
  if (sourceCategory) return sourceCategory; // Guardian sectionId já mapeado
  const t = title.toLowerCase();
  if (RE_CRIPTO.test(t)) return 'cripto';
  if (RE_GEO.test(t))    return 'geo';
  if (RE_TECH.test(t))   return 'tech';
  if (RE_MACRO.test(t))  return 'macro';
  return SOURCE_DEFAULT_CATEGORY[source] || 'other';
}

// Estado dos filtros activos
let _filterTime    = 'all';
let _filterCat     = 'all';
let _blockedSources = new Set(); // blocklist: fontes desactivadas. Vazio = todas activas.
let _allEventos    = [];

function _timeLimitMs() {
  if (_filterTime === '24h') return CFG.FILTER_24H_MS;
  if (_filterTime === '7d')  return CFG.FILTER_7D_MS;
  return CFG.FILTER_30D_MS; // 'all' = teto de 30 dias
}

function applyFilters() {
  const now   = Date.now();
  const limit = _timeLimitMs();
  EVENTOS = _allEventos.filter(ev => {
    if (_filterCat !== 'all' && ev.newsCategory !== _filterCat) return false;
    if (_blockedSources.has(ev.source)) return false;
    // Filtro estrito: sem publishedAt = sem como provar que está dentro da janela.
    if (!ev.publishedAt) return false;
    const ts = new Date(ev.publishedAt).getTime();
    if (Number.isNaN(ts) || now - ts > limit) return false;
    return true;
  });
  if (window._globe?.rebuildMarkers) window._globe.rebuildMarkers(EVENTOS);
  const gsEl = document.getElementById('gs-events');
  if (gsEl) gsEl.textContent = String(EVENTOS.length).padStart(2,'0');
}

function _getVisibleSources() {
  // Fontes presentes após filtros de tempo+categoria (ignora filtro de fonte)
  const now   = Date.now();
  const limit = _timeLimitMs();
  const visible = _allEventos.filter(ev => {
    if (_filterCat !== 'all' && ev.newsCategory !== _filterCat) return false;
    if (!ev.publishedAt) return false;
    const ts = new Date(ev.publishedAt).getTime();
    if (Number.isNaN(ts) || now - ts > limit) return false;
    return true;
  });
  return [...new Set(visible.map(ev => ev.source))].sort();
}

function _updateSourceTrigger(sources) {
  const group = document.getElementById('filter-source-group');
  const label = document.getElementById('filter-source-label');
  if (!group || !label) return;

  if (sources.length === 0) { group.style.display = 'none'; return; }
  group.style.display = '';

  const activeCount = sources.filter(s => !_blockedSources.has(s)).length;
  const total = sources.length;
  label.textContent = activeCount === total
    ? `Todas (${total})`
    : activeCount === 0
      ? `Nenhuma`
      : `${activeCount} de ${total}`;
}

function rebuildSourcePopup() {
  const sources = _getVisibleSources();
  _updateSourceTrigger(sources);

  const list  = document.getElementById('filter-source');
  const count = document.getElementById('filter-source-count');
  if (!list) return;

  if (sources.length === 0) { list.innerHTML = ''; if (count) count.textContent = '—'; return; }

  const activeCount = sources.filter(s => !_blockedSources.has(s)).length;
  if (count) count.textContent = `${activeCount} / ${sources.length}`;

  list.innerHTML = sources.map(s => {
    const active = !_blockedSources.has(s);
    return `<label class="gf-source-row${active ? ' active' : ''}">
      <input type="checkbox" data-source="${esc(s)}"${active ? ' checked' : ''}>
      <span>${esc(s)}</span>
    </label>`;
  }).join('');
}

function _openSourceModal() {
  const modal   = document.getElementById('source-modal');
  const trigger = document.getElementById('filter-source-trigger');
  if (!modal) return;
  rebuildSourcePopup();
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function _closeSourceModal() {
  const modal   = document.getElementById('source-modal');
  const trigger = document.getElementById('filter-source-trigger');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function setupGlobeFilters() {
  document.getElementById('filter-time')?.addEventListener('click', e => {
    const btn = e.target.closest('.gf-btn');
    if (!btn) return;
    document.querySelectorAll('#filter-time .gf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _filterTime = btn.dataset.val;
    _blockedSources.clear();
    rebuildSourcePopup();
    applyFilters();
  });

  document.getElementById('filter-cat')?.addEventListener('click', e => {
    const btn = e.target.closest('.gf-btn');
    if (!btn) return;
    document.querySelectorAll('#filter-cat .gf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _filterCat = btn.dataset.val;
    _blockedSources.clear();
    rebuildSourcePopup();
    applyFilters();
  });

  document.getElementById('filter-source-trigger')?.addEventListener('click', _openSourceModal);
  document.getElementById('source-modal-close')?.addEventListener('click', _closeSourceModal);
  document.getElementById('source-modal-backdrop')?.addEventListener('click', _closeSourceModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('source-modal');
      if (modal && !modal.hidden) _closeSourceModal();
    }
  });

  document.getElementById('filter-source-all')?.addEventListener('click', () => {
    _blockedSources.clear();
    rebuildSourcePopup();
    applyFilters();
  });

  // Search box do modal de fontes — filtra rows por substring
  document.getElementById('filter-source-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#filter-source .gf-source-row').forEach(row => {
      const txt = (row.textContent || '').toLowerCase();
      row.classList.toggle('is-hidden', q.length > 0 && !txt.includes(q));
    });
  });

  document.getElementById('filter-source-none')?.addEventListener('click', () => {
    _getVisibleSources().forEach(s => _blockedSources.add(s));
    rebuildSourcePopup();
    applyFilters();
  });

  document.getElementById('filter-source')?.addEventListener('change', e => {
    const input = e.target.closest('input[type="checkbox"][data-source]');
    if (!input) return;
    const src = input.dataset.source;
    if (input.checked) _blockedSources.delete(src);
    else _blockedSources.add(src);
    rebuildSourcePopup();
    applyFilters();
  });
}

async function fetchGlobeNews() {
  const results = [];
  const seen    = new Set();

  function addArticle(id, title, url, source, countryCode, publishedAt, sourceCategory) {
    const dedup = title.toLowerCase().slice(0, 50);
    if (seen.has(dedup)) return;

    // Tenta inferir país pelo título (mais preciso pro evento real).
    // Se não bater, usa countryCode do feed (origem editorial) como fallback.
    let geo = geoFromText(title);
    if (!geo && countryCode) geo = geoFromISO(countryCode);
    if (!geo) return;

    const { lat, lon, tag, country } = geo;
    // Sem jitter aqui: geoTagArticles() espalha via samplePoint dentro do polígono.
    // Países pequenos (SG, BH, IL) ficavam fora do mapa com jitter ±1°.
    const newsCategory = classifyTitle(title, sourceCategory, source);
    if (newsCategory === 'other') return; // descarta sem catalogação confiável
    seen.add(dedup);
    const pub = publishedAt ? new Date(publishedAt) : null;
    results.push({
      id, url, source,
      title: title.length > 90 ? title.slice(0, 87) + '…' : title,
      country, tag,
      baseLat: lat, baseLon: lon,
      lat: Math.max(-85, Math.min(85, lat)),
      lon: ((lon + 180) % 360) - 180,
      date: pub ? pub.toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
      publishedAt: pub ? pub.toISOString() : null,
      author: source,
      category: newsCategory.toUpperCase(),
      newsCategory,
    });
  }

  const LS_KEY = 'wesearch:globe:v1';
  const LS_TTL = 48 * 60 * 60 * 1000; // 48h — artigos antigos ainda servem como seed visual

  function processArticles(rawArticles, source) {
    const bySource = new Map();
    for (const a of rawArticles) {
      if (!a?.source) continue;
      if (!bySource.has(a.source)) bySource.set(a.source, []);
      bySource.get(a.source).push(a);
    }
    const articles = [];
    for (const [, group] of bySource) {
      const tier = SOURCE_TIER[group[0].source] ?? 3;
      const cap = TIER_CAP[tier] ?? 5;
      group.sort((x, y) => new Date(y.publishedAt || 0) - new Date(x.publishedAt || 0));
      for (const a of group.slice(0, cap)) articles.push(a);
    }
    for (const item of articles) {
      const id = item.source.replace(/\W/g, '') + '-' + item.title.slice(0, 20).replace(/\W/g, '');
      addArticle(id, item.title, item.url, item.source, item.countryCode, item.publishedAt, item.category);
    }
  }

  // Loading state — só mostra se request demorar >300ms (evita flash em fast networks)
  const loadingEl = document.getElementById('globe-loading');
  const loadingTimer = loadingEl ? setTimeout(() => loadingEl.classList.add('on'), 300) : null;
  const stopLoading = () => { if (loadingTimer) clearTimeout(loadingTimer); loadingEl?.classList.remove('on'); };

  let fetched = false;
  try {
    const data = await fetch(WORKER_URL).then(r => r.json());
    const rawArticles = data.articles || [];
    if (rawArticles.length) {
      processArticles(rawArticles, 'worker');
      try {
        // Cap em 200 artigos pra evitar quota overflow do localStorage
        // (alguns browsers limitam 5MB total per origin).
        const capped = rawArticles.slice(0, 200);
        localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), articles: capped }));
      } catch {}
      fetched = true;
    }
  } catch (e) { console.warn('[globe] worker indisponível', e); }

  if (!fetched) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && Array.isArray(cached.articles) && Date.now() - (cached.t || 0) < LS_TTL) {
          processArticles(cached.articles, 'cache');
        }
      }
    } catch (e) { console.warn('[globe] cache local indisponível', e); }
  }

  stopLoading();
  if (results.length === 0) return; // keep static markers as fallback

  // Geo-tag por posição: d3.geoContains diz qual país contém as coords base
  if (window._globe?.geoTagArticles) window._globe.geoTagArticles(results);

  _allEventos = results;
  rebuildSourcePopup();
  applyFilters();

  // Update stats
  const gsEl = document.getElementById('gs-events');
  if (gsEl) gsEl.textContent = String(EVENTOS.length).padStart(2, '0');
  const gsLatestEl = document.getElementById('gs-latest');
  if (gsLatestEl) gsLatestEl.textContent = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '');

  if (window._globe?.rebuildMarkers) window._globe.rebuildMarkers(EVENTOS);
}

/* ==========================================================
   KICK OFF
========================================================== */
loadAll()
  .then(() => fetchGlobeNews())
  .then(() => setInterval(() => { if (!document.hidden) fetchGlobeNews(); }, CFG.GLOBE_REFRESH_MS))
  .catch(err => console.error(err));

// Pause stream animations when hero is off-screen
(function() {
  const svg = document.querySelector('.hero-mark-streams');
  if (!svg || !window.IntersectionObserver) return;
  new IntersectionObserver(([entry]) => {
    svg.style.animationPlayState = entry.isIntersecting ? '' : 'paused';
    svg.querySelectorAll('.trail, .dot').forEach(el => {
      el.style.animationPlayState = entry.isIntersecting ? '' : 'paused';
    });
  }, { threshold: 0.1 }).observe(svg.closest('.hero-mark') || svg);
})();

/* ==========================================================
   MARKET TICKER
   - Binance + Alternative.me fetched directly (CORS-open, keyless).
   - Finnhub + Brapi require server-side proxy (/api/ticker) with
     FINNHUB_KEY / BRAPI_KEY envs in production. Here we use
     realistic seed values with gentle drift so the bar stays lively.
========================================================== */
const TICKER_ORDER = [
  { label: "BTC",           key: "BTCUSDT",  src: "binance" },
  { label: "S&P 500",       key: "SPY",      src: "finnhub", seed: 542.10 },
  { label: "IBOV",          key: "^BVSP",    src: "brapi",   seed: 135200, currency: "BRL-idx" },
  { label: "ETH",           key: "ETHUSDT",  src: "binance" },
  { label: "OURO",          key: "GLD",      src: "finnhub", seed: 231.40 },
  { label: "PETR4",         key: "PETR4",    src: "brapi",   seed: 38.92, currency: "BRL" },
  { label: "SOL",           key: "SOLUSDT",  src: "binance" },
  { label: "NASDAQ",        key: "QQQ",      src: "finnhub", seed: 468.20 },
  { label: "VALE3",         key: "VALE3",    src: "brapi",   seed: 62.15, currency: "BRL" },
  { label: "BNB",           key: "BNBUSDT",  src: "binance" },
  { label: "PETRÓLEO",      key: "USO",      src: "finnhub", seed: 78.60 },
  { label: "USD/BRL",       key: "USD-BRL",  src: "brapi",   seed: 5.02, currency: "BRL-fx" },
  { label: "XRP",           key: "XRPUSDT",  src: "binance" },
  { label: "DOW JONES",     key: "DIA",      src: "finnhub", seed: 395.70 },
  { label: "ITUB4",         key: "ITUB4",    src: "brapi",   seed: 34.48, currency: "BRL" },
  { label: "ADA",           key: "ADAUSDT",  src: "binance" },
  { label: "PRATA",         key: "SLV",      src: "finnhub", seed: 28.15 },
  { label: "BBDC4",         key: "BBDC4",    src: "brapi",   seed: 16.30, currency: "BRL" },
  { label: "DOGE",          key: "DOGEUSDT", src: "binance" },
  { label: "RUSSELL 2000",  key: "IWM",      src: "finnhub", seed: 218.40 },
  { label: "BBAS3",         key: "BBAS3",    src: "brapi",   seed: 28.74, currency: "BRL" },
  { label: "AVAX",          key: "AVAXUSDT", src: "binance" },
  { label: "DOT",           key: "DOTUSDT",  src: "binance" },
  { label: "LINK",          key: "LINKUSDT", src: "binance" },
  { label: "TON",           key: "TONUSDT",  src: "binance" },
  { label: "NEAR",          key: "NEARUSDT", src: "binance" },
  { label: "MATIC",         key: "MATICUSDT",src: "binance" },
  { label: "UNI",           key: "UNIUSDT",  src: "binance" },
  { label: "AAVE",          key: "AAVEUSDT", src: "binance" },
  { label: "FEAR & GREED",  key: "FNG",      src: "alternative" },
];

// Seed fallback prices for Binance (used if fetch fails or pre-load)
const BINANCE_SEED = {
  BTCUSDT: 64500, ETHUSDT: 3180, SOLUSDT: 172, BNBUSDT: 598, XRPUSDT: 0.52,
  ADAUSDT: 0.46, DOGEUSDT: 0.158, AVAXUSDT: 35.4, DOTUSDT: 7.12, LINKUSDT: 17.8,
  TONUSDT: 6.85, NEARUSDT: 7.42, MATICUSDT: 0.71, UNIUSDT: 9.85, AAVEUSDT: 115.3
};

function fmtUSD(n) {
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 10)   return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
}
function fmtBRL(n) {
  return 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
function fmtIdx(n) {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function fmtChange(c) {
  const sign = c >= 0 ? '+' : '';
  return sign + c.toFixed(c > -10 && c < 10 ? 2 : 1) + '%';
}
function fgClass(v) {
  if (v <= 25) return { label: 'EXTREME FEAR', cls: 'tk-fg-ef' };
  if (v <= 45) return { label: 'FEAR',         cls: 'tk-fg-f'  };
  if (v <= 54) return { label: 'NEUTRAL',      cls: 'tk-fg-n'  };
  if (v <= 75) return { label: 'GREED',        cls: 'tk-fg-g'  };
  return         { label: 'EXTREME GREED',    cls: 'tk-fg-eg' };
}

// In-memory snapshot of each ticker value
const tickerState = Object.fromEntries(TICKER_ORDER.map(x => [x.key, { value: null, change: null, extra: null }]));

const prevTickerValues = {};

function renderTickerRow(changedKeys = new Set()) {
  const track = document.getElementById('ticker-track');
  if (!track) return;
  const itemHtml = TICKER_ORDER.map(row => {
    const st = tickerState[row.key];
    if (st.value == null) {
      return `<span class="tk-item" data-key="${row.key}"><span class="tk-lbl">${row.label}</span><span class="tk-skel"></span></span>`;
    }
    if (row.src === 'alternative') {
      const fg = fgClass(st.value);
      return `<span class="tk-item" data-key="${row.key}"><span class="tk-lbl">${row.label}</span><span class="tk-val">${st.value}</span><span class="tk-chg ${fg.cls}">${fg.label}</span></span>`;
    }
    let valStr;
    if (row.currency === 'BRL')     valStr = fmtBRL(st.value);
    else if (row.currency === 'BRL-fx')  valStr = fmtBRL(st.value);
    else if (row.currency === 'BRL-idx') valStr = fmtIdx(st.value);
    else valStr = fmtUSD(st.value);
    const chg = st.change ?? 0;
    const chgCls = chg >= 0 ? 'up' : 'down';
    return `<span class="tk-item" data-key="${row.key}"><span class="tk-lbl">${row.label}</span><span class="tk-val">${valStr}</span><span class="tk-chg ${chgCls}">${fmtChange(chg)}</span></span>`;
  }).join('');
  // Duplicate for seamless loop
  track.innerHTML = itemHtml + itemHtml;

  // Wave: varredura de luz no container do ticker
  const ticker = document.getElementById('ticker');
  if (ticker) {
    const old = ticker.querySelector('.ticker-sweep');
    if (old) old.remove();
    const sweep = document.createElement('div');
    sweep.className = 'ticker-sweep';
    ticker.appendChild(sweep);
    sweep.addEventListener('animationend', () => sweep.remove(), { once: true });
  }

  // Flash laranja nos ativos que mudaram de valor
  if (changedKeys.size > 0) {
    track.querySelectorAll('.tk-item').forEach(el => {
      if (changedKeys.has(el.dataset.key)) {
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
        el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
      }
    });
  }
}

// ---- Data fetchers ----
// Bundle /ticker: 1 request substitui binance + fng + fx + 6 quotes. KV compartilhado entre visitantes.
/* Seed pra Finnhub (sem API) e Brapi (fallback se upstream falhar). */
function seedMocks() {
  for (const row of TICKER_ORDER) {
    if ((row.src === 'finnhub' || row.src === 'brapi') && row.seed && tickerState[row.key].value == null) {
      tickerState[row.key].value = row.seed;
      tickerState[row.key].change = (Math.random() - 0.4) * 1.8;
    }
  }
}
function driftMocks() {
  for (const row of TICKER_ORDER) {
    if (row.src === 'finnhub') {
      const st = tickerState[row.key];
      if (st.value != null) {
        const delta = (Math.random() - 0.5) * 0.004;
        st.value = st.value * (1 + delta);
        st.change = (st.change ?? 0) + delta * 100 * 0.2;
      }
    }
  }
}

function applyTickerBundle(bundle) {
  // Binance
  for (const d of (bundle.binance || [])) {
    if (tickerState[d.symbol]) {
      tickerState[d.symbol].value = parseFloat(d.lastPrice);
      tickerState[d.symbol].change = parseFloat(d.priceChangePercent);
    }
  }
  // Fear & Greed
  const fngVal = parseInt(bundle.fng?.data?.[0]?.value, 10);
  if (!Number.isNaN(fngVal)) tickerState.FNG.value = fngVal;
  // Brapi quotes
  for (const q of (bundle.quotes || [])) {
    const r = (q.results || [])[0];
    if (r && tickerState[r.symbol] !== undefined) {
      tickerState[r.symbol].value  = r.regularMarketPrice;
      tickerState[r.symbol].change = r.regularMarketChangePercent;
    }
  }
  // USD-BRL
  const rate = bundle.fx?.USDBRL;
  if (rate) {
    tickerState['USD-BRL'].value  = parseFloat(rate.bid);
    tickerState['USD-BRL'].change = parseFloat(rate.pctChange);
  }
}

async function fetchTicker() {
  try {
    const r = await fetch(`${CFG.WORKER_URL}/ticker`);
    if (!r.ok) throw new Error('ticker status ' + r.status);
    const bundle = await r.json();
    applyTickerBundle(bundle);
  } catch (err) {
    console.warn('[ticker] bundle failed, keeping seeds/last known', err);
    for (const sym of Object.keys(BINANCE_SEED)) {
      if (tickerState[sym].value == null) {
        tickerState[sym].value = BINANCE_SEED[sym] * (1 + (Math.random()-0.5)*0.02);
        tickerState[sym].change = (Math.random()-0.5) * 4;
      }
    }
    if (tickerState.FNG.value == null) tickerState.FNG.value = 71;
  }
}

async function refreshTicker() {
  const snapshot = {};
  for (const row of TICKER_ORDER) snapshot[row.key] = tickerState[row.key].value;

  await fetchTicker();
  driftMocks();

  // Detecta quais mudaram
  const changed = new Set();
  for (const row of TICKER_ORDER) {
    const prev = snapshot[row.key];
    const curr = tickerState[row.key].value;
    if (prev != null && curr != null && prev !== curr) changed.add(row.key);
  }

  renderTickerRow(changed);
}

// Init
seedMocks();
renderTickerRow();           // skeletons + mock seeds
refreshTicker();             // live fetch
setInterval(() => { if (!document.hidden) refreshTicker(); }, CFG.TICKER_REFRESH_MS);
