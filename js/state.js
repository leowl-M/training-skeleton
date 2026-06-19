// ===== js/state.js — stato e parametri: globali, definizione knob (SL), pannelli, conv(), edit scope, bombature =====
let cur = 0,
  font = {},
  glyphColor = "#f4f4f4",
  mostra = true,
  galleryOn = true,
  celle = null,
  dirty = true,
  cache = null,
  zoom = 1,
  disp = "fill",
  word = "",
  union0 = true,
  kern = {},
  kclassMode = false,
  autoSpace = false,
  editMode = false,
  skelEdits = {},
  glyphLock = {},
  compFree = {},
  traceFont = null,
  traceOn = false,
  abTexts = ["Handgloves", "Handgloves", "Handgloves"],
  abEdit = null,
  glyphRaw = {},
  imported = {},
  edDrag = null,
  edHover = null,
  edTX = null,
  edSel = [],
  edBand = null,
  edStrip = 1e9,
  drawMode = false,
  edPending = null,
  rectMode = false,
  edRect = null,
  glyphClip = null,
  panX = 0,
  panY = 0,
  spaceDown = false,
  panDrag = null,
  edSnap = null,
  masters = { A: null, B: null },
  masterCur = "A",
  interT = 0,
  lintOn = false,
  lintCache = null,
  cmpAB = false,
  fxOn = false,
  fxLayer = {
    wob: 0,
    rough: 0,
    glitchN: 0,
    twist: 0,
    inflate: 0,
    stepGrid: 0,
    vortex: 0,
  };
masters.A = font;
function unionPolys(polys) {
  if (typeof polygonClipping === "undefined" || polys.length < 2) return polys;
  try {
    const mp = polys.map((pg) => [
      pg.outer.map((p) => [p.x, p.y]),
      ...pg.holes.map((h) => h.map((p) => [p.x, p.y])),
    ]);
    const res = polygonClipping.union(mp[0], ...mp.slice(1));
    const out = [];
    for (const poly of res)
      out.push({
        outer: poly[0].map(([x, y]) => ({ x, y })),
        holes: poly.slice(1).map((r) => r.map(([x, y]) => ({ x, y }))),
      });
    return out.length ? out : polys;
  } catch (e) {
    return polys;
  }
}
function roundRing(ring, rOut, rIn, isHole) {
  let P = ring;
  if (
    P.length > 2 &&
    Math.hypot(P[0].x - P[P.length - 1].x, P[0].y - P[P.length - 1].y) < 1e-6
  )
    P = P.slice(0, -1);
  const n = P.length;
  if (n < 3 || (rOut <= 0 && rIn <= 0)) return ring;
  const ccw = areaP(P) > 0,
    out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n],
      v = P[i],
      b = P[(i + 1) % n];
    let d1x = v.x - a.x,
      d1y = v.y - a.y,
      l1 = Math.hypot(d1x, d1y) || 1;
    d1x /= l1;
    d1y /= l1;
    let d2x = b.x - v.x,
      d2y = b.y - v.y,
      l2 = Math.hypot(d2x, d2y) || 1;
    d2x /= l2;
    d2y /= l2;
    if (d1x * d2x + d1y * d2y > 0.985) {
      out.push({ x: v.x, y: v.y });
      continue;
    }
    const cross = d1x * d2y - d1y * d2x,
      convexInk = (cross > 0 === ccw) !== !!isHole,
      r = convexInk ? rOut : rIn;
    if (r <= 0) {
      out.push({ x: v.x, y: v.y });
      continue;
    }
    const t = Math.min(r, l1 * 0.5, l2 * 0.5),
      p1 = { x: v.x - d1x * t, y: v.y - d1y * t },
      p2 = { x: v.x + d2x * t, y: v.y + d2y * t };
    for (let k = 0; k <= 8; k++) {
      const u = k / 8,
        w = 1 - u;
      out.push({
        x: w * w * p1.x + 2 * w * u * v.x + u * u * p2.x,
        y: w * w * p1.y + 2 * w * u * v.y + u * u * p2.y,
      });
    }
  }
  return out;
}
function roundPolys(polys, rOut, rIn) {
  return polys.map((pg) => ({
    outer: roundRing(pg.outer, rOut, rIn, false),
    holes: pg.holes.map((h) => roundRing(h, rOut, rIn, true)),
  }));
}
// offset di un anello lungo le normali (dn>0 gonfia l'inchiostro, dn<0 lo restringe)
function blowRing(ring, dn) {
  const n = ring.length;
  if (n < 3) return ring;
  const sgn = areaP(ring) > 0 ? -1 : 1,
    o = [];
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n],
      b = ring[i],
      c = ring[(i + 1) % n];
    let nx = -(c.y - a.y),
      ny = c.x - a.x;
    const L = Math.hypot(nx, ny) || 1;
    o.push({ x: b.x + (nx / L) * dn * sgn, y: b.y + (ny / L) * dn * sgn });
  }
  return o;
}
function blowPolys(polys, dn) {
  return polys.map((pg) => ({
    outer: blowRing(pg.outer, dn),
    holes: pg.holes.map((h) => blowRing(h, dn)),
  }));
}
const mbToMP = (ms) =>
  ms.map((pg) => [
    pg.outer.map((p) => [p.x, p.y]),
    ...pg.holes.map((h) => h.map((p) => [p.x, p.y])),
  ]);
