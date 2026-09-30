'use strict';

/* ============================================================
   Model: walks the exported LightGBM trees (same decision rules
   as LightGBM's NumericalDecision / CategoricalDecision).
   Node = [feature, threshold | categories, left, right,
           default_left, is_categorical, missing_type(0 none,1 zero,2 nan)]
   Child >= 0 is a node index, < 0 is leaf -(k) -> leaves[k-1].
   ============================================================ */
const Model = {
  treeValue(t, vec) {
    let i = t.r;
    while (i >= 0) {
      const nd = t.n[i];
      let x = vec[nd[0]];
      const missing = x === null || x === undefined || Number.isNaN(x);
      let left;
      if (nd[5]) {
        if (missing) {
          if (nd[6] === 2) { i = nd[3]; continue; }
          x = 0;
        }
        left = x >= 0 && nd[1].indexOf(Math.trunc(x)) !== -1;
      } else {
        if (missing && nd[6] !== 2) x = 0;
        if ((nd[6] === 1 && Math.abs(x) <= 1e-35) || (nd[6] === 2 && missing)) left = nd[4] === 1;
        else left = x <= nd[1];
      }
      i = left ? nd[2] : nd[3];
    }
    return t.l[-i - 1];
  },
  predictLog(model, vec) {
    let s = 0;
    const trees = model.trees;
    for (let k = 0; k < trees.length; k++) s += Model.treeValue(trees[k], vec);
    return s;
  },
};
if (typeof module !== 'undefined') module.exports = Model;

if (typeof document !== 'undefined') (function () {

/* ============================================================
   Numbers from the v2 notebook run (housing_model_v2.ipynb)
   ============================================================ */
const NB = {
  alpharetta: {
    place: 'Alpharetta', name: 'Alpharetta', county: 'Fulton County', hue: 245,
    n: 19218, r2: 0.911, mae: 45659, mape: 6.34, medape: 3.93, w10: 81.3, cov: 0.798,
    bandLo: -0.08996691503784379, bandHi: 0.10331139084715889,
    tiers: [0.843, 0.851, 0.846, 0.769, 0.691],
    steps: [
      { name: 'v1 inputs', a: 7.25, b: 29.19 },
      { name: '+ building details', a: 3.97, b: 16.34 },
      { name: '+ coordinates (final)', a: 3.93, b: 15.63 },
    ],
    sales: [
      { year: 2023, n: 10, cv: 0.970, cvCod: 19.4, est: 0.923, estCod: 19.9 },
      { year: 2024, n: 160, cv: 0.859, cvCod: 15.7, est: 0.853, estCod: 14.3 },
      { year: 2025, n: 308, cv: 0.786, cvCod: 21.4, est: 0.780, estCod: 22.0 },
    ],
  },
  forsyth: {
    place: 'Forsyth County', name: 'Forsyth', county: 'Forsyth County', hue: 48,
    n: 80306, r2: 0.912, mae: 45380, mape: 6.76, medape: 4.42, w10: 81.6, cov: 0.800,
    bandLo: -0.08859482034256416, bandHi: 0.10414530144086775,
    tiers: [0.800, 0.876, 0.845, 0.794, 0.685],
    steps: [
      { name: 'v1 inputs (with land value)', a: 4.34 },
      { name: 'minus land value', a: 4.50 },
      { name: '+ quality and structure type', a: 4.45 },
      { name: '+ coordinates (final)', a: 4.42 },
    ],
  },
};
const TIERS = ['Lowest 20%', '20–40%', '40–60%', '60–80%', 'Top 20%'];
const TAX_YEAR = 2025;

const LABELS = {
  LandAcres: 'Lot size', LivUnits: 'Living units', LUCode: 'Home type', NbrHood: 'Neighborhood',
  AreaSF_all: 'Square footage', YrBlt: 'Year built', Stories: 'Stories', TotBed: 'Bedrooms',
  FixBath: 'Full baths', FixHalf: 'Half baths', TotRooms: 'Total rooms', Basement: 'Basement',
  FinBsmtVal: 'Finished basement', ExtWall: 'Exterior walls', Attic: 'Attic', Firepl_S: 'Fireplaces',
  Firepl_PF: 'Prefab fireplaces', n_cards: 'Buildings on the lot', Topo: 'Lot topography',
  Fronting: 'Road frontage', lon: 'Location (east–west)', lat: 'Location (north–south)',
  BLDGAREA: 'Building size', RESFLRAREA: 'Residential floor area', home_age: 'Age',
  FLOORCOUNT: 'Floors', STATEDAREA: 'Lot size', owns_lot: 'Owns its lot', USECD: 'Use type',
  NGHBRHDCD: 'Neighborhood', CLASSCD: 'Tax class', ZONING: 'Zoning', STRCLASS: 'Construction grade',
  RESSTRTYP: 'Structure type',
};
const LU = { '101': 'Single family', '106': 'Condo', '107': 'Townhome' };

const SLIDERS = {
  alpharetta: [
    { f: 'AreaSF_all', label: 'Square footage', min: v => Math.max(400, r50(v * 0.5)), max: v => r50(v * 1.8), step: 50, fmt: v => fmtInt(v) + ' sq ft' },
    { f: 'YrBlt', label: 'Year built', min: () => 1900, max: () => TAX_YEAR, step: 1, fmt: v => String(v) },
    { f: 'TotBed', label: 'Bedrooms', min: () => 1, max: () => 8, step: 1, fmt: v => String(v) },
    { f: 'FixBath', label: 'Full baths', min: () => 1, max: () => 7, step: 1, fmt: v => String(v) },
    { f: 'FixHalf', label: 'Half baths', min: () => 0, max: () => 4, step: 1, fmt: v => String(v) },
    { f: 'LandAcres', label: 'Lot size', min: () => 0.05, max: v => Math.max(2, +(v * 3).toFixed(2)), step: 0.01, fmt: v => v.toFixed(2) + ' ac' },
  ],
  forsyth: [
    { f: 'BLDGAREA', label: 'Building size', min: v => Math.max(400, r50(v * 0.5)), max: v => r50(v * 1.8), step: 50, fmt: v => fmtInt(v) + ' sq ft' },
    // the model uses age; people think in year built
    { f: 'home_age', label: 'Year built', toUI: a => TAX_YEAR - a, fromUI: y => TAX_YEAR - y, min: () => 1900, max: () => TAX_YEAR, step: 1, fmt: v => String(v) },
    { f: 'FLOORCOUNT', label: 'Floors', min: () => 1, max: () => 4, step: 1, fmt: v => String(v) },
    { f: 'STATEDAREA', label: 'Lot size', min: () => 0.05, max: v => Math.max(2, +(v * 3).toFixed(2)), step: 0.01, fmt: v => v.toFixed(2) + ' ac', skip: (h, i) => !(h.X.owns_lot[i] > 0) },
  ],
};

/* ---------------- utilities ---------------- */
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function r50(v) { return Math.round(v / 50) * 50; }
function fmtInt(v) { return Math.round(v).toLocaleString('en-US'); }
function fmtUSD(v) { return v == null || !isFinite(v) ? '—' : '$' + Math.round(v).toLocaleString('en-US'); }
function fmtShort(v) {
  if (v >= 1e6) return '$' + (+(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)) + 'M';
  return '$' + Math.round(v / 1e3) + 'k';
}
function fmtPct(v, d = 1) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%'; }
function round100(v) { return Math.round(v / 100) * 100; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function quantile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]; }
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/* Critically damped spring (Apple: damping 1.0, response ~0.35s).
   Retargeting keeps the current value and velocity, so it is interruptible. */
class Spring {
  constructor(value, onUpdate, response = 0.35) {
    this.value = value; this.target = value; this.velocity = 0;
    this.onUpdate = onUpdate; this.response = response; this.raf = 0; this.last = 0;
  }
  set(target, velocity) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (reduceMotion.matches) return this.snap(target);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.step(t)); }
  }
  snap(v) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.value = this.target = v; this.velocity = 0; this.onUpdate(v, true);
  }
  step(now) {
    const dt = Math.min(0.064, (now - this.last) / 1000); this.last = now;
    const w = 2 * Math.PI / this.response;
    const x = this.value - this.target, v = this.velocity, e = Math.exp(-w * dt);
    const nx = (x + (v + w * x) * dt) * e;
    this.velocity = (v - w * (v + w * x) * dt) * e;
    this.value = this.target + nx;
    const scale = Math.max(1e-9, Math.abs(this.target) * 1e-5 + 1e-6);
    if (Math.abs(nx) < scale && Math.abs(this.velocity) < scale * 10) {
      this.value = this.target; this.velocity = 0; this.raf = 0; this.onUpdate(this.value, true); return;
    }
    this.onUpdate(this.value, false);
    this.raf = requestAnimationFrame(t => this.step(t));
  }
}

