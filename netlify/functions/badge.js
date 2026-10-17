// Live density altitude badge for any airport.
//   /badge/KLXV.svg[?theme=light]   image badge (works anywhere an <img> does)
//   /badge/KLXV.json                the numbers behind it
//   /embed/KLXV[?theme=light]       small HTML card for an <iframe>
const { stationWx } = require("../lib/wxcore");

const SITE = "https://densityalt.com";
const THEMES = {
  dark: { bg: "#0b1020", line: "#1f2a44", head: "#8fa3c0", big: "#ffb84d", unit: "#c9d4e5", small: "#9fb0c9", brand: "#6f84a3" },
  light: { bg: "#ffffff", line: "#d5dce8", head: "#4a5b75", big: "#b35c00", unit: "#33415a", small: "#4a5b75", brand: "#6b7a90" },
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const path = q.p || event.path || "";
  const m = /([A-Za-z0-9]{3,4})(\.svg|\.json)?\/?$/.exec(path) || /^([A-Za-z0-9]{3,4})$/.exec(q.icao || "");
  // netlify.toml rewrites /embed/X to .../badge/embed/X; event.path may be either form
  const embed = q.embed || /\/embed\//.test(event.path || "") || /\/embed\//.test(event.rawUrl || "");
  const kind = embed ? "html" : m && m[2] === ".json" ? "json" : "svg";
  const t = THEMES[q.theme] ? q.theme : "dark";
  if (!m) return send(400, kind, kind === "json" ? JSON.stringify({ error: "expected /badge/<ICAO>.svg" }) : errorBody(kind, "????", t), 60);

  const icao = m[1].toUpperCase();
  const w = await stationWx(icao);
  if (!w) {
    return send(404, kind, kind === "json" ? JSON.stringify({ icao, error: "no airport or weather found" }) : errorBody(kind, icao, t), 300);
  }
  if (kind === "json") return send(200, kind, JSON.stringify(w), 600);
  return send(200, kind, kind === "html" ? card(w, t) : svg(w, t), 600);
};

