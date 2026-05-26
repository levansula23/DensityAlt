const UPSTREAM = {
  metar: "https://aviationweather.gov/api/data/metar",
  airport: "https://aviationweather.gov/api/data/airport",
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const base = UPSTREAM[q.src];
  const ids = (q.ids || "").trim();

  if (!base || !ids || !/^[A-Za-z0-9]{2,6}$/.test(ids)) {
    return json(400, { error: "expected ?src=metar|airport&ids=<ICAO>" });
  }

  const url = `${base}?ids=${encodeURIComponent(ids.toUpperCase())}&format=json`;
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

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
    body: JSON.stringify(obj),
  };
}
