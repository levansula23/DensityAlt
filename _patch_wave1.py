# -*- coding: utf-8 -*-
"""Wave-1 SEO patch: nav rollout, stale-link fixes, title/meta trims,
cross-link grids, learn-hub cards. Scratch file; gitignored pattern (_*)."""
import io, re, sys

def rd(p):
    with io.open(p, encoding="utf-8", newline="") as f: return f.read()
def wr(p, s):
    with io.open(p, "w", encoding="utf-8", newline="") as f: f.write(s)

def eolize(s, eol):
    return s.replace("\n", eol) if eol == "\r\n" else s

NEW_MENU = """      <div class="nl-menu">
        <a class="nl" href="/pressure-altitude-calculator">Pressure Altitude</a>
        <a class="nl" href="/true-airspeed-calculator">True Airspeed</a>
        <a class="nl" href="/crosswind-calculator">Crosswind</a>
        <a class="nl" href="/takeoff-landing-distance">Takeoff &amp; Landing</a>
        <a class="nl" href="/cloud-base-calculator">Cloud Base</a>
        <a class="nl" href="/freezing-level-calculator">Freezing Level</a>
        <a class="nl" href="/isa-deviation-calculator">ISA Deviation</a>
        <a class="nl" href="/oxygen-at-altitude-calculator">Oxygen at Altitude</a>
        <a class="nl" href="/pivotal-altitude-calculator">Pivotal Altitude</a>
        <a class="nl" href="/horsepower-at-altitude">Horsepower</a>
        <a class="nl" href="/power-curve">Power Curve</a>
        <a class="nl" href="/cabin-altitude-calculator">Cabin Altitude</a>
      </div>"""

CARDS = {
 "da":       ('/', 'Calculator', 'Density Altitude', 'The altitude your aircraft actually performs at — with live METAR.'),
 "pa":       ('/pressure-altitude-calculator', 'Calculator', 'Pressure Altitude', 'PA from the altimeter setting — the chart-entry altitude.'),
 "tas":      ('/true-airspeed-calculator', 'Calculator', 'True Airspeed', 'TAS from IAS, pressure altitude &amp; temperature.'),
 "cb":       ('/cloud-base-calculator', 'Calculator', 'Cloud Base', 'Estimate the cumulus base from temp &amp; dew point.'),
 "fz":       ('/freezing-level-calculator', 'Calculator', 'Freezing Level', 'Estimate the 0&nbsp;°C altitude from surface temperature.'),
 "isa":      ('/isa-deviation-calculator', 'Calculator', 'ISA Deviation', 'Standard temperature at altitude and your ISA± number.'),
 "o2":       ('/oxygen-at-altitude-calculator', 'Calculator', 'Oxygen at Altitude', 'Effective O₂ %, pressure &amp; SpO₂ from Denver to Everest.'),
 "pv":       ('/pivotal-altitude-calculator', 'Calculator', 'Pivotal Altitude', 'GS² ÷ 11.3 for eights on pylons, in AGL and MSL.'),
 "explorer": ('/atmosphere-explorer', 'Interactive', 'Atmosphere &amp; Hypoxia Explorer', 'Drag an aircraft up and watch pressure, oxygen &amp; SpO₂ fall.'),
 "xw":       ('/crosswind-calculator', 'Calculator', 'Crosswind Calculator', 'Split the wind into crosswind &amp; headwind on a runway diagram.'),
 "tol":      ('/takeoff-landing-distance', 'Interactive', 'Takeoff &amp; Landing Distance', 'How density altitude stretches your ground roll &amp; rollout.'),
 "hp":       ('/horsepower-at-altitude', 'Calculator', 'Horsepower at Altitude', 'How much power a piston engine loses with density altitude.'),
 "pc":       ('/power-curve', 'Interactive', 'Power Curve &amp; Reversed Command', 'The back side of the power curve and your climb margins.'),
 "cabin":    ('/cabin-altitude-calculator', 'Calculator', 'Cabin Altitude', 'What cabin altitude your pressurization holds at cruise.'),
}

def card_html(key):
    href, lbl, val, pct = CARDS[key]
    return ('      <a class="card" href="%s" style="text-decoration:none;color:inherit;display:block">\n'
            '        <div class="lbl">%s</div><div class="val" style="font-size:18px">%s</div>\n'
            '        <div class="pct">%s</div></a>' % (href, lbl, val, pct))

def grid_section(keys):
    return ('  <section class="da" id="more-tools">\n'
            '    <h2>More free altitude tools</h2>\n'
            '    <p class="desc">DensityAlt is a set of free, no-signup aviation calculators. Explore the rest:</p>\n'
            '    <div class="grid">\n'
            + '\n'.join(card_html(k) for k in keys) + '\n'
            '    </div>\n'
            '  </section>\n\n')

changed = []

# ---- 1. Nav rollout: every file still carrying the old 5-item menu ----
import glob
for p in glob.glob("*.html") + glob.glob("learn/*.html"):
    s = rd(p)
    if "Pressure Altitude</a>" in s and "/pressure-altitude-calculator" in s and 'nl-menu' in s:
        pass  # may still need other patches below
    m = re.search(r'[ \t]*<div class="nl-menu">.*?</div>', s, re.S)
    if m and "Pressure Altitude" not in m.group(0):
        eol = "\r\n" if "\r\n" in s else "\n"
        s = s[:m.start()] + eolize(NEW_MENU, eol) + s[m.end():]
        wr(p, s); changed.append(p + " [nav]")

# ---- 2. Per-file fixes ----
def patch(p, pairs, tag):
    s = rd(p); eol = "\r\n" if "\r\n" in s else "\n"
    ok = True
    for old, new in pairs:
        o, n = eolize(old, eol), eolize(new, eol)
        if o not in s:
            print("MISS in %s: %r" % (p, old[:70])); ok = False; continue
        s = s.replace(o, n, 1)
    wr(p, s); changed.append(p + " [" + tag + "]")
    return ok