/* ---------------- state ---------------- */
const state = {
  market: 'alpharetta', data: {}, summary: null, sel: -1, vec: null, base: 0, est: 0,
  sort: 'value', filter: '', shown: 25, loading: null,
};
const cur = () => state.data[state.market];

/* ---------------- data loading ---------------- */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  return JSON.parse(text);
}

function prepare(market, raw) {
  const H = raw.homes, X = raw.X, model = raw.model, nb = NB[market];
  const n = H.id.length;
  const lowMul = Math.exp(nb.bandLo), highMul = Math.exp(nb.bandHi);
  const d = { market, H, X, model, n, lowMul, highMul };
  d.lower = H.addr.map(a => a.toLowerCase());
  d.subOf = i => H.sub ? H.sub.v[H.sub.i[i]] : '';
  d.nbrOf = i => H.nbr ? H.nbr.v[H.nbr.i[i]] : '';
  d.useOf = i => H.use ? H.use.v[H.use.i[i]] : '';

  // equirectangular projection around the median latitude
  const lats = H.lat.filter(v => v != null).sort((a, b) => a - b);
  const lons = H.lon.filter(v => v != null).sort((a, b) => a - b);
  const lat0 = quantile(lats, 0.5), lon0 = quantile(lons, 0.5), kx = Math.cos(lat0 * Math.PI / 180);
  d.wx = new Float32Array(n); d.wy = new Float32Array(n); d.has = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (H.lat[i] == null || H.lon[i] == null) continue;
    d.wx[i] = (H.lon[i] - lon0) * kx; d.wy[i] = -(H.lat[i] - lat0); d.has[i] = 1;
  }
  d.bounds = {
    x0: (quantile(lons, 0.003) - lon0) * kx, x1: (quantile(lons, 0.997) - lon0) * kx,
    y0: -(quantile(lats, 0.997) - lat0), y1: -(quantile(lats, 0.003) - lat0),
  };

  // color bucket per home from log estimate
  const ests = H.est.slice().sort((a, b) => a - b);
  d.vLo = quantile(ests, 0.02); d.vHi = quantile(ests, 0.98); d.vMid = quantile(ests, 0.5);
  const l0 = Math.log(d.vLo), l1 = Math.log(d.vHi);
  d.bucket = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = (Math.log(H.est[i]) - l0) / (l1 - l0);
    d.bucket[i] = Math.max(0, Math.min(RAMP_STEPS - 1, Math.round(t * (RAMP_STEPS - 1))));
  }
  d.order = Array.from({ length: n }, (_, i) => i).filter(i => d.has[i]).sort((a, b) => H.est[a] - H.est[b]);

  // spatial grid for hover, clicks and nearby homes
  const span = Math.max(d.bounds.x1 - d.bounds.x0, d.bounds.y1 - d.bounds.y0);
  d.cell = span / 160;
  d.grid = new Map();
  for (let i = 0; i < n; i++) {
    if (!d.has[i]) continue;
    const k = Math.floor(d.wx[i] / d.cell) + ',' + Math.floor(d.wy[i] / d.cell);
    let a = d.grid.get(k); if (!a) d.grid.set(k, a = []); a.push(i);
  }
  d.near = (x, y, r) => {
    const out = [];
    const c0 = Math.floor((x - r) / d.cell), c1 = Math.floor((x + r) / d.cell);
    const r0 = Math.floor((y - r) / d.cell), r1 = Math.floor((y + r) / d.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const a = d.grid.get(cx + ',' + cy); if (!a) continue;
      for (const i of a) { const dx = d.wx[i] - x, dy = d.wy[i] - y, dd = dx * dx + dy * dy; if (dd <= r * r) out.push([dd, i]); }
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  d.featIndex = Object.fromEntries(model.features.map((f, k) => [f, k]));
  d.vecOf = i => model.features.map(f => X[f][i]);
  d.sorted = {};
  return d;
}

function loadMarket(market) {
  if (state.data[market]) return Promise.resolve(state.data[market]);
  return fetchJSON(`data/${market}.json.gz`).then(raw => (state.data[market] = prepare(market, raw)));
}

/* ============================================================
   Map
   ============================================================ */
const RAMP_STEPS = 28;
const map = {
  canvas: $('map'), ctx: null, W: 0, H: 0, dpr: 1, colors: [], fit: 1, hover: -1, active: false,
  cam: { x: 0, y: 0, s: 1 }, springs: null, dragging: null, raf: 0,
};
map.ctx = map.canvas.getContext('2d');

function rampColor(t, hue, dark) {
  const L = dark ? 0.4 + 0.52 * t : 0.86 - 0.54 * t;
  const C = 0.035 + 0.13 * t;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue})`;
}
function buildRamp() {
  const hue = NB[state.market].hue, dark = isDark();
  map.colors = Array.from({ length: RAMP_STEPS }, (_, k) => rampColor(k / (RAMP_STEPS - 1), hue, dark));
  const stops = [0, 0.25, 0.5, 0.75, 1].map(t => rampColor(t, hue, dark) + ' ' + t * 100 + '%').join(',');
  $('ramp').style.background = `linear-gradient(to right, ${stops})`;
  const d = cur();
  if (d) $('rampTicks').innerHTML = [d.vLo, d.vMid, d.vHi].map(v => `<span>${fmtShort(v)}</span>`).join('');
}
function sizeMap() {
  const r = map.canvas.getBoundingClientRect();
  map.dpr = Math.min(2, window.devicePixelRatio || 1);
  map.W = r.width; map.H = r.height;
  map.canvas.width = Math.round(r.width * map.dpr); map.canvas.height = Math.round(r.height * map.dpr);
  const d = cur(); if (d) map.fit = fitScale(d);
  drawMap();
}
function fitScale(d) {
  const b = d.bounds, pad = 28;
  return Math.min((map.W - pad * 2) / (b.x1 - b.x0), (map.H - pad * 2) / (b.y1 - b.y0));
}
function resetCam(animate) {
  const d = cur(); if (!d) return;
  map.fit = fitScale(d);
  const b = d.bounds;
  const tx = (b.x0 + b.x1) / 2, ty = (b.y0 + b.y1) / 2;
  if (animate) { map.springs.x.set(tx); map.springs.y.set(ty); map.springs.s.set(map.fit); }
  else { for (const [k, v] of [['x', tx], ['y', ty], ['s', map.fit]]) map.springs[k].snap(v); drawMap(); }
}
map.springs = {
  x: new Spring(0, v => { map.cam.x = v; requestDraw(); }, 0.55),
  y: new Spring(0, v => { map.cam.y = v; requestDraw(); }, 0.55),
  s: new Spring(1, v => { map.cam.s = v; requestDraw(); }, 0.55),
};
function requestDraw() { if (!map.raf) map.raf = requestAnimationFrame(() => { map.raf = 0; drawMap(); }); }
const toScreen = (d, i) => [(d.wx[i] - map.cam.x) * map.cam.s + map.W / 2, (d.wy[i] - map.cam.y) * map.cam.s + map.H / 2];
const toWorld = (sx, sy) => [(sx - map.W / 2) / map.cam.s + map.cam.x, (sy - map.H / 2) / map.cam.s + map.cam.y];

function drawMap() {
  const ctx = map.ctx, d = cur();
  ctx.setTransform(map.dpr, 0, 0, map.dpr, 0, 0);
  ctx.clearRect(0, 0, map.W, map.H);
  if (!d) return;
  const zoom = map.cam.s / map.fit;
  const r = Math.min(5, Math.max(d.n > 40000 ? 0.9 : 1.2, 1.1 * Math.sqrt(zoom)));
  const W = map.W, Hh = map.H, s = map.cam.s, cx = map.cam.x - W / 2 / s, cy = map.cam.y - Hh / 2 / s;
  let lastB = -1;
  const round = r >= 2.4;
  ctx.beginPath();
  for (let k = 0; k < d.order.length; k++) {
    const i = d.order[k];
    const x = (d.wx[i] - cx) * s, y = (d.wy[i] - cy) * s;
    if (x < -r || y < -r || x > W + r || y > Hh + r) continue;
    const b = d.bucket[i];
    if (b !== lastB) { ctx.fill(); ctx.beginPath(); ctx.fillStyle = map.colors[b]; lastB = b; }
    if (round) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
    else ctx.rect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fill();
  const ring = (i, color, rad, width) => {
    const [x, y] = toScreen(d, i);
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832);
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
  };
  if (map.hover >= 0 && map.hover !== state.sel) ring(map.hover, css('--ink'), r + 3, 1.5);
  if (state.sel >= 0 && d.has[state.sel]) {
    const [x, y] = toScreen(d, state.sel);
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fillStyle = css('--mkt'); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = isDark() ? '#000' : '#fff'; ctx.stroke();
  }
}

function pickAt(sx, sy, px = 10) {
  const d = cur(); if (!d) return -1;
  const [wx, wy] = toWorld(sx, sy);
  const hit = d.near(wx, wy, px / map.cam.s);
  return hit.length ? hit[hit.length ? 0 : 0][1] : -1;
}
function showTip(i, sx, sy) {
  const tip = $('tip'), d = cur();
  if (i < 0) { tip.hidden = true; return; }
  tip.innerHTML = `<b>${esc(d.H.addr[i])}</b> · ${fmtShort(d.H.est[i])}`;
  tip.style.left = Math.max(80, Math.min(map.W - 80, sx)) + 'px';
  tip.style.top = sy + 'px';
  tip.hidden = false;
}

(function mapInput() {
  const c = map.canvas;
  let hist = [];
  const stopSprings = () => { for (const k in map.springs) { const sp = map.springs[k]; cancelAnimationFrame(sp.raf); sp.raf = 0; sp.value = sp.target = map.cam[k]; sp.velocity = 0; } };
  c.addEventListener('pointerdown', e => {
    if (!cur()) return;
    map.active = true;
    map.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, touch: e.pointerType === 'touch' };
    if (!map.dragging.touch) { c.setPointerCapture(e.pointerId); stopSprings(); }
    hist = [[e.clientX, e.clientY, e.timeStamp]];
  });
  c.addEventListener('pointermove', e => {
    const rect = c.getBoundingClientRect();
    const g = map.dragging;
    if (g && g.id === e.pointerId) {
      const dx = e.clientX - hist[hist.length - 1][0], dy = e.clientY - hist[hist.length - 1][1];
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (!g.touch && g.moved > 4) {
        c.classList.add('dragging');
        map.cam.x -= dx / map.cam.s; map.cam.y -= dy / map.cam.s;
        map.springs.x.value = map.springs.x.target = map.cam.x;
        map.springs.y.value = map.springs.y.target = map.cam.y;
        $('tip').hidden = true;
        requestDraw();
      }
      hist.push([e.clientX, e.clientY, e.timeStamp]); if (hist.length > 6) hist.shift();
      return;
    }
    if (e.pointerType === 'touch') return;
    const i = pickAt(e.clientX - rect.left, e.clientY - rect.top);
    if (i !== map.hover) { map.hover = i; requestDraw(); }
    if (i >= 0) { const [x, y] = toScreen(cur(), i); showTip(i, x, y); } else showTip(-1);
    c.style.cursor = i >= 0 ? 'pointer' : '';
  });
  const end = e => {
    const g = map.dragging; if (!g || g.id !== e.pointerId) return;
    map.dragging = null; c.classList.remove('dragging');
    const rect = c.getBoundingClientRect();
    if (g.moved <= 6 && e.type === 'pointerup') {
      const i = pickAt(e.clientX - rect.left, e.clientY - rect.top, g.touch ? 16 : 10);
      if (i >= 0) selectHome(i, { from: 'map' });
      return;
    }
    if (g.touch) return;
    // momentum: project where the flick is heading (Apple's deceleration projection)
    const a = hist[0], b = hist[hist.length - 1], dt = Math.max(16, b[2] - a[2]) / 1000;
    if (b[2] - a[2] > 120 || e.timeStamp - b[2] > 80) return;
    const vx = (b[0] - a[0]) / dt, vy = (b[1] - a[1]) / dt, dec = 0.994;
    const proj = v => (v / 1000) * dec / (1 - dec);
    map.springs.x.set(map.cam.x - proj(vx) / map.cam.s, -vx / map.cam.s);
    map.springs.y.set(map.cam.y - proj(vy) / map.cam.s, -vy / map.cam.s);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => { map.active = false; if (map.hover >= 0) { map.hover = -1; requestDraw(); } showTip(-1); });
  c.addEventListener('wheel', e => {
    // zoom on trackpad pinch (ctrlKey) or once the pointer has engaged the map; otherwise let the page scroll
    if (!cur() || !(e.ctrlKey || map.active)) return;
    e.preventDefault(); stopSprings();
    const rect = c.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const [wx, wy] = toWorld(sx, sy);
    const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
    const s = Math.min(map.fit * 400, Math.max(map.fit * 0.6, map.cam.s * k));
    map.cam.s = s; map.cam.x = wx - (sx - map.W / 2) / s; map.cam.y = wy - (sy - map.H / 2) / s;
    for (const key of ['x', 'y', 's']) { map.springs[key].value = map.springs[key].target = map.cam[key]; }
    requestDraw();
  }, { passive: false });
  c.addEventListener('mouseenter', () => { /* engage wheel-zoom only after a click */ });
  $('zoomIn').onclick = () => map.springs.s.set(Math.min(map.fit * 400, map.springs.s.target * 2));
  $('zoomOut').onclick = () => map.springs.s.set(Math.max(map.fit * 0.6, map.springs.s.target / 2));
  $('zoomReset').onclick = () => resetCam(true);
  new ResizeObserver(() => sizeMap()).observe(map.canvas);
})();

function flyTo(i) {
  const d = cur(); if (!d.has[i]) return;
  map.springs.x.set(d.wx[i]); map.springs.y.set(d.wy[i]);
  map.springs.s.set(Math.max(map.springs.s.target, map.fit * 7));
}

/* ============================================================
   Search
   ============================================================ */
const search = { items: [], active: -1 };
function runSearch(q) {
  const d = cur(); if (!d) return [];
  q = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const starts = [], contains = [];
  for (let i = 0; i < d.n; i++) {
    const a = d.lower[i];
    if (a.startsWith(q)) { starts.push(i); if (starts.length >= 8) break; }
    else if (contains.length < 8 && a.includes(q)) contains.push(i);
  }
  let out = starts.concat(contains).slice(0, 8);
  if (!out.length) {
    const qid = q.replace(/\s+/g, '');
    for (let i = 0; i < d.n && out.length < 8; i++) if (d.H.id[i].toLowerCase().replace(/\s+/g, '').startsWith(qid)) out.push(i);
  }
  return out;
}
function renderSuggest() {
  const ul = $('suggest'), input = $('q'), d = cur();
  if (!input.value.trim() || document.activeElement !== input) { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
  if (!search.items.length) {
    ul.innerHTML = input.value.trim().length < 2 ? '' : `<li class="empty" role="option" aria-disabled="true">No ${esc(NB[state.market].name)} address matches “${esc(input.value.trim())}”. Try the house number and street name.</li>`;
  } else {
    ul.innerHTML = search.items.map((i, k) => {
      const sub = d.subOf(i);
      return `<li role="option" id="opt${k}" data-i="${i}" aria-selected="${k === search.active}"><span>${esc(d.H.addr[i])}${sub ? `<br><small>${esc(sub)}</small>` : ''}</span><small class="num">${fmtShort(d.H.est[i])}</small></li>`;
    }).join('');
  }
  const open = ul.innerHTML !== '';
  ul.hidden = !open; input.setAttribute('aria-expanded', String(open));
  input.setAttribute('aria-activedescendant', search.active >= 0 ? 'opt' + search.active : '');
}
(function searchInput() {
  const input = $('q'), ul = $('suggest');
  input.addEventListener('input', () => { search.items = runSearch(input.value); search.active = search.items.length ? 0 : -1; renderSuggest(); });
  input.addEventListener('focus', renderSuggest);
  input.addEventListener('blur', () => setTimeout(renderSuggest, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!search.items.length) return;
      e.preventDefault();
      search.active = (search.active + (e.key === 'ArrowDown' ? 1 : -1) + search.items.length) % search.items.length;
      renderSuggest();
    } else if (e.key === 'Enter') {
      if (search.active >= 0) { e.preventDefault(); choose(search.items[search.active]); }
    } else if (e.key === 'Escape') { input.value = ''; search.items = []; renderSuggest(); }
  });
  // select on press, not release
  ul.addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); choose(+li.dataset.i);
  });
  function choose(i) { input.value = cur().H.addr[i]; search.items = []; renderSuggest(); input.blur(); selectHome(i, { from: 'search' }); }
})();

function renderTry() {
  const d = cur(), row = $('tryRow');
  const ok = i => d.has[i] && d.H.sqft[i] && d.H.addr[i];
  const picks = [];
  for (const q of [0.5, 0.75, 0.96]) {
    const target = quantile(d.order.map(i => d.H.est[i]), q);
    let best = -1;
    for (let k = Math.floor(q * d.order.length); k < d.order.length; k++) { const i = d.order[k]; if (ok(i) && d.H.est[i] >= target) { best = i; break; } }
    if (best >= 0) picks.push(best);
  }
  if (picks.length) $('q').placeholder = 'Street address, like ' + d.H.addr[picks[0]];
  row.innerHTML = 'Try ' + picks.map(i => `<button class="chip" type="button" data-i="${i}">${esc(d.H.addr[i])}</button>`).join('');
  row.hidden = false;
}
$('tryRow').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) selectHome(+b.dataset.i, { from: 'search' }); });

/* ============================================================
   Home detail
   ============================================================ */
const estSpring = new Spring(0, v => { $('rEst').textContent = fmtUSD(round100(v)); }, 0.3);

function selectHome(i, opts = {}) {
  const d = cur();
  state.sel = i;
  state.vec = d.vecOf(i);
  state.orig = state.vec.slice();
  state.base = Model.predictLog(d.model, state.vec);
  state.est = d.H.est[i];
  renderResult(opts);
  flyTo(i);
  requestDraw();
  history.replaceState(null, '', `#${state.market}/${encodeURIComponent(d.H.id[i])}`);
  if (opts.scroll !== false) {
    const el = $('result');
    const top = el.getBoundingClientRect().top;
    if (opts.from !== 'map' || top > innerHeight * 0.7) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' }));
    }
  }
}