const mpToMb = (res) =>
  res.map((poly) => ({
    outer: poly[0].map(([x, y]) => ({ x, y })),
    holes: poly.slice(1).map((r) => r.map(([x, y]) => ({ x, y }))),
  }));
// inline/incisa: scava un solco sottile interno parallelo al contorno
function inlinePolys(mb, d, gw) {
  if (typeof polygonClipping === "undefined") return mb;
  try {
    const insA = mbToMP(blowPolys(mb, -d)),
      insB = mbToMP(blowPolys(mb, -(d + gw))),
      groove = polygonClipping.difference(insA, insB),
      res = polygonClipping.difference(mbToMP(mb), groove);
    return res.length ? mpToMb(res) : mb;
  } catch (e) {
    return mb;
  }
}
// stencil: sottrae bande orizzontali (bridge) per spezzare i tratti
function stencilPolys(mb, gap, y0, y1) {
  if (typeof polygonClipping === "undefined") return mb;
  try {
    let xn = 1e9,
      xx = -1e9;
    for (const pg of mb)
      for (const v of pg.outer) {
        if (v.x < xn) xn = v.x;
        if (v.x > xx) xx = v.x;
      }
    const bands = [0.5, 0.2, 0.8].map((f) => {
      const yc = y0 + (y1 - y0) * f;
      return [
        [
          [xn - 9, yc - gap / 2],
          [xx + 9, yc - gap / 2],
          [xx + 9, yc + gap / 2],
          [xn - 9, yc + gap / 2],
        ],
      ];
    });
    const res = polygonClipping.difference(mbToMP(mb), ...bands);
    return res.length ? mpToMb(res) : mb;
  } catch (e) {
    return mb;
  }
}
// ink trap post-union: scava la tacca nei vertici concavi dell'inchiostro (crotch)
// dell'outline già fuso — per-tratto verrebbe coperta dai tratti sovrapposti (set duplex)
function trapRing(ring, trap, tMin, tMax, isHole, shape) {
  let P = ring;
  if (
    P.length > 2 &&
    Math.hypot(P[0].x - P[P.length - 1].x, P[0].y - P[P.length - 1].y) < 1e-6
  )
    P = P.slice(0, -1);
  const n = P.length;
  if (n < 3) return ring;
  const ccw = areaP(P) > 0,
    out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n],
      v = P[i],
      b = P[(i + 1) % n];
    let d1x = v.x - a.x,
      d1y = v.y - a.y,
      l1 = Math.hypot(d1x, d1y) || 1;
    d1x /= l1;
    d1y /= l1;
    let d2x = b.x - v.x,
      d2y = b.y - v.y,
      l2 = Math.hypot(d2x, d2y) || 1;
    d2x /= l2;
    d2y /= l2;
    const tau = Math.acos(
      Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y)),
    );
    if (tau < tMin || tau > tMax) {
      out.push({ x: v.x, y: v.y });
      continue;
    }
    const cross = d1x * d2y - d1y * d2x,
      convexInk = (cross > 0 === ccw) !== !!isHole;
    if (convexInk) {
      out.push({ x: v.x, y: v.y });
      continue;
    }
    const sh = Math.min(1, (tau - tMin) / Math.max(0.02, tMax - tMin)),
      d = trap * sh,
      // bx,by bisetta il cuneo d'inchiostro: la punta della tacca affonda lì
      bx = d1x - d2x,
      by = d1y - d2y,
      bl = Math.hypot(bx, by) || 1,
      ux = bx / bl,
      uy = by / bl,
      back = Math.min(d, l1 * 0.4, l2 * 0.4);
    if (shape === "round") {
      const b1x = v.x - d1x * back,
        b1y = v.y - d1y * back,
        b2x = v.x + d2x * back,
        b2y = v.y + d2y * back,
        cxp = v.x + ux * d * 1.3,
        cyp = v.y + uy * d * 1.3,
        N = 6;
      for (let k = 0; k <= N; k++) {
        const t = k / N,
          mt = 1 - t;
        out.push({
          x: mt * mt * b1x + 2 * mt * t * cxp + t * t * b2x,
          y: mt * mt * b1y + 2 * mt * t * cyp + t * t * b2y,
        });
      }
    } else if (shape === "flat" || shape === "slit") {
      const w = shape === "slit" ? Math.min(back, d * 0.28) : back,
        dd = shape === "slit" ? d * 1.15 : d,
        b1x = v.x - d1x * w,
        b1y = v.y - d1y * w,
        b2x = v.x + d2x * w,
        b2y = v.y + d2y * w;
      out.push({ x: b1x, y: b1y });
      out.push({ x: b1x + ux * dd, y: b1y + uy * dd });
      out.push({ x: b2x + ux * dd, y: b2y + uy * dd });
      out.push({ x: b2x, y: b2y });
    } else {
      out.push({ x: v.x - d1x * back, y: v.y - d1y * back });
      out.push({ x: v.x + ux * d, y: v.y + uy * d });
      out.push({ x: v.x + d2x * back, y: v.y + d2y * back });
    }
  }
  return out;
}
function trapPolys(polys, trap, tMin, tMax, shape) {
  return polys.map((pg) => ({
    outer: trapRing(pg.outer, trap, tMin, tMax, false, shape),
    holes: pg.holes.map((h) => trapRing(h, trap, tMin, tMax, true, shape)),
  }));
}
function bulge(pts, amt, closed) {
  const n = pts.length;
  if (n < 3 || !amt) return pts;
  const res = pts.map((p) => {
    const r = [p[0], p[1]];
    if (p[2]) r[2] = p[2];
    return r;
  });
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = pts[(i - 1 + n) % n],
      b = pts[i],
      c = pts[(i + 1) % n];
    let d1x = b[0] - a[0],
      d1y = b[1] - a[1],
      d2x = c[0] - b[0],
      d2y = c[1] - b[1];
    const l1 = Math.hypot(d1x, d1y) || 1,
      l2 = Math.hypot(d2x, d2y) || 1;
    if ((d1x * d2x + d1y * d2y) / (l1 * l2) < 0.5) continue;
    const mx = (a[0] + c[0]) / 2 - b[0],
      my = (a[1] + c[1]) / 2 - b[1];
    res[i][0] = b[0] - mx * amt;
    res[i][1] = b[1] - my * amt;
  }
  return res;
}
// bombatura per quadrante (ne/se/sw/nw) e per verso (convessa/concava rispetto al centro del glifo)
function bulgeQuad(pts, closed, q, cx, cy) {
  const n = pts.length;
  if (n < 3) return pts;
  const res = pts.map((p) => {
    const r = [p[0], p[1]];
    if (p[2]) r[2] = p[2];
    return r;
  });
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = pts[(i - 1 + n) % n],
      b = pts[i],
      c = pts[(i + 1) % n];
    const d1x = b[0] - a[0],
      d1y = b[1] - a[1],
      d2x = c[0] - b[0],
      d2y = c[1] - b[1],
      l1 = Math.hypot(d1x, d1y) || 1,
      l2 = Math.hypot(d2x, d2y) || 1;
    if ((d1x * d2x + d1y * d2y) / (l1 * l2) < 0.5) continue;
    const mx = (a[0] + c[0]) / 2 - b[0],
      my = (a[1] + c[1]) / 2 - b[1],
      ox = b[0] - cx,
      oy = b[1] - cy;
    const key =
      (mx * ox + my * oy < 0 ? "cvx" : "cnc") +
      (oy < 0 ? "N" : "S") +
      (ox >= 0 ? "E" : "W");
    const amt = q[key] || 0;
    if (!amt) continue;
    res[i][0] -= mx * amt;
    res[i][1] -= my * amt;
  }
  return res;
}
const CUR = () => SET()[cur];
const gcols = (n) => (n <= 13 ? n : Math.ceil(n / 2));
let viewMode = "single",
  editScope = "single",
  allCase = "upper",
  caseBtns = [];
