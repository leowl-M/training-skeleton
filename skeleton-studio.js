// ===== skeleton-studio.js — editor scheletri base con preview del TRATTO PENNA =====
// Evoluzione standalone di base-editor: oltre alla centerline mostra l'outline reale
// inkata dal motore (costr) per verificare visivamente la saldatura dei nodi.
// Riusa il motore parametrico (data/geometry/state/base/engine.js) in sola lettura.

// --- shim per i globali che il motore si aspetta dall'app principale ---
// NB: `bypass` è già dichiarato globale da base.js (default tutto false → applyBypass
// passa i parametri inalterati): NON ridichiararlo qui o collide ("already declared").
// `noise` (Perlin di p5 nell'app): qui basta un value-noise deterministico 0..1,
// serve solo se peso/effetti caos>0 — coi parametri di preview non viene chiamato.
if (typeof noise === "undefined")
  var noise = function (x, y) {
    y = y || 0;
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

const LS_KEY = "ht_base_custom";
const TAU2 = Math.PI * 2;
const clone = (o) => JSON.parse(JSON.stringify(o));

// stato di lavoro: parte da HERSHEY, sovrappone l'eventuale base salvata
let work = clone(HERSHEY);
try {
  const saved = localStorage.getItem(LS_KEY);
  if (saved) Object.assign(work, JSON.parse(saved));
} catch (e) {}

const CHARS = Object.keys(HERSHEY);
let gch = CHARS.includes("A") ? "A" : CHARS[0]; // glifo corrente (string)
let sel = null; // {ti, pi} — nodo primario (per campi/drag)
let selSet = []; // [{ti,pi}] — selezione multipla (Shift+click)
let drag = false;

// ---------- cronologia (undo / redo) ----------
// snapshot dell'intero `work` in JSON; begin prima della modifica, commit dopo.
const undoStack = [],
  redoStack = [];
const HIST_MAX = 200;
let histPending = null;
function beginHist() {
  histPending = JSON.stringify(work);
}
function persistWork() {
  // auto-save dei glifi modificati → reload non perde il lavoro
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(editedBase()));
  } catch (e) {}
}
function commitHist() {
  if (histPending != null && histPending !== JSON.stringify(work)) {
    undoStack.push(histPending);
    if (undoStack.length > HIST_MAX) undoStack.shift();
    redoStack.length = 0;
    persistWork();
  }
  histPending = null;
  updateHistBtns();
}
function afterHist() {
  sel = null;
  selSet = [];
  mode = "idle";
  const nb = document.getElementById("newStroke");
  if (nb) nb.classList.remove("on");
  buildGlyphs();
  render();
  updateHistBtns();
  persistWork();
}
function undo() {
  if (!undoStack.length) {
    toast("Niente da annullare");
    return;
  }
  redoStack.push(JSON.stringify(work));
  work = JSON.parse(undoStack.pop());
  afterHist();
}
function redo() {
  if (!redoStack.length) {
    toast("Niente da rifare");
    return;
  }
  undoStack.push(JSON.stringify(work));
  work = JSON.parse(redoStack.pop());
  afterHist();
}
function updateHistBtns() {
  const u = document.getElementById("undoBtn"),
    r = document.getElementById("redoBtn");
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}

// selezione multipla
function inSel(ti, pi) {
  return selSet.some((s) => s.ti === ti && s.pi === pi);
}
function toggleSel(h) {
  const i = selSet.findIndex((s) => s.ti === h.ti && s.pi === h.pi);
  if (i >= 0) selSet.splice(i, 1);
  else selSet.push({ ti: h.ti, pi: h.pi });
}
function setSel(h) {
  sel = h;
  selSet = h ? [{ ti: h.ti, pi: h.pi }] : [];
}
let mode = "idle"; // 'idle' | 'new'
// traceFont / traceOn sono già dichiarati come globali in state.js (script condiviso)

const cv = document.getElementById("cv"),
  cx = cv.getContext("2d");
const PAD = 90;
let scale = cv.height - 2 * PAD,
  originX = cv.width / 2;

// --- parametri penna per la preview: def0() + override "identità" delle metriche ---
// (azzero remap x-height/asc/desc, slant, warp, overshoot → il tratto inka lo
//  scheletro grezzo 1:1 con i nodi mostrati, così la saldatura è leggibile)
function makePen() {
  const p = def0();
  p.larghezza = 100;
  p.altezza = 100;
  p.slant = 0;
  p.rot = 0;
  p.mid = 50; // cbar = 0
  p.asc = 0;
  p.xheight = 66.7; // → remapYy identità sulle minuscole
  p.desc = 100;
  p.overshoot = 0;
  p.penang = 0;
  p.tang = 0;
  p.serif = "none";
  p.join = "miter";
  p.cap = "butt";
  p.pen = "ellipse";
  p.convex = 0;
  p.peso = 12;
  p.contrasto = 0;
  return p;
}
let pen = makePen();
let showStroke = true,
  diagOn = true,
  badJoins = 0,
  counterCount = 0,
  onionOn = false,
  wordText = "";
try {
  wordText = localStorage.getItem("ht_word") || "Handgloves";
} catch (e) {
  wordText = "Handgloves";
}

function curW() {
  return work[gch].w || 0.8;
}
function recalcOrigin() {
  originX = (cv.width - curW() * scale) / 2;
}
function W2S(x, y) {
  return { X: originX + x * scale, Y: PAD + y * scale };
}
function S2W(X, Y) {
  return { x: (X - originX) / scale, y: (Y - PAD) / scale };
}

// ---------- snap ----------
function snapVal(v, targets, thr) {
  for (const t of targets) if (Math.abs(v - t) < thr) return t;
  return v;
}
function snapPoint(x, y) {
  if (!document.getElementById("snap") || !document.getElementById("snap").checked) {
    // niente checkbox snap in questa UI → snap sempre attivo, leggero
  }
  const w = curW(),
    thr = 0.014;
  const xs = [0, w / 2, w],
    ys = [0, 0.25, 0.333, 0.5, 0.667, 0.75, 1];
  for (const tr of work[gch].tratti)
    for (let i = 0; i < tr.pts.length; i++) {
      if (sel && tr === work[gch].tratti[sel.ti] && i === sel.pi) continue;
      xs.push(tr.pts[i][0]);
      ys.push(tr.pts[i][1]);
    }
  return [snapVal(x, xs, thr), snapVal(y, ys, thr)];
}