function renderResult() {
  const d = cur(), H = d.H, i = state.sel, market = state.market;
  $('result').hidden = false;
  $('rAddr').textContent = H.addr[i] || H.id[i];
  const use = market === 'alpharetta' ? (LU[d.useOf(i)] || d.useOf(i)) : titleCase(d.useOf(i));
  $('rMeta').textContent = [d.subOf(i), use, d.nbrOf(i) ? 'Neighborhood ' + d.nbrOf(i) : '', 'Parcel ' + H.id[i]].filter(Boolean).join(' · ');
  const link = $('rCounty');
  if (H.link) { link.href = H.link + H.id[i].replace(/ /g, '+'); link.hidden = false; } else link.hidden = true;

  // facts
  const facts = [];
  const sq = H.sqft[i]; if (sq) facts.push(['Square feet', fmtInt(sq)]);
  if (H.yr[i]) facts.push(['Built', H.yr[i]]);
  if (H.beds && H.beds[i] != null) facts.push(['Bedrooms', H.beds[i]]);
  if (H.baths && H.baths[i] != null) facts.push(['Baths', H.baths[i] + (H.half[i] ? ` + ${H.half[i]} half` : '')]);
  if (H.floors[i] != null) facts.push([market === 'alpharetta' ? 'Stories' : 'Floors', H.floors[i]]);
  if (H.ac[i]) facts.push(['Lot', H.ac[i].toFixed(2) + ' ac']);
  $('rFacts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${esc(v)}</dd></div>`).join('');

  renderDrivers();
  renderSliders();
  renderNearby();
  estSpring.snap(H.est[i]);
  updateEstimate(true);
}
function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSfr\b/, 'SFR').replace(/\bSf\b/, 'SF'); }

