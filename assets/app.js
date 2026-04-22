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
  WORKER_URL: 'https://wesearch-news.wesearch.workers.dev',
  GLOBE_REFRESH_MS: 5 * 60 * 1000,       // intervalo do fetch do globo
  TICKER_REFRESH_MS: 120 * 1000,         // intervalo do ticker de mercado (120s p/ ficar dentro do free tier)
  DRAG_RESUME_MS: 250,                   // delay pra retomar auto-rotate após drag
  FILTER_24H_MS: 24 * 60 * 60 * 1000,
  FILTER_7D_MS:  7 * 24 * 60 * 60 * 1000,
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
  if (!u) return '#';
  return /^https?:\/\//i.test(u) ? u : '#';
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
      const excerpt = item.description
        .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120)
        .replace(/\s\S*$/, '') + '.';
      const author = (item.author || '').replace(/\s*-.*$/, '').trim().toUpperCase();
      return {
        n: String(i+1).padStart(2,'0'), date, title: item.title,
        excerpt, author, category, url: item.link,
        thumbnail: item.thumbnail || extractFirstImg(item.content) || extractFirstImg(item.description) || null
      };
    });
  } catch {
    // fallback: usa artigos.json estático
    return fetch('data/artigos.json').then(r => r.json());
  }
}

