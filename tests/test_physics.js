// Validation tests for the Virtual Fab physics engine.
// Run from the repository root with:  node tests/test_physics.js
// Each check prints PASS or FAIL; the script exits with code 1 if anything fails.

const PH = require('../js/physics.js');

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failed++;
}
const near = (a, b, relTol) => Math.abs(a - b) <= relTol * Math.abs(b);

// ---------- 1. Thermal oxidation (Deal–Grove) ----------
{
  const wet = PH.dealGrove('wet', '100', 1000);
  const x = PH.oxide(wet.A, wet.B, 1);                         // 1 hour of steam at 1000 °C
  check('Steam, 1000 °C, 1 h on (100) Si grows ~0.39 µm', near(x, 0.388, 0.01), x.toFixed(4) + ' µm');
  check('Solution satisfies x² + A·x = B·t', Math.abs(x * x + wet.A * x - wet.B * 1) < 1e-12);

  const dry = PH.dealGrove('dry', '100', 1000);
  const tau = PH.tauFor(0.025, dry.A, dry.B);
  const xd = PH.oxide(dry.A, dry.B, 1 + tau);
  check('Dry O₂, 1000 °C, 1 h (25 nm offset) grows ~58 nm', near(xd, 0.058, 0.03), (xd * 1000).toFixed(1) + ' nm');

  const d111 = PH.dealGrove('dry', '111', 1000);
  check('(111) linear rate is 1.68× the (100) rate', near(d111.BA / dry.BA, 1.68, 1e-9));
  check('Steam grows faster than dry O₂', PH.oxide(wet.A, wet.B, 1) > 5 * PH.oxide(dry.A, dry.B, 1));
}

// ---------- 2. Oxide interference colours vs the standard colour chart ----------
{
  const hue = ([r, g, b]) => ({ r, g, b });
  const c120 = hue(PH.filmColor(120)), c200 = hue(PH.filmColor(200)), c300 = hue(PH.filmColor(300));
  check('~120 nm oxide looks blue', c120.b > c120.r + 40 && c120.b > c120.g + 20, JSON.stringify(c120));
  check('~200 nm oxide looks gold/yellow (blue lowest)', c200.b < c200.r && c200.b < c200.g, JSON.stringify(c200));
  check('~300 nm oxide looks blue again (second order)', c300.b > c300.r + 60, JSON.stringify(c300));
}

// ---------- 3. Implant + anneal: finite differences vs exact solution ----------
function runImplant(theta, nx, nt) {
  const sp = 'B', E = 50, Q = 1e14, Tc = 1000, T = 3600;           // boron, 50 keV, 1e14 cm⁻², 1 h at 1000 °C
  const { Rp, dRp } = PH.implantRange(sp, E);
  const D = PH.diffusivity(sp, Tc) * 1e8;                          // cm²/s → µm²/s
  const L = Rp + 8 * Math.sqrt(dRp * dRp + 2 * D * T);
  const res = PH.solve({ D, T, L, nx, nt, theta, init: x => PH.exactImplant(x, 0, Q, Rp, dRp, D) });
  const c = res.frames[res.frames.length - 1];
  let peak = 0, err = 0;
  for (let i = 0; i < nx; i++) { const e = PH.exactImplant(res.x[i], T, Q, Rp, dRp, D); peak = Math.max(peak, e); err = Math.max(err, Math.abs(c[i] - e)); }
  return { err: err / peak, res, c, Q, D, T, Rp, dRp };
}
{
  const cn = runImplant(0.5, 301, 200);
  check('Crank–Nicolson matches exact solution within 0.05% of peak', cn.err < 5e-4, (cn.err * 100).toFixed(4) + '%');
  check('Dose is conserved (zero-flux surface)', near(PH.dose(cn.c, cn.res.dx), cn.Q, 1e-9));

  const NB = 1e15, xj = PH.junction(cn.res.x, cn.c, NB);
  const s = Math.sqrt(cn.dRp ** 2 + 2 * cn.D * cn.T), Npk = cn.Q / (Math.sqrt(2 * Math.PI) * s * 1e-4);
  const xjExact = cn.Rp + s * Math.sqrt(2 * Math.log(Npk / NB));
  check('Junction depth matches closed form within 1 nm', Math.abs(xj - xjExact) < 1e-3, `${xj.toFixed(4)} vs ${xjExact.toFixed(4)} µm`);

  // Order of accuracy in time (fine grid so spatial error is small)
  const e1 = runImplant(0.5, 1201, 25).err, e2 = runImplant(0.5, 1201, 50).err;
  check('Crank–Nicolson is ~2nd order in time (error drops ≥3.5× when Δt halves)', e1 / e2 > 3.5, (e1 / e2).toFixed(2) + '×');
  const b1 = runImplant(1, 1201, 50).err, b2 = runImplant(1, 1201, 100).err;
  check('Backward Euler is 1st order in time (error drops ~2× when Δt halves)', b1 / b2 > 1.8 && b1 / b2 < 2.3, (b1 / b2).toFixed(2) + '×');

  const ex = runImplant(0, 301, 200);
  check('Explicit scheme blows up when r > 0.5', ex.res.r > 0.5 && ex.res.unstable, 'r = ' + ex.res.r.toFixed(2));
  const exOk = runImplant(0, 151, Math.ceil(cn.D * cn.T / (0.45 * (ex.res.dx * 2) ** 2)));
  check('Explicit scheme is accurate when r ≤ 0.5', !exOk.res.unstable && exOk.err < 2e-3, 'r = ' + exOk.res.r.toFixed(2) + ', err ' + (exOk.err * 100).toFixed(3) + '%');
}

// ---------- 4. Constant-source predeposition vs erfc ----------
{
  const D = PH.diffusivity('P', 1000) * 1e8, T = 1800, Cs = 1e20;
  const L = 2 * Math.sqrt(D * T) * (Math.sqrt(Math.log(Cs / 1e15)) + 1.5);
  const res = PH.solve({ D, T, L, nx: 301, nt: 400, theta: 0.5, init: () => 0, Cs });
  const c = res.frames[res.frames.length - 1];
  let err = 0; for (let i = 0; i < 301; i++) err = Math.max(err, Math.abs(c[i] - PH.exactPredep(res.x[i], T, Cs, D)));
  check('Predeposition matches Cs·erfc(x/2√(Dt)) within 0.01% of Cs', err / Cs < 1e-4, (err / Cs * 100).toFixed(4) + '%');
  const Qexact = 2 * Cs * Math.sqrt(D * 1e-8 * T / Math.PI);
  check('Predeposited dose matches 2·Cs·√(Dt/π) within 0.1%', near(PH.dose(c, res.dx), Qexact, 1e-3));
}

// ---------- 5. Helper functions ----------
check('erfc(1) = 0.1572992', Math.abs(PH.erfc(1) - 0.1572992) < 1e-6);
check('erfc(2) = 0.0046777', Math.abs(PH.erfc(2) - 0.0046777) < 1e-6);
{
  const r = PH.implantRange('P', 100);
  check('Phosphorus 100 keV projected range ≈ 0.12 µm', near(r.Rp, 0.1238, 0.02), r.Rp.toFixed(4) + ' µm');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