function updateEstimate(initial) {
  const d = cur(), H = d.H, i = state.sel;
  const orig = H.est[i];
  const est = orig * Math.exp(Model.predictLog(d.model, state.vec) - state.base);
  state.est = est;
  const lo = round100(est * d.lowMul), hi = round100(est * d.highMul);
  if (!initial) estSpring.set(est);
  $('rRange').textContent = `80% range ${fmtUSD(lo)} – ${fmtUSD(hi)}`;
  const delta = est - orig;
  $('rAdj').textContent = Math.abs(delta) < 50 ? '' : `With your changes: ${delta > 0 ? '+' : '−'}${fmtUSD(round100(Math.abs(delta)))} (${fmtPct(delta / orig * 100)}) from ${fmtUSD(orig)}`;
  $('rReset').hidden = Math.abs(delta) < 1 && state.vec.every((v, k) => v === state.orig[k]);

  // range visual
  const cv = H.cv[i];
  const saleYear = H.sd && H.sd[i] ? +H.sd[i].slice(0, 4) : 0;
  const sp = H.sp && H.sp[i] && saleYear >= TAX_YEAR - 3 ? H.sp[i] : null;
  const baseLo = orig * d.lowMul, baseHi = orig * d.highMul;
  const vals = [lo, hi, cv, baseLo, baseHi].concat(sp ? [sp] : []);
  const min = Math.min(...vals) * 0.96, max = Math.max(...vals) * 1.03;
  const pos = v => ((v - min) / (max - min) * 100).toFixed(2) + '%';
  const band = $('rvBand');
  band.classList.toggle('glide', !!initial);
  band.style.left = pos(lo); band.style.width = ((hi - lo) / (max - min) * 100).toFixed(2) + '%';
  const m = (id, v, label) => { const el = $(id); el.classList.toggle('glide', !!initial); el.style.left = pos(v); el.querySelector('span').textContent = label; };
  m('rvEst', est, fmtShort(est));
  m('rvCv', cv, 'County ' + fmtShort(cv));
  const saleEl = $('rvSale');
  if (sp) {
    saleEl.hidden = false; m('rvSale', sp, 'Sold ' + fmtShort(sp));
    // keep the two lower labels from colliding
    const gap = Math.abs(sp - cv) / (max - min);
    saleEl.querySelector('span').style.visibility = gap < 0.16 ? 'hidden' : '';
  } else saleEl.hidden = true;

  // comparison
  const diff = (est - cv) / cv * 100;
  const rows = [
    [`County value ${TAX_YEAR}`, fmtUSD(cv), `Model is ${Math.abs(diff) < 0.5 ? 'within 0.5%' : fmtPct(diff) + (diff > 0 ? ' higher' : ' lower')}`],
  ];
  if (state.market === 'alpharetta') {
    rows.push(H.sp[i] ? ['Last recorded sale', fmtUSD(H.sp[i]), fmtDate(H.sd[i])] : ['Last recorded sale', '—', 'None on file']);
  }
  if (H.sqft[i]) rows.push(['Estimate per sq ft', fmtUSD(est / H.sqft[i]), `county: ${fmtUSD(cv / H.sqft[i])}`]);
  $('rCompare').innerHTML = rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd class="num">${v}<small>${esc(s)}</small></dd></div>`).join('');
}

function featValue(d, f, i) {
  const v = d.X[f][i];
  if (v == null) return 'Not recorded';
  if (d.model.cats[f]) {
    const c = d.model.cats[f][v];
    if (f === 'LUCode') return LU[c] || c;
    if (f === 'NbrHood' || f === 'NGHBRHDCD') return 'Code ' + c;
    return titleCase(c);
  }
  switch (f) {
    case 'lon': case 'lat': return 'Where the home sits';
    case 'AreaSF_all': case 'BLDGAREA': case 'RESFLRAREA': return fmtInt(v) + ' sq ft';
    case 'LandAcres': case 'STATEDAREA': return v.toFixed(2) + ' acres';
    case 'home_age': return v + ' years (built ' + (TAX_YEAR - v) + ')';
    case 'FinBsmtVal': return v ? fmtUSD(v) : 'None';
    case 'owns_lot': return v ? 'Yes' : 'No';
    default: return String(v);
  }
}
function renderDrivers() {
  const d = cur(), i = state.sel;
  const drv = d.H.drv[i];
  const maxAbs = Math.max(6, ...drv.map(x => Math.abs(x[1])));
  $('rDrivers').innerHTML = drv.map(([k, pct]) => {
    const f = d.model.features[k];
    const w = Math.min(50, Math.abs(pct) / maxAbs * 50);
    const cls = pct >= 0 ? 'pos' : 'neg';
    return `<div class="drv"><div class="lbl">${esc(LABELS[f] || f)}<small>${esc(featValue(d, f, i))}</small></div>
      <div class="viz"><i class="${cls}" style="width:${w.toFixed(1)}%"></i></div>
      <div class="pct ${cls}">${fmtPct(pct, Math.abs(pct) < 10 ? 1 : 0)}</div></div>`;
  }).join('');
}

function renderSliders() {
  const d = cur(), i = state.sel, host = $('rSliders');
  const conf = SLIDERS[state.market].filter(c => d.X[c.f][i] != null && !(c.skip && c.skip(d, i)));
  if (!conf.length) { host.innerHTML = '<p class="sub">This home is missing the details the sliders need.</p>'; return; }
  host.innerHTML = conf.map(c => {
    const raw = d.X[c.f][i];
    const ui = c.toUI ? c.toUI(raw) : raw;
    const min = Math.min(c.min(ui), ui), max = Math.max(c.max(ui), ui);
    return `<div><div class="sl-head"><label for="sl-${c.f}">${c.label}</label><output id="out-${c.f}" for="sl-${c.f}">${c.fmt(ui)}</output></div>
      <input type="range" id="sl-${c.f}" data-f="${c.f}" min="${min}" max="${max}" step="${c.step}" value="${ui}" data-orig="${ui}"></div>`;
  }).join('');
  host.querySelectorAll('input[type=range]').forEach(el => {
    const c = conf.find(x => x.f === el.dataset.f);
    const paint = () => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
    paint();
    el.addEventListener('input', () => {
      const ui = +el.value;
      state.vec[d.featIndex[c.f]] = c.fromUI ? c.fromUI(ui) : ui;
      const out = $('out-' + c.f); out.textContent = c.fmt(ui);
      out.classList.toggle('changed', String(ui) !== el.dataset.orig);
      paint();
      updateEstimate(false);
    });
  });
}
$('rReset').addEventListener('click', () => {
  state.vec = state.orig.slice();
  renderSliders(); updateEstimate(false);
});
$('rCopy').addEventListener('click', async () => {
  const btn = $('rCopy');
  try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => (btn.textContent = 'Copy link'), 1600);
});

function renderNearby() {
  const d = cur(), i = state.sel, ul = $('rNearby');
  if (!d.has[i]) { ul.innerHTML = '<li class="sub">No location on file for this home.</li>'; return; }
  let r = d.cell * 0.6, hits = [];
  for (let k = 0; k < 6 && hits.length < 7; k++, r *= 2) hits = d.near(d.wx[i], d.wy[i], r);
  hits = hits.filter(h => h[1] !== i).slice(0, 5);
  ul.innerHTML = hits.map(([dd, j]) => {
    const mi = Math.sqrt(dd) * 69;
    const dist = mi < 0.1 ? Math.round(mi * 5280 / 10) * 10 + ' ft' : mi.toFixed(1) + ' mi';
    const sq = d.H.sqft[j] ? ' · ' + fmtInt(d.H.sqft[j]) + ' sq ft' : '';
    return `<li><button type="button" data-i="${j}"><span class="a">${esc(d.H.addr[j])}</span><span class="v num">${fmtUSD(d.H.est[j])}</span><small>${dist}${sq}</small><small class="num" style="text-align:right">county ${fmtShort(d.H.cv[j])}</small></button></li>`;
  }).join('');
}
$('rNearby').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) selectHome(+b.dataset.i, { from: 'nearby', scroll: false }); });

/* ============================================================
   Charts (hand-built SVG so they follow the theme)
   ============================================================ */
function svg(w, h, body, label) { return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`; }