// ---------- preview tratto penna (motore reale) ----------
function addRing(r) {
  for (let i = 0; i < r.length; i++)
    i ? cx.lineTo(r[i].x, r[i].y) : cx.moveTo(r[i].x, r[i].y);
  cx.closePath();
}
function drawStroke() {
  if (!showStroke) return;
  try {
    // inietto il glifo in editing dove il motore lo legge (srcGlifo → skelEdits)
    skelEdits[gch] = work[gch];
    union0 = document.getElementById("unionTog").checked;
    // penX=originX, capTop=PAD, size=scale, larghezza/altezza=100 → polys già in px canvas
    const r = costr(gch, pen, originX, PAD, scale);
    counterCount = r.polys.reduce((s, pg) => s + (pg.holes || []).length, 0);
    cx.save();
    cx.fillStyle = "rgba(120,130,150,0.30)";
    cx.strokeStyle = "rgba(90,100,120,0.55)";
    cx.lineWidth = 1;
    for (const pg of r.polys) {
      cx.beginPath();
      addRing(pg.outer);
      (pg.holes || []).forEach(addRing);
      cx.fill("evenodd");
      cx.beginPath();
      addRing(pg.outer);
      (pg.holes || []).forEach(addRing);
      cx.stroke();
    }
    cx.restore();
  } catch (e) {
    console.warn("preview tratto:", e);
  }
}

// ---------- diagnostica giunzioni ----------
function distSegN(px, py, ax, ay, bx, by) {
  const vx = bx - ax,
    vy = by - ay,
    L2 = vx * vx + vy * vy || 1;
  let t = ((px - ax) * vx + (py - ay) * vy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
// distanza minima (in coord normalizzate) da un estremo a QUALSIASI altro tratto
function minDistToOthers(x, y, selfTi) {
  let d = 1e9;
  const g = work[gch];
  for (let ti = 0; ti < g.tratti.length; ti++) {
    if (ti === selfTi) continue;
    const tr = g.tratti[ti],
      n = tr.pts.length,
      last = tr.chiuso ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = tr.pts[i],
        b = tr.pts[(i + 1) % n];
      d = Math.min(d, distSegN(x, y, a[0], a[1], b[0], b[1]));
    }
    if (last === 0 && n) d = Math.min(d, Math.hypot(x - tr.pts[0][0], y - tr.pts[0][1]));
  }
  return d;
}
// raggio del cerchio per 3 punti (normalizzati) — ∞ se collineari
function circR3(a, b, c) {
  const ax = a[0] - b[0],
    ay = a[1] - b[1],
    gx = c[0] - b[0],
    gy = c[1] - b[1],
    ar = Math.abs(ax * gy - ay * gx) / 2;
  if (ar < 1e-12) return 1e9;
  return (
    (Math.hypot(ax, ay) *
      Math.hypot(c[0] - a[0], c[1] - a[1]) *
      Math.hypot(gx, gy)) /
    (4 * ar)
  );
}
function drawDiag() {
  badJoins = 0;
  if (!diagOn) {
    renderDiagPanel(0, 0, 0);
    return;
  }
  const epsJN = Math.max((pen.peso / 100) * 0.7, 0.015),
    looseN = epsJN * 2.5;
  let welded = 0;
  const g = work[gch];
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    if (tr.chiuso || tr.pts.length < 2) continue;
    for (const pi of [0, tr.pts.length - 1]) {
      const p = tr.pts[pi],
        d = minDistToOthers(p[0], p[1], ti),
        s = W2S(p[0], p[1]);
      if (d <= epsJN) {
        welded++;
        cx.beginPath();
        cx.arc(s.X, s.Y, 7, 0, TAU2);
        cx.fillStyle = "rgba(40,190,120,0.9)";
        cx.fill();
      } else if (d <= looseN) {
        badJoins++;
        cx.beginPath();
        cx.arc(s.X, s.Y, 9, 0, TAU2);
        cx.strokeStyle = "#ff3b30";
        cx.lineWidth = 2.5;
        cx.stroke();
      }
      // terminali liberi (d > looseN): nessun marker, voluti
    }
  }
  // fold: nodo dove il raggio nib supera il raggio di curvatura locale → il lato
  // interno dell'offset si auto-interseca (cusp), la penna "si rompe" sulla curva.
  // ponytail: usa il raggio max (peso/2), ignora penang/contrasto → flag conservativo, anticipa il fold
  let folds = 0;
  const hwN = pen.peso / 100 / 2;
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti],
      n = tr.pts.length;
    if (n < 3) continue;
    const lo = tr.chiuso ? 0 : 1,
      hi = tr.chiuso ? n : n - 1;
    for (let i = lo; i < hi; i++) {
      const a = tr.pts[(i - 1 + n) % n],
        b = tr.pts[i],
        c = tr.pts[(i + 1) % n];
      if (circR3(a, b, c) < hwN) {
        folds++;
        const s = W2S(b[0], b[1]);
        cx.beginPath();
        cx.arc(s.X, s.Y, 8, 0, TAU2);
        cx.strokeStyle = "#ff9500";
        cx.lineWidth = 2.5;
        cx.stroke();
      }
    }
  }
  renderDiagPanel(welded, badJoins, folds);
}
function renderDiagPanel(welded, bad, folds) {
  const el = document.getElementById("diag");
  if (!diagOn) {
    el.innerHTML = "<b>Giunzioni</b><br><span style='color:var(--muted)'>diagnostica off</span>";
    return;
  }
  el.innerHTML =
    "<b>Giunzioni</b><br>" +
    "<span class='dot' style='background:rgba(40,190,120,0.9)'></span>" +
    welded +
    " saldate<br>" +
    "<span class='dot' style='background:#ff3b30'></span>" +
    bad +
    " staccate" +
    (bad ? " ⚠" : "") +
    "<br><span class='dot' style='background:#ff9500'></span>" +
    folds +
    " fold" +
    (folds ? " ⚠" : "") +
    "<br><span class='dot' style='background:#8090a6'></span>" +
    counterCount +
    " controforme" +
    (COUNTERS[gch] != null && COUNTERS[gch] !== counterCount
      ? " ⚠ atteso " + COUNTERS[gch]
      : "");
}
// controforme attese per i glifi non ambigui (g/s escluse: variano per stile)
const COUNTERS = {
  A: 1, B: 2, D: 1, O: 1, P: 1, Q: 1, R: 1,
  0: 1, 4: 1, 6: 1, 8: 2, 9: 1,
  a: 1, b: 1, d: 1, e: 1, o: 1, p: 1, q: 1,
};

