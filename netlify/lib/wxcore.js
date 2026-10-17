// Shared server-side weather + density altitude helpers for the badge and Hot & High functions.
// Mirrors the browser logic in app.js (wxFetchStation / nearbyWx / calcDA) so a badge and the
// calculator it links to show the same numbers.

const AWC = "https://aviationweather.gov/api/data";
const UA = { "User-Agent": "densityalt.com (+https://densityalt.com)" };
const FT_PER_M = 3.28084, HPA_TO_INHG = 0.02953, NEAR_NM = 25, LAPSE_C_PER_FT = 0.00198, STALE_S = 3 * 3600;
const FIELD_ELEV_FT = Object.fromEntries(require("./stations.json").map((s) => [s[0], s[4]]));

async function getJSON(url, ms = 6000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: c.signal });
    if (r.status === 204 || !r.ok) return null;
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const fresh = (m) => m && m.obsTime && Date.now() / 1000 - m.obsTime <= STALE_S;

function distNm(a1, o1, a2, o2) {
  const r = Math.PI / 180;
  const h = Math.sin(((a2 - a1) * r) / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(((o2 - o1) * r) / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function altimFromSurface(hPa, elevM) {
  return Math.pow(Math.pow(hPa - 0.3, 0.190284) + 8.4228807e-5 * elevM, 1 / 0.190284) * HPA_TO_INHG;
}

// Same formulas as calcDA() in app.js.
function computeDA(elevFt, tempC, altInHg) {
  const paFt = elevFt + (29.92 - altInHg) * 1000;
  const isaC = 15 - 1.98 * (paFt / 1000);
  const isaDevC = tempC - isaC;
  const daFt = paFt + 120 * isaDevC;
  return { paFt: Math.round(paFt), daFt: Math.round(daFt), isaDevC: Math.round(isaDevC * 10) / 10, excessFt: Math.round(daFt - elevFt) };
}

// Latest METARs for many stations, keyed by ICAO. Batches keep each upstream call small.
async function metarsFor(ids, batch = 60) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += batch) chunks.push(ids.slice(i, i + batch));
  const res = await Promise.all(chunks.map((c) => getJSON(`${AWC}/metar?ids=${c.join(",")}&format=json`, 9000)));
  const out = {};
  for (const arr of res) for (const m of arr || []) if (!out[m.icaoId] || m.obsTime > out[m.icaoId].obsTime) out[m.icaoId] = m;
  return out;
}

// Every current METAR in one ~250 KB download (AWC's bulk cache, refreshed each minute).
// Returns the same shape as the JSON API (icaoId, obsTime, temp, altim hPa, elev m, rawOb).
async function metarsBulk() {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 7000);
  try {
    const r = await fetch("https://aviationweather.gov/data/cache/metars.cache.csv.gz", { headers: UA, signal: c.signal });
    if (!r.ok) return null;
    let buf = Buffer.from(await r.arrayBuffer());
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = require("zlib").gunzipSync(buf);
    const lines = buf.toString("utf8").split("\n");
    const head = lines[0].split(","), col = (n) => head.indexOf(n);
    const iId = col("station_id"), iT = col("observation_time"), iTc = col("temp_c"), iAlt = col("altim_in_hg"), iEl = col("elevation_m");
    if ([iId, iT, iTc, iAlt, iEl].some((i) => i < 0)) return null;
    const out = {};
    for (let k = 1; k < lines.length; k++) {
      const line = lines[k];
      if (!line) continue;
      // raw_text is the only quoted field and is always first
      const q = line.startsWith('"') ? line.indexOf('",', 1) : -1;
      const rawOb = q > 0 ? line.slice(1, q) : "";
      const f = [rawOb, ...(q > 0 ? line.slice(q + 2) : line.slice(line.indexOf(",") + 1)).split(",")];
      const id = f[iId], obsTime = Date.parse(f[iT]) / 1000;
      if (!id || !obsTime || (out[id] && out[id].obsTime >= obsTime)) continue;
      const num = (v) => (v === "" || v == null || isNaN(+v) ? null : +v);
      const altIn = num(f[iAlt]);
      out[id] = { icaoId: id, obsTime, temp: num(f[iTc]), altim: altIn == null ? null : altIn / HPA_TO_INHG, elev: num(f[iEl]), rawOb };
    }
    return Object.keys(out).length ? out : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function nearestMetar(lat, lon, skip) {
  const dA = NEAR_NM / 60, dO = dA / Math.max(0.3, Math.cos((lat * Math.PI) / 180));
  const box = [lat - dA, lon - dO, lat + dA, lon + dO].map((v) => v.toFixed(2)).join(",");
  const url = `${AWC}/metar?bbox=${box}&format=json`;
  // one retry: a dropped call here would otherwise demote the badge to a model estimate for 10 minutes
  const d = (await getJSON(url)) || (await getJSON(url));
  let best = null;
  for (const m of d || []) {
    if (m.altim == null || m.lat == null || m.icaoId === skip || !fresh(m)) continue;
    const nm = distNm(lat, lon, m.lat, m.lon);
    if (nm <= NEAR_NM && (!best || nm < best.nm)) best = { m, nm };
  }
  return best;
}

async function modelAt(lat, lon) {
  const d = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,surface_pressure`);
  const cur = d && d.current;
  if (!cur || cur.temperature_2m == null || cur.surface_pressure == null || d.elevation == null) return null;
  return { tempC: cur.temperature_2m, altInHg: altimFromSurface(cur.surface_pressure, d.elevation), elevFt: d.elevation * FT_PER_M };
}

const ABBR = { Arpt: "Airport", Cnty: "County", Fld: "Field", Intl: "International", Meml: "Memorial", Muni: "Municipal", Rgnl: "Regional", Exec: "Executive", Mtn: "Mountain" };
const tidyName = (s) => (s || "").replace(/,\s*[A-Z]{2},\s*US$/, "").replace(/\b[A-Z][a-z]{2,4}\b/g, (w) => ABBR[w] || w).replace(/\s+/g, " ").trim();

// Current density altitude at one airport: its own METAR, else the nearest METAR within 25 nm
// (temperature lapse-adjusted when the elevations differ by 500 ft or more), else a weather model.
async function stationWx(icao) {
  icao = String(icao || "").toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) return null;
  // AWC only takes ICAO codes: a bare 3-character US identifier (LXV, L35) is the K-prefixed one.
  if (icao.length === 3 && FIELD_ELEV_FT[icao] == null) icao = "K" + icao;
  const own = ((await getJSON(`${AWC}/metar?ids=${icao}&format=json`)) || [])[0];
  let name = own && own.name ? tidyName(own.name) : null;
  // Field elevation, not the METAR sensor's: bundled list first, then the AWC airport record.
  let elevFt = FIELD_ELEV_FT[icao] != null ? FIELD_ELEV_FT[icao] : null;
  let lat = own ? own.lat : null, lon = own ? own.lon : null;
  if (elevFt == null || lat == null) {
    const apt = ((await getJSON(`${AWC}/airport?ids=${icao}&format=json`)) || [])[0];
    if (apt) {
      if (!name && apt.name) name = tidyName(apt.name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()));
      if (elevFt == null && apt.elev != null) elevFt = apt.elev * FT_PER_M;
      if (lat == null) { lat = apt.lat; lon = apt.lon; }
    }
  }
  if (elevFt == null && own && own.elev != null) elevFt = own.elev * FT_PER_M;
  if (elevFt == null || lat == null) return null;
  if (fresh(own) && own.temp != null && own.altim != null) {
    return finish({ icao, name, elevFt, lat, lon, tempC: own.temp, altInHg: own.altim * HPA_TO_INHG, obsTime: own.obsTime, source: "metar", sourceId: icao, rawOb: own.rawOb });
  }
  const near = await nearestMetar(lat, lon, icao);
  if (near && near.m.temp != null) {
    const sElevFt = near.m.elev != null ? near.m.elev * FT_PER_M : elevFt;
    const dh = sElevFt - elevFt;
    const tempC = near.m.temp + (Math.abs(dh) >= 500 ? dh * LAPSE_C_PER_FT : 0);
    return finish({ icao, name, elevFt, lat, lon, tempC, altInHg: near.m.altim * HPA_TO_INHG, obsTime: near.m.obsTime, source: "nearby", sourceId: near.m.icaoId, sourceNm: Math.max(1, Math.round(near.nm)) });
  }
  const mod = await modelAt(lat, lon);
  if (!mod) return null;
  return finish({ icao, name, elevFt, lat, lon, tempC: mod.tempC, altInHg: mod.altInHg, obsTime: Math.floor(Date.now() / 1000), source: "model" });
}

// Round the inputs exactly as lookupICAO() fills the calculator (ft, whole °C, 0.01 inHg),
// so clicking through from a badge shows the same density altitude.
function finish(w) {
  const elevFt = Math.round(w.elevFt), tempC = Math.round(w.tempC), altInHg = Math.round(w.altInHg * 100) / 100;
  return { ...w, elevFt, tempC, altInHg, ...computeDA(elevFt, tempC, altInHg) };
}

module.exports = { FT_PER_M, HPA_TO_INHG, getJSON, fresh, computeDA, finish, metarsFor, metarsBulk, stationWx, tidyName };