function errChart() {
  const s = state.summary && state.summary[state.market]; if (!s) return;
  const hst = s.err_hist, nb = NB[state.market];
  const W = 520, Hh = 210, L = 8, R = 8, T = 10, B = 26;
  const n = hst.counts.length, bw = (W - L - R) / n, max = Math.max(...hst.counts);
  const xOf = p => L + (p - hst.lo) / (hst.hi - hst.lo) * (W - L - R);
  // (est - cv) / cv inside the band  <=>  cv in [est*e^lo, est*e^hi]
  const b0 = (Math.exp(-nb.bandHi) - 1) * 100, b1 = (Math.exp(-nb.bandLo) - 1) * 100;
  let body = `<rect x="${xOf(b0)}" y="${T}" width="${xOf(b1) - xOf(b0)}" height="${Hh - T - B}" fill="var(--mkt-soft)" rx="4"/>`;
  hst.counts.forEach((c, k) => {
    const h = c / max * (Hh - T - B - 6);
    body += `<rect x="${(L + k * bw + 0.75).toFixed(1)}" y="${(Hh - B - h).toFixed(1)}" width="${(bw - 1.5).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="var(--mkt)"/>`;
  });
  body += `<line x1="${xOf(0)}" x2="${xOf(0)}" y1="${T}" y2="${Hh - B}" stroke="var(--ink)" stroke-width="1"/>`;
  for (const t of [-40, -20, 0, 20, 40]) body += `<text x="${xOf(t)}" y="${Hh - 8}" text-anchor="middle">${t > 0 ? '+' : ''}${t}%</text>`;
  body += `<text x="${xOf(b1) + 6}" y="${T + 14}" class="strong">80% range</text>`;
  $('errChart').innerHTML = svg(W, Hh, body, `Histogram of estimate errors for ${nb.name}; most homes fall between ${b0.toFixed(0)}% and +${b1.toFixed(0)}%.`);
  $('errTitle').textContent = `How far off the ${nb.name} estimates are`;
}