// salda gli estremi liberi del glifo corrente: estremo→estremo coincidente, poi
// estremo→punto più vicino su un altro tratto. Chiude le giunzioni "staccate"
// (rosse in diagnostica) → merge+union ricreano le controforme, via il buco.
function saldaEstremi() {
  const g = work[gch],
    tol = Math.max((pen.peso / 100) * 0.7, 0.015) * 2.5,
    t2 = tol * tol;
  const ends = [];
  g.tratti.forEach((tr, ti) => {
    if (tr.chiuso || tr.pts.length < 2) return;
    for (const pi of [0, tr.pts.length - 1]) ends.push({ ti, p: tr.pts[pi] });
  });
  if (!ends.length) return toast("Nessun estremo da saldare");
  beginHist();
  // 1) estremo → estremo vicino
  for (let a = 0; a < ends.length; a++)
    for (let b = a + 1; b < ends.length; b++) {
      const dx = ends[a].p[0] - ends[b].p[0],
        dy = ends[a].p[1] - ends[b].p[1];
      if (dx * dx + dy * dy <= t2 && (dx || dy)) {
        ends[b].p[0] = ends[a].p[0];
        ends[b].p[1] = ends[a].p[1];
      }
    }
  // 2) estremo → punto più vicino su un ALTRO tratto (estremo che atterra a metà tratto)
  for (const en of ends) {
    let best = null,
      bd = t2;
    g.tratti.forEach((tr, ti) => {
      if (ti === en.ti) return;
      const P = tr.pts,
        n = P.length,
        last = tr.chiuso ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const a = P[i],
          c = P[(i + 1) % n],
          vx = c[0] - a[0],
          vy = c[1] - a[1],
          L2 = vx * vx + vy * vy || 1;
        let t = ((en.p[0] - a[0]) * vx + (en.p[1] - a[1]) * vy) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = a[0] + vx * t,
          qy = a[1] + vy * t,
          d = (en.p[0] - qx) ** 2 + (en.p[1] - qy) ** 2;
        if (d < bd) {
          bd = d;
          best = [qx, qy];
        }
      }
    });
    if (best) {
      en.p[0] = best[0];
      en.p[1] = best[1];
    }
  }
  sel = null;
  selSet = [];
  commitHist();
  afterHist();
  toast("Estremi saldati");
}

// #1 striscia parola: lettere inkate in contesto sotto il canvas
function drawWord() {
  const wc = document.getElementById("wordCv");
  if (!wc) return;
  const wx = wc.getContext("2d");
  wx.clearRect(0, 0, wc.width, wc.height);
  const SIZE = 78,
    PADX = 14,
    items = [];
  let penX = 0;
  // ponytail: O(parola) costr per frame; durante un drag ~10 lettere ricalcolate.
  // se lagga, fare drawWord solo a mouseup invece che in render
  for (const ch of wordText) {
    if (!work[ch]) {
      penX += SIZE * 0.32;
      continue;
    }
    skelEdits[ch] = work[ch];
    try {
      const r = costr(ch, pen, penX, 0, SIZE);
      items.push(r.polys);
      penX += r.advance;
    } catch (e) {}
  }
  const total = penX || 1,
    sc = Math.min(1, (wc.width - 2 * PADX) / total);
  wx.save();
  wx.translate(PADX + (wc.width - 2 * PADX - total * sc) / 2, (wc.height - SIZE * sc) / 2);
  wx.scale(sc, sc);
  wx.fillStyle =
    getComputedStyle(document.body).getPropertyValue("--display-ink").trim() || "#eee";
  for (const polys of items)
    for (const pg of polys) {
      wx.beginPath();
      pg.outer.forEach((p, i) => (i ? wx.lineTo(p.x, p.y) : wx.moveTo(p.x, p.y)));
      (pg.holes || []).forEach((h) =>
        h.forEach((p, i) => (i ? wx.lineTo(p.x, p.y) : wx.moveTo(p.x, p.y))),
      );
      wx.fill("evenodd");
    }
  wx.restore();
}
// #4 specchia: duplica tutti i tratti riflessi su x = w/2 (disegni metà, l'altra è gratis)
function mirrorX() {
  const g = work[gch],
    w = g.w || 1;
  if (!g.tratti.length) return toast("Niente da specchiare");
  beginHist();
  const mir = (p) => {
    const q = [w - p[0], p[1]];
    if (p[2]) {
      const m = p[2],
        nm = { k: m.k },
        nx = (h) => [-h[0], h[1]];
      if (m.h) nm.h = nx(m.h);
      if (m.hIn) nm.hIn = nx(m.hIn);
      if (m.hOut) nm.hOut = nx(m.hOut);
      q[2] = nm;
    }
    return q;
  };
  const add = g.tratti.map((tr) => ({
    pts: tr.pts.map(mir),
    chiuso: tr.chiuso,
    e: tr.e ? tr.e.slice() : undefined,
  }));
  g.tratti.push(...add);
  sel = null;
  selSet = [];
  commitHist();
  afterHist();
  toast("Specchiato su X");
}

