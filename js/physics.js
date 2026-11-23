/* Virtual Fab — physics engine (no browser code, so Node can test it too).
   Thermal oxidation (Deal–Grove), oxide interference colour, intrinsic dopant diffusivities,
   ion-implant ranges, and a θ-scheme finite-difference solver for Fick's second law.
   Units: depth in µm, time in seconds (diffusion) or hours (oxidation), concentration in cm⁻³, dose in cm⁻². */
const PH = (() => {
  const kB = 8.617333262e-5; // eV/K

  /* ---------- Thermal oxidation: Deal–Grove (1965) ----------
     (111) Si, 1 atm. For (100) Si divide C2 by 1.68. B in µm²/h, B/A in µm/h. */
  const DG = {
    dry: { C1: 7.72e2, E1: 1.23, C2: 6.23e6, E2: 2.00 },
    wet: { C1: 3.86e2, E1: 0.78, C2: 1.63e8, E2: 2.05 }
  };
  function dealGrove(amb, orient, Tc) {
    const kT = kB * (Tc + 273.15), p = DG[amb];
    const B = p.C1 * Math.exp(-p.E1 / kT);
    const BA = (p.C2 / (orient === '100' ? 1.68 : 1)) * Math.exp(-p.E2 / kT);
    return { B, BA, A: B / BA };
  }
  const tauFor = (xi, A, B) => (xi * xi + A * xi) / B; // hours
  // x² + A x = B (t + τ), solved without cancellation. th = t + τ in hours → µm
  function oxide(A, B, th) {
    const q = 4 * B * th / (A * A);
    return (2 * B * th / A) / (1 + Math.sqrt(1 + q));
  }
  const growthRate = (A, B, x) => B / (2 * x + A); // µm/h

  /* ---------- Thin-film interference colour of SiO2 on Si ---------- */
  const SI_NK = [[380, 6.0, 0.9], [400, 5.57, 0.39], [420, 5.05, 0.17], [450, 4.67, 0.091], [500, 4.30, 0.044],
    [550, 4.08, 0.028], [600, 3.94, 0.020], [650, 3.85, 0.0145], [700, 3.78, 0.0106], [750, 3.73, 0.0078], [780, 3.70, 0.006]];
  function siNK(l) {
    for (let i = 1; i < SI_NK.length; i++) if (l <= SI_NK[i][0]) {
      const [l0, n0, k0] = SI_NK[i - 1], [l1, n1, k1] = SI_NK[i], f = (l - l0) / (l1 - l0);
      return [n0 + f * (n1 - n0), k0 + f * (k1 - k0)];
    }
    return [SI_NK[SI_NK.length - 1][1], SI_NK[SI_NK.length - 1][2]];
  }
  const g = (l, m, s1, s2) => { const s = l < m ? s1 : s2; return Math.exp(-0.5 * ((l - m) / s) ** 2); };
  // CIE 1931 2° colour matching functions, multi-lobe fit (Wyman, Sloan & Shirley 2013)
  const cmf = l => [
    1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
    0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
    1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8)
  ];
  const planck = l => { const m = l * 1e-9; return 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * 6504)) - 1)); };
  function reflectance(dnm, l) {
    const n1 = 1.4485 + 3560 / (l * l);          // SiO2 Cauchy fit
    const [n2, k2] = siNK(l);
    const r01 = (1 - n1) / (1 + n1);
    // r12 = (n1 - n2 - i k2) / (n1 + n2 + i k2)
    const ar = n1 - n2, ai = -k2, br = n1 + n2, bi = k2, bb = br * br + bi * bi;
    const r12r = (ar * br + ai * bi) / bb, r12i = (ai * br - ar * bi) / bb;
    const ph = 4 * Math.PI * n1 * dnm / l, er = Math.cos(ph), ei = Math.sin(ph);
    const tr = r12r * er - r12i * ei, ti = r12r * ei + r12i * er;   // r12·e^{2iδ}
    const numr = r01 + tr, numi = ti, denr = 1 + r01 * tr, deni = r01 * ti;
    return (numr * numr + numi * numi) / (denr * denr + deni * deni);
  }
  const WL = []; for (let l = 380; l <= 780; l += 5) WL.push(l);
  const W0 = WL.reduce((a, l) => { const c = cmf(l), s = planck(l); return [a[0] + s * c[0], a[1] + s * c[1], a[2] + s * c[2]]; }, [0, 0, 0]);
  const gam = v => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
  function filmColor(dnm, exposure = 1.45) {
    let X = 0, Y = 0, Z = 0;
    for (const l of WL) { const R = reflectance(dnm, l), c = cmf(l), s = planck(l) * R; X += s * c[0]; Y += s * c[1]; Z += s * c[2]; }
    X = X / W0[0] * 0.9505 * exposure; Y = Y / W0[1] * exposure; Z = Z / W0[2] * 1.089 * exposure; // adapt to D65 white
    const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    return [r, gg, b].map(v => Math.round(255 * gam(v)));
  }

  /* ---------- Dopant diffusion ----------
     Fair's charged-vacancy components at intrinsic conditions (n = p = ni): D = Σ D0·exp(−Ea/kT), cm²/s */
  const DIFF = {
    B: [[0.037, 3.46], [0.41, 3.46]],
    P: [[3.85, 3.66], [4.44, 4.00], [44.2, 4.37]],
    As: [[0.066, 3.44], [12, 4.05]],
    Sb: [[0.214, 3.65], [15, 4.08]]
  };
  const diffusivity = (sp, Tc) => { const kT = kB * (Tc + 273.15); return DIFF[sp].reduce((s, [D0, E]) => s + D0 * Math.exp(-E / kT), 0); };

  /* ---------- Ion implantation: LSS projected range & straggle in Si (µm), Gibbons tables ---------- */
  const EN = [10, 20, 30, 40, 50, 60, 80, 100, 120, 140, 160, 180, 200];
  const RANGE = {
    B: [[.0333, .0171], [.0662, .0283], [.0987, .0371], [.1302, .0443], [.1608, .0504], [.1903, .0556], [.2459, .0641], [.2974, .0709], [.3452, .0764], [.3898, .0811], [.4314, .0850], [.4703, .0885], [.5070, .0914]],
    P: [[.0139, .0069], [.0253, .0119], [.0368, .0166], [.0486, .0212], [.0607, .0256], [.0730, .0298], [.0981, .0378], [.1238, .0451], [.1497, .0520], [.1757, .0585], [.2017, .0646], [.2275, .0702], [.2532, .0755]],
    As: [[.0097, .0036], [.0159, .0059], [.0215, .0080], [.0269, .0099], [.0322, .0118], [.0374, .0136], [.0478, .0172], [.0582, .0207], [.0685, .0241], [.0789, .0275], [.0893, .0308], [.0998, .0341], [.1104, .0373]],
    Sb: [[.0088, .0026], [.0141, .0043], [.0187, .0057], [.0230, .0070], [.0271, .0082], [.0311, .0094], [.0388, .0116], [.0464, .0138], [.0538, .0158], [.0612, .0178], [.0685, .0198], [.0759, .0217], [.0833, .0236]]
  };
  function implantRange(sp, E) {
    E = Math.max(10, Math.min(200, E));
    let i = 1; while (i < EN.length - 1 && E > EN[i]) i++;
    const f = Math.log(E / EN[i - 1]) / Math.log(EN[i] / EN[i - 1]), a = RANGE[sp][i - 1], b = RANGE[sp][i];
    const lerp = (u, v) => Math.exp(Math.log(u) + f * (Math.log(v) - Math.log(u)));
    return { Rp: lerp(a[0], b[0]), dRp: lerp(a[1], b[1]) };
  }

  function erfc(x) { // Numerical Recipes erfcc, fractional error < 1.2e-7
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  // Implanted Gaussian reflected at the surface (no dopant escapes) after time t: σ² = ΔRp² + 2Dt
  function exactImplant(x, t, Q, Rp, dRp, D) {
    const s2 = dRp * dRp + 2 * D * t, pre = Q / (Math.sqrt(2 * Math.PI * s2) * 1e-4);
    return pre * (Math.exp(-((x - Rp) ** 2) / (2 * s2)) + Math.exp(-((x + Rp) ** 2) / (2 * s2)));
  }
  const exactPredep = (x, t, Cs, D) => t <= 0 ? (x <= 0 ? Cs : 0) : Cs * erfc(x / (2 * Math.sqrt(D * t)));

  /* θ-scheme finite differences for ∂C/∂t = D ∂²C/∂x².
     θ = 0 explicit (FTCS), 0.5 Crank–Nicolson, 1 backward Euler.
     Surface: zero flux (implant, capped) or fixed C = Cs (predeposition). Deep end: zero flux. */
  function solve({ D, T, L, nx, nt, theta, init, Cs = null, nFrames = 91 }) {
    const dx = L / (nx - 1), dt = T / nt, r = D * dt / (dx * dx);
    const x = new Float64Array(nx), c = new Float64Array(nx);
    for (let i = 0; i < nx; i++) { x[i] = i * dx; c[i] = init(x[i]); }
    if (Cs !== null) c[0] = Cs;
    const a = new Float64Array(nx), b = new Float64Array(nx), cc = new Float64Array(nx), d = new Float64Array(nx);
    const cp = new Float64Array(nx), dp = new Float64Array(nx);
    const lo = theta * r, ex = (1 - theta) * r;
    for (let i = 0; i < nx; i++) { a[i] = -lo; b[i] = 1 + 2 * lo; cc[i] = -lo; }
    if (Cs !== null) { b[0] = 1; cc[0] = 0; } else cc[0] = -2 * lo;
    a[0] = 0; a[nx - 1] = -2 * lo; cc[nx - 1] = 0;
    const peak0 = c.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
    const nf = Math.min(nFrames, nt + 1), marks = new Set();
    for (let j = 0; j < nf; j++) marks.add(Math.round(j * nt / (nf - 1)));
    const frames = [c.slice()], times = [0];
    let unstable = false, stepFail = -1;
    for (let n = 1; n <= nt; n++) {
      if (Cs !== null) d[0] = Cs; else d[0] = c[0] + ex * 2 * (c[1] - c[0]);
      for (let i = 1; i < nx - 1; i++) d[i] = c[i] + ex * (c[i + 1] - 2 * c[i] + c[i - 1]);
      d[nx - 1] = c[nx - 1] + ex * 2 * (c[nx - 2] - c[nx - 1]);
      cp[0] = cc[0] / b[0]; dp[0] = d[0] / b[0];                 // Thomas algorithm
      for (let i = 1; i < nx; i++) { const m = b[i] - a[i] * cp[i - 1]; cp[i] = cc[i] / m; dp[i] = (d[i] - a[i] * dp[i - 1]) / m; }
      c[nx - 1] = dp[nx - 1];
      for (let i = nx - 2; i >= 0; i--) c[i] = dp[i] - cp[i] * c[i + 1];
      let mx = 0; for (let i = 0; i < nx; i++) { const v = Math.abs(c[i]); if (!(v <= mx)) mx = v; }
      if (!isFinite(mx) || mx > 50 * peak0) { unstable = true; stepFail = n; frames.push(c.slice()); times.push(n * dt); break; }
      if (marks.has(n)) { frames.push(c.slice()); times.push(n * dt); }
    }
    return { x, frames, times, r, dx, dt, unstable, stepFail };
  }
  // trapezoid-rule dose (cm⁻²) from concentration (cm⁻³) on a µm grid
  function dose(c, dx) { let s = 0; for (let i = 0; i < c.length; i++) s += (i === 0 || i === c.length - 1 ? 0.5 : 1) * c[i]; return s * dx * 1e-4; }
  // deepest depth where the dopant falls to the background level (log interpolation)
  function junction(x, c, NB) {
    for (let i = c.length - 2; i >= 0; i--) if (c[i] >= NB && c[i + 1] < NB) {
      const l0 = Math.log(Math.max(c[i], 1e-30)), l1 = Math.log(Math.max(c[i + 1], 1e-30)), lt = Math.log(NB);
      return x[i] + (x[i + 1] - x[i]) * (l0 - lt) / (l0 - l1);
    }
    return null;
  }
  return { kB, dealGrove, tauFor, oxide, growthRate, filmColor, reflectance, diffusivity, implantRange, erfc, exactImplant, exactPredep, solve, dose, junction };
})();
if (typeof module !== 'undefined') module.exports = PH;