function covChart() {
  const nb = NB[state.market];
  const W = 520, Hh = 210, L = 34, R = 8, T = 18, B = 26;
  const n = 5, slot = (W - L - R) / n, bw = Math.min(56, slot * 0.56);
  const y = v => T + (1 - v) * (Hh - T - B);
  let body = '';
  for (const t of [0, 0.5, 1]) body += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text>`;
  nb.tiers.forEach((v, k) => {
    const x = L + k * slot + (slot - bw) / 2;
    const low = v < 0.75;
    body += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="5" fill="var(--mkt)" opacity="${low ? 0.55 : 1}"/>`;
    body += `<text x="${x + bw / 2}" y="${y(v) - 6}" text-anchor="middle" class="strong">${Math.round(v * 100)}%</text>`;
    body += `<text x="${x + bw / 2}" y="${Hh - 8}" text-anchor="middle">${TIERS[k]}</text>`;
  });
  body += `<line x1="${L}" x2="${W - R}" y1="${y(0.8)}" y2="${y(0.8)}" stroke="var(--ink)" stroke-dasharray="4 4"/>`;
  $('covChart').innerHTML = svg(W, Hh, body, `Share of ${nb.name} homes inside their 80% range by price tier: ${nb.tiers.map((v, k) => TIERS[k] + ' ' + Math.round(v * 100) + '%').join(', ')}. Dashed line marks the 80% target.`);
}