function send(statusCode, kind, body, maxAge) {
  const type = { svg: "image/svg+xml", json: "application/json", html: "text/html" }[kind];
  return {
    statusCode,
    headers: {
      "content-type": `${type}; charset=utf-8`,
      "cache-control": `public, max-age=${maxAge}`,
      "netlify-cdn-cache-control": `public, durable, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      "access-control-allow-origin": "*",
      ...(kind === "html" ? {} : { "x-robots-tag": "noindex" }),
    },
    body,
  };
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const signed = (n) => (n >= 0 ? "+" : "−") + fmt(Math.abs(n));
const zulu = (s) => new Date(s * 1000).toISOString().slice(11, 16).replace(":", "") + "Z";

// Accent colour tracks how far density altitude sits above the field today.
// c = accent bar; d = darker text shade that stays readable on the light theme's white.
function band(excessFt) {
  if (excessFt >= 3000) return { c: "#ff5d5d", d: "#c0392b" };
  if (excessFt >= 1000) return { c: "#ffb84d", d: "#9a5b00" };
  return { c: "#3ecf8e", d: "#0f7a4f" };
}
const bandText = (b, t) => (t === "light" ? b.d : b.c);

function sourceText(w) {
  if (w.source === "metar") return `METAR ${zulu(w.obsTime)}`;
  if (w.source === "nearby") return `${w.sourceId} ${zulu(w.obsTime)}`;
  return "model est.";
}

function svg(w, t) {
  const c = THEMES[t], b = band(w.excessFt);
  const label = `Density altitude at ${w.icao}: ${fmt(w.daFt)} ft (${signed(w.excessFt)} ft vs field elevation). Live from DensityAlt.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="72" viewBox="0 0 300 72" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<rect x=".5" y=".5" width="299" height="71" rx="10" fill="${c.bg}" stroke="${c.line}"/>
<path d="M10 .5h0v71h0a9.5 9.5 0 0 1-9.5-9.5v-52A9.5 9.5 0 0 1 10 .5z" fill="${b.c}"/>
<g font-family="${FONT}">
<text x="18" y="21" font-size="10.5" font-weight="700" letter-spacing=".8" fill="${c.head}">DENSITY ALTITUDE · ${esc(w.icao)}</text>
<text x="18" y="49" font-size="26" font-weight="700" fill="${c.big}">${fmt(w.daFt)}<tspan font-size="13" font-weight="600" fill="${c.unit}" dx="4">ft</tspan></text>
<text x="18" y="64" font-size="10" fill="${c.small}">${w.tempC}°C · ${w.altInHg.toFixed(2)} inHg · field ${fmt(w.elevFt)} ft</text>
<text x="288" y="21" text-anchor="end" font-size="10" fill="${c.head}">${esc(sourceText(w))}</text>
<text x="288" y="43" text-anchor="end" font-size="12.5" font-weight="700" fill="${bandText(b, t)}">${signed(w.excessFt)} ft</text>
<text x="288" y="55" text-anchor="end" font-size="9.5" fill="${c.small}">vs field elevation</text>
<text x="288" y="66" text-anchor="end" font-size="9.5" font-weight="700" fill="${c.brand}">densityalt.com</text>
</g>
</svg>`;
}

function card(w, t) {
  const c = THEMES[t], b = band(w.excessFt);
  const href = `${SITE}/?icao=${encodeURIComponent(w.icao)}`;
  const src = w.source === "metar" ? `${w.icao} METAR at ${zulu(w.obsTime)}`
    : w.source === "nearby" ? `nearest METAR ${w.sourceId} (${w.sourceNm} nm) at ${zulu(w.obsTime)}`
    : "weather-model estimate (no METAR within 25 nm)";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="900">
<title>Density altitude at ${esc(w.icao)} · DensityAlt</title>
<style>
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:${c.bg};color:${c.unit};font:13px/1.35 ${FONT}}
a{color:inherit}
.c{height:100%;display:flex;flex-direction:column;justify-content:space-between;padding:12px 14px 10px 18px;border:1px solid ${c.line};border-radius:10px;border-left:6px solid ${b.c}}
.h{display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;letter-spacing:.06em;color:${c.head};text-transform:uppercase}
.h span:last-child{font-weight:500;letter-spacing:0;text-transform:none;white-space:nowrap}
.n{font-size:13px;color:${c.small};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.da{font-size:32px;font-weight:700;color:${c.big};line-height:1.1}
.da small{font-size:15px;color:${c.unit};font-weight:600;margin-left:3px}
.x{font-weight:700;color:${bandText(b, t)}}
.g{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;font-size:12px;color:${c.small}}
.g b{color:${c.unit};font-weight:600}
.f{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;font-size:10.5px;color:${c.brand}}
.f a{font-weight:700;text-decoration:none;white-space:nowrap}
.f a:hover{text-decoration:underline}
</style></head><body><div class="c">
<div><div class="h"><span>Density altitude · ${esc(w.icao)}</span><span>${esc(sourceText(w))}</span></div>
<div class="n">${esc(w.name || w.icao)}</div></div>
<div><div class="da">${fmt(w.daFt)}<small>ft</small></div>
<div class="x">${signed(w.excessFt)} ft vs field elevation</div></div>
<div class="g"><span>Field <b>${fmt(w.elevFt)} ft</b></span><span>Pressure alt <b>${fmt(w.paFt)} ft</b></span>
<span>OAT <b>${w.tempC}°C</b> (ISA ${w.isaDevC >= 0 ? "+" : ""}${Math.round(w.isaDevC)})</span><span>Altimeter <b>${w.altInHg.toFixed(2)}</b></span></div>
<div class="f"><span title="${esc(src)}">From ${esc(src)}. Not for flight planning.</span><a href="${href}" target="_blank" rel="noopener">DensityAlt ↗</a></div>
</div></body></html>`;
}

function errorBody(kind, icao, t) {
  const c = THEMES[t];
  if (kind === "html") {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>DensityAlt</title></head>
<body style="margin:0;background:${c.bg};color:${c.small};font:13px ${FONT};padding:14px">Density altitude for ${esc(icao)} is unavailable right now. <a href="${SITE}/" target="_blank" rel="noopener" style="color:${c.unit}">DensityAlt ↗</a></body></html>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="72" viewBox="0 0 300 72" role="img" aria-label="Density altitude for ${esc(icao)} unavailable">
<rect x=".5" y=".5" width="299" height="71" rx="10" fill="${c.bg}" stroke="${c.line}"/>
<g font-family="${FONT}"><text x="18" y="21" font-size="10.5" font-weight="700" letter-spacing=".8" fill="${c.head}">DENSITY ALTITUDE · ${esc(icao)}</text>
<text x="18" y="46" font-size="15" font-weight="600" fill="${c.small}">Unavailable right now</text>
<text x="288" y="66" text-anchor="end" font-size="9.5" font-weight="700" fill="${c.brand}">densityalt.com</text></g>
</svg>`;
}
