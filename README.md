# Virtual Fab

An interactive silicon process simulator that runs in the browser. Grow a thermal oxide, implant a dopant, anneal it, and watch the physics play out, with every numerical result checked against an exact solution.

**Live demo:** https://theocen8.github.io/Virtual-Fab/

![Virtual Fab screenshot](docs/screenshot.png)

## What it simulates (Stage 1)

**Thermal oxidation (Deal–Grove model)**
- Dry O₂ or steam, 700–1200 °C, (100) or (111) silicon, any starting oxide
- Animated cross-section: the oxide grows upward while consuming silicon below the original surface (44% of its thickness)
- The wafer drawn in its true interference colour, computed from thin-film optics and the optical constants of SiO₂ and Si
- Log–log growth curve showing the transition from linear (reaction-limited) to parabolic (diffusion-limited) growth

**Ion implantation and drive-in diffusion**
- Boron, phosphorus, arsenic or antimony; implant energy, dose, substrate doping, anneal temperature and time
- Constant-source predeposition mode (erfc profile)
- Fick's second law solved by finite differences with three schemes: explicit (FTCS), implicit (backward Euler) and Crank–Nicolson
- Exact solution overlaid on the numerical one, with live error, dose conservation, junction depth and the stability number r = DΔt/Δx²
- A preset that deliberately breaks the explicit scheme (r > 0.5) to show numerical instability

## Validation

Run `node tests/test_physics.js` (needs [Node.js](https://nodejs.org)). Current results:

| Check | Result |
|---|---|
| Steam, 1000 °C, 1 h on (100) Si | 0.388 µm |
| Crank–Nicolson vs exact solution (B, 50 keV, 1e14 cm⁻², 1000 °C, 1 h) | 0.0099% max error |
| Junction depth, solver vs closed form | 0.5488 vs 0.5486 µm |
| Order of accuracy in time | Crank–Nicolson 2nd order, backward Euler 1st order |
| Explicit scheme | unstable for r > 0.5, accurate for r ≤ 0.5 |
| Predeposition vs Cs·erfc(x/2√(Dt)) | 0.0014% max error |
| Dose conservation | exact to rounding error |
| Oxide colours vs standard colour chart | ~120 nm blue, ~200 nm gold, ~300 nm blue |

## Physics and numerics

- **Oxidation:** x² + A·x = B·(t + τ), with Arrhenius rate constants B = C₁e^(−E₁/kT) and B/A = C₂e^(−E₂/kT) from Deal and Grove (1965). For (100) silicon, C₂ is divided by 1.68.
- **Oxide colour:** normal-incidence reflectance of air / SiO₂ / Si, integrated against the CIE 1931 colour-matching functions and converted to sRGB.
- **Diffusivity:** intrinsic values (n = p = nᵢ) from Fair, summing the neutral and charged-vacancy terms.
- **Implant:** Gaussian profile with projected range Rp and straggle ΔRp from the LSS tables, reflected at the surface.
- **Diffusion solver:** θ-scheme (θ = 0, ½, 1), solved each step with the tridiagonal Thomas algorithm. Zero-flux or fixed-concentration surface, zero-flux deep boundary.

## Limitations

- Dry oxides under ~25 nm grow faster than Deal–Grove predicts (Massoud regime).
- Oxidation and diffusion are not yet coupled: no segregation at the moving interface, no oxidation-enhanced diffusion.
- Diffusivities are intrinsic; heavy doping and implant damage make real profiles diffuse faster.
- Implants are symmetric Gaussians with no channeling.
- One dimension only.

## Project structure

```
virtual-fab/
├── index.html           page layout and text
├── css/style.css        styling (light and dark themes)
├── js/physics.js        physics engine: oxidation, optics, implant, diffusion solver
├── js/app.js            user interface: sliders, readouts, SVG charts, animation
├── tests/test_physics.js  validation tests (Node.js)
└── docs/screenshot.png
```

## Run it locally

Download the repository and open `index.html` in a browser. No install or build step.

## Roadmap

- [x] **Stage 1:** oxidation, implant and diffusion, each validated against exact solutions
- [ ] **Stage 2:** couple oxidation and diffusion (segregation, oxidation-enhanced diffusion); sheet resistance
- [ ] **Stage 3:** 2D cross-section of a MOSFET process flow with lateral diffusion under a mask edge
- [ ] **Stage 4:** compare against SRIM and published SIMS profiles; write-up and demo video

## References

1. B. E. Deal and A. S. Grove, "General relationship for the thermal oxidation of silicon," *J. Appl. Phys.* 36, 3770 (1965).
2. H. Z. Massoud, "Thermal oxidation of silicon in dry oxygen," *J. Electrochem. Soc.* 132, 1745 (1985).
3. R. B. Fair, in *Impurity Doping Processes in Silicon* (1981): intrinsic diffusivities of B, P, As, Sb.
4. J. F. Gibbons, W. S. Johnson and S. W. Mylroie, *Projected Range Statistics*, 2nd ed. (1975).
5. C. Wyman, P.-P. Sloan and P. Shirley, "Simple analytic approximations to the CIE XYZ color matching functions," *JCGT* 2(2) (2013).
6. M. A. Green, "Self-consistent optical parameters of intrinsic silicon," *Sol. Energy Mater. Sol. Cells* 92, 1305 (2008).
7. K. Misiakos and D. Tsamakis, intrinsic carrier density of Si vs temperature, *J. Appl. Phys.* 74, 3293 (1993).