function stepChart() {
  const nb = NB[state.market];
  const two = nb.steps[0].b !== undefined;
  const max = Math.max(...nb.steps.map(s => Math.max(s.a, s.b || 0)));
  const bar = (v, cls) => `<div class="step-bar ${cls}"><div><i style="width:${(v / max * 100).toFixed(1)}%"></i></div><span>${v.toFixed(2)}%</span></div>`;
  $('stepChart').innerHTML = `<div class="steps" role="list">` + nb.steps.map(s =>
    `<div role="listitem"><div class="step-name">${esc(s.name)}</div>${bar(s.a, 'a')}${two ? bar(s.b, 'b') : ''}</div>`).join('') + '</div>';
  $('stepTitle').textContent = `${nb.name}: median error as inputs were added`;
  $('stepSub').textContent = two
    ? 'Lower is better. Random folds test homes whose neighbors the model has seen; the second test holds out entire neighborhoods.'
    : 'Lower is better. Taking away the county’s land value cost a little; building quality and location won most of it back.';
  $('stepLegend').innerHTML = two
    ? `<span><i style="background:var(--mkt)"></i>Random 5-fold</span><span><i style="background:var(--mkt);opacity:.35"></i>Whole neighborhoods held out</span>`
    : `<span><i style="background:var(--mkt)"></i>Random 5-fold</span>`;
}

function scoreboard() {
  const a = NB.alpharetta, f = NB.forsyth;
  const rows = [
    ['Median error', 'Half of estimates land closer than this', v => v.medape.toFixed(1) + '%'],
    ['Within 10% of county value', 'Share of homes', v => v.w10.toFixed(1) + '%'],
    ['Typical miss in dollars', 'Mean absolute error', v => fmtUSD(v.mae)],
    ['R²', 'Share of value differences explained', v => v.r2.toFixed(3)],
    ['80% range coverage', 'Checked on a held-out half of homes', v => (v.cov * 100).toFixed(1) + '%'],
    ['Homes', 'After cleaning', v => fmtInt(v.n)],
  ];
  $('scoreboard').innerHTML =
    `<div class="score-row head"><span></span><span><i class="dot" style="background:var(--alph)"></i>Alpharetta</span><span><i class="dot" style="background:var(--fors)"></i>Forsyth County</span></div>` +
    rows.map(([k, s, fn]) => `<div class="score-row"><div class="k">${k}<small>${s}</small></div><div class="v">${fn(a)}</div><div class="v">${fn(f)}</div></div>`).join('');
}

function caveats() {
  const nb = NB[state.market];
  const items = [
    [Math.round(nb.tiers[4] * 100) + '%', 'Pricier homes are harder', `For the top 20% of ${nb.name} homes, the range catches the county value ${Math.round(nb.tiers[4] * 100)}% of the time instead of 80%. Treat estimates on expensive homes as looser than the range suggests.`],
  ];
  if (state.market === 'alpharetta') {
    items.push(['15.6%', 'New neighborhoods are harder still', 'With whole neighborhoods held out, median error rises from 3.9% to 15.6%. The model leans heavily on having seen the neighbors.']);
    items.push(['+' + Math.round((1 / nb.sales[2].cv - 1) * 100) + '%', 'County values trail the market', `2025 sales closed about ${Math.round((1 / nb.sales[2].cv - 1) * 100)}% above county value. The model predicts county value, so it trails by the same amount.`]);
  } else {
    items.push([nb.mape.toFixed(1) + '%', 'A few big misses', `Average error is ${nb.mape.toFixed(1)}% against a ${nb.medape.toFixed(1)}% median: most homes are close, and a small set of unusual ones miss by a lot.`]);
    items.push(['0', 'No sales check here', 'The Forsyth export has no sale records, so these estimates are compared only with county values. Alpharetta’s sales check shows county values trailing 2025 prices.']);
  }
  $('caveats').innerHTML = items.map(([big, h, p]) => `<div class="caveat"><div class="big">${big}</div><h3>${h}</h3><p>${p}</p></div>`).join('');
}

