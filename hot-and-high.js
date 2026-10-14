/* Hot & High — live density altitude leaderboard.
   Reads /api/hot-and-high (Netlify function, CDN-cached ~10 min) and renders
   headline stats, a top-10, and a sortable / filterable table.
   Wrapped in an IIFE: app.js already declares globals like $ and fmt. */
(function () {
  'use strict';

  var API = '/api/hot-and-high';
  var REFRESH_MS = 10 * 60 * 1000;
  var HIGH_DA = 8000;      // headline threshold
  var GAP_AMBER = 1000;    // same thresholds as the airport badge
  var GAP_RED = 3000;
  var STALE_MIN = 90;

  var byId = function (id) { return document.getElementById(id); };
  var els = {
    msg: byId('hhMsg'), content: byId('hhContent'), status: byId('hhStatus'),
    stats: byId('hhStats'), top: byId('hhTop'), body: byId('hhBody'),
    count: byId('hhCount'), state: byId('hhState'), search: byId('hhSearch'),
    scroll: byId('hhScroll'), table: byId('hhTable')
  };
  if (!els.msg || !els.body) return;

  var S = { data: null, byDa: [], byGap: [], rankDa: {}, rankGap: {}, sort: 'da', st: '', q: '', loadedAt: 0, hashDone: false, hit: '' };

  /* ---------- formatting ---------- */
  var num = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var signed = function (n) {
    var r = Math.round(n);
    return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r).toLocaleString('en-US');
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var zulu = function (ms, colon) {
    var d = new Date(ms);
    return pad2(d.getUTCHours()) + (colon ? ':' : '') + pad2(d.getUTCMinutes()) + 'Z';
  };
  var ageMin = function (sec) { return Math.max(0, Math.round((Date.now() / 1000 - sec) / 60)); };
  var ageText = function (m) {
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    return h + ' h ' + pad2(m % 60) + ' min ago';
  };
  var shortAge = function (m) { return m < 60 ? m + 'm ago' : Math.floor(m / 60) + 'h ' + pad2(m % 60) + 'm ago'; };
  var gapCls = function (x) { return x >= GAP_RED ? 'r' : x >= GAP_AMBER ? 'a' : 'g'; };
  var gapPill = function (x) { return '<span class="hh-gap ' + gapCls(x) + '">' + signed(x) + '</span>'; };
  var calcUrl = function (icao) { return '/?icao=' + encodeURIComponent(icao); };
  var place = function (s) { return esc(s.city) + (s.state ? ', ' + esc(s.state) : ''); };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };

  /* ---------- states ---------- */
  function showLoading() {
    els.msg.className = 'hh-msg';
    els.msg.innerHTML = '<span class="hh-spin" aria-hidden="true"></span>Loading live METARs for about 300 airports…';
    els.msg.hidden = false;
    els.content.hidden = true;
    els.status.textContent = '';
  }

  function showError(err) {
    els.content.hidden = true;
    els.msg.hidden = false;
    els.msg.className = 'hh-msg err';
    els.msg.innerHTML = '<strong>Live data is temporarily unavailable.</strong><br>' +
      'The weather feed didn’t answer' + (err && err.status ? ' (HTTP ' + err.status + ')' : '') +
      '. The summer ranking below is unaffected — try again in a minute.<br>' +
      '<button type="button" id="hhRetry">Try again</button>';
    els.status.textContent = 'Live feed offline';
    var b = byId('hhRetry');
    if (b) b.addEventListener('click', function () { load(false); });
  }

  /* ---------- data ---------- */
  function ingest(d) {
    var list = d.stations.filter(function (s) {
      return s && s.icao && isNum(s.daFt) && isNum(s.elevFt);
    }).map(function (s) {
      if (!isNum(s.excessFt)) s.excessFt = s.daFt - s.elevFt;
      return s;
    });
    if (!list.length) throw new Error('No stations');
    S.data = d;
    S.byDa = list.slice().sort(function (a, b) { return b.daFt - a.daFt || b.excessFt - a.excessFt; });
    S.byGap = list.slice().sort(function (a, b) { return b.excessFt - a.excessFt || b.daFt - a.daFt; });
    S.rankDa = {}; S.rankGap = {};
    S.byDa.forEach(function (s, i) { S.rankDa[s.icao] = i + 1; });
    S.byGap.forEach(function (s, i) { S.rankGap[s.icao] = i + 1; });
    S.loadedAt = Date.now();
    buildStateFilter(list);
    els.msg.hidden = true;
    els.content.hidden = false;
    renderAll();
    if (!S.hashDone) { S.hashDone = true; focusFromHash(); }
  }

  function load(isRefresh) {
    if (!isRefresh) showLoading();
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 20000) : 0;
    fetch(API, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) { var e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
        return r.json();
      })
      .then(function (d) {
        if (!d || !Array.isArray(d.stations) || !d.stations.length) throw new Error('Empty response');
        ingest(d);
      })
      .catch(function (e) {
        // Keep showing the last good board on a failed background refresh.
        if (isRefresh && S.data) { renderStatus(true); return; }
        showError(e);
      })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  /* ---------- rendering ---------- */
  function renderAll() { renderStatus(false); renderStats(); renderTop(); renderTable(); }

  function renderStatus(refreshFailed) {
    var d = S.data; if (!d) return;
    var upd = Date.parse(d.updated);
    var n = S.byDa.length, total = isNum(d.total) ? d.total : n;
    els.status.innerHTML = 'Updated <b>' + (isNaN(upd) ? '—' : zulu(upd, true)) + '</b> · ' +
      num(n) + (total > n ? ' of ' + num(total) : '') + ' airports reporting' +
      (refreshFailed ? ' · <span style="color:var(--warn)">refresh failed, retrying</span>' : '');
  }

  function stat(cls, label, value, sub) {
    return '<div class="hh-stat' + (cls ? ' ' + cls : '') + '"><div class="lbl">' + label + '</div>' +
      '<div class="v">' + value + '</div><div class="s">' + sub + '</div></div>';
  }
  function apLink(s) {
    return '<a href="' + calcUrl(s.icao) + '">' + esc(s.icao) + '</a> · ' + esc(s.name) + ', ' + place(s);
  }

  function renderStats() {
    var top = S.byDa[0], gap = S.byGap[0], n = S.byDa.length;
    var high = S.byDa.filter(function (s) { return s.daFt >= HIGH_DA; }).length;
    var thin = S.byDa.filter(function (s) { return s.excessFt >= GAP_AMBER; }).length;
    els.stats.innerHTML =
      stat('hh-lead', 'Highest density altitude now', num(top.daFt) + ' <small>ft</small>',
        apLink(top) + ' — field ' + num(top.elevFt) + ' ft') +
      stat('', 'Biggest jump above field', signed(gap.excessFt) + ' <small>ft</small>',
        apLink(gap) + ' — ' + (isNum(gap.tempC) ? Math.round(gap.tempC) + ' °C, ' : '') + 'DA ' + num(gap.daFt) + ' ft') +
      stat('', 'Airports above ' + num(HIGH_DA) + ' ft DA', num(high) + ' <small>of ' + num(n) + '</small>',
        'Density altitude of ' + num(HIGH_DA) + ' ft or more right now') +
      stat('', 'Running +1,000 ft or more', num(thin) + ' <small>of ' + num(n) + '</small>',
        'Density altitude at least 1,000 ft above field elevation');
  }

  function renderTop() {
    els.top.innerHTML = S.byDa.slice(0, 10).map(function (s, i) {
      return '<li><a href="' + calcUrl(s.icao) + '" title="' + esc(s.name + ', ' + s.city + ', ' + s.state) + '">' +
        '<span class="tk"><span class="rk">#' + (i + 1) + '</span>' + gapPill(s.excessFt) + '</span>' +
        '<span class="id">' + esc(s.icao) + '</span>' +
        '<span class="nm">' + esc(s.city) + ', ' + esc(s.state) + '</span>' +
        '<span class="dav">' + num(s.daFt) + ' <small>ft DA</small></span>' +
        '</a></li>';
    }).join('');
  }

  function matches(s) {
    if (S.st && s.state !== S.st) return false;
    if (!S.q) return true;
    var hay = (s.icao + ' ' + s.name + ' ' + s.city + ' ' + s.state).toLowerCase();
    return S.q.split(/\s+/).every(function (t) { return hay.indexOf(t) !== -1; });
  }

  function row(s) {
    var rank = S.sort === 'gap' ? S.rankGap[s.icao] : S.rankDa[s.icao];
    var hasObs = isNum(s.obsTime);
    var m = hasObs ? ageMin(s.obsTime) : null;
    var obs = hasObs ? zulu(s.obsTime * 1000, false) : '—';
    var age = hasObs ? ageText(m) : '';
    var stale = hasObs && m > STALE_MIN;
    var temp = isNum(s.tempC) ? Math.round(s.tempC) + ' °C' : '—';
    var alt = isNum(s.altInHg) ? s.altInHg.toFixed(2) + '″' : '—';
    return '<tr data-icao="' + esc(s.icao) + '"' + (s.icao === S.hit ? ' class="hit"' : '') + '>' +
      '<td class="rk">' + rank + '</td>' +
      '<td><a class="hh-ap" href="' + calcUrl(s.icao) + '"><b>' + esc(s.icao) + '</b><span>' + esc(s.name) + '</span></a>' +
        '<span class="hh-city">' + place(s) + '</span>' +
        '<span class="hh-meta">' + num(s.elevFt) + ' ft · ' + temp + ' · ' + alt + ' · ' + obs + (hasObs ? ', ' + shortAge(m) : '') + '</span></td>' +
      '<td class="n c-el">' + num(s.elevFt) + ' ft</td>' +
      '<td class="n c-tp">' + temp + '</td>' +
      '<td class="n c-al">' + alt + '</td>' +
      '<td class="n dav">' + num(s.daFt) + '</td>' +
      '<td class="n">' + gapPill(s.excessFt) + '</td>' +
      '<td class="n c-ob">' + obs + (age ? '<span class="hh-age' + (stale ? ' stale' : '') + '">' + age + '</span>' : '') + '</td>' +
      '</tr>';
  }

  function renderTable() {
    var src = S.sort === 'gap' ? S.byGap : S.byDa;
    var rows = src.filter(matches);
    els.body.innerHTML = rows.length ? rows.map(row).join('')
      : '<tr class="hh-empty"><td colspan="8">No airports match — try another search or state.</td></tr>';
    var total = src.length;
    els.count.textContent = rows.length === total
      ? 'Showing all ' + num(total) + ' airports, ranked by ' + (S.sort === 'gap' ? 'density altitude above field elevation' : 'density altitude')
      : 'Showing ' + num(rows.length) + ' of ' + num(total) + ' airports · rank is national';
    syncSortUi();
  }

  function syncSortUi() {
    document.querySelectorAll('[data-sort]').forEach(function (b) {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', b.getAttribute('data-sort') === S.sort ? 'true' : 'false');
    });
    if (els.table) {
      els.table.querySelectorAll('th[data-col]').forEach(function (th) {
        if (th.getAttribute('data-col') === S.sort) th.setAttribute('aria-sort', 'descending');
        else th.removeAttribute('aria-sort');
      });
    }
  }

  function buildStateFilter(list) {
    var counts = {};
    list.forEach(function (s) { if (s.state) counts[s.state] = (counts[s.state] || 0) + 1; });
    var keep = S.st;
    var opts = ['<option value="">All states</option>'].concat(Object.keys(counts).sort().map(function (st) {
      return '<option value="' + esc(st) + '">' + esc(st) + ' (' + counts[st] + ')</option>';
    }));
    els.state.innerHTML = opts.join('');
    if (keep && counts[keep]) els.state.value = keep; else { S.st = ''; els.state.value = ''; }
  }

  /* /hot-and-high#KLXV highlights that airport's row (handy for outreach links). */
  function focusFromHash() {
    var m = /^#([A-Za-z0-9]{3,4})$/.exec(location.hash || '');
    if (!m) return;
    var icao = m[1].toUpperCase();
    if (!S.rankDa[icao] && S.rankDa['K' + icao]) icao = 'K' + icao;
    if (!S.rankDa[icao]) return;
    var tr = els.body.querySelector('tr[data-icao="' + icao + '"]');
    if (!tr) return;
    S.hit = icao;
    tr.classList.add('hit');
    els.scroll.scrollTop = Math.max(0, tr.offsetTop - 70);
    var head = byId('all-airports');
    if (head && head.scrollIntoView) head.scrollIntoView({ block: 'start' });
  }

  /* ---------- events ---------- */
  document.querySelectorAll('button[data-sort]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-sort');
      if (v === S.sort || !S.data) return;
      S.sort = v;
      els.scroll.scrollTop = 0;
      renderTable();
    });
  });
  els.state.addEventListener('change', function () { S.st = els.state.value; els.scroll.scrollTop = 0; if (S.data) renderTable(); });
  els.search.addEventListener('input', function () {
    S.q = els.search.value.trim().toLowerCase();
    els.scroll.scrollTop = 0;
    if (S.data) renderTable();
  });
  els.body.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) return;
    var tr = e.target.closest ? e.target.closest('tr[data-icao]') : null;
    if (tr) location.href = calcUrl(tr.getAttribute('data-icao'));
  });

  // Keep ages honest while the page sits open; pull fresh data every 10 minutes.
  setInterval(function () {
    if (!S.data || document.hidden) return;
    if (Date.now() - S.loadedAt >= REFRESH_MS) load(true);
    else { renderStatus(false); renderTable(); }
  }, 60 * 1000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.data && Date.now() - S.loadedAt >= REFRESH_MS) load(true);
  });

  load(false);
})();