async function loadAll() {
  const [e, a, r, p] = await Promise.all([
    fetch('data/eventos.json').then(r=>r.json()),
    fetch('data/analistas.json').then(r=>r.json()),
    fetchArtigosSubstack(),
    fetch('data/parceiros.json').then(r=>r.json())
  ]);
  EVENTOS = e; ANALISTAS = a; ARTIGOS = r; PARCEIROS = p;

  // Credibility numbers
  document.getElementById('m-articles').textContent = String(ARTIGOS.length + 35);
  document.getElementById('m-countries').textContent = String(new Set(EVENTOS.map(x=>x.country)).size);
  document.getElementById('m-analysts').textContent = String(ANALISTAS.length).padStart(2,'0');

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
  container.innerHTML = ANALISTAS.map((an, i) => `
    <a class="analyst" href="${safeUrl(an.substackUrl)}" target="_blank" rel="noopener">
      <div class="frame">
        <span class="tag">№ ${String(i+1).padStart(2,'0')}</span>
        <span class="ticks"></span>
        <span class="initials">${esc(an.initials)}</span>
      </div>
      <div>
        <div class="name">${esc(an.name)}</div>
        <div class="spec">${esc(an.specialty)}</div>
      </div>
      <div class="go">
        <span>LinkedIn</span>
        <span class="arr">↗</span>
      </div>
    </a>
  `).join('');

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
        if (u !== '#') window.open(u, '_blank', 'noopener');
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



  function openCountryPanel(tag, displayName) {
    const items = EVENTOS.filter(e => e.tag === tag || (e.country||'').toLowerCase() === (tag||'').toLowerCase());
    panelTitle.textContent = displayName || tag;
    panelCount.textContent = items.length === 0
      ? 'Nenhuma publicação ainda'
      : items.length + ' publicaç' + (items.length === 1 ? 'ão' : 'ões');
    panelList.innerHTML = items.length
      ? items.map(ev => `<a class="cp-item" href="${safeUrl(ev.url)}" target="_blank" rel="noopener">
          <span class="cp-cat">${esc(ev.category)}</span>
          <span class="cp-title">${esc(ev.title)}</span>
          <span class="cp-meta">${esc(ev.source||ev.author)} · ${esc(ev.date)}</span>
        </a>`).join('')
      : `<div class="cp-empty">Ainda não cobrimos esse país — volte em breve.</div>`;
    panel.classList.add('on');
  }
  function closeCountryPanel() { panel.classList.remove('on'); }
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
    hoverPauseUntil = performance.now() + 4000;
  }
  function hideTip() {
    tip.classList.remove('on');
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
const GEO_DICT = {
  // Americas — países
  'brazil': [-15.78, -47.93], 'brasil': [-15.78, -47.93], 'brasília': [-15.78, -47.93],
  'são paulo': [-23.55, -46.63], 'rio de janeiro': [-22.91, -43.17], 'lula': [-15.78, -47.93],
  'united states': [38.90, -77.03], 'trump': [38.90, -77.03], 'washington': [38.90, -77.03],
  'wall street': [40.71, -74.01], 'new york': [40.71, -74.01], 'federal reserve': [38.90, -77.03],
  'white house': [38.90, -77.03], 'pentagon': [38.90, -77.03], 'harris': [38.90, -77.03],
  'american': [38.90, -77.03], 'u.s.': [38.90, -77.03], 'us economy': [38.90, -77.03],
  'argentina': [-34.61, -58.37], 'buenos aires': [-34.61, -58.37], 'milei': [-34.61, -58.37],
  'mexico': [19.43, -99.13], 'méxico': [19.43, -99.13], 'sheinbaum': [19.43, -99.13],
  'canada': [45.42, -75.69], 'ottawa': [45.42, -75.69], 'carney': [45.42, -75.69], 'trudeau': [45.42, -75.69],
  'colombia': [4.71, -74.07], 'bogotá': [4.71, -74.07],
  'venezuela': [10.49, -66.88], 'caracas': [10.49, -66.88], 'maduro': [10.49, -66.88],
  'chile': [-33.45, -70.67], 'santiago': [-33.45, -70.67],
  'peru': [-12.04, -77.03], 'lima': [-12.04, -77.03],
  'ecuador': [-0.23, -78.52], 'bolivia': [-16.50, -68.15], 'uruguay': [-33.00, -56.00],
  'cuba': [23.13, -82.38], 'havana': [23.13, -82.38],
  // Europe — países e líderes
  'united kingdom': [51.51, -0.13], 'britain': [51.51, -0.13], 'london': [51.51, -0.13],
  'uk ': [51.51, -0.13], 'starmer': [51.51, -0.13], 'downing street': [51.51, -0.13],
  'bank of england': [51.51, -0.13], 'british': [51.51, -0.13],
  'germany': [52.52, 13.40], 'berlin': [52.52, 13.40], 'scholz': [52.52, 13.40],
  'merz': [52.52, 13.40], 'bundesbank': [52.52, 13.40], 'german': [52.52, 13.40],
  'france': [48.85, 2.35], 'paris': [48.85, 2.35], 'macron': [48.85, 2.35], 'french': [48.85, 2.35],
  'russia': [55.75, 37.62], 'moscow': [55.75, 37.62], 'putin': [55.75, 37.62], 'kremlin': [55.75, 37.62],
  'ukraine': [50.45, 30.52], 'kyiv': [50.45, 30.52], 'zelensky': [50.45, 30.52],
  'spain': [40.42, -3.70], 'madrid': [40.42, -3.70], 'sanchez': [40.42, -3.70],
  'italy': [41.90, 12.49], 'rome': [41.90, 12.49], 'meloni': [41.90, 12.49], 'italian': [41.90, 12.49],
  'netherlands': [52.37, 4.90], 'amsterdam': [52.37, 4.90],
  'poland': [52.23, 21.01], 'warsaw': [52.23, 21.01],
  'switzerland': [46.95, 7.44], 'zurich': [47.38, 8.54], 'davos': [46.80, 9.84],
  'sweden': [59.33, 18.07], 'stockholm': [59.33, 18.07],
  'norway': [59.91, 10.75], 'oslo': [59.91, 10.75],
  'denmark': [55.68, 12.57], 'finland': [60.17, 24.94], 'austria': [48.21, 16.37],
  'portugal': [38.72, -9.14], 'lisbon': [38.72, -9.14],
  'greece': [37.98, 23.73], 'athens': [37.98, 23.73],
  'turkey': [39.93, 32.86], 'erdogan': [39.93, 32.86], 'ankara': [39.93, 32.86],
  'european union': [50.85, 4.35], 'brussels': [50.85, 4.35], 'ecb': [50.11, 8.68],
  'nato': [50.85, 4.35], 'hungary': [47.50, 19.04], 'orbán': [47.50, 19.04],
  'romania': [44.43, 26.10], 'czech': [50.08, 14.44], 'serbia': [44.80, 20.46],
  // Middle East
  'israel': [32.08, 34.78], 'tel aviv': [32.08, 34.78], 'netanyahu': [32.08, 34.78], 'israeli': [32.08, 34.78],
  'iran': [35.69, 51.39], 'tehran': [35.69, 51.39], 'iranian': [35.69, 51.39],
  'saudi arabia': [24.69, 46.72], 'riyadh': [24.69, 46.72], 'mbs': [24.69, 46.72],
  'iraq': [33.34, 44.40], 'baghdad': [33.34, 44.40],
  'syria': [33.51, 36.29], 'damascus': [33.51, 36.29],
  'lebanon': [33.89, 35.50], 'beirut': [33.89, 35.50], 'hezbollah': [33.89, 35.50],
  'yemen': [15.55, 44.21], 'houthi': [15.55, 44.21],
  'gaza': [32.08, 34.78], 'west bank': [32.08, 34.78], 'hamas': [32.08, 34.78],
  'uae': [24.45, 54.37], 'dubai': [25.20, 55.27], 'abu dhabi': [24.45, 54.37],
  'qatar': [25.29, 51.53], 'doha': [25.29, 51.53],
  'kuwait': [29.37, 47.98], 'jordan': [31.95, 35.93], 'amman': [31.95, 35.93],
  'oman': [22.00, 57.50], 'bahrain': [24.69, 46.72],
  // Asia — países, líderes e cidades
  'china': [39.91, 116.39], 'beijing': [39.91, 116.39], 'xi jinping': [39.91, 116.39],
  'shanghai': [31.23, 121.47], 'chinese': [39.91, 116.39],
  'japan': [35.68, 139.69], 'tokyo': [35.68, 139.69], 'ishiba': [35.68, 139.69], 'japanese': [35.68, 139.69],
  'india': [28.61, 77.21], 'new delhi': [28.61, 77.21], 'modi': [28.61, 77.21],
  'mumbai': [19.08, 72.88], 'indian': [28.61, 77.21],
  'south korea': [37.57, 126.98], 'seoul': [37.57, 126.98], 'korean': [37.57, 126.98],
  'north korea': [39.02, 125.76], 'kim jong': [39.02, 125.76], 'pyongyang': [39.02, 125.76],
  'taiwan': [25.04, 121.56], 'taipei': [25.04, 121.56],
  'hong kong': [22.30, 114.17],
  'singapore': [1.35, 103.82],
  'indonesia': [-6.21, 106.85], 'jakarta': [-6.21, 106.85],
  'pakistan': [33.72, 73.04], 'islamabad': [33.72, 73.04], 'karachi': [24.86, 67.01],
  'afghanistan': [34.52, 69.18], 'kabul': [34.52, 69.18], 'taliban': [34.52, 69.18],
  'bangladesh': [23.72, 90.41], 'sri lanka': [7.60, 80.70],
  'vietnam': [21.03, 105.85], 'hanoi': [21.03, 105.85],
  'thailand': [13.76, 100.50], 'bangkok': [13.76, 100.50],
  'malaysia': [3.15, 101.69], 'kuala lumpur': [3.15, 101.69],
  'philippines': [14.60, 120.98], 'manila': [14.60, 120.98],
  'myanmar': [19.74, 96.08], 'cambodia': [11.57, 104.92],
  'kazakhstan': [51.18, 71.45], 'uzbekistan': [41.30, 69.24],
  // Africa
  'south africa': [-25.75, 28.19], 'johannesburg': [-26.20, 28.04], 'pretoria': [-25.75, 28.19],
  'nigeria': [9.07, 7.40], 'lagos': [6.46, 3.40], 'abuja': [9.07, 7.40],
  'egypt': [30.06, 31.25], 'cairo': [30.06, 31.25], 'sisi': [30.06, 31.25],
  'ethiopia': [9.03, 38.74], 'addis ababa': [9.03, 38.74],
  'kenya': [-1.29, 36.82], 'nairobi': [-1.29, 36.82],
  'morocco': [34.01, -6.85], 'rabat': [34.01, -6.85], 'casablanca': [33.59, -7.62],
  'ghana': [5.55, -0.20], 'accra': [5.55, -0.20],
  'sudan': [15.55, 32.53], 'khartoum': [15.55, 32.53],
  'congo': [-4.32, 15.32], 'kinshasa': [-4.32, 15.32],
  'tanzania': [-6.79, 39.21], 'uganda': [0.32, 32.58],
  'angola': [-8.84, 13.23], 'mozambique': [-25.97, 32.57],
  'somalia': [2.05, 45.34], 'mali': [12.65, -8.00], 'niger': [13.51, 2.12],
  'libya': [26.34, 17.23], 'tripoli': [30.50, 14.50], 'tunisia': [36.82, 10.17],
  'algeria': [36.74, 3.06], 'senegal': [14.71, -17.47],
  // Oceania
  'australia': [-35.28, 149.13], 'sydney': [-33.87, 151.21], 'canberra': [-35.28, 149.13],
  'melbourne': [-37.81, 144.96], 'australian': [-35.28, 149.13],
  'new zealand': [-41.29, 174.78], 'wellington': [-41.29, 174.78],
  // Crypto / Macro — termos com âncora geográfica
  'bitcoin': [40.71, -74.01], 'btc': [40.71, -74.01], 'satoshi': [40.71, -74.01],
  'crypto': [40.71, -74.01], 'cryptocurrency': [40.71, -74.01],
  'ethereum': [47.38, 8.54], 'eth': [47.38, 8.54], 'vitalik': [47.38, 8.54], 'buterin': [47.38, 8.54],
  'solana': [37.77, -122.42], 'xrp': [37.77, -122.42], 'ripple': [37.77, -122.42],
  'cardano': [47.38, 8.54], 'polkadot': [47.38, 8.54],
  'chainlink': [37.77, -122.42], 'uniswap': [40.71, -74.01],
  'aave': [51.51, -0.13], 'makerdao': [37.77, -122.42], 'compound': [37.77, -122.42],
  'avalanche': [40.71, -74.01], 'avax': [40.71, -74.01],
  'aptos': [37.77, -122.42], 'arbitrum': [40.71, -74.01], 'optimism': [37.77, -122.42],
  'stablecoin': [42.36, -71.06], 'stablecoins': [42.36, -71.06],
  'defi': [37.77, -122.42], 'nft': [40.71, -74.01], 'nfts': [40.71, -74.01],
  'blockchain': [37.77, -122.42], 'web3': [37.77, -122.42],
  'halving': [40.71, -74.01], 'hashrate': [38.90, -77.03], 'hash rate': [38.90, -77.03],
  'miner': [38.90, -77.03], 'miners': [38.90, -77.03], 'mining': [38.90, -77.03],
  'altcoin': [40.71, -74.01], 'altcoins': [40.71, -74.01],
  'memecoin': [40.71, -74.01], 'meme coin': [40.71, -74.01],
  'dogecoin': [40.71, -74.01], 'doge': [40.71, -74.01],
  'shiba': [40.71, -74.01],
  'bnb': [25.20, 55.27],
  'staking': [40.71, -74.01], 'tvl': [40.71, -74.01],
  'smart contract': [37.77, -122.42], 'smart contracts': [37.77, -122.42],
  // Exchanges
  'binance': [25.20, 55.27], 'changpeng zhao': [25.20, 55.27],
  'coinbase': [37.77, -122.42], 'brian armstrong': [37.77, -122.42],
  'kraken': [37.77, -122.42], 'winklevoss': [40.71, -74.01],
  'bybit': [25.20, 55.27], 'okx': [25.04, 121.56], 'bitget': [1.35, 103.82], 'kucoin': [1.35, 103.82],
  'bitfinex': [22.30, 114.17], 'deribit': [51.51, -0.13],
  // Stablecoins
  'tether': [22.30, 114.17], 'usdt': [22.30, 114.17],
  'circle': [42.36, -71.06], 'usdc': [42.36, -71.06],
  // Crypto-adjacent firms / vehicles
  'microstrategy': [38.90, -77.03], 'saylor': [38.90, -77.03], 'michael saylor': [38.90, -77.03],
  'grayscale': [40.71, -74.01], 'gbtc': [40.71, -74.01],
  'blackrock': [40.71, -74.01], 'larry fink': [40.71, -74.01],
  'fidelity': [42.36, -71.06], 'vaneck': [40.71, -74.01], 'ark invest': [40.71, -74.01],
  'bitcoin etf': [40.71, -74.01], 'ethereum etf': [40.71, -74.01], 'spot etf': [40.71, -74.01],
  'gensler': [38.90, -77.03], 'gary gensler': [38.90, -77.03], 'paul atkins': [38.90, -77.03],
  'cftc': [38.90, -77.03], 'fdic': [38.90, -77.03],
  'ftx': [40.71, -74.01], 'sbf': [40.71, -74.01], 'bankman-fried': [40.71, -74.01], 'bankman fried': [40.71, -74.01],
  'luna': [37.57, 126.98], 'terra luna': [37.57, 126.98], 'do kwon': [37.57, 126.98],
  'celsius': [40.71, -74.01], 'voyager': [40.71, -74.01],
  '3ac': [1.35, 103.82], 'three arrows': [1.35, 103.82], 'mt gox': [35.68, 139.69], 'mt. gox': [35.68, 139.69],
  'silvergate': [40.71, -74.01], 'signature bank': [40.71, -74.01], 'svb': [37.77, -122.42],
  'polymarket': [40.71, -74.01], 'prediction market': [40.71, -74.01], 'prediction markets': [40.71, -74.01],
  'kalshi': [40.71, -74.01],

  // Macro — Fed / bancos centrais / dados
  'powell': [38.90, -77.03], 'jerome powell': [38.90, -77.03],
  'yellen': [38.90, -77.03], 'janet yellen': [38.90, -77.03],
  'bessent': [38.90, -77.03], 'scott bessent': [38.90, -77.03],
  'fomc': [38.90, -77.03], 'jackson hole': [38.90, -77.03],
  'rate cut': [38.90, -77.03], 'rate cuts': [38.90, -77.03],
  'rate hike': [38.90, -77.03], 'rate hikes': [38.90, -77.03],
  'interest rate': [38.90, -77.03], 'interest rates': [38.90, -77.03],
  'basis point': [38.90, -77.03], 'basis points': [38.90, -77.03],
  'inflation': [38.90, -77.03], 'disinflation': [38.90, -77.03], 'deflation': [38.90, -77.03], 'stagflation': [38.90, -77.03],
  'cpi': [38.90, -77.03], 'core cpi': [38.90, -77.03],
  'pce': [38.90, -77.03], 'core pce': [38.90, -77.03], 'ppi': [38.90, -77.03],
  'unemployment': [38.90, -77.03], 'jobless': [38.90, -77.03], 'jobs report': [38.90, -77.03],
  'nonfarm payrolls': [38.90, -77.03], 'payrolls': [38.90, -77.03], 'nfp': [38.90, -77.03],
  'retail sales': [38.90, -77.03], 'consumer confidence': [38.90, -77.03],
  'housing starts': [38.90, -77.03],
  'pmi': [38.90, -77.03], 'ism': [38.90, -77.03], 'gdp': [38.90, -77.03],
  'recession': [38.90, -77.03], 'soft landing': [38.90, -77.03], 'hard landing': [38.90, -77.03],
  'treasury': [38.90, -77.03], 'treasuries': [38.90, -77.03],
  'yield curve': [38.90, -77.03], '10-year': [38.90, -77.03], '10 year': [38.90, -77.03],
  'bond yields': [38.90, -77.03], 'treasury yields': [38.90, -77.03],
  'dollar index': [38.90, -77.03], 'dxy': [38.90, -77.03],
  'quantitative easing': [38.90, -77.03], 'quantitative tightening': [38.90, -77.03],
  'balance sheet': [38.90, -77.03], 'reverse repo': [38.90, -77.03],
  'debt ceiling': [38.90, -77.03],
  'monetary policy': [38.90, -77.03], 'hawkish': [38.90, -77.03], 'dovish': [38.90, -77.03],
  'lagarde': [50.11, 8.68], 'christine lagarde': [50.11, 8.68],
  'bank of england': [51.51, -0.13], 'andrew bailey': [51.51, -0.13],
  'bank of japan': [35.68, 139.69], 'kazuo ueda': [35.68, 139.69], 'ueda': [35.68, 139.69],
  'pboc': [39.91, 116.39], "people's bank of china": [39.91, 116.39],
  'rbi': [28.61, 77.21], 'reserve bank of india': [28.61, 77.21],
  'bis': [47.56, 7.59], 'bank for international settlements': [47.56, 7.59],

  // Commodities
  'oil price': [24.69, 46.72], 'crude oil': [24.69, 46.72], 'crude': [24.69, 46.72],
  'wti': [29.76, -95.37], 'brent': [51.51, -0.13],
  'gold price': [51.51, -0.13], 'gold': [51.51, -0.13], 'silver price': [51.51, -0.13],
  'copper': [-33.45, -70.67], 'lithium': [-23.65, -68.13], 'uranium': [-23.65, -68.13],
  'natural gas': [29.76, -95.37], 'lng': [29.76, -95.37],
  'wheat': [51.18, 71.45], 'corn': [41.88, -93.09], 'soybean': [-23.55, -46.63], 'soybeans': [-23.55, -46.63],
  'commodity': [40.71, -74.01], 'commodities': [40.71, -74.01],

  // Mercados / índices
  's&p 500': [40.71, -74.01], 's&p500': [40.71, -74.01], 'sp500': [40.71, -74.01], 'spx': [40.71, -74.01],
  'nasdaq': [40.71, -74.01], 'dow jones': [40.71, -74.01],
  'russell 2000': [40.71, -74.01], 'vix': [40.71, -74.01], 'nyse': [40.71, -74.01],
  'ftse': [51.51, -0.13], 'ftse 100': [51.51, -0.13],
  'dax': [52.52, 13.40], 'cac 40': [48.85, 2.35],
  'nikkei': [35.68, 139.69], 'hang seng': [22.30, 114.17], 'kospi': [37.57, 126.98],
  'shanghai composite': [31.23, 121.47],
  'bovespa': [-23.55, -46.63], 'ibovespa': [-23.55, -46.63], 'b3': [-23.55, -46.63],
  'merval': [-34.61, -58.37],
  'msci': [40.71, -74.01], 'emerging markets': [40.71, -74.01],

  // Tech / AI
  'apple': [37.33, -122.03], 'tim cook': [37.33, -122.03], 'iphone': [37.33, -122.03],
  'google': [37.42, -122.08], 'alphabet': [37.42, -122.08], 'sundar pichai': [37.42, -122.08],
  'microsoft': [47.61, -122.33], 'satya nadella': [47.61, -122.33],
  'amazon': [47.61, -122.33], 'andy jassy': [47.61, -122.33], 'aws': [47.61, -122.33],
  'meta': [37.49, -122.14], 'zuckerberg': [37.49, -122.14], 'mark zuckerberg': [37.49, -122.14],
  'facebook': [37.49, -122.14], 'instagram': [37.49, -122.14], 'whatsapp': [37.49, -122.14],
  'nvidia': [37.42, -121.94], 'jensen huang': [37.42, -121.94],
  'amd': [37.42, -121.94], 'intel': [37.42, -121.94], 'qualcomm': [32.72, -117.16],
  'tesla': [30.22, -97.75], 'elon musk': [30.22, -97.75], 'musk': [30.22, -97.75],
  'spacex': [30.22, -97.75], 'starlink': [30.22, -97.75], 'starship': [30.22, -97.75],
  'openai': [37.77, -122.42], 'sam altman': [37.77, -122.42],
  'chatgpt': [37.77, -122.42],
  'anthropic': [37.77, -122.42], 'perplexity': [37.77, -122.42],
  'mistral': [48.85, 2.35], 'deepseek': [22.54, 114.06],
  'nasa': [38.90, -77.03], 'artemis': [38.90, -77.03],
  'tsmc': [25.04, 121.56], 'taiwan semiconductor': [25.04, 121.56],
  'samsung': [37.57, 126.98], 'sk hynix': [37.57, 126.98],
  'sony': [35.68, 139.69], 'softbank': [35.68, 139.69], 'masayoshi son': [35.68, 139.69],
  'alibaba': [30.27, 120.15], 'jack ma': [30.27, 120.15],
  'tencent': [22.54, 114.06], 'byd': [22.54, 114.06],
  'xiaomi': [39.91, 116.39], 'huawei': [22.54, 114.06],
  'nio': [31.23, 121.47], 'xpeng': [22.54, 114.06],
  'lufthansa': [50.11, 8.68],

  // Wall Street / Bancos globais
  'jp morgan': [40.71, -74.01], 'jpmorgan': [40.71, -74.01], 'jamie dimon': [40.71, -74.01],
  'goldman sachs': [40.71, -74.01], 'goldman': [40.71, -74.01],
  'morgan stanley': [40.71, -74.01],
  'bank of america': [35.23, -80.84], 'wells fargo': [37.77, -122.42],
  'citigroup': [40.71, -74.01], 'citibank': [40.71, -74.01],
  'ubs': [47.38, 8.54], 'credit suisse': [47.38, 8.54],
  'deutsche bank': [50.11, 8.68], 'barclays': [51.51, -0.13],
  'hsbc': [51.51, -0.13], 'santander': [40.42, -3.70],
  'bnp paribas': [48.85, 2.35], 'societe generale': [48.85, 2.35],
  'nomura': [35.68, 139.69], 'icbc': [39.91, 116.39],

  // EUA — estados/cidades/políticos expandidos
  'biden': [38.90, -77.03], 'kamala': [38.90, -77.03], 'kamala harris': [38.90, -77.03],
  'schumer': [38.90, -77.03], 'pelosi': [38.90, -77.03], 'nancy pelosi': [38.90, -77.03],
  'mike johnson': [38.90, -77.03], 'mitch mcconnell': [38.90, -77.03],
  'bernie sanders': [38.90, -77.03], 'elizabeth warren': [38.90, -77.03],
  'vance': [38.90, -77.03], 'jd vance': [38.90, -77.03],
  'desantis': [30.44, -84.28], 'ron desantis': [30.44, -84.28],
  'newsom': [38.58, -121.49], 'gavin newsom': [38.58, -121.49],
  'greg abbott': [30.27, -97.74],
  'california': [34.05, -118.24], 'texas': [30.27, -97.74], 'florida': [27.99, -81.76],
  'virginia': [37.54, -77.43], 'ohio': [39.96, -82.99], 'michigan': [42.33, -83.05],
  'arizona': [33.45, -112.07], 'nevada': [36.17, -115.14], 'colorado': [39.74, -104.99],
  'oregon': [45.52, -122.68], 'pennsylvania': [40.27, -76.88],
  'san francisco': [37.77, -122.42], 'los angeles': [34.05, -118.24],
  'miami': [25.79, -80.19], 'chicago': [41.88, -87.63], 'boston': [42.36, -71.06],
  'houston': [29.76, -95.37], 'austin': [30.27, -97.74], 'seattle': [47.61, -122.33],
  'dallas': [32.78, -96.80], 'atlanta': [33.75, -84.39], 'philadelphia': [39.95, -75.17],
  'americans': [38.90, -77.03],

  // Demonyms adicionais
  'russian': [55.75, 37.62], 'russians': [55.75, 37.62],
  'ukrainian': [50.45, 30.52], 'ukrainians': [50.45, 30.52],
  'polish': [52.23, 21.01], 'poles': [52.23, 21.01],
  'dutch': [52.37, 4.90],
  'swedish': [59.33, 18.07], 'norwegian': [59.91, 10.75], 'danish': [55.68, 12.57],
  'spanish': [40.42, -3.70], 'portuguese': [38.72, -9.14],
  'belgian': [50.85, 4.35], 'swiss': [46.95, 7.44],
  'saudi': [24.69, 46.72], 'egyptian': [30.06, 31.25], 'turkish': [39.93, 32.86],
  'pakistani': [33.72, 73.04], 'afghan': [34.52, 69.18],
  'vietnamese': [21.03, 105.85], 'thai': [13.76, 100.50], 'malaysian': [3.15, 101.69],
  'filipino': [14.60, 120.98], 'indonesian': [-6.21, 106.85],
  'mexican': [19.43, -99.13], 'brazilian': [-15.78, -47.93],
  'argentine': [-34.61, -58.37], 'argentinian': [-34.61, -58.37],
  'chilean': [-33.45, -70.67], 'colombian': [4.71, -74.07],
  'venezuelan': [10.49, -66.88], 'cuban': [23.13, -82.38], 'cubans': [23.13, -82.38],
  'peruvian': [-12.04, -77.03],
  'canadian': [45.42, -75.69], 'canadians': [45.42, -75.69],
  'nigerian': [9.07, 7.40], 'kenyan': [-1.29, 36.82], 'moroccan': [34.01, -6.85],
  'ethiopian': [9.03, 38.74], 'sudanese': [15.55, 32.53],
  'south african': [-25.75, 28.19],
  'european': [50.85, 4.35], 'eurozone': [50.11, 8.68], 'euro area': [50.11, 8.68],

  // Brasil / Argentina / Chile / México / Colômbia — expansão
  'cfk': [-34.61, -58.37], 'cristina kirchner': [-34.61, -58.37], 'kirchner': [-34.61, -58.37],
  'massa': [-34.61, -58.37], 'caputo': [-34.61, -58.37], 'luis caputo': [-34.61, -58.37],
  'bullrich': [-34.61, -58.37], 'villarruel': [-34.61, -58.37], 'adorni': [-34.61, -58.37],
  'haddad': [-15.78, -47.93], 'fernando haddad': [-15.78, -47.93],
  'galipolo': [-15.78, -47.93], 'campos neto': [-15.78, -47.93],
  'bolsonaro': [-15.78, -47.93], 'moraes': [-15.78, -47.93], 'alexandre de moraes': [-15.78, -47.93],
  'petrobras': [-22.91, -43.17],
  'itau': [-23.55, -46.63], 'itaú': [-23.55, -46.63], 'bradesco': [-23.55, -46.63], 'nubank': [-23.55, -46.63],
  'copom': [-15.78, -47.93], 'selic': [-15.78, -47.93], 'stf': [-15.78, -47.93],
  'pemex': [19.43, -99.13], 'amlo': [19.43, -99.13],
  'boric': [-33.45, -70.67], 'codelco': [-33.45, -70.67],
  'gustavo petro': [4.71, -74.07],

  // Geopolítica — conflitos, organismos, tratados
  'drone strike': [50.45, 30.52], 'drone strikes': [50.45, 30.52],
  'missile strike': [31.77, 35.22], 'airstrike': [33.51, 36.29],
  'ceasefire': [32.08, 34.78], 'cease fire': [32.08, 34.78],
  'coup': [13.51, 2.12], 'junta': [13.51, 2.12],
  'embargo': [38.90, -77.03], 'trade war': [38.90, -77.03], 'trade deal': [38.90, -77.03],
  'tariffs': [38.90, -77.03], 'usmca': [19.43, -99.13], 'wto': [46.21, 6.14],
  'summit': [50.85, 4.35], 'g7 summit': [51.51, -0.13], 'g20 summit': [-15.78, -47.93],
  'united nations': [40.75, -73.98], 'security council': [40.75, -73.98],
  'donbas': [49.84, 36.23], 'kharkiv': [49.99, 36.23], 'odesa': [46.48, 30.73], 'odessa': [46.48, 30.73],
  'mariupol': [47.10, 37.55], 'crimea': [45.03, 34.10], 'odesa': [48.00, 31.00], 'odessa': [48.00, 31.00],
  'belarus': [53.90, 27.57], 'lukashenko': [53.90, 27.57], 'minsk': [53.90, 27.57],
  'sahel': [13.51, 2.12], 'tigray': [13.50, 38.45],
  'hormuz': [27.20, 56.30], 'strait of hormuz': [27.20, 56.30],
  'red sea': [15.55, 44.21], 'bab el mandeb': [15.55, 44.21], 'suez canal': [30.06, 31.25],
  'south china sea': [22.54, 114.06], 'taiwan strait': [25.04, 121.56],
  'korean peninsula': [37.57, 126.98], 'kashmir': [34.08, 74.80],
  'nasrallah': [33.89, 35.50], 'sinwar': [32.08, 34.78], 'yahya sinwar': [32.08, 34.78],
  'houthis': [15.55, 44.21],

  // Termos legados (manter compatibilidade)
  'imf': [38.90, -77.03], 'world bank': [38.90, -77.03], 'g7': [51.51, -0.13],
  'g20': [-15.78, -47.93], 'brics': [-15.78, -47.93], 'opec': [24.69, 46.72],
  'tariff': [38.90, -77.03], 'sanctions': [38.90, -77.03],

  // Variações acentuadas / não-inglês (captura de títulos ES/PT)
  'irán': [35.69, 51.39], 'ormuz': [27.20, 56.30],
  'estados unidos': [38.90, -77.03], 'eua': [38.90, -77.03],
  'méxico': [19.43, -99.13], 'teotihuacán': [19.69, -98.84],
  'unión europea': [50.85, 4.35], 'união europeia': [50.85, 4.35], 'europea': [50.85, 4.35],
  'reino unido': [51.51, -0.13], 'alemania': [52.52, 13.40], 'alemanha': [52.52, 13.40],
  'españa': [40.42, -3.70], 'espanha': [40.42, -3.70],
  'china': [39.91, 116.39],
  'tajani': [41.90, 12.49], 'mandelson': [51.51, -0.13],
  'nasrallah': [33.89, 35.50],
};

// Sort longest-first to avoid 'iran' matching inside 'ukraine'
const GEO_ENTRIES = Object.entries(GEO_DICT).sort((a, b) => b[0].length - a[0].length);

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

function geoFromISO(code) {
  const cities = ISO_CITIES[code];
  if (cities?.length) {
    const [lat, lon] = cities[Math.floor(Math.random() * cities.length)];
    return { lat, lon, tag: code.toLowerCase(), country: code };
  }
  const c = ISO_COORDS[code];
  if (c) return { lat: c[0], lon: c[1], tag: code.toLowerCase(), country: code };
  return null;
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
  // T2 — regional relevante
  'G1 Globo': 2, 'La Nación': 2, 'ANSA': 2, 'Notes from Poland': 2,
  'Dawn': 2, 'Taipei Times': 2, 'CBC News': 2, 'CNA': 2,
  // T2 — analítico complementar
  'Foreign Affairs': 2, 'Axios': 2, 'Al-Monitor': 2, 'Middle East Eye': 2,
  'Meduza': 2, 'AllAfrica': 2, 'Ars Technica': 2, 'MIT Technology Review': 2,
  // T3 — diversidade geográfica + macro agregador
  'El Universal': 3, 'The Punch': 3, 'ABC Australia': 3, 'DutchNews': 3,
  'Rappler': 3, 'Bangkok Post': 3, 'Morocco World News': 3,
  'Investing.com': 3, 'Crisis Group': 3,
};
const TIER_CAP = { 1: 25, 2: 10, 3: 5 };

// Keyword classifiers — ordem importa: cripto > geo > macro
const CRIPTO_KW = ['bitcoin','ethereum','crypto','blockchain','defi','nft','web3','btc','eth','solana','binance','coinbase','altcoin','stablecoin','token','halving','dex','on-chain','onchain'];
const GEO_KW    = ['war','conflict','military','sanction','treaty','nato','united nations',' un ','attack','missile','troops','ceasefire','diplomat','coup','protest','refugee','invasion','offensive','airstrike','hostage','insurgent','rebel'];
const MACRO_KW  = ['inflation','gdp','recession','interest rate','federal reserve','ecb','imf','world bank','tariff','trade war','economy','economic','fiscal','monetary','bond yield','unemployment','deficit','surplus','oil price','opec','central bank','rate cut','rate hike','earnings','stock market','nasdaq','s&p 500','dow jones'];

function classifyTitle(title, sourceCategory) {
  if (sourceCategory) return sourceCategory; // Guardian sectionId já mapeado
  const t = title.toLowerCase();
  if (CRIPTO_KW.some(k => t.includes(k))) return 'cripto';
  if (GEO_KW.some(k => t.includes(k)))    return 'geo';
  if (MACRO_KW.some(k => t.includes(k)))  return 'macro';
  return 'other';
}

// Estado dos filtros activos
let _filterTime    = 'all';
let _filterCat     = 'all';
let _blockedSources = new Set(); // blocklist: fontes desactivadas. Vazio = todas activas.
let _allEventos    = [];

function applyFilters() {
  const now   = Date.now();
  const limit = _filterTime === '24h' ? CFG.FILTER_24H_MS : _filterTime === '7d' ? CFG.FILTER_7D_MS : Infinity;
  EVENTOS = _allEventos.filter(ev => {
    if (_filterCat !== 'all' && ev.newsCategory !== _filterCat) return false;
    if (_blockedSources.has(ev.source)) return false;
    if (limit < Infinity && ev.publishedAt) {
      if (now - new Date(ev.publishedAt).getTime() > limit) return false;
    }
    return true;
  });
  if (window._globe?.rebuildMarkers) window._globe.rebuildMarkers(EVENTOS);
  const gsEl = document.getElementById('gs-events');
  if (gsEl) gsEl.textContent = String(EVENTOS.length).padStart(2,'0');
}

function _getVisibleSources() {
  // Fontes presentes após filtros de tempo+categoria (ignora filtro de fonte)
  const now   = Date.now();
  const limit = _filterTime === '24h' ? CFG.FILTER_24H_MS : _filterTime === '7d' ? CFG.FILTER_7D_MS : Infinity;
  const visible = _allEventos.filter(ev => {
    if (_filterCat !== 'all' && ev.newsCategory !== _filterCat) return false;
    if (limit < Infinity && ev.publishedAt) {
      if (now - new Date(ev.publishedAt).getTime() > limit) return false;
    }
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

    let geo = geoFromText(title);
    if (!geo) return;

    const { lat, lon, tag, country } = geo;
    seen.add(dedup);
    const jLat = lat + (Math.random() - 0.5) * 2;
    const jLon = lon + (Math.random() - 0.5) * 2;
    const newsCategory = classifyTitle(title, sourceCategory);
    const pub = publishedAt ? new Date(publishedAt) : null;
    results.push({
      id, url, source,
      title: title.length > 90 ? title.slice(0, 87) + '…' : title,
      country, tag,
      baseLat: lat, baseLon: lon,
      lat: Math.max(-85, Math.min(85, jLat)),
      lon: ((jLon + 180) % 360) - 180,
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
    console.info(`[globe/${source}] recebidos: ${rawArticles.length} | após tier-cap: ${articles.length} | no globo: ${results.length}`);
  }

  let fetched = false;
  try {
    const data = await fetch(WORKER_URL).then(r => r.json());
    const rawArticles = data.articles || [];
    if (rawArticles.length) {
      processArticles(rawArticles, 'worker');
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ t: Date.now(), articles: rawArticles }));
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
  .then(() => setInterval(fetchGlobeNews, CFG.GLOBE_REFRESH_MS))
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
setInterval(refreshTicker, CFG.TICKER_REFRESH_MS);