// ---------- render ----------
function render() {
  recalcOrigin();
  cx.clearRect(0, 0, cv.width, cv.height);
  drawGuides();
  if (traceOn && traceFont) drawTrace();
  drawStroke(); // tratto penna SOTTO lo scheletro
  // #3 onion-skin: scheletro Hershey originale in trasparenza, per vedere la deriva
  if (onionOn && HERSHEY[gch])
    for (const tr of HERSHEY[gch].tratti) {
      const sm = tr.pts.length >= 2 ? liscia(tr.pts, !!tr.chiuso) : tr.pts;
      cx.beginPath();
      sm.forEach((p, i) => {
        const s = W2S(p[0], p[1]);
        i ? cx.lineTo(s.X, s.Y) : cx.moveTo(s.X, s.Y);
      });
      if (tr.chiuso) cx.closePath();
      cx.strokeStyle = "rgba(120,140,255,0.35)";
      cx.lineWidth = 1.5;
      cx.stroke();
    }
  const g = work[gch];
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    const smooth = tr.pts.length >= 2 ? liscia(tr.pts, !!tr.chiuso) : tr.pts;
    cx.beginPath();
    smooth.forEach((p, i) => {
      const s = W2S(p[0], p[1]);
      i ? cx.lineTo(s.X, s.Y) : cx.moveTo(s.X, s.Y);
    });
    if (tr.chiuso) cx.closePath();
    cx.strokeStyle = "#ff5a1a";
    cx.lineWidth = 2;
    cx.lineJoin = "round";
    cx.stroke();
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const h = handleWorld(tr.pts[pi]);
      if (!h) continue;
      const c0 = W2S(tr.pts[pi][0], tr.pts[pi][1]),
        ho = W2S(h.out[0], h.out[1]),
        hi = W2S(h.inn[0], h.inn[1]);
      gline(c0.X, c0.Y, ho.X, ho.Y, "#4a5364");
      gline(c0.X, c0.Y, hi.X, hi.Y, "#4a5364");
      for (const hp of [ho, hi]) {
        cx.fillStyle = "#ff5a1a";
        cx.fillRect(hp.X - 3, hp.Y - 3, 6, 6);
      }
    }
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const s = W2S(tr.pts[pi][0], tr.pts[pi][1]);
      const isSel = sel && sel.ti === ti && sel.pi === pi;
      const isMulti = inSel(ti, pi);
      const isSmooth = !!(tr.pts[pi][2] && tr.pts[pi][2].k === 2);
      cx.beginPath();
      cx.arc(s.X, s.Y, isSel || isMulti ? 6 : 4, 0, TAU2);
      cx.fillStyle = isSel ? "#ff7a59" : isMulti ? "#ffd23f" : isSmooth ? "#ffae8a" : "#cfd6e4";
      cx.fill();
      if (isMulti && !isSel) {
        cx.strokeStyle = "#ffd23f";
        cx.lineWidth = 2;
        cx.stroke();
      }
      if (pi === 0 && !tr.chiuso) {
        cx.strokeStyle = "#ff5a1a";
        cx.lineWidth = 1.5;
        cx.stroke();
      }
    }
  }
  drawDiag();
  if (marquee) drawMarquee();
  drawWord();
  syncFields();
}
function drawMarquee() {
  const x = Math.min(marquee.X0, marquee.X1),
    y = Math.min(marquee.Y0, marquee.Y1),
    w = Math.abs(marquee.X1 - marquee.X0),
    h = Math.abs(marquee.Y1 - marquee.Y0);
  cx.save();
  cx.fillStyle = "rgba(255,210,63,0.10)";
  cx.fillRect(x, y, w, h);
  cx.setLineDash([4, 3]);
  cx.strokeStyle = "#ffd23f";
  cx.lineWidth = 1;
  cx.strokeRect(x, y, w, h);
  cx.restore();
}
function gline(x1, y1, x2, y2, col, dash) {
  cx.beginPath();
  cx.setLineDash(dash || []);
  cx.moveTo(x1, y1);
  cx.lineTo(x2, y2);
  cx.strokeStyle = col;
  cx.lineWidth = 1;
  cx.stroke();
  cx.setLineDash([]);
}
function drawGuides() {
  const w = curW();
  const L = W2S(0, 0).X,
    R = W2S(w, 0).X;
  for (const [y, c] of [
    [0, "#3a4150"],
    [0.333, "#2a2f38"],
    [0.5, "#2a2f38"],
    [0.667, "#2a2f38"],
    [1, "#3a4150"],
  ]) {
    const s = W2S(0, y);
    gline(40, s.Y, cv.width - 40, s.Y, c, y === 0 || y === 1 ? [] : [3, 4]);
  }
  gline(L, 30, L, cv.height - 30, "#3a4150");
  gline(R, 30, R, cv.height - 30, "#3a4150", [3, 4]);
  cx.fillStyle = "#5a6371";
  cx.font = "10px ui-sans-serif";
  cx.fillText("cap", 42, W2S(0, 0).Y - 4);
  cx.fillText("baseline", 42, W2S(0, 1).Y - 4);
  cx.fillText("w", R + 4, 42);
}
function drawTrace() {
  try {
    const glyph = traceFont.charToGlyph(gch);
    if (!glyph || !glyph.path) return;
    const upm = traceFont.unitsPerEm || 1000,
      os2 = traceFont.tables && traceFont.tables.os2,
      capH = (os2 && os2.sCapHeight) || 0.7 * upm;
    cx.beginPath();
    for (const c of glyph.path.commands) {
      const m = (x, y) => W2S(x / capH, 1 - y / capH);
      if (c.type === "M") {
        const s = m(c.x, c.y);
        cx.moveTo(s.X, s.Y);
      } else if (c.type === "L") {
        const s = m(c.x, c.y);
        cx.lineTo(s.X, s.Y);
      } else if (c.type === "C") {
        const a = m(c.x1, c.y1),
          b = m(c.x2, c.y2),
          d = m(c.x, c.y);
        cx.bezierCurveTo(a.X, a.Y, b.X, b.Y, d.X, d.Y);
      } else if (c.type === "Q") {
        const a = m(c.x1, c.y1),
          d = m(c.x, c.y);
        cx.quadraticCurveTo(a.X, a.Y, d.X, d.Y);
      } else if (c.type === "Z") cx.closePath();
    }
    cx.fillStyle = "rgba(255,90,26,0.12)";
    cx.fill("evenodd");
  } catch (e) {}
}

