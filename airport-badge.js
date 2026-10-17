// /airport-badge — badge builder: pick an airport + style, preview it live, copy the embed code.
// Previews load from this origin (so local/dev previews work); copied snippets always point at
// https://densityalt.com so they keep working wherever they're pasted.
(function () {
  'use strict';
  var SITE = 'https://densityalt.com';
  var ORIGIN = /^https?:$/.test(location.protocol) ? location.origin : SITE;
  var DEFAULT_ICAO = 'KASE';
  var BAND = [[3000, '#ff5d5d'], [1000, '#ffb84d'], [-Infinity, '#3ecf8e']];

  var $ = function (id) { return document.getElementById(id); };
  var input = $('bdIcao');
  if (!input) return;

  var state = { icao: null, theme: 'dark', data: null, seq: 0 };
  var statusEl = $('bdStatus');
  var copyLive = $('bdCopyLive');
  var debounce = null;

  // ---- formatting (mirrors netlify/functions/badge.js so the page matches the badge) ----
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var signed = function (n) { return (n >= 0 ? '+' : '−') + fmt(Math.abs(n)); };
  var zulu = function (s) { return new Date(s * 1000).toISOString().slice(11, 16).replace(':', '') + 'Z'; };
  var bandColor = function (ex) { for (var i = 0; i < BAND.length; i++) if (ex >= BAND[i][0]) return BAND[i][1]; return BAND[2][1]; };
  function sourceShort(w) {
    if (w.source === 'metar') return 'METAR ' + zulu(w.obsTime);
    if (w.source === 'nearby') return w.sourceId + ' ' + zulu(w.obsTime);
    return 'model est.';
  }
  function sourceLong(w) {
    if (w.source === 'metar') return 'from the ' + w.icao + ' METAR at ' + zulu(w.obsTime);
    if (w.source === 'nearby') return 'from the nearest METAR, ' + w.sourceId + ' (' + w.sourceNm + ' nm away), at ' + zulu(w.obsTime);
    return 'weather-model estimate (no METAR within 25 nm)';
  }

  function norm(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
  function themeQ() { return state.theme === 'light' ? '?theme=light' : ''; }

  function snippets(icao) {
    var q = themeQ(), calc = SITE + '/?icao=' + icao, img = SITE + '/badge/' + icao + '.svg' + q;
    return {
      snipImg: '<a href="' + calc + '"><img src="' + img + '" width="300" height="72" alt="Live density altitude at ' + icao + ', from DensityAlt"></a>',
      snipFrame: '<iframe src="' + SITE + '/embed/' + icao + q + '" width="320" height="190" style="border:0" loading="lazy" title="Live density altitude at ' + icao + '"></iframe>',
      snipMd: '[![Density altitude at ' + icao + '](' + img + ')](' + calc + ')',
      snipLink: '<a href="' + calc + '">Today\'s density altitude at ' + icao + '</a>'
    };
  }

  function setStatus(kind, text, spin) {
    statusEl.className = 'icao-status' + (kind ? ' ' + kind : '');
    statusEl.textContent = '';
    if (spin) { var s = document.createElement('span'); s.className = 'spin'; s.setAttribute('aria-hidden', 'true'); statusEl.appendChild(s); }
    statusEl.appendChild(document.createTextNode(text));
  }

  // ---- render previews, snippets and the "what it shows" anatomy for the current state ----
  function render() {
    var icao = state.icao;
    if (!icao) return;
    var q = themeQ();
    var img = $('bdImg'), frame = $('bdFrame');
    var imgSrc = ORIGIN + '/badge/' + icao + '.svg' + q;
    if (img.getAttribute('src') !== imgSrc) img.src = imgSrc;
    img.alt = 'Live density altitude at ' + icao + ', from DensityAlt';
    $('bdImgLink').href = '/?icao=' + encodeURIComponent(icao);
    var frameSrc = ORIGIN + '/embed/' + icao + q;
    if (frame.getAttribute('src') !== frameSrc) frame.src = frameSrc;
    frame.title = 'Live density altitude at ' + icao;
    ['bdImgStage', 'bdFrameStage', 'bdAnatStage'].forEach(function (id) { $(id).setAttribute('data-theme', state.theme); });

    var s = snippets(icao);
    Object.keys(s).forEach(function (id) { $(id).textContent = s[id]; });
    var calc = $('bdCalcLink');
    calc.href = '/?icao=' + encodeURIComponent(icao);
    calc.textContent = 'density altitude calculator for ' + icao;

    var anat = $('bdAnatImg');
    var anatSrc = ORIGIN + '/badge/' + icao + '.svg' + q;
    if (anat.getAttribute('src') !== anatSrc) anat.src = anatSrc;
    anat.alt = 'The density altitude badge for ' + icao + ', enlarged';
    $('bdAnatIcao').textContent = icao;
    $('bdTagHead').textContent = 'DENSITY ALTITUDE · ' + icao;
    var w = state.data;
    if (w && w.icao === icao) {
      $('bdTagDa').textContent = fmt(w.daFt) + ' ft';
      var ex = $('bdTagEx');
      ex.textContent = signed(w.excessFt) + ' ft vs field elevation';
      ex.style.color = bandColor(w.excessFt);
      $('bdTagIn').textContent = w.tempC + '°C · ' + Number(w.altInHg).toFixed(2) + ' inHg · field ' + fmt(w.elevFt) + ' ft';
      $('bdTagSrc').textContent = sourceShort(w);
    }
  }

  function syncUrl() {
    if (!history.replaceState || !/^https?:$/.test(location.protocol)) return;
    try {
      var u = new URL(location.href);
      u.searchParams.set('icao', state.icao);
      if (state.theme === 'light') u.searchParams.set('theme', 'light'); else u.searchParams.delete('theme');
      history.replaceState(null, '', u);
    } catch (e) { /* ignore */ }
  }

  function fetchWx(code) {
    return fetch(ORIGIN + '/badge/' + encodeURIComponent(code) + '.json', { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 404) return { missing: true };
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().then(function (j) { return j && !j.error && isFinite(j.daFt) ? { wx: j } : { missing: true }; });
      });
  }

  // Validate a code against the JSON endpoint, then switch the whole page to it.
  function lookup(raw, opts) {
    opts = opts || {};
    clearTimeout(debounce);
    var code = norm(raw);
    input.value = code;
    if (code.length < 3) {
      setStatus('err', code ? 'Use the 4-letter ICAO code. US airports usually add a K: LXV → KLXV.' : 'Type your airport\'s 4-letter ICAO code first.');
      return Promise.resolve(false);
    }
    if (state.data && state.icao === code && !opts.force) { okStatus(state.data, null); return Promise.resolve(true); }
    var seq = ++state.seq;
    setStatus('loading', 'Checking live weather for ' + code + '…', true);
    // A bare 3-letter US identifier (LXV) is almost always the K-prefixed ICAO (KLXV): try that first.
    var tries = /^[A-Z0-9]{3}$/.test(code) ? ['K' + code, code] : [code];
    var netErr = false;
    var chain = Promise.resolve(null);
    tries.forEach(function (c) {
      chain = chain.then(function (hit) {
        if (hit) return hit;
        return fetchWx(c).then(function (res) { return res.wx || null; }, function () { netErr = true; return null; });
      });
    });
    return chain.then(function (wx) {
      if (seq !== state.seq) return false;
      if (!wx) {
        if (netErr) setStatus('err', 'Couldn\'t reach the weather service just now. Please try ' + code + ' again in a moment.');
        else setStatus('err', 'We couldn\'t find ' + code + '. Use the 4-letter ICAO code. US airports usually add a K: LXV → KLXV.');
        return false;
      }
      state.icao = wx.icao;
      state.data = wx;
      input.value = wx.icao;
      okStatus(wx, wx.icao !== code ? code : null, opts.example);
      render();
      if (!opts.initial || opts.fromUrl) syncUrl();
      return true;
    });
  }

  function okStatus(w, typed, example) {
    var name = w.name ? ' · ' + w.name : '';
    if (example) {
      setStatus('info', 'Showing the example for ' + w.icao + name + ' (' + fmt(w.daFt) + ' ft right now). Type your own airport\'s code above.');
      return;
    }
    var lead = typed ? 'Using ' + w.icao + ' (US airports add a K to the 3-letter code)' + name : '✓ ' + w.icao + name;
    setStatus('ok', lead + ' — density altitude ' + fmt(w.daFt) + ' ft right now (' + signed(w.excessFt) + ' ft vs field), ' + sourceLong(w) + '.');
  }

  function setTheme(t) {
    state.theme = t === 'light' ? 'light' : 'dark';
    document.querySelectorAll('.bd-seg button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme') === state.theme));
    });
    if (state.icao) { render(); syncUrl(); }
  }

  // ---- copy to clipboard (async API, with a textarea fallback for older/insecure contexts) ----
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function selectEl(el) {
    var sel = window.getSelection && window.getSelection();
    if (!sel) return;
    var r = document.createRange();
    r.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  document.querySelectorAll('.bd-copy').forEach(function (btn) {
    var label = btn.textContent;
    var timer = null;
    btn.addEventListener('click', function () {
      var el = $(btn.getAttribute('data-for'));
      copyText(el.textContent).then(function (ok) {
        clearTimeout(timer);
        if (ok) {
          btn.textContent = 'Copied ✓';
          btn.classList.add('done');
          copyLive.textContent = 'Code copied to your clipboard.';
        } else {
          selectEl(el);
          btn.textContent = 'Press Ctrl+C';
          copyLive.textContent = 'Code selected. Press Control+C (or Command+C) to copy.';
        }
        timer = setTimeout(function () { btn.textContent = label; btn.classList.remove('done'); }, 2200);
      });
    });
  });
  document.querySelectorAll('.bd-code').forEach(function (el) {
    el.addEventListener('click', function () { if (!String(window.getSelection && window.getSelection())) selectEl(el); });
  });

  // ---- wire up controls ----
  input.addEventListener('input', function () {
    var pos = input.selectionStart, v = norm(input.value);
    if (v !== input.value) { input.value = v; try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } }
    clearTimeout(debounce);
    if (v.length === 4 && v !== state.icao) debounce = setTimeout(function () { lookup(v); }, 650);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); lookup(input.value); }
  });
  $('bdGo').addEventListener('click', function () { lookup(input.value); });
  document.querySelectorAll('.bd-chips .chip').forEach(function (c) {
    c.addEventListener('click', function () { lookup(c.getAttribute('data-icao')); });
  });
  document.querySelectorAll('.bd-seg button').forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme')); });
  });

  // ---- initial state: ?icao= / ?theme= from the URL, else the KASE example ----
  var params = new URLSearchParams(location.search);
  var fromUrl = norm(params.get('icao'));
  setTheme(params.get('theme') === 'light' ? 'light' : 'dark');
  if (fromUrl.length >= 3) {
    lookup(fromUrl, { initial: true, fromUrl: true }).then(function (ok) {
      // Bad ?icao= : keep the error message, but make the previews/snippets a working example.
      if (!ok && !state.icao) { state.icao = DEFAULT_ICAO; render(); }
    });
  } else {
    // Show the example straight away (it's a known-good field), then fill in the live numbers.
    state.icao = DEFAULT_ICAO;
    input.value = DEFAULT_ICAO;
    render();
    lookup(DEFAULT_ICAO, { initial: true, force: true, example: true }).then(function (ok) {
      if (!ok) setStatus('', 'Type your airport\'s 4-letter ICAO code, or try one of these:');
    });
  }
})();
