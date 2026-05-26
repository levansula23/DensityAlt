# DensityAlt

**Free density altitude calculator + an interactive atmosphere & hypoxia explorer** — and a small suite of altitude-physics tools for pilots, student pilots, CFIs, and aerospace enthusiasts.

🔗 **Live:** [densityalt.com](https://densityalt.com)

![DensityAlt](og-image.png)

A single self-contained HTML file. No build step, no framework, no dependencies — just open it in a browser. One serverless function proxies live weather (see [Deployment](#deployment)).

---

## What's inside

1. **Atmosphere & hypoxia explorer** — drag an aircraft up a 0–65,000 ft column and watch pressure, density, ISA temperature, ambient and alveolar oxygen pressure, and blood-oxygen saturation (SpO₂) move together in real time, alongside the oxygen–hemoglobin dissociation curve and FAR 91.211 / time-of-useful-consciousness / Armstrong-limit flags.
2. **Density altitude calculator** — field elevation + temperature + altimeter setting → pressure altitude, ISA deviation, and density altitude. ICAO airport lookup (≈110 bundled airports offline, plus live METAR when hosted), "use my location," and a °C/°F toggle.
3. **Horsepower at altitude** — how a piston engine's power falls with density altitude (Gagg–Ferrar), with turbocharger critical-altitude handling.
4. **Power curve & region of reversed command** — the U-shaped power-required curve (induced + parasite drag), V-speeds, and the "back side of the power curve," shifted by density altitude.
5. **Cabin altitude calculator** — pressurized cabin altitude from each aircraft's max pressure differential (ΔP), plus the cabin SpO₂ that comes with it.

All charts are interactive (drag to scrub) and recompute live.

## Tech

- **Vanilla HTML + CSS + JavaScript** in one file (`index.html`). No bundler, no npm install, no runtime deps.
- Charts are hand-drawn on `<canvas>` (hi-DPI aware, redrawn on resize).
- One **Netlify Function** (`netlify/functions/wx.js`) for the live-weather proxy.

## Run locally

Just open the file:

```sh
# macOS
open index.html
# Windows
start index.html
# Linux
xdg-open index.html
```

Everything works offline **except** live weather and "use my location":

- **Live METAR temp/altimeter** needs the weather proxy (below) — it won't work from `file://`.
- **"Use my location"** needs HTTPS (browser geolocation requirement), so it works once deployed, not from `file://`.
- Bundled airport **elevations** work offline regardless, and you can always type the numbers in by hand.

## Deployment

Deployed as a static site on **Netlify** with one serverless function.

```sh
netlify deploy --prod
```

`netlify.toml` sets the publish directory and wires a clean proxy path:

```
/api/wx  →  /.netlify/functions/wx
```

### Why the weather proxy exists

`aviationweather.gov` sends **no `Access-Control-Allow-Origin` header**, so a browser's `fetch()` to it is blocked from *any* origin — hosting on a plain static host alone does **not** fix this. `netlify/functions/wx.js` calls the API **server-side** (no CORS in play) and returns the JSON, with a small allow-list (`metar`, `airport`) so it can't be used as an open proxy. The front-end routes through `/api/wx` automatically when served over http(s), and falls back to the bundled airport set on `file://`. ("Use my location" uses Open-Meteo, which *is* CORS-friendly, so it stays a direct call and just needs HTTPS.)

## How the numbers are computed

- **Atmosphere** — International Standard Atmosphere (ISA): barometric formula in the troposphere, isothermal layer above the tropopause.
- **Blood oxygen** — alveolar gas equation feeding the Severinghaus SpO₂ relation; tuned to published acute-exposure SaO₂ data.
- **Density altitude** — `PA = elev + (29.92 − altimeter)·1000`, then `DA = PA + 120·(OAT − ISA temp)`.
- **Horsepower** — Gagg–Ferrar `HP ≈ rated·(1.132σ − 0.132)`.
- **Power curve** — parabolic drag polar `C_D = C_D0 + C_L²/(πAR·e)`; power required = drag × TAS.
- **Cabin altitude** — `cabin_P = min(sea level, ambient + ΔP)` inverted to an altitude.

Full references (FAA *Pilot's Handbook of Aeronautical Knowledge* and *Airplane Flying Handbook*, Anderson's *Introduction to Flight*, high-altitude physiology literature, and power-curve cross-checks against Van's Air Force / GoFly / Boldmethod) are listed in the page footer.

## ⚠️ Disclaimer

**Educational estimates only.** DensityAlt is **not for flight planning, dispatch, weight-and-balance, or medical use.** The physiological models are for healthy, unacclimatized adults at acute exposure and will not match any individual. Always fly the numbers in your POH/AFM and current official weather. Use of this tool is at your own risk; see the [warranty disclaimer](LICENSE).

## License & brand

The **code** is released under the [MIT License](LICENSE) — reuse it, learn from it, build on it.

The **"DensityAlt" name, logo, favicon, and Open Graph image are not covered by the MIT license** and remain trademarks/brand assets of their owner. If you fork this, please ship it under your own name and branding.

## Contributing

Found a wrong number, an airport that won't look up, or have a tool idea? Open an issue, or use the feedback form on [densityalt.com](https://densityalt.com).