// ---------- hit-test ----------
function hitNode(X, Y) {
  const g = work[gch];
  for (let ti = 0; ti < g.tratti.length; ti++)
    for (let pi = 0; pi < g.tratti[ti].pts.length; pi++) {
      const s = W2S(g.tratti[ti].pts[pi][0], g.tratti[ti].pts[pi][1]);
      if (Math.hypot(s.X - X, s.Y - Y) < 9) return { ti, pi };
    }
  return null;
}
function nearestSeg(X, Y) {
  const g = work[gch];
  let best = null,
    bd = 12;
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti],
      n = tr.pts.length,
      last = tr.chiuso ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = W2S(tr.pts[i][0], tr.pts[i][1]),
        b = W2S(tr.pts[(i + 1) % n][0], tr.pts[(i + 1) % n][1]);
      const vx = b.X - a.X,
        vy = b.Y - a.Y,
        L2 = vx * vx + vy * vy || 1;
      let t = ((X - a.X) * vx + (Y - a.Y) * vy) / L2;
      t = Math.max(0, Math.min(1, t));
      const px = a.X + vx * t,
        py = a.Y + vy * t,
        d = Math.hypot(X - px, Y - py);
      if (d < bd) {
        bd = d;
        best = { ti, pi: i + 1 };
      }
    }
  }
  return best;
}

// ---------- maniglie Bézier ----------
function handleWorld(node) {
  const m = node[2];
  if (!m) return null;
  if (m.h)
    return {
      out: [node[0] + m.h[0], node[1] + m.h[1]],
      inn: [node[0] - m.h[0], node[1] - m.h[1]],
    };
  if (m.hOut || m.hIn) {
    const o = m.hOut || [0, 0],
      i = m.hIn || [0, 0];
    return {
      out: [node[0] + o[0], node[1] + o[1]],
      inn: [node[0] + i[0], node[1] + i[1]],
    };
  }
  return null;
}
function hitHandle(X, Y) {
  const g = work[gch];
  for (let ti = 0; ti < g.tratti.length; ti++)
    for (let pi = 0; pi < g.tratti[ti].pts.length; pi++) {
      const h = handleWorld(g.tratti[ti].pts[pi]);
      if (!h) continue;
      const o = W2S(h.out[0], h.out[1]),
        i = W2S(h.inn[0], h.inn[1]);
      if (Math.hypot(o.X - X, o.Y - Y) < 8) return { ti, pi, which: "out" };
      if (Math.hypot(i.X - X, i.Y - Y) < 8) return { ti, pi, which: "in" };
    }
  return null;
}
function estTangent(tr, i) {
  const n = tr.pts.length;
  let a, b;
  if (tr.chiuso) {
    a = tr.pts[(i - 1 + n) % n];
    b = tr.pts[(i + 1) % n];
  } else {
    a = tr.pts[Math.max(0, i - 1)];
    b = tr.pts[Math.min(n - 1, i + 1)];
  }
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = Math.hypot(dx, dy) || 1,
    len = Math.min(0.18, L * 0.4);
  return [(dx / L) * len, (dy / L) * len];
}
function toggleSmooth() {
  if (!sel || sel.pi < 0) return;
  beginHist();
  const node = work[gch].tratti[sel.ti].pts[sel.pi],
    m = node[2];
  if (m && m.k === 2) node[2] = { k: 1 };
  else node[2] = { k: 2, h: estTangent(work[gch].tratti[sel.ti], sel.pi) };
  commitHist();
  render();
}

// ---------- eventi canvas ----------
function evPos(e) {
  const r = cv.getBoundingClientRect();
  return { X: e.clientX - r.left, Y: e.clientY - r.top };
}
let dragH = null;
let marquee = null; // {X0,Y0,X1,Y1,add,base} riquadro di selezione (coord schermo)
let groupDrag = null; // {wx,wy,orig:[{ti,pi,x,y}]} spostamento di gruppo
// nodi dentro il rettangolo schermo
function nodesInRect(X0, Y0, X1, Y1) {
  const xmin = Math.min(X0, X1),
    xmax = Math.max(X0, X1),
    ymin = Math.min(Y0, Y1),
    ymax = Math.max(Y0, Y1);
  const out = [];
  const g = work[gch];
  for (let ti = 0; ti < g.tratti.length; ti++)
    for (let pi = 0; pi < g.tratti[ti].pts.length; pi++) {
      const s = W2S(g.tratti[ti].pts[pi][0], g.tratti[ti].pts[pi][1]);
      if (s.X >= xmin && s.X <= xmax && s.Y >= ymin && s.Y <= ymax) out.push({ ti, pi });
    }
  return out;
}
cv.addEventListener("pointerdown", (e) => {
  const { X, Y } = evPos(e);
  if (mode === "new") {
    const w = S2W(X, Y);
    const [sx, sy] = snapPoint(w.x, w.y);
    beginHist();
    work[gch].tratti[sel.ti].pts.push([sx, sy]);
    sel.pi = work[gch].tratti[sel.ti].pts.length - 1;
    selSet = [{ ti: sel.ti, pi: sel.pi }];
    commitHist();
    render();
    return;
  }
  const hh = hitHandle(X, Y);
  if (hh) {
    dragH = hh;
    setSel({ ti: hh.ti, pi: hh.pi });
    beginHist();
    cv.setPointerCapture(e.pointerId);
    render();
    return;
  }
  const h = hitNode(X, Y);
  if (h) {
    if (e.shiftKey) {
      toggleSel(h);
      sel = h;
      render();
      return;
    }
    // nodo già in una selezione multipla → sposta tutto il gruppo
    if (inSel(h.ti, h.pi) && selSet.length > 1) {
      sel = h;
      const w = S2W(X, Y);
      beginHist();
      groupDrag = {
        wx: w.x,
        wy: w.y,
        orig: selSet.map((s) => {
          const p = work[gch].tratti[s.ti].pts[s.pi];
          return { ti: s.ti, pi: s.pi, x: p[0], y: p[1] };
        }),
      };
      cv.setPointerCapture(e.pointerId);
      render();
      return;
    }
    setSel(h);
    drag = true;
    beginHist();
    cv.setPointerCapture(e.pointerId);
    render();
    return;
  }
  // vuoto → riquadro di selezione (marquee)
  marquee = { X0: X, Y0: Y, X1: X, Y1: Y, add: e.shiftKey, base: e.shiftKey ? selSet.slice() : [] };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", (e) => {
  const { X, Y } = evPos(e),
    w = S2W(X, Y);
  if (marquee) {
    marquee.X1 = X;
    marquee.Y1 = Y;
    const inside = nodesInRect(marquee.X0, marquee.Y0, X, Y);
    selSet = marquee.base.slice();
    for (const h of inside) if (!inSel(h.ti, h.pi)) selSet.push(h);
    render();
    return;
  }
  if (groupDrag) {
    const dx = w.x - groupDrag.wx,
      dy = w.y - groupDrag.wy;
    for (const o of groupDrag.orig) {
      const node = work[gch].tratti[o.ti].pts[o.pi];
      node[0] = o.x + dx;
      node[1] = o.y + dy;
    }
    render();
    return;
  }
  if (dragH) {
    const node = work[gch].tratti[dragH.ti].pts[dragH.pi],
      hx = w.x - node[0],
      hy = w.y - node[1];
    node[2] = { k: 2, h: dragH.which === "out" ? [hx, hy] : [-hx, -hy] };
    render();
    return;
  }
  if (!drag || !sel) return;
  const [sx, sy] = snapPoint(w.x, w.y),
    node = work[gch].tratti[sel.ti].pts[sel.pi];
  node[0] = sx;
  node[1] = sy;
  render();
});
cv.addEventListener("pointerup", () => {
  if (marquee) {
    const moved = Math.hypot(marquee.X1 - marquee.X0, marquee.Y1 - marquee.Y0) > 3;
    if (!moved && !marquee.add) {
      sel = null;
      selSet = [];
    } else {
      sel = selSet.length ? selSet[selSet.length - 1] : null;
    }
    marquee = null;
    render();
  }
  if (groupDrag || drag || dragH) commitHist();
  groupDrag = null;
  drag = false;
  dragH = null;
});
cv.addEventListener("dblclick", (e) => {
  const { X, Y } = evPos(e),
    seg = nearestSeg(X, Y);
  if (!seg) return;
  const w = S2W(X, Y),
    [sx, sy] = snapPoint(w.x, w.y);
  beginHist();
  work[gch].tratti[seg.ti].pts.splice(seg.pi, 0, [sx, sy]);
  setSel({ ti: seg.ti, pi: seg.pi });
  commitHist();
  render();
});

