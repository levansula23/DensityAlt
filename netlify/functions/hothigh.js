// Hot & High: live density altitude across ~300 US airports with a summer DA of 4,500 ft or more.
// GET /api/hot-and-high -> { updated, count, stations: [...] } sorted by density altitude, highest first.
const { metarsBulk, metarsFor, fresh, finish, tidyName, HPA_TO_INHG } = require("../lib/wxcore");
const STATIONS = require("../lib/stations.json"); // [icao, name, city, state, elevFt, summerDaFt]

exports.handler = async () => {
  const met = (await metarsBulk()) || (await metarsFor(STATIONS.map((s) => s[0])));
  const stations = [];
  for (const [icao, name, city, state, elev, summerDaFt] of STATIONS) {
    const m = met[icao];
    if (!fresh(m) || m.temp == null || m.altim == null) continue;
    const w = finish({ elevFt: elev, tempC: m.temp, altInHg: m.altim * HPA_TO_INHG });
    stations.push({ icao, name: name || tidyName(m.name), city, state, ...w, obsTime: m.obsTime, summerDaFt });
  }
  stations.sort((a, b) => b.daFt - a.daFt);
  const ok = stations.length > 0;
  return {
    statusCode: ok ? 200 : 502,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "netlify-cdn-cache-control": ok ? "public, durable, s-maxage=600, stale-while-revalidate=1200" : "no-store",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify({ updated: new Date().toISOString(), count: stations.length, total: STATIONS.length, stations }),
  };
};
