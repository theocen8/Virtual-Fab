/* Virtual Fab — user interface.
   Reads the sliders, calls the physics engine (js/physics.js, global PH), and draws every chart as SVG.
   Sections: formatting helpers · input handling · chart helpers · oxidation module · implant/diffusion module · event wiring. */
{
const $ = id => document.getElementById(id);
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const SUPM = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
const sup = n => String(n).replace(/[0-9-]/g, ch => SUPM[ch]);
function sci(v, dg = 2) {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(v))), ms = (v / 10 ** e).toFixed(dg - 1);
  if (Math.abs(parseFloat(ms)) >= 10) { e += 1; ms = (v / 10 ** e).toFixed(dg - 1); }
  return (ms === (1).toFixed(dg - 1) ? '' : ms + ' × ') + '10' + sup(e);
}
const len = um => { const nm = um * 1000; return nm < 9.95 ? nm.toFixed(1) + ' nm' : nm < 999.5 ? Math.round(nm) + ' nm' : (um < 10 ? um.toFixed(2) : um.toFixed(1)) + ' µm'; };
const depth = um => um < 0.1 ? (um * 1000).toFixed(1) + ' nm' : um.toFixed(um < 10 ? 3 : 2) + ' µm';
const num = v => v >= 0.01 && v < 1e4 ? String(+v.toPrecision(3)) : sci(v, 3);
function timeFmt(h) {
  const m = h * 60;
  if (m < 0.995) return Math.round(m * 60) + ' s';
  if (m < 59.5) return Math.round(m) + ' min';
  if (h < 10) { const hh = Math.floor(h + 1e-9), mm = Math.round((h - hh) * 60); return mm === 60 ? (hh + 1) + ' h' : mm ? hh + ' h ' + mm + ' min' : hh + ' h'; }
  return Math.round(h) + ' h';
}
const pct = v => !isFinite(v) ? '—' : v < 1e-6 ? '< 0.0001%' : (v * 100).toPrecision(2) + '%';
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ---------- inputs ---------- */
const LOG = { oxTime: [Math.log10(1 / 60), Math.log10(24)], dfTime: [Math.log10(1 / 60), 1], dfDose: [11, 16], dfCs: [18, 21], dfNB: [14, 18], dfSteps: [1, Math.log10(20000)] };
const raw = id => { const el = $(id), v = +el.value; if (LOG[id]) { const [a, b] = LOG[id]; return 10 ** (a + (b - a) * v / 1000); } return v; };
const sig2 = v => Number(v.toPrecision(2));
const val = {
  oxT: () => raw('oxT'), oxTime: () => Math.max(1, Math.round(raw('oxTime') * 60)) / 60, oxXi: () => raw('oxXi'),
  dfE: () => raw('dfE'), dfDose: () => sig2(raw('dfDose')), dfCs: () => sig2(raw('dfCs')), dfNB: () => sig2(raw('dfNB')),
  dfT: () => raw('dfT'), dfTime: () => Math.max(1, Math.round(raw('dfTime') * 60)) / 60, dfSteps: () => Math.round(raw('dfSteps')), dfNx: () => raw('dfNx')
};
function setVal(id, x) { const el = $(id); if (!el) return; if (LOG[id]) { const [a, b] = LOG[id]; el.value = Math.round((Math.log10(x) - a) / (b - a) * 1000); } else el.value = x; }
const radio = name => document.querySelector(`input[name="${name}"]:checked`).value;
const setRadio = (name, v) => { const el = document.querySelector(`input[name="${name}"][value="${v}"]`); if (el) el.checked = true; };
function apply(o) { for (const [k, v] of Object.entries(o)) { if (k.startsWith('r:')) setRadio(k.slice(2), v); else if ($(k) && $(k).type === 'checkbox') $(k).checked = v; else setVal(k, v); } }
const DEF_OX = { 'r:oxAmb': 'wet', 'r:oxOri': '100', oxT: 1000, oxTime: 0.6667, oxXi: 0, oxFast: true };
const DEF_DF = { 'r:dfMode': 'imp', 'r:dfSp': 'B', dfE: 50, dfDose: 1e14, dfCs: 1e20, dfNB: 1e15, dfT: 1000, dfTime: 1, 'r:dfMeth': 'cn', dfSteps: 200, dfNx: 301, 'r:dfScale': 'log' };
const KEY = 'vfab-stage1';
function save() {
  try {
    const o = {};
    document.querySelectorAll('.ctl input').forEach(el => { if (el.type === 'radio') { if (el.checked) o['r:' + el.name] = el.value; } else if (el.type === 'checkbox') o[el.id] = el.checked; else o['raw:' + el.id] = el.value; });
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch (e) { }
}
function restore() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!o) return;
    for (const [k, v] of Object.entries(o)) { if (k.startsWith('r:')) setRadio(k.slice(2), v); else if (k.startsWith('raw:')) { const el = $(k.slice(4)); if (el) el.value = v; } else if ($(k)) $(k).checked = v; }
  } catch (e) { }
}