// ---------- tastiera ----------
window.addEventListener("keydown", (e) => {
  if (/input|textarea|select/i.test(e.target.tagName || "")) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
    e.preventDefault();
    redo();
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    delNode();
    e.preventDefault();
  } else if (e.key === "n" || e.key === "N") newStroke();
  else if (e.key === "c" || e.key === "C") toggleClosed();
  else if (e.key === "s" || e.key === "S") toggleSmooth();
  else if (e.key === "u" || e.key === "U") unisciPunti();
  else if (e.key === "d" || e.key === "D") dividiNodo();
  else if (e.key === "Enter" || e.key === "Escape") finishNew();
});

// ---------- azioni ----------
function delNode() {
  if (!sel) return;
  beginHist();
  const tr = work[gch].tratti[sel.ti];
  if (tr.pts.length <= 2) work[gch].tratti.splice(sel.ti, 1);
  else tr.pts.splice(sel.pi, 1);
  sel = null;
  selSet = [];
  commitHist();
  render();
}
function newStroke() {
  if (mode === "new") {
    finishNew();
    return;
  }
  beginHist();
  mode = "new";
  work[gch].tratti.push({ pts: [], chiuso: false });
  sel = { ti: work[gch].tratti.length - 1, pi: -1 };
  selSet = [];
  commitHist();
  document.getElementById("newStroke").classList.add("on");
  toast("Nuovo tratto: clicca per aggiungere punti · Invio per finire");
}
function finishNew() {
  if (mode !== "new") return;
  mode = "idle";
  document.getElementById("newStroke").classList.remove("on");
  const tr = work[gch].tratti[sel.ti];
  if (!tr || tr.pts.length < 2) {
    beginHist();
    work[gch].tratti.splice(sel.ti, 1);
    commitHist();
  }
  sel = null;
  selSet = [];
  render();
}
function toggleClosed() {
  if (!sel) return;
  beginHist();
  work[gch].tratti[sel.ti].chiuso = !work[gch].tratti[sel.ti].chiuso;
  commitHist();
  render();
}
function delStroke() {
  if (!sel) return;
  beginHist();
  work[gch].tratti.splice(sel.ti, 1);
  sel = null;
  selSet = [];
  commitHist();
  render();
}

// estremo di un tratto aperto?
function isEnd(tr, pi) {
  return !tr.chiuso && (pi === 0 || pi === tr.pts.length - 1);
}
// unisci: 2 punti stesso tratto → collassa in 1; 2 estremi di tratti diversi → salda
function unisciPunti() {
  if (selSet.length !== 2) {
    toast("Seleziona 2 punti (Shift+click)");
    return;
  }
  const g = work[gch];
  const [a, b] = selSet;
  const pa = g.tratti[a.ti].pts[a.pi],
    pb = g.tratti[b.ti].pts[b.pi];
  const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  beginHist();
  if (a.ti === b.ti) {
    const tr = g.tratti[a.ti];
    if (tr.pts.length <= 2) {
      toast("Tratto troppo corto per unire");
      histPending = null;
      return;
    }
    const lo = Math.min(a.pi, b.pi),
      hi = Math.max(a.pi, b.pi);
    tr.pts[lo] = [mid[0], mid[1]];
    tr.pts.splice(hi, 1);
    setSel({ ti: a.ti, pi: lo });
  } else {
    const A = g.tratti[a.ti],
      B = g.tratti[b.ti];
    if (!isEnd(A, a.pi) || !isEnd(B, b.pi)) {
      toast("Per saldare due tratti seleziona un estremo di ciascuno");
      histPending = null;
      return;
    }
    // A termina nel nodo di giunzione, B riparte da lì
    const seqA = a.pi === 0 ? A.pts.slice().reverse() : A.pts.slice();
    const seqB = b.pi === 0 ? B.pts.slice() : B.pts.slice().reverse();
    seqA[seqA.length - 1] = [mid[0], mid[1]];
    seqB.shift();
    const merged = { pts: seqA.concat(seqB), chiuso: false };
    const loT = Math.min(a.ti, b.ti),
      hiT = Math.max(a.ti, b.ti);
    g.tratti.splice(hiT, 1);
    g.tratti.splice(loT, 1);
    g.tratti.push(merged);
    setSel({ ti: g.tratti.length - 1, pi: seqA.length - 1 });
  }
  commitHist();
  buildGlyphs();
  render();
}
// dividi: nodo interno di tratto aperto → 2 tratti; nodo di tratto chiuso → apre il tratto
function dividiNodo() {
  if (!sel || sel.pi < 0) {
    toast("Seleziona un nodo");
    return;
  }
  const g = work[gch],
    tr = g.tratti[sel.ti],
    n = tr.pts.length,
    pi = sel.pi;
  beginHist();
  if (tr.chiuso) {
    const rot = tr.pts.slice(pi).concat(tr.pts.slice(0, pi));
    rot.push(clone(rot[0]));
    tr.pts = rot;
    tr.chiuso = false;
    setSel({ ti: sel.ti, pi: 0 });
  } else {
    if (pi === 0 || pi === n - 1) {
      toast("Per dividere un tratto aperto seleziona un nodo interno");
      histPending = null;
      return;
    }
    const left = tr.pts.slice(0, pi + 1);
    const right = [clone(tr.pts[pi])].concat(tr.pts.slice(pi + 1));
    tr.pts = left;
    g.tratti.splice(sel.ti + 1, 0, { pts: right, chiuso: false });
    setSel({ ti: sel.ti, pi: left.length - 1 });
  }
  commitHist();
  buildGlyphs();
  render();
}