# horsepower: stale link -> real link; add visible FAQ (mirrors existing JSON-LD)
patch("horsepower-at-altitude.html", [
 ('<a id="useDa">↑ use the density altitude from above</a>',
  'First compute it with the <a href="/">density altitude calculator</a> (or the <a href="/pressure-altitude-calculator">pressure altitude calculator</a> on a standard day).'),
], "stale-link")

HP_FAQ = """  <section class="da faq" id="faq">
    <h2>Frequently asked questions</h2>
    <div class="faqlist">
      <details class="faq-item"><summary>How much horsepower does an engine lose with altitude?</summary>
      <p class="a">A normally-aspirated piston engine loses power roughly in proportion to air density — about 3% per 1,000 ft of density altitude (Gagg–Ferrar). At 8,000 ft density altitude a 180 hp engine makes closer to 135 hp. Turbocharged engines hold rated power up to a critical altitude, then fall off the same way.</p></details>
      <details class="faq-item"><summary>Do jet (turbine) engines lose power at altitude?</summary>
      <p class="a">Yes. Jet engines produce thrust, not horsepower, and thrust falls as you climb because thinner air means less mass flow through the engine — roughly with the ambient pressure ratio, so a turbofan at FL400 may make only about a third of its sea-level static thrust. Turboprops produce shaft horsepower and are usually flat-rated to a critical altitude, then lose power as density falls.</p></details>
    </div>
  </section>

"""

# ---- 3. Insert FAQ (horsepower) + cross-link grid before <footer> on old tool pages ----
GRIDS = {
 "atmosphere-explorer.html":        ["o2", "da", "cabin", "pa", "hp", "tol"],
 "cabin-altitude-calculator.html":  ["o2", "explorer", "da", "pa", "hp", "tas"],
 "horsepower-at-altitude.html":     ["da", "pa", "tas", "tol", "pc", "isa"],
 "power-curve.html":                ["da", "hp", "tas", "tol", "explorer", "pv"],
 "crosswind-calculator.html":       ["tol", "da", "pv", "cb", "fz", "tas"],
 "takeoff-landing-distance.html":   ["da", "hp", "pa", "cb", "xw", "isa"],
}
for p, keys in GRIDS.items():
    s = rd(p); eol = "\r\n" if "\r\n" in s else "\n"
    if 'id="more-tools"' in s:
        print("SKIP grid (exists):", p); continue
    ins = grid_section(keys)
    if p == "horsepower-at-altitude.html" and 'class="da faq"' not in s:
        ins = HP_FAQ + ins
    marker = eolize("  <footer>", eol)
    idx = s.find(marker)
    if idx < 0:
        print("MISS footer:", p); continue
    s = s[:idx] + eolize(ins, eol) + s[idx:]
    wr(p, s); changed.append(p + " [grid]")

# ---- 4. Broken/stale links ----
patch("cabin-altitude-calculator.html", [
 ('<a href="#explorer">blood oxygen (SpO₂)</a>',
  '<a href="/atmosphere-explorer">blood oxygen (SpO₂)</a>'),
], "fix-link")
patch("power-curve.html", [
 ('<a id="usePcDa">↑ use the density altitude from above</a>',
  'Get your number from the <a href="/">density altitude calculator</a> first.'),
], "stale-link")

# ---- 5. Title/meta trims ----
patch("atmosphere-explorer.html", [
 ('<title>Atmosphere & Hypoxia Explorer — Air, O₂ & SpO₂ vs Altitude | DensityAlt</title>',
  '<title>Atmosphere & Hypoxia Explorer — O₂ & SpO₂ vs Altitude</title>'),
], "title")
patch("cabin-altitude-calculator.html", [
 ('<title>Cabin Altitude Calculator — Cabin Pressure at Cruise | DensityAlt</title>',
  '<title>Cabin Altitude Calculator — Pressure at Cruise</title>'),
], "title")
patch("crosswind-calculator.html", [
 ('<title>Crosswind Calculator — Crosswind & Headwind Components | DensityAlt</title>',
  '<title>Crosswind Calculator — Runway Wind Components</title>'),
 ('content="Free visual crosswind calculator: enter runway heading and wind, or drag the wind around the runway, to get crosswind and headwind/tailwind components in knots."',
  'content="Free visual crosswind calculator: enter runway heading and wind, or drag the wind around the runway, for crosswind and headwind components in knots."'),
], "title")
patch("takeoff-landing-distance.html", [
 ('<title>Takeoff & Landing Distance Calculator (Density Altitude) | DensityAlt</title>',
  '<title>Takeoff & Landing Distance Calculator (Koch Chart)</title>'),
 ('content="Free takeoff & landing distance calculator: how much density altitude lengthens your ground roll and rollout, plus climb-rate loss. Interactive FAA Koch chart."',
  'content="Free takeoff & landing distance calculator: how density altitude lengthens ground roll and rollout, plus climb-rate loss. Interactive FAA Koch chart."'),
], "title")
patch("learn/density-altitude.html", [
 ('<title>What Is Density Altitude? A Pilot’s Guide (+ Calculator) | DensityAlt</title>',
  '<title>What Is Density Altitude? A Pilot’s Guide (+ Calculator)</title>'),
 ('content="What density altitude is, how to calculate it, and what it does to takeoff, climb, and landing — a clear pilot’s guide with a built-in density altitude calculator."',
  'content="What density altitude is, how to calculate it, and what it does to takeoff, climb, and landing — a pilot’s guide with a built-in calculator."'),
], "title")

print("PATCHED:")
for c in changed: print(" ", c)