/* ---------- shared chart helpers ---------- */
function niceTicks(lo, hi, n) {
  const raw0 = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw0)), f = raw0 / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi * (1 + 1e-9); v += step) out.push(+v.toPrecision(12));
  return { ticks: out, step };
}
const tickTxt = (v, step) => v.toFixed(Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
const pathOf = (n, fx, fy) => { let d = ''; for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + fx(i).toFixed(1) + ' ' + fy(i).toFixed(1); return d; };
function placeTip(tip, fig, px, html) {
  tip.innerHTML = html; tip.style.display = 'block';
  const W = fig.clientWidth, w = tip.offsetWidth;
  tip.style.left = Math.max(0, px + 14 + w > W ? px - w - 14 : px + 14) + 'px';
}
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

/* ---------- oxidation ---------- */
const ox = { anim: 0, tCur: null, chipW: 0, chipStr: '', cols: [] };
for (let d = 0; d <= 1000; d += 4) ox.cols.push(PH.filmColor(d));
function oxParams() { return { amb: radio('oxAmb'), ori: radio('oxOri'), T: val.oxT(), th: val.oxTime(), xi0: val.oxXi() / 1000, fast: $('oxFast').checked }; }
function oxModel(p, amb = p.amb) {
  const dg = PH.dealGrove(amb, p.ori, p.T), xi = amb === 'dry' && p.fast ? Math.max(p.xi0, 0.025) : p.xi0, tau = PH.tauFor(xi, dg.A, dg.B);
  return { ...dg, xi, tau, at: t => PH.oxide(dg.A, dg.B, t + tau) };
}
function oxUpdate() {
  const p = ox.p = oxParams(), m = ox.m = oxModel(p);
  ox.xf = m.at(p.th);
  const t = ox.tCur == null ? p.th : ox.tCur, x = ox.x = m.at(t);
  $('oxTOut').textContent = p.T + ' °C';
  $('oxTimeOut').textContent = timeFmt(p.th);
  $('oxXiOut').textContent = p.xi0 ? Math.round(p.xi0 * 1000) + ' nm' : 'bare Si';
  $('oxFast').disabled = p.amb !== 'dry'; $('oxFastLab').classList.toggle('off', p.amb !== 'dry');
  $('oxBig').textContent = len(x);
  $('oxBigLab').textContent = 'oxide after ' + timeFmt(t);
  $('oxCons').textContent = len(0.44 * x);
  const rate = PH.growthRate(m.A, m.B, x) * 1000 / 60;
  $('oxRate').textContent = (rate >= 0.1 ? rate.toPrecision(2) : rate.toPrecision(1)) + ' nm/min';
  const q = x / m.A;
  $('oxReg').textContent = q < 0.3 ? 'linear (reaction-limited)' : q > 3 ? 'parabolic (diffusion-limited)' : 'linear → parabolic';
  $('oxBA').textContent = num(m.BA) + ' µm/h';
  $('oxB').textContent = num(m.B) + ' µm²/h';
  $('oxTau').textContent = m.tau > 0 ? timeFmt(m.tau) : '0';
  const col = PH.filmColor(x * 1000);
  $('waferDisc').setAttribute('fill', `rgb(${col})`);
  $('waferCap').textContent = 'Seen from above, ' + len(x);
  ox.col = col;
  const amb = p.amb === 'dry' ? 'Dry O₂' : 'Steam', oth = p.amb === 'dry' ? 'Steam' : 'Dry O₂';
  $('gLegend').innerHTML = `<b>Oxide thickness vs time</b><span><i class="lk"></i>${amb}, ${p.T} °C, (${p.ori})</span><span><i class="lk mute"></i>${oth}, same conditions</span><span><i class="lk dash"></i>Linear and parabolic limits</span>`;
  drawXS(); drawChip(); drawGrowth();
}
function drawXS() {
  const s = $('xsSvg'), W = s.clientWidth, H = s.clientHeight; if (!W || !ox.m) return;
  const narrow = W < 440, rm = narrow ? 104 : 168, L0 = 2, R0 = W - rm, top = 40, bot = 4;
  const xf = Math.max(ox.xf, 1e-4), x = ox.x, sc = 0.5 * (H - top - bot) / xf;
  const y0 = top + 8 + 0.56 * xf * sc, yt = y0 - 0.56 * x * sc, yi = y0 + 0.44 * x * sc, wpx = R0 - L0;
  const col = ox.col, ink = lum(col) > 0.36 ? '#0b0d0f' : '#ffffff';
  const amb = ox.p.amb === 'dry' ? 'O₂' : 'H₂O';
  let h = `<defs><linearGradient id="xsSi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--si1)"/><stop offset="1" style="stop-color:var(--si2)"/></linearGradient>
  <pattern id="xsLat" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.3" fill="#fff" fill-opacity=".35"/><circle cx="9" cy="9" r="1.3" fill="#000" fill-opacity=".16"/></pattern>
  <pattern id="xsHat" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/></pattern>
  <marker id="xsAr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" style="fill:var(--ink2)"/></marker><marker id="xsAr2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${ink}"/></marker></defs>`;
  h += `<text x="${L0}" y="14">${esc(amb)} ambient, ${ox.p.T} °C</text>`;
  for (const f of [0.2, 0.5, 0.8]) { const ax = L0 + wpx * f; if (yt - 4 > 26) h += `<line x1="${ax}" y1="22" x2="${ax}" y2="${yt - 4}" style="stroke:var(--ink2)" stroke-width="1.5" marker-end="url(#xsAr)"/>`; }
  h += `<rect x="${L0}" y="${yi}" width="${wpx}" height="${H - bot - yi}" fill="url(#xsSi)"/><rect x="${L0}" y="${yi}" width="${wpx}" height="${H - bot - yi}" fill="url(#xsLat)"/>`;
  if (yi - yt > 0.5) {
    h += `<rect x="${L0}" y="${yt}" width="${wpx}" height="${yi - yt}" fill="rgb(${col})"/><rect x="${L0}" y="${yt}" width="${wpx}" height="${yi - yt}" fill="url(#xsHat)"/>`;
    h += `<line x1="${L0}" x2="${R0}" y1="${yt}" y2="${yt}" stroke="#000" stroke-opacity=".25"/>`;
    if (yi - yt > 40) h += `<line x1="${L0 + wpx * 0.5}" y1="${yt + 6}" x2="${L0 + wpx * 0.5}" y2="${yi - 6}" stroke="${ink}" stroke-opacity=".75" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#xsAr2)"/>`;
    if (yi - yt > 22) h += `<text x="${L0 + 10}" y="${(y0 - yt > 22 ? (yt + y0) / 2 : (yt + yi) / 2) + 5}" style="fill:${ink};font-weight:700">SiO₂</text>`;
    if (yi - yt > 64 && wpx > 470) h += `<text x="${L0 + wpx * 0.5 + 8}" y="${(yt + yi) / 2 + 5}" style="fill:${ink}">oxidant diffuses to the interface</text>`;
  }
  h += `<line x1="${L0}" x2="${R0 + 8}" y1="${y0}" y2="${y0}" style="stroke:var(--ink)" stroke-width="1.25" stroke-dasharray="5 4"/>`;
  h += `<text x="${L0 + 10}" y="${H - bot - 12}" style="fill:var(--ink);font-weight:600">Si (${ox.p.ori}) wafer</text>`;
  const bx = R0 + 12;
  if (yi - yt > 1) {
    let ya = (yt + y0) / 2, yb = (y0 + yi) / 2;
    if (yb - ya < 38) { const mid = (ya + yb) / 2; ya = mid - 19; yb = mid + 19; }
    ya = Math.max(ya, 22);
    h += `<path d="M${bx} ${yt}h6V${y0}h-6" fill="none" style="stroke:var(--ink2)"/><path d="M${bx + 4} ${y0}h6V${yi}h-6" fill="none" style="stroke:var(--ink2)"/>`;
    h += `<text x="${bx + 16}" y="${ya - 2}" style="fill:var(--ink);font-weight:600">${len(0.56 * x)}</text><text x="${bx + 16}" y="${ya + 14}">${narrow ? 'grown up' : 'above old surface'}</text>`;
    h += `<text x="${bx + 16}" y="${yb - 2}" style="fill:var(--ink);font-weight:600">${len(0.44 * x)}</text><text x="${bx + 16}" y="${yb + 14}">${narrow ? 'Si used' : 'silicon consumed'}</text>`;
  } else h += `<text x="${bx}" y="${y0 - 6}">no oxide yet</text>`;
  s.innerHTML = h;
}
function drawChip() {
  const s = $('chipSvg'), W = s.clientWidth; if (!W || ox.x == null) return;
  const ml = 6, pw = W - 2 * ml, top = 12, hh = 18;
  if (ox.chipW !== W) {
    let r = '';
    ox.cols.forEach((c, i) => { r += `<rect x="${(ml + i * 4 / 1000 * pw).toFixed(2)}" y="${top}" width="${(pw / 250 + 0.7).toFixed(2)}" height="${hh}" fill="rgb(${c})"/>`; });
    const st = W < 520 ? 200 : 100;
    for (let d = 0; d <= 1000; d += st) { const xx = ml + d / 1000 * pw; r += `<line x1="${xx}" x2="${xx}" y1="${top + hh}" y2="${top + hh + 4}" class="ax"/><text x="${xx}" y="${top + hh + 17}" text-anchor="${d === 0 ? 'start' : d === 1000 ? 'end' : 'middle'}">${d === 1000 ? '1 µm' : d === 0 ? '0 nm' : d}</text>`; }
    ox.chipStr = r; ox.chipW = W;
  }
  const mx = ml + Math.min(ox.x * 1000, 1000) / 1000 * pw;
  s.innerHTML = ox.chipStr + `<path d="M${mx} ${top - 1}l-6 -9h12z" style="fill:var(--ink)"/><line x1="${mx}" x2="${mx}" y1="${top}" y2="${top + hh}" style="stroke:var(--ink)" stroke-width="2"/>`;
}
function drawGrowth() {
  const s = $('growthSvg'), W = s.clientWidth, H = s.clientHeight; if (!W || !ox.m) return;
  const p = ox.p, m = ox.m, o = oxModel(p, p.amb === 'dry' ? 'wet' : 'dry');
  const ml = W < 520 ? 50 : 58, mr = 14, mt = 12, mb = 30, pw = W - ml - mr, ph = H - mt - mb;
  const lt0 = Math.log10(1 / 60), lt1 = 2, N = 160, ts = Array.from({ length: N }, (_, i) => 10 ** (lt0 + (lt1 - lt0) * i / (N - 1)));
  const a = ts.map(m.at), b = ts.map(o.at), all = a.concat(b);
  let y1 = Math.ceil(Math.log10(Math.max(...all) * 1.15)), y0 = Math.floor(Math.log10(Math.max(1e-3, Math.min(...all) * 0.9)));
  if (y1 - y0 < 2) y0 = y1 - 2;
  const X = t => ml + (Math.log10(t) - lt0) / (lt1 - lt0) * pw, Y = v => mt + (y1 - Math.log10(Math.max(v, 10 ** (y0 - 2)))) / (y1 - y0) * ph;
  ox.g = { ml, pw, mt, ph, lt0, lt1, X, Y, o };
  let h = `<defs><clipPath id="gClip"><rect x="${ml}" y="${mt}" width="${pw}" height="${ph}"/></clipPath></defs>`;
  for (let e = y0; e <= y1; e++) { const y = Y(10 ** e); h += `<line class="gl" x1="${ml}" x2="${ml + pw}" y1="${y}" y2="${y}"/><text x="${ml - 8}" y="${y + 4}" text-anchor="end">${e < 0 ? 10 ** (e + 3) + ' nm' : 10 ** e + ' µm'}</text>`; }
  for (const [t, lab] of [[1 / 60, '1 min'], [1 / 6, '10 min'], [1, '1 h'], [10, '10 h'], [100, '100 h']]) { const x = X(t); h += `<line class="gl" x1="${x}" x2="${x}" y1="${mt}" y2="${mt + ph}"/><text x="${x}" y="${mt + ph + 18}" text-anchor="${t < 0.02 ? 'start' : t > 50 ? 'end' : 'middle'}">${lab}</text>`; }
  h += `<line class="ax" x1="${ml}" x2="${ml + pw}" y1="${mt + ph}" y2="${mt + ph}"/>`;
  h += `<g clip-path="url(#gClip)"><path class="l-asym" d="${pathOf(N, i => X(ts[i]), i => Y(m.BA * ts[i]))}"/><path class="l-asym" d="${pathOf(N, i => X(ts[i]), i => Y(Math.sqrt(m.B * ts[i])))}"/>`;
  h += `<path class="l-oth" d="${pathOf(N, i => X(ts[i]), i => Y(b[i]))}"/><path class="l-main" d="${pathOf(N, i => X(ts[i]), i => Y(a[i]))}"/></g>`;
  const tm = Math.max(ox.tCur == null ? p.th : ox.tCur, 1 / 60), cx = X(tm), cy = Y(m.at(tm)), lab = `${len(m.at(tm))} at ${timeFmt(tm)}`;
  h += `<circle cx="${cx}" cy="${cy}" r="6" style="fill:var(--ox);stroke:var(--surf)" stroke-width="2.5"/>`;
  h += cx > ml + 150 ? `<text class="lbl" x="${cx - 12}" y="${cy - 12}" text-anchor="end">${lab}</text>` : `<text class="lbl" x="${cx + 12}" y="${cy + 20}">${lab}</text>`;
  h += `<g id="gHover"></g>`;
  s.innerHTML = h;
}
function oxHover(e) {
  const g = ox.g; if (!g) return;
  const fig = $('growthSvg').parentNode, px = e.clientX - fig.getBoundingClientRect().left;
  if (px < g.ml || px > g.ml + g.pw) return oxLeave();
  const t = 10 ** (g.lt0 + (px - g.ml) / g.pw * (g.lt1 - g.lt0)), va = ox.m.at(t), vb = g.o.at(t);
  $('gHover').innerHTML = `<line x1="${px}" x2="${px}" y1="${g.mt}" y2="${g.mt + g.ph}" style="stroke:var(--ink2)" stroke-width="1"/><circle cx="${px}" cy="${g.Y(va)}" r="4" style="fill:var(--ox)"/><circle cx="${px}" cy="${g.Y(vb)}" r="3.5" style="fill:var(--mute)"/>`;
  const a = ox.p.amb === 'dry' ? 'dry O₂' : 'steam', b = ox.p.amb === 'dry' ? 'steam' : 'dry O₂';
  placeTip($('gTip'), fig, px, `<strong>${timeFmt(t)}</strong><br><strong>${len(va)}</strong> ${a}<br>${len(vb)} ${b}`);
}
function oxLeave() { const h = $('gHover'); if (h) h.innerHTML = ''; $('gTip').style.display = 'none'; }
function oxPlay() {
  cancelAnimationFrame(ox.anim);
  if (RM.matches) { ox.tCur = null; oxUpdate(); return; }
  const th = val.oxTime(), dur = 3200, t0 = performance.now();
  const step = now => { const f = Math.min(1, (now - t0) / dur); ox.tCur = f >= 1 ? null : Math.max(1e-4, f * th); oxUpdate(); if (f < 1) ox.anim = requestAnimationFrame(step); };
  ox.anim = requestAnimationFrame(step);
}
const oxInput = () => { cancelAnimationFrame(ox.anim); ox.tCur = null; oxUpdate(); save(); };

/* ---------- implant & diffusion ---------- */
const df = { anim: 0, frame: 0, pending: false };
const TYPE = { B: 'p', P: 'n', As: 'n', Sb: 'n' };
const ni = Tc => { const T = Tc + 273.15; return 5.29e19 * (T / 300) ** 2.54 * Math.exp(-6726 / T); };
function dfParams() {
  const th = { cn: 0.5, be: 1, ftcs: 0 }[radio('dfMeth')];
  return { mode: radio('dfMode'), sp: radio('dfSp'), E: val.dfE(), Q: val.dfDose(), Cs: val.dfCs(), NB: val.dfNB(), T: val.dfT(), th: val.dfTime(), theta: th, meth: radio('dfMeth'), nt: val.dfSteps(), nx: val.dfNx() };
}
function dfSolve() {
  const p = df.p = dfParams(), D = df.D = PH.diffusivity(p.sp, p.T) * 1e8, T = df.T = p.th * 3600;
  const dop = TYPE[p.sp], sub = dop === 'p' ? 'n' : 'p';
  const root = $('diffusion').style; root.setProperty('--dop', `var(--${dop})`); root.setProperty('--sub', `var(--${sub})`);
  document.querySelectorAll('[data-mode]').forEach(el => el.hidden = el.dataset.mode !== p.mode);
  $('lgT0').hidden = p.mode !== 'imp';
  $('dfEOut').textContent = p.E + ' keV'; $('dfDoseOut').textContent = sci(p.Q) + ' cm⁻²'; $('dfCsOut').textContent = sci(p.Cs) + ' cm⁻³';
  $('dfNBOut').textContent = sci(p.NB) + ' cm⁻³, ' + sub + '-type'; $('dfTOut').textContent = p.T + ' °C'; $('dfTimeOut').textContent = timeFmt(p.th);
  $('dfStepsOut').textContent = p.nt.toLocaleString('en-US'); $('dfNxOut').textContent = p.nx;
  let L, init, Cs = null;
  if (p.mode === 'imp') {
    const { Rp, dRp } = PH.implantRange(p.sp, p.E); p.Rp = Rp; p.dRp = dRp;
    const sg = Math.sqrt(dRp * dRp + 2 * D * T), Npk = p.Q / (Math.sqrt(2 * Math.PI) * sg * 1e-4);
    L = Math.max(0.05, Rp + sg * Math.max(6, Math.sqrt(2 * Math.log(Math.max(Npk / p.NB, 1))) + 2.5));
    init = x => PH.exactImplant(x, 0, p.Q, Rp, dRp, D);
    df.exact = (x, t) => PH.exactImplant(x, t, p.Q, Rp, dRp, D);
  } else {
    L = Math.max(0.05, 2 * Math.sqrt(D * T) * (Math.sqrt(Math.log(Math.max(p.Cs / p.NB, Math.E))) + 2));
    init = () => 0; Cs = p.Cs; df.exact = (x, t) => PH.exactPredep(x, t, p.Cs, D);
  }
  df.L = L;
  const r = df.res = PH.solve({ D, T, L, nx: p.nx, nt: p.nt, theta: p.theta, init, Cs });
  const mx = a => a.reduce((m, v) => Math.max(m, v), 0);
  let hi = Math.max(mx(r.frames[0]), p.mode === 'imp' ? df.exact(p.Rp, T) : p.Cs, p.NB);
  df.yt = Math.ceil(Math.log10(hi * 1.6)); df.yb = Math.max(Math.floor(Math.log10(p.NB)) - 1, df.yt - 8);
  df.linTop = hi * 1.1;
  const fr = $('dfFrame'); fr.max = r.frames.length - 1; fr.value = r.frames.length - 1;
  const w = $('dfWarn');
  if (p.theta === 0 && r.r > 0.5) {
    w.hidden = false;
    const what = r.unstable ? `so the profile blew up at step ${r.stepFail} of ${p.nt.toLocaleString('en-US')}` : 'so errors are growing every step, and a longer run will blow up';
    w.innerHTML = `<strong>Unstable.</strong> The explicit scheme needs r ≤ 0.5, but r = ${num(r.r)}. Each step multiplies the shortest grid wiggles by about ${num(Math.abs(1 - 4 * r.r))}×, ${what}. Take more time steps, or switch to Crank–Nicolson, which is stable at any r.`;
  } else w.hidden = true;
  dfDraw(r.frames.length - 1);
}
function dfDraw(k) {
  const r = df.res; if (!r) return;
  k = Math.max(0, Math.min(k, r.frames.length - 1)); df.frame = k;
  const p = df.p, c = r.frames[k], t = r.times[k], x = r.x, n = x.length, ex = df.ex = new Float64Array(n);
  let me = 0, er = 0, pk = 0, pkx = 0;
  for (let i = 0; i < n; i++) { ex[i] = df.exact(x[i], t); me = Math.max(me, ex[i]); er = Math.max(er, Math.abs(c[i] - ex[i])); if (c[i] > pk) { pk = c[i]; pkx = x[i]; } }
  const rel = er / me, bad = !isFinite(rel) || rel > 0.5;
  const xj = bad ? null : PH.junction(x, c, p.NB);
  const NF = 2001, xe = new Float64Array(NF), ce = new Float64Array(NF);
  for (let i = 0; i < NF; i++) { xe[i] = df.L * i / (NF - 1); ce[i] = df.exact(xe[i], t); }
  const xjE = PH.junction(xe, ce, p.NB);
  const doseN = PH.dose(c, r.dx), doseE = p.mode === 'imp' ? p.Q : 2 * p.Cs * Math.sqrt(df.D * 1e-8 * t / Math.PI);
  $('dfBig').textContent = xj != null ? depth(xj) : bad ? 'unstable' : '—';
  $('dfBigLab').textContent = xj != null ? 'junction depth' : bad ? 'solution blew up' : 'dopant stays below the substrate level';
  $('dfXjE').textContent = xjE != null ? depth(xjE) : '—';
  $('dfPk').textContent = bad ? '—' : sci(pk, 2) + ' at ' + depth(pkx);
  $('dfD').textContent = sci(df.D * 1e-8, 3) + ' cm²/s';
  $('dfLd').textContent = depth(2 * Math.sqrt(df.D * t));
  $('dfErr').textContent = bad ? '—' : pct(rel);
  const dErr = doseE > 0 ? Math.abs(doseN - doseE) / doseE : NaN;
  $('dfDose').textContent = bad ? '—' : sci(doseN, 3) + ' cm⁻²';
  const stable = p.theta > 0 || r.r <= 0.5;
  $('dfR').innerHTML = `${num(r.r)}<span class="chipw ${stable ? 'ok' : 'bad'}">${p.theta > 0 ? 'stable at any r' : stable ? 'stable' : 'unstable'}</span>`;
  const notes = [];
  if (!bad && pk > ni(p.T)) notes.push(`Peak is above the intrinsic carrier density at ${p.T} °C (${sci(ni(p.T))} cm⁻³), so real diffusion would be faster than this intrinsic model.`);
  if (p.theta === 0.5 && r.r > 20) notes.push(`Crank–Nicolson is stable at any r, but at r = ${num(r.r)} it can ring near sharp edges. More time steps fix it.`);
  $('dfNote').hidden = !notes.length; $('dfNote').textContent = notes.join(' ');
  $('dfFrameOut').textContent = `${timeFmt(t / 3600)} of ${timeFmt(df.T / 3600)}`;
  $('vErr').textContent = bad ? 'unstable' : pct(rel);
  $('vDose').textContent = bad ? 'unstable' : isFinite(dErr) ? pct(dErr) : '—';
  $('vXj').textContent = xj != null && xjE != null ? `${depth(xj)} vs ${depth(xjE)}` : '—';
  df.stats = { xj, bad };
  drawProfile();
}
function drawProfile() {
  const s = $('profSvg'), W = s.clientWidth, H = s.clientHeight; if (!W || !df.res) return;
  const r = df.res, p = df.p, c = r.frames[df.frame], c0 = r.frames[0], ex = df.ex, x = r.x, n = x.length, lin = radio('dfScale') === 'lin';
  const ml = W < 520 ? 46 : 58, mr = 12, mt = 26, band = 22, mb = 30 + band + 8, pw = W - ml - mr, ph = H - mt - mb, L = df.L;
  const X = v => ml + v / L * pw;
  const Y = lin ? v => mt + (1 - v / df.linTop) * ph : v => mt + (df.yt - Math.log10(Math.max(v, 10 ** (df.yb - 1)))) / (df.yt - df.yb) * ph;
  df.geo = { ml, pw, mt, ph, X, Y };
  let h = `<defs><clipPath id="pClip"><rect x="${ml}" y="${mt}" width="${pw}" height="${ph}"/></clipPath></defs>`;
  if (lin) { const { ticks, step } = niceTicks(0, df.linTop, 5); for (const v of ticks) { const y = Y(v); h += `<line class="gl" x1="${ml}" x2="${ml + pw}" y1="${y}" y2="${y}"/><text x="${ml - 8}" y="${y + 4}" text-anchor="end">${v === 0 ? '0' : sci(v, 2)}</text>`; } }
  else for (let e = df.yb; e <= df.yt; e++) { const y = Y(10 ** e); h += `<line class="gl" x1="${ml}" x2="${ml + pw}" y1="${y}" y2="${y}"/><text x="${ml - 8}" y="${y + 4}" text-anchor="end">10${sup(e)}</text>`; }
  const xt = niceTicks(0, L, W < 520 ? 4 : 7), ty = mt + ph + 8 + band + 17;
  for (const v of xt.ticks) { const xx = X(v); h += `<line class="gl" x1="${xx}" x2="${xx}" y1="${mt}" y2="${mt + ph}"/><text x="${xx}" y="${ty}" text-anchor="${v === 0 ? 'start' : 'middle'}">${tickTxt(v, xt.step)}${v === 0 ? ' µm' : ''}</text>`; }
  h += `<line class="ax" x1="${ml}" x2="${ml + pw}" y1="${mt + ph}" y2="${mt + ph}"/><line class="ax" x1="${ml}" x2="${ml}" y1="${mt}" y2="${mt + ph}"/>`;
  const yNB = Y(p.NB);
  h += `<g clip-path="url(#pClip)"><line class="l-sub" x1="${ml}" x2="${ml + pw}" y1="${yNB}" y2="${yNB}"/>`;
  if (p.mode === 'imp' && df.frame > 0) h += `<path class="l-t0" d="${pathOf(n, i => X(x[i]), i => Y(c0[i]))}"/>`;
  h += `<path class="l-num" d="${pathOf(n, i => X(x[i]), i => Y(c[i]))}"/><path class="l-ex" d="${pathOf(n, i => X(x[i]), i => Y(ex[i]))}"/></g>`;
  const sub = TYPE[p.sp] === 'p' ? 'n' : 'p';
  h += `<text class="lbl" x="${ml + 8}" y="${yNB - 8}">${sub}-type substrate, ${sci(p.NB)}</text>`;
  const xj = df.stats.xj;
  if (xj != null) { const xx = X(xj); h += `<line class="l-jn" x1="${xx}" x2="${xx}" y1="${mt - 4}" y2="${mt + ph + 8 + band}"/><text class="lbl" x="${xx > ml + pw - 150 ? xx - 6 : xx + 6}" y="${mt - 9}" text-anchor="${xx > ml + pw - 150 ? 'end' : 'start'}">Junction ${depth(xj)}</text>`; }
  const by = mt + ph + 8, cnt = Math.min(n, 240), lgN = Math.log10(p.NB), lgH = Math.max(Math.log10(Math.max(...c.slice(0, n).map(Math.abs)) || 1), lgN + 1);
  for (let j = 0; j < cnt; j++) {
    const i = Math.round(j * (n - 1) / (cnt - 1)), net = c[i] - p.NB, an = Math.abs(net);
    const a = isFinite(an) ? 0.08 + 0.92 * Math.max(0, Math.min(1, (Math.log10(an + 1) - (lgN - 1.5)) / (lgH - lgN + 1.5))) : 1;
    h += `<rect x="${(ml + j / cnt * pw).toFixed(2)}" y="${by}" width="${(pw / cnt + 0.6).toFixed(2)}" height="${band}" style="fill:var(${net >= 0 ? '--dop' : '--sub'})" fill-opacity="${a.toFixed(3)}"/>`;
  }
  h += `<rect x="${ml}" y="${by}" width="${pw}" height="${band}" fill="none" class="ax"/><g id="pHover"></g>`;
  s.innerHTML = h;
}
function dfHover(e) {
  const g = df.geo; if (!g || !df.res) return;
  const fig = $('profSvg').parentNode, px = e.clientX - fig.getBoundingClientRect().left;
  if (px < g.ml || px > g.ml + g.pw) return dfLeave();
  const r = df.res, n = r.x.length, i = Math.max(0, Math.min(n - 1, Math.round((px - g.ml) / g.pw * (n - 1)))), c = r.frames[df.frame][i], e2 = df.ex[i], xx = g.X(r.x[i]);
  const net = c - df.p.NB, typ = net >= 0 ? TYPE[df.p.sp] : (TYPE[df.p.sp] === 'p' ? 'n' : 'p');
  $('pHover').innerHTML = `<line x1="${xx}" x2="${xx}" y1="${g.mt}" y2="${g.mt + g.ph}" style="stroke:var(--ink2)"/><circle cx="${xx}" cy="${g.Y(c)}" r="4.5" style="fill:var(--dop);stroke:var(--surf)" stroke-width="2"/><circle cx="${xx}" cy="${g.Y(e2)}" r="3" style="fill:var(--ink)"/>`;
  placeTip($('pTip'), fig, px, `<strong>${depth(r.x[i])}</strong> deep<br><strong>${sci(c, 3)}</strong> solver<br>${sci(e2, 3)} exact<br>net ${typ}-type`);
}
function dfLeave() { const h = $('pHover'); if (h) h.innerHTML = ''; $('pTip').style.display = 'none'; }
function dfQueue() { if (df.pending) return; df.pending = true; requestAnimationFrame(() => { df.pending = false; dfSolve(); }); }
function dfPlay() {
  cancelAnimationFrame(df.anim);
  const last = df.res.frames.length - 1;
  if (RM.matches) { $('dfFrame').value = last; dfDraw(last); return; }
  const dur = 2600, t0 = performance.now();
  const step = now => { const f = Math.min(1, (now - t0) / dur), k = Math.round(f * last); $('dfFrame').value = k; dfDraw(k); if (f < 1) df.anim = requestAnimationFrame(step); };
  df.anim = requestAnimationFrame(step);
}
const dfInput = () => { cancelAnimationFrame(df.anim); dfQueue(); save(); };

/* ---------- wiring ---------- */
$('oxCtl').addEventListener('input', oxInput);
$('oxPlay').addEventListener('click', oxPlay);
$('oxReset').addEventListener('click', () => { apply(DEF_OX); oxInput(); });
$('oxPresets').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; apply({ oxFast: true, ...JSON.parse(b.dataset.p) }); oxInput(); oxPlay(); });
$('dfCtl').addEventListener('input', e => { if (e.target.name === 'dfScale') { drawProfile(); save(); } else dfInput(); });
$('dfFrame').addEventListener('input', () => { cancelAnimationFrame(df.anim); dfDraw(+$('dfFrame').value); });
$('dfPlay').addEventListener('click', dfPlay);
$('dfReset').addEventListener('click', () => { apply(DEF_DF); dfInput(); });
$('dfStable').addEventListener('click', () => {
  const p = dfParams(), dx = df.L / (p.nx - 1), need = Math.ceil(df.D * df.T / (0.45 * dx * dx));
  setVal('dfSteps', Math.max(10, Math.min(20000, need))); dfInput();
});
$('dfPresets').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; apply(JSON.parse(b.dataset.p)); cancelAnimationFrame(df.anim); dfSolve(); save(); dfPlay(); });
const gs = $('growthSvg'); gs.addEventListener('pointermove', oxHover); gs.addEventListener('pointerleave', oxLeave);
const ps = $('profSvg'); ps.addEventListener('pointermove', dfHover); ps.addEventListener('pointerleave', dfLeave);
const roOx = new ResizeObserver(() => { drawXS(); drawChip(); drawGrowth(); });
roOx.observe($('xsSvg')); roOx.observe($('chipSvg')); roOx.observe($('growthSvg'));
const roDf = new ResizeObserver(() => drawProfile());
roDf.observe($('profSvg'));

apply(DEF_OX); apply(DEF_DF); restore();
oxUpdate(); dfSolve();
}