// ---------- pannello / picker ----------
function buildGlyphs() {
  const host = document.getElementById("glyphs");
  host.innerHTML = "";
  for (const ch of CHARS) {
    const b = document.createElement("button");
    b.className = "gly" + (ch === gch ? " cur" : "");
    if (JSON.stringify(work[ch]) !== JSON.stringify(HERSHEY[ch]))
      b.classList.add("edited");
    b.textContent = ch;
    b.onclick = () => {
      finishNew();
      gch = ch;
      sel = null;
      selSet = [];
      buildGlyphs();
      render();
    };
    host.appendChild(b);
  }
}
function syncFields() {
  document.getElementById("wRange").value = curW();
  document.getElementById("wNum").value = curW().toFixed(3);
  const nx = document.getElementById("nx"),
    ny = document.getElementById("ny");
  if (sel && sel.pi >= 0) {
    const p = work[gch].tratti[sel.ti].pts[sel.pi];
    nx.value = p[0].toFixed(3);
    ny.value = p[1].toFixed(3);
    nx.disabled = ny.disabled = false;
  } else {
    nx.value = ny.value = "";
    nx.disabled = ny.disabled = true;
  }
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- generazione codice per data.js ----------
const num = (n) => String(+(+n).toFixed(3));
function metaStr(m) {
  const parts = [];
  if (m.k != null) parts.push("k: " + m.k);
  if (m.h) parts.push("h: [" + num(m.h[0]) + ", " + num(m.h[1]) + "]");
  if (m.hIn) parts.push("hIn: [" + num(m.hIn[0]) + ", " + num(m.hIn[1]) + "]");
  if (m.hOut) parts.push("hOut: [" + num(m.hOut[0]) + ", " + num(m.hOut[1]) + "]");
  return "{ " + parts.join(", ") + " }";
}
function keyName(ch) {
  return /^[A-Za-z0-9]$/.test(ch) ? ch : JSON.stringify(ch);
}
function glyphCode(ch) {
  const g = work[ch];
  let s = "  " + keyName(ch) + ": {\n    w: " + num(g.w) + ",\n    tratti: [\n";
  for (const tr of g.tratti) {
    s += "      {\n        pts: [\n";
    for (const p of tr.pts) {
      let pt = "[" + num(p[0]) + ", " + num(p[1]);
      if (p[2]) pt += ", " + metaStr(p[2]);
      pt += "]";
      s += "          " + pt + ",\n";
    }
    s += "        ],\n";
    s += "        chiuso: " + (tr.chiuso ? "true" : "false") + ",\n";
    if (tr.e) s += "        e: " + JSON.stringify(tr.e) + ",\n";
    s += "      },\n";
  }
  s += "    ],\n  },";
  return s;
}
function genCode() {
  const all = document.getElementById("codeAll").checked;
  let out;
  if (all) {
    const ch = CHARS.filter(
      (c) => JSON.stringify(work[c]) !== JSON.stringify(HERSHEY[c]),
    );
    out = ch.length ? ch.map(glyphCode).join("\n") : "// nessun glifo modificato";
  } else out = glyphCode(gch);
  document.getElementById("codeOut").value = out;
  return out;
}

// carica il codice data.js incollato in #codeOut → aggiorna i glifi live.
// accetta sia i frammenti di genCode (`A: {...},`) sia l'oggetto/const HERSHEY intero.
function importCode() {
  let txt = document.getElementById("codeOut").value.trim();
  if (!txt) return toast("Incolla prima il codice");
  txt = txt
    .replace(/^\s*(?:const|let|var)\s+\w+\s*=\s*/, "") // toglie `const HERSHEY =`
    .replace(/;?\s*$/, "");
  const body = txt.startsWith("{") ? txt : "{" + txt + "}";
  let obj;
  try {
    // ponytail: eval del codice locale dell'utente nel suo browser — nessun trust boundary
    obj = new Function("return (" + body + ")")();
  } catch (e) {
    return toast("Parse fallito: " + e.message);
  }
  beginHist();
  let n = 0;
  for (const ch in obj)
    if (obj[ch] && Array.isArray(obj[ch].tratti)) {
      work[ch] = obj[ch];
      n++;
    }
  if (!n) {
    histPending = null;
    return toast("Nessun glifo valido nel codice");
  }
  if (!work[gch] || !work[gch].tratti) gch = Object.keys(obj)[0];
  sel = null;
  selSet = [];
  commitHist();
  buildGlyphs();
  render();
  toast(n + " glifi caricati");
}

// ---------- salva base / JSON ----------
function editedBase() {
  const o = {};
  for (const c of CHARS)
    if (JSON.stringify(work[c]) !== JSON.stringify(HERSHEY[c])) o[c] = work[c];
  return o;
}
function saveBase() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(editedBase()));
    toast("Base salvata → nel tool scegli «Personalizzata (editor)»");
  } catch (e) {
    toast("Salvataggio fallito: " + e.message);
  }
}

