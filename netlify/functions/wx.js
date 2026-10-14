const UPSTREAM = {
  metar: "https://aviationweather.gov/api/data/metar",
  airport: "https://aviationweather.gov/api/data/airport",
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const base = UPSTREAM[q.src];
  const ids = (q.ids || "").trim();
  const box = q.src === "metar" && !ids ? parseBox(q.bbox) : null;

  if (!base || (ids ? !/^[A-Za-z0-9]{2,6}$/.test(ids) : !box)) {
    return json(400, { error: "expected ?src=metar|airport&ids=<ICAO> or ?src=metar&bbox=<lat0,lon0,lat1,lon1>" });
  }

  const url = ids
    ? `${base}?ids=${encodeURIComponent(ids.toUpperCase())}&format=json`
    : `${base}?bbox=${box.join(",")}&format=json`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "densityalt.com weather proxy (+https://densityalt.com)" },
    });
    const body = await r.text();
    return {
      statusCode: r.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=120, s-maxage=300",
        "access-control-allow-origin": "*",
      },
      body,
    };
  } catch (e) {
    return json(502, { error: "upstream weather fetch failed", detail: String(e) });
  }
};

function parseBox(s) {
  const v = String(s || "").split(",").map(Number);
  if (v.length !== 4 || v.some((n) => !Number.isFinite(n))) return null;
  const [a0, o0, a1, o1] = v;
  if (a0 >= a1 || o0 >= o1 || a0 < -90 || a1 > 90 || o0 < -180 || o1 > 180) return null;
  if (a1 - a0 > 1 || o1 - o0 > 3) return null;
  return v.map((n) => n.toFixed(2));
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
    body: JSON.stringify(obj),
  };
}