function targets() {
  // se c'è un testo personalizzato, le modifiche dai pannelli vanno su TUTTE le sue lettere
  const w = (word || "").trim();
  if (w) {
    const seen = {},
      out = [];
    for (const ch of w)
      if (!seen[ch] && font[ch]) {
        seen[ch] = 1;
        out.push(ch);
      }
    if (out.length) return out;
  }
  if (editScope === "global") return SETS[allCase].chars;
  if (editScope === "pair") {
    const c = CUR(),
      o = c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase();
    return o !== c && font[o] ? [c, o] : [c];
  }
  return [CUR()];
}
function editParam(id, v) {
  for (const c of targets()) {
    if (compLinked(c)) detachComposite(c); // editi un accentato linkato → si scollega
    font[c][id] = v;
  }
  schedPersist();
}
function editTog(key, v) {
  for (const c of targets()) {
    if (compLinked(c)) detachComposite(c);
    font[c][key] = v;
  }
  schedPersist();
}
function selectChar(ch) {
  for (const k in SETS) {
    const i = SETS[k].chars.indexOf(ch);
    if (i >= 0) {
      setKey = k;
      cur = i;
      return;
    }
  }
}
const SL = [
  {
    id: "peso",
    l: "Weight",
    min: 2,
    max: 46,
    def: 12,
    f: (v) => (v / 100).toFixed(2),
  },
  {
    id: "contrasto",
    l: "Contrasto",
    min: 0,
    max: 85,
    def: 0,
    f: (v) => v + "%",
  },
  {
    id: "altezza",
    l: "Height",
    min: 50,
    max: 140,
    def: 100,
    f: (v) => v + "%",
  },
  {
    id: "larghezza",
    l: "Width",
    min: 35,
    max: 175,
    def: 100,
    f: (v) => v + "%",
  },
  {
    id: "mid",
    l: "Crossbar",
    min: 28,
    max: 72,
    def: 50,
    f: (v) => (v / 100).toFixed(2),
  },
  {
    id: "xheight",
    l: "x-Height",
    min: 45,
    max: 82,
    def: 67,
    f: (v) => v + "%",
  },
  { id: "asc", l: "Ascender", min: -10, max: 25, def: 0, f: (v) => v + "%" },
  {
    id: "desc",
    l: "Descender",
    min: 40,
    max: 160,
    def: 100,
    f: (v) => v + "%",
  },
  {
    id: "spaz",
    l: "Spacing",
    min: -6,
    max: 45,
    def: 6,
    f: (v) => (v / 100).toFixed(2),
  },
  {
    id: "lsb",
    l: "LSB",
    min: -20,
    max: 40,
    def: 0,
    f: (v) => (v / 100).toFixed(2),
  },
  {
    id: "rsb",
    l: "RSB",
    min: -20,
    max: 40,
    def: 0,
    f: (v) => (v / 100).toFixed(2),
  },
  {
    id: "mono",
    l: "Mono Aspect",
    min: 0,
    max: 100,
    def: 0,
    f: (v) => v + "%",
  },
  { id: "slant", l: "Slant", min: -55, max: 55, def: 0, f: (v) => v },
  { id: "rot", l: "Glyph rot", min: -45, max: 45, def: 0, f: (v) => v + "°" },
  { id: "penang", l: "Pen angle", min: -90, max: 90, def: 0, f: (v) => v + "°" },
  { id: "apice", l: "Miter", min: 1, max: 14, def: 4, f: (v) => v },
  { id: "apxOff", l: "Apex off", min: -22, max: 22, def: 0, f: (v) => v },
  { id: "apxThin", l: "Apex thin", min: 0, max: 60, def: 0, f: (v) => v + "%" },
  {
    id: "tang",
    l: "Term. angle",
    min: -60,
    max: 60,
    def: 0,
    f: (v) => v + "°",
  },
  { id: "inktrap", l: "Ink trap", min: 0, max: 24, def: 0, f: (v) => v },
  {
    id: "sLen",
    l: "Serif len",
    min: 2,
    max: 28,
    def: 9,
    f: (v) => (v / 100).toFixed(2),
  },
  {
    id: "sThk",
    l: "Serif thk",
    min: 2,
    max: 24,
    def: 6,
    f: (v) => (v / 100).toFixed(2),
  },
  { id: "caos", l: "Deform", min: 0, max: 34, def: 0, f: (v) => v },
  { id: "onda", l: "Wave", min: 0, max: 34, def: 0, f: (v) => v },
  { id: "ondaFreq", l: "Wave frq", min: 1, max: 9, def: 3, f: (v) => v },
  {
    id: "overshoot",
    l: "Overshoot",
    min: 0,
    max: 8,
    def: 0,
    f: (v) => v + "%",
  },
  { id: "convex", l: "Convex", min: -45, max: 60, def: 0, f: (v) => v + "%" },
  { id: "taper", l: "Taper", min: 0, max: 55, def: 0, f: (v) => v + "%" },
  { id: "corner", l: "Round out", min: 0, max: 22, def: 0, f: (v) => v },
  { id: "cornerIn", l: "Round in", min: 0, max: 22, def: 0, f: (v) => v },
  { id: "cvxNE", l: "Cvx NE", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cvxSE", l: "Cvx SE", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cvxSW", l: "Cvx SW", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cvxNW", l: "Cvx NW", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cncNE", l: "Cnc NE", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cncSE", l: "Cnc SE", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cncSW", l: "Cnc SW", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "cncNW", l: "Cnc NW", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  {
    id: "pressIn",
    l: "Press. in",
    min: 30,
    max: 170,
    def: 100,
    f: (v) => v + "%",
  },
  {
    id: "pressOut",
    l: "Press. out",
    min: 30,
    max: 170,
    def: 100,
    f: (v) => v + "%",
  },
  { id: "gravity", l: "Gravity", min: -50, max: 50, def: 0, f: (v) => v + "%" },
  { id: "vortex", l: "Vortex", min: -90, max: 90, def: 0, f: (v) => v + "°" },
  { id: "stepGrid", l: "Pixel", min: 0, max: 30, def: 0, f: (v) => v },
  { id: "twist", l: "Twist", min: -60, max: 60, def: 0, f: (v) => v + "°" },
  { id: "bend", l: "Bend", min: -50, max: 50, def: 0, f: (v) => v + "%" },
  { id: "lens", l: "Lente", min: -50, max: 50, def: 0, f: (v) => v + "%" },
  { id: "persp", l: "Prospett.", min: -60, max: 60, def: 0, f: (v) => v + "%" },
  { id: "skewY", l: "Skew vert", min: -40, max: 40, def: 0, f: (v) => v + "%" },
  { id: "wob", l: "Wobble", min: 0, max: 45, def: 0, f: (v) => v + "%" },
  { id: "wobFreq", l: "Wob frq", min: 1, max: 12, def: 4, f: (v) => v },
  { id: "rough", l: "Ruvido", min: 0, max: 30, def: 0, f: (v) => v },
  { id: "inflate", l: "Gonfia", min: -25, max: 25, def: 0, f: (v) => v },
  { id: "glitchN", l: "Glitch n", min: 0, max: 12, def: 0, f: (v) => v },
  { id: "glitchOff", l: "Glitch off", min: -30, max: 30, def: 10, f: (v) => v },
  {
    id: "trapMin",
    l: "Trap min",
    min: 20,
    max: 150,
    def: 60,
    f: (v) => v + "°",
  },
  {
    id: "trapMax",
    l: "Trap max",
    min: 60,
    max: 180,
    def: 170,
    f: (v) => v + "°",
  },
  { id: "eco", l: "Echo", min: 0, max: 8, def: 0, f: (v) => v },
  { id: "ecoOff", l: "Echo gap", min: 1, max: 34, def: 8, f: (v) => v },
  { id: "inline", l: "Inline", min: 0, max: 16, def: 0, f: (v) => v },
  { id: "stencil", l: "Stencil", min: 0, max: 24, def: 0, f: (v) => v },
];
const TOG = {
  pen: {
    l: "Forma penna",
    opts: [
      ["ellipse", "Ellisse"],
      ["rect", "Rettang."],
      ["pointed", "Appuntito"],
    ],
  },
  cap: {
    l: "Terminale",
    opts: [
      ["butt", "Dritto"],
      ["round", "Tondo"],
      ["ball", "Ball"],
      ["flared", "Svasato"],
      ["beak", "Beak"],
    ],
  },
  join: {
    l: "Giunzione",
    opts: [
      ["miter", "Punta"],
      ["bevel", "Smusso"],
      ["round", "Tonda"],
    ],
  },
  serif: {
    l: "Grazie",
    opts: [
      ["none", "Sans"],
      ["slab", "Slab"],
      ["wedge", "Wedge"],
      ["bracketed", "Bracket"],
      ["hairline", "Hairline"],
      ["cupped", "Coppa"],
    ],
  },
  dot: {
    l: "Punto (i j)",
    opts: [
      ["round", "Tondo"],
      ["square", "Quadro"],
    ],
  },
  trapShape: {
    l: "Forma trap",
    opts: [
      ["triangle", "Triangolo"],
      ["round", "Tondo"],
      ["slit", "Fessura"],
      ["flat", "Piatto"],
    ],
  },
};
const PANELS = [
  {
    id: "stroke",
    t: "Stroke",
    col: "L",
    y: 62,
    viz: "pen",
    desc: "Forma e spessore del tratto. Trascina la penna nell'anteprima.",
    tabs: [
      {
        n: "Penna",
        knobs: ["peso", "contrasto", "penang"],
        h: "Weight = larghezza nib (tratto spesso). Contrasto = quanto è sottile l'asse stretto. Pen angle ruota la nib: il contrasto segue la rotazione.",
      },
      {
        n: "Trasf.",
        knobs: ["slant", "rot"],
        h: "Slant inclina come un corsivo. Glyph rot ruota l'intero glifo.",
      },
    ],
    togs: ["pen", "cap", "join"],
  },
  {
    id: "metrics",
    t: "Metrics",
    col: "L",
    y: 352,
    viz: "metrics",
    desc: "Altezze e proporzioni. Trascina le linee guida nell'anteprima.",
    tabs: [
      {
        n: "Altezze",
        knobs: ["xheight", "asc", "desc"],
        h: "x-Height = corpo delle minuscole. Ascender/Descender = sporgenze sopra/sotto.",
      },
      {
        n: "Scala",
        knobs: ["altezza", "mid"],
        h: "Height scala in verticale. Crossbar alza/abbassa la barra di A E F H…",
      },
      {
        n: "Orizz.",
        knobs: ["larghezza", "spaz", "lsb", "rsb", "mono"],
        h: "Width = larghezza glifo. Spacing = aria simmetrica. LSB/RSB = aria per-lato. Mono Aspect = avvicina a monospazio.",
      },
    ],
  },
  {
    id: "curves",
    t: "Curves",
    col: "R",
    y: 62,
    viz: "curves",
    desc: "Curvatura e dettaglio dei contorni.",
    tabs: [
      {
        n: "Forma",
        knobs: ["overshoot", "convex", "taper", "corner", "cornerIn"],
        h: "Overshoot sporge i tondi oltre le linee. Convex bomba i lati. Round arrotonda gli spigoli.",
      },
      {
        n: "Quadr.",
        knobs: [
          "cvxNE",
          "cvxSE",
          "cvxSW",
          "cvxNW",
          "cncNE",
          "cncSE",
          "cncSW",
          "cncNW",
        ],
        h: "Bombatura (cvx) e concavità (cnc) per ogni quadrante: NE/SE/SW/NW.",
      },
      {
        n: "Distors.",
        knobs: ["caos", "onda", "ondaFreq"],
        h: "Deform sposta i nodi a caso. Wave ondula il contorno (Freq = numero onde).",
      },
      {
        n: "Extra",
        knobs: ["inktrap", "trapMin", "trapMax", "eco", "ecoOff", "inline", "stencil"],
        h: "Ink trap scava le giunzioni strette (forma sotto). Echo duplica in ombra. Inline incide un solco interno. Stencil spezza i tratti.",
      },
    ],
    togs: ["trapShape"],
  },
  {
    id: "lab",
    t: "Lab",
    col: "R",
    y: 120,
    viz: "lab",
    desc: "Effetti sperimentali sul singolo glifo. Led header = bypass.",
    tabs: [
      {
        n: "Peso",
        knobs: ["pressIn", "pressOut", "gravity", "wob", "wobFreq"],
        h: "Pressione modula lo spessore in entrata/uscita. Gravity tira il peso, Wobble trema.",
      },
      {
        n: "Spazio",
        knobs: ["vortex", "twist", "bend", "lens", "persp", "skewY"],
        h: "Vortex/Twist/Bend piegano lo spazio del glifo. Lente e Prospettiva deformano in profondità.",
      },
      {
        n: "Glitch",
        knobs: ["rough", "inflate", "glitchN", "glitchOff", "stepGrid"],
        h: "Ruvido sporca i bordi, Gonfia ingrassa, Glitch taglia a fasce, Pixel quantizza.",
      },
      {
        n: "FX",
        fx: true,
        h: "Layer FX globale: effetti su TUTTO l'alfabeto, reversibili e non distruttivi. Accendi e gira i knob.",
      },
    ],
  },
  {
    id: "terminal",
    t: "Terminal",
    col: "R",
    y: 352,
    viz: "terminal",
    desc: "Apici, terminali e grazie.",
    tabs: [
      {
        n: "Apex",
        knobs: ["apice", "apxOff", "apxThin"],
        h: "Punta di A V M W: trascina la punta nell'anteprima. Miter = quanto è acuta.",
      },
      {
        n: "Termin.",
        knobs: ["tang", "sLen", "sThk"],
        h: "Term. angle taglia i terminali in obliquo. Serif len/thk = grazie (con Grazie ≠ Sans).",
      },
    ],
    togs: ["serif", "dot"],
  },
];
// layer FX globale: effetti Lab additivi su TUTTI i glifi, reversibile e non distruttivo
// (i parametri per-glifo non vengono toccati: l'overlay si somma solo in fontR a render/export)
const FXKEYS = ["wob", "rough", "glitchN", "twist", "inflate", "stepGrid", "vortex"];
const SLById = (() => {
  const m = {};
  for (const s of SL) m[s.id] = s;
  return m;
})();
function applyFX(base) {
  const out = Object.assign({}, base);
  for (const k of FXKEYS) {
    const s = SLById[k];
    let v = (base[k] || 0) + (fxLayer[k] || 0);
    if (s) v = Math.max(s.min, Math.min(s.max, v));
    out[k] = Math.round(v);
  }
  return out;
}
// parametri per il RENDERING: interpolazione A↔B quando esiste il master B (+ layer FX globale)
// component glyph: un accentato (COMPOSITES) eredita i parametri del glifo base
// finché è "linkato"; scollegandolo usa parametri propri.
function compLinked(ch) {
  return !!(typeof COMPOSITES !== "undefined" && COMPOSITES[ch] && !compFree[ch]);
}
function detachComposite(ch) {
  if (!COMPOSITES[ch]) return;
  // semina i parametri propri dalla base corrente → nessun salto visivo
  font[ch] = JSON.parse(JSON.stringify(font[COMPOSITES[ch][0]]));
  compFree[ch] = true;
}
function relinkComposite(ch) {
  delete compFree[ch];
}
function fontR(ch) {
  if (glyphLock[ch]) return glyphLock[ch];
  const src = compLinked(ch) ? COMPOSITES[ch][0] : ch;
  const base = fontBase(src);
  return fxOn ? applyFX(base) : base;
}
// lock glifo: congela i parametri RISOLTI (post interpolazione + FX) → glifo "finale",
// immune a slider globali, interpolazione master e layer FX finché non si sblocca.
function glyphLocked(ch) {
  return !!glyphLock[ch];
}
function lockGlyph(ch) {
  const base = fontBase(ch);
  glyphLock[ch] = JSON.parse(JSON.stringify(fxOn ? applyFX(base) : base));
}
function unlockGlyph(ch) {
  delete glyphLock[ch];
}
function fontBase(ch) {
  const A = masters.A[ch];
  if (!masters.B || interT <= 0) return A;
  const B = masters.B[ch];
  if (!B) return A;
  if (interT >= 1) return B;
  const o = {};
  for (const s of SL)
    o[s.id] = Math.round(A[s.id] + (B[s.id] - A[s.id]) * interT);
  for (const k of ["serif", "join", "cap", "dot", "pen"])
    o[k] = interT < 0.5 ? A[k] : B[k];
  o.seme = A.seme;
  return o;
}
function def0() {
  const o = {
    serif: "none",
    join: "miter",
    cap: "butt",
    dot: "round",
    pen: "ellipse",
    trapShape: "triangle",
    seme: Math.floor(Math.random() * 99999),
  };
  for (const s of SL) o[s.id] = s.def;
  return o;
}
function initFont() {
  for (const c of ALLCHARS) font[c] = def0();
}
function conv(r) {
  return {
    pen: r.pen || "ellipse",
    peso: r.peso / 100,
    // model B (broad-nib): asse stretto = weight × (1-contrasto). Niente knob bar separato.
    bar: (r.peso / 100) * (1 - (r.contrasto || 0) / 100),
    altezza: r.altezza / 100,
    larghezza: r.larghezza / 100,
    mid: r.mid / 100,
    xh: r.xheight / 100,
    asc: r.asc / 100,
    desc: r.desc / 100,
    spaz: r.spaz / 100,
    lsb: (r.lsb || 0) / 100,
    rsb: (r.rsb || 0) / 100,
    mono: (r.mono || 0) / 100,
    slant: r.slant / 100,
    rot: (r.rot * Math.PI) / 180,
    penang: (r.penang * Math.PI) / 180,
    tang: (r.tang * Math.PI) / 180,
    serif: r.serif,
    join: r.join,
    cap: r.cap,
    miterLimit: r.apice,
    apxOff: r.apxOff / 100,
    apxThin: r.apxThin / 100,
    inktrap: r.inktrap / 100,
    sLen: r.sLen / 100,
    sThk: r.sThk / 100,
    oversh: r.overshoot / 100,
    convex: r.convex / 100,
    taper: r.taper / 100,
    corner: r.corner / 100,
    cornerIn: (r.cornerIn || 0) / 100,
    dot: r.dot,
    pressIn: (r.pressIn || 100) / 100,
    pressOut: (r.pressOut || 100) / 100,
    gravity: (r.gravity || 0) / 100,
    vortex: ((r.vortex || 0) * Math.PI) / 180,
    stepGrid: (r.stepGrid || 0) / 100,
    twist: ((r.twist || 0) * Math.PI) / 180,
    bend: (r.bend || 0) / 100,
    lens: (r.lens || 0) / 100,
    persp: (r.persp || 0) / 100,
    skewY: (r.skewY || 0) / 100,
    wob: (r.wob || 0) / 100,
    wobFreq: r.wobFreq || 4,
    rough: (r.rough || 0) / 100,
    inflate: (r.inflate || 0) / 100,
    glitchN: r.glitchN || 0,
    glitchOff: (r.glitchOff || 0) / 100,
    quad: {
      cvxNE: (r.cvxNE || 0) / 100,
      cvxSE: (r.cvxSE || 0) / 100,
      cvxSW: (r.cvxSW || 0) / 100,
      cvxNW: (r.cvxNW || 0) / 100,
      cncNE: (r.cncNE || 0) / 100,
      cncSE: (r.cncSE || 0) / 100,
      cncSW: (r.cncSW || 0) / 100,
      cncNW: (r.cncNW || 0) / 100,
    },
    quadOn: !!(
      r.cvxNE ||
      r.cvxSE ||
      r.cvxSW ||
      r.cvxNW ||
      r.cncNE ||
      r.cncSE ||
      r.cncSW ||
      r.cncNW
    ),
    trapMin: ((r.trapMin || 60) * Math.PI) / 180,
    trapMax: ((r.trapMax || 170) * Math.PI) / 180,
    caos: r.caos / 100,
    onda: r.onda / 100,
    ondaFreq: r.ondaFreq,
    eco: Math.round(r.eco),
    ecoOff: r.ecoOff / 100,
    trapShape: r.trapShape || "triangle",
    inline: (r.inline || 0) / 100,
    stencil: (r.stencil || 0) / 100,
    seme: r.seme,
    sb: 0.05,
  };
}