// ---------- wiring controlli ----------
let wDrag = false;
document.getElementById("wRange").addEventListener("input", (e) => {
  if (!wDrag) {
    beginHist();
    wDrag = true;
  }
  work[gch].w = +e.target.value;
  render();
});
document.getElementById("wRange").addEventListener("change", () => {
  if (wDrag) {
    commitHist();
    wDrag = false;
  }
});
document.getElementById("wNum").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (isFinite(v)) {
    beginHist();
    work[gch].w = v;
    commitHist();
    render();
  }
});
document.getElementById("nx").addEventListener("change", (e) => {
  if (sel && sel.pi >= 0) {
    beginHist();
    work[gch].tratti[sel.ti].pts[sel.pi][0] = parseFloat(e.target.value) || 0;
    commitHist();
    render();
  }
});
document.getElementById("ny").addEventListener("change", (e) => {
  if (sel && sel.pi >= 0) {
    beginHist();
    work[gch].tratti[sel.ti].pts[sel.pi][1] = parseFloat(e.target.value) || 0;
    commitHist();
    render();
  }
});
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;
document.getElementById("mergePts").onclick = unisciPunti;
document.getElementById("splitNode").onclick = dividiNodo;
document.getElementById("smoothNode").onclick = toggleSmooth;
document.getElementById("delNode").onclick = delNode;
document.getElementById("newStroke").onclick = newStroke;
document.getElementById("toggleClosed").onclick = toggleClosed;
document.getElementById("delStroke").onclick = delStroke;

// preview penna
document.getElementById("showStroke").onchange = (e) => {
  showStroke = e.target.checked;
  render();
};
document.getElementById("unionTog").onchange = render;
document.getElementById("diagTog").onchange = (e) => {
  diagOn = e.target.checked;
  render();
};
function persistPen() {
  try {
    localStorage.setItem(
      "ht_pen",
      JSON.stringify({ peso: pen.peso, contrasto: pen.contrasto, pen: pen.pen, penang: pen.penang }),
    );
  } catch (e) {}
}
document.getElementById("pesoR").oninput = (e) => {
  pen.peso = +e.target.value;
  persistPen();
  render();
};
document.getElementById("contrR").oninput = (e) => {
  pen.contrasto = +e.target.value;
  persistPen();
  render();
};
document.getElementById("penSel").onchange = (e) => {
  pen.pen = e.target.value;
  persistPen();
  render();
};
document.getElementById("angR").oninput = (e) => {
  pen.penang = +e.target.value;
  persistPen();
  render();
};
// ripristina i parametri penna salvati + riflette sugli input
try {
  const sp = JSON.parse(localStorage.getItem("ht_pen") || "null");
  if (sp) {
    Object.assign(pen, sp);
    pesoR.value = pen.peso;
    contrR.value = pen.contrasto;
    penSel.value = pen.pen;
    angR.value = pen.penang;
  }
} catch (e) {}

document.getElementById("saveBase").onclick = saveBase;
document.getElementById("exportJson").onclick = () => {
  const blob = new Blob([JSON.stringify(editedBase(), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "skeleton-base.json";
  a.click();
  URL.revokeObjectURL(a.href);
};
const jsonin = document.getElementById("jsonin");
document.getElementById("importJson").onclick = () => {
  jsonin.value = "";
  jsonin.click();
};
jsonin.addEventListener("change", () => {
  const f = jsonin.files[0];
  if (!f) return;
  f.text()
    .then((t) => {
      beginHist();
      Object.assign(work, JSON.parse(t));
      sel = null;
      selSet = [];
      commitHist();
      buildGlyphs();
      render();
      toast("JSON importato");
    })
    .catch((e) => toast("JSON non valido: " + e.message));
});

document.getElementById("genCode").onclick = () => {
  genCode();
  toast("Codice generato");
};
document.getElementById("loadCode").onclick = importCode;
document.getElementById("snapEnds").onclick = saldaEstremi;
document.getElementById("mirrorX").onclick = mirrorX;
document.getElementById("onionTog").onchange = (e) => {
  onionOn = e.target.checked;
  render();
};
const wordIn = document.getElementById("wordIn");
if (wordIn) {
  wordIn.value = wordText;
  wordIn.oninput = (e) => {
    wordText = e.target.value;
    try {
      localStorage.setItem("ht_word", wordText);
    } catch (_) {}
    render();
  };
}
document.getElementById("copyCode").onclick = () => {
  const t = genCode();
  navigator.clipboard
    .writeText(t)
    .then(() => toast("Codice copiato — incollalo in js/data.js"))
    .catch(() => {
      document.getElementById("codeOut").select();
      toast("Seleziona e copia (Cmd/Ctrl+C)");
    });
};
document.getElementById("resetGlyph").onclick = () => {
  beginHist();
  work[gch] = clone(HERSHEY[gch]);
  sel = null;
  selSet = [];
  commitHist();
  buildGlyphs();
  render();
  toast("Glifo ripristinato a Hershey");
};
document.getElementById("resetAll").onclick = () => {
  if (!confirm("Reset di TUTTA la base alle forme Hershey?")) return;
  beginHist();
  work = clone(HERSHEY);
  sel = null;
  selSet = [];
  commitHist();
  buildGlyphs();
  render();
  toast("Base ripristinata");
};

// trace
const tracein = document.getElementById("tracein");
document.getElementById("traceLoad").onclick = () => {
  tracein.value = "";
  tracein.click();
};
tracein.addEventListener("change", () => {
  const f = tracein.files[0];
  if (!f) return;
  f.arrayBuffer()
    .then((ab) => {
      traceFont = opentype.parse(ab);
      traceOn = true;
      document.getElementById("traceTog").classList.add("on");
      render();
      toast("Traccia: " + f.name);
    })
    .catch((e) => toast("Font non valido: " + e.message));
});
document.getElementById("traceTog").onclick = () => {
  if (!traceFont) {
    toast("Nessun font caricato");
    return;
  }
  traceOn = !traceOn;
  document.getElementById("traceTog").classList.toggle("on", traceOn);
  render();
};

buildGlyphs();
render();
updateHistBtns();