function salesTable() {
  const s = NB.alpharetta.sales;
  $('salesTable').innerHTML = `<thead><tr><th>Sale year</th><th>Sales</th><th>County ratio</th><th>County COD</th><th>Model ratio</th><th>Model COD</th></tr></thead><tbody>` +
    s.map(r => `<tr><td>${r.year}</td><td>${r.n}</td><td>${r.cv.toFixed(3)}</td><td>${r.cvCod.toFixed(1)}%</td><td>${r.est.toFixed(3)}</td><td>${r.estCod.toFixed(1)}%</td></tr>`).join('') + '</tbody>';
}

/* ============================================================
   Browse table
   ============================================================ */
function sortedIdx() {
  const d = cur(), H = d.H;
  if (d.sorted[state.sort]) return d.sorted[state.sort];
  const idx = Array.from({ length: d.n }, (_, i) => i);
  const ratio = i => H.est[i] / H.cv[i];
  const cmp = {
    value: (a, b) => H.est[b] - H.est[a],
    above: (a, b) => ratio(b) - ratio(a),
    below: (a, b) => ratio(a) - ratio(b),
    newest: (a, b) => (H.yr[b] || 0) - (H.yr[a] || 0) || H.est[b] - H.est[a],
  }[state.sort];
  return (d.sorted[state.sort] = idx.sort(cmp));
}
function renderTable() {
  const d = cur(); if (!d) return;
  const H = d.H, q = state.filter.trim().toLowerCase();
  let list = sortedIdx();
  if (q) list = list.filter(i => d.lower[i].includes(q) || d.subOf(i).toLowerCase().includes(q));
  const rows = list.slice(0, state.shown);
  $('homesBody').innerHTML = rows.map(i => {
    const gap = (H.est[i] - H.cv[i]) / H.cv[i] * 100;
    return `<tr data-i="${i}" tabindex="0"><td>${esc(H.addr[i] || H.id[i])}</td><td>${fmtUSD(H.est[i])}</td><td>${fmtUSD(H.cv[i])}</td><td class="gap ${gap >= 0 ? 'pos' : 'neg'}">${fmtPct(gap)}</td><td>${H.sqft[i] ? fmtInt(H.sqft[i]) : '—'}</td><td>${H.yr[i] || '—'}</td></tr>`;
  }).join('') || `<tr><td colspan="6" style="color:var(--ink-2)">No homes match “${esc(state.filter)}”.</td></tr>`;
  $('moreBtn').hidden = rows.length >= list.length;
  $('moreCount').textContent = `Showing ${fmtInt(rows.length)} of ${fmtInt(list.length)}`;
  $('exploreTitle').textContent = `Browse every ${NB[state.market].name} home`;
}
$('homesBody').addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) selectHome(+tr.dataset.i, { from: 'table' }); });
$('homesBody').addEventListener('keydown', e => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-i]'); if (tr) selectHome(+tr.dataset.i, { from: 'table' }); } });
$('moreBtn').addEventListener('click', () => { state.shown += 50; renderTable(); });
let filterT = 0;
$('filter').addEventListener('input', e => { clearTimeout(filterT); filterT = setTimeout(() => { state.filter = e.target.value; state.shown = 25; renderTable(); }, 90); });

/* ============================================================
   Segmented controls
   ============================================================ */
function segThumb(seg) {
  const on = seg.querySelector('button[aria-pressed="true"]'), thumb = seg.querySelector('.thumb');
  if (!on) return;
  thumb.style.width = on.offsetWidth + 'px';
  thumb.style.transform = `translateX(${on.offsetLeft}px)`;
}
function initSeg(seg, onPick) {
  const thumb = seg.querySelector('.thumb');
  segThumb(seg);
  requestAnimationFrame(() => { thumb.style.transition = 'transform .38s var(--ease-out), width .38s var(--ease-out)'; });
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
    seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    segThumb(seg); onPick(b);
  });
  new ResizeObserver(() => segThumb(seg)).observe(seg);
}
initSeg($('marketSeg'), b => setMarket(b.dataset.market));
initSeg($('sortSeg'), b => { state.sort = b.dataset.sort; state.shown = 25; renderTable(); });

/* ============================================================
   Market switching + boot
   ============================================================ */
function setStatus(msg, error) { const s = $('status'); s.textContent = msg; s.classList.toggle('error', !!error); }

async function setMarket(market, selectId) {
  state.market = market;
  document.body.dataset.market = market;
  $('marketSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.market === market)));
  segThumb($('marketSeg'));
  const nb = NB[market];
  $('heroPlace').textContent = nb.place;
  $('heroLede').textContent = `Search any of ${fmtInt(nb.n)} homes for a model estimate, an honest range around it, and what drove the number.`;
  $('result').hidden = true; state.sel = -1;
  $('q').value = ''; search.items = []; renderSuggest();
  history.replaceState(null, '', '#' + market);
  errChart(); covChart(); stepChart(); caveats();

  if (!state.data[market]) {
    $('q').disabled = true; $('tryRow').hidden = true; $('legend').hidden = true;
    $('mapSkel').hidden = false; map.ctx.clearRect(0, 0, map.canvas.width, map.canvas.height);
    setStatus(`Loading ${fmtInt(nb.n)} ${nb.name} homes…`);
  }
  let d;
  try { d = await loadMarket(market); }
  catch (err) {
    console.error(err);
    setStatus('Couldn’t load the home data. If you opened this file directly, serve the folder over HTTP; GitHub Pages does this for you.', true);
    return;
  }
  if (state.market !== market) return; // the user switched again while this loaded
  $('mapSkel').hidden = true; $('legend').hidden = false; $('q').disabled = false;
  setStatus('');
  buildRamp(); sizeMap(); resetCam(false); renderTry(); renderTable();
  if (selectId) {
    const i = d.H.id.indexOf(selectId);
    if (i >= 0) selectHome(i, { from: 'link' });
  }
}

$('themeBtn').addEventListener('click', () => {
  document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
  buildRamp(); drawMap(); if (state.sel >= 0) { /* colors come from CSS vars */ }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { buildRamp(); drawMap(); });

(async function boot() {
  scoreboard(); salesTable();
  fetchJSON('data/summary.json').then(s => { state.summary = s; errChart(); }).catch(() => {});
  const m = location.hash.match(/^#(alpharetta|forsyth)(?:\/(.+))?$/);
  const market = m ? m[1] : 'alpharetta';
  await setMarket(market, m && m[2] ? decodeURIComponent(m[2]) : null);
})();

})();
