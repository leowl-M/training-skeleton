// ===== base-editor.js — editor visuale degli scheletri base (HERSHEY) =====
// Modifica i tratti dei glifi base, ricalca un font reale, salva in localStorage
// come base "Personalizzata" che il tool principale carica.

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
let cur = CHARS.includes("A") ? "A" : CHARS[0];
let sel = null; // {ti, pi}
let drag = false;
let mode = "idle"; // 'idle' | 'new'
let traceFont = null,
  traceOn = false;

const cv = document.getElementById("cv"),
  cx = cv.getContext("2d");
const PAD = 90;
let scale = cv.height - 2 * PAD,
  originX = cv.width / 2;

function curW() {
  return work[cur].w || 0.8;
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
  if (!document.getElementById("snap").checked) return [x, y];
  const w = curW(),
    thr = 0.014;
  const xs = [0, w / 2, w],
    ys = [0, 0.25, 0.333, 0.5, 0.667, 0.75, 1];
  // anche X/Y di altri nodi
  for (const tr of work[cur].tratti)
    for (let i = 0; i < tr.pts.length; i++) {
      if (sel && tr === work[cur].tratti[sel.ti] && i === sel.pi) continue;
      xs.push(tr.pts[i][0]);
      ys.push(tr.pts[i][1]);
    }
  return [snapVal(x, xs, thr), snapVal(y, ys, thr)];
}

// ---------- render ----------
function render() {
  recalcOrigin();
  cx.clearRect(0, 0, cv.width, cv.height);
  drawGuides();
  if (traceOn && traceFont) drawTrace();
  const g = work[cur];
  // tratti — curva REALE del motore (liscia: Catmull-Rom + override maniglie)
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    const smooth =
      tr.pts.length >= 2 ? liscia(tr.pts, !!tr.chiuso) : tr.pts;
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
    // maniglie dei nodi curvi
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const h = handleWorld(tr.pts[pi]);
      if (!h) continue;
      const c0 = W2S(tr.pts[pi][0], tr.pts[pi][1]),
        ho = W2S(h.out[0], h.out[1]),
        hi = W2S(h.inn[0], h.inn[1]);
      cx.strokeStyle = "#4a5364";
      cx.lineWidth = 1;
      gline(c0.X, c0.Y, ho.X, ho.Y, "#4a5364");
      gline(c0.X, c0.Y, hi.X, hi.Y, "#4a5364");
      for (const hp of [ho, hi]) {
        cx.fillStyle = "#ff5a1a";
        cx.fillRect(hp.X - 3, hp.Y - 3, 6, 6);
      }
    }
    // nodi
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const s = W2S(tr.pts[pi][0], tr.pts[pi][1]);
      const isSel = sel && sel.ti === ti && sel.pi === pi;
      const isSmooth = !!(tr.pts[pi][2] && tr.pts[pi][2].k === 2);
      cx.beginPath();
      cx.arc(s.X, s.Y, isSel ? 6 : 4, 0, TAU2);
      cx.fillStyle = isSel ? "#ff7a59" : isSmooth ? "#ffae8a" : "#cfd6e4";
      cx.fill();
      if (pi === 0 && !tr.chiuso) {
        cx.strokeStyle = "#ff5a1a";
        cx.lineWidth = 1.5;
        cx.stroke();
      }
    }
  }
  syncFields();
  saveBase();
}
// autosave: ogni modifica passa da render() → salva la base in localStorage (debounced).
// Il tool principale la legge come base "Personalizzata". ponytail: localStorage = stesso
// browser/device. add when serve sincronizzarla online → embed nel progetto.
let _saveBaseT = null;
function saveBase() {
  clearTimeout(_saveBaseT);
  _saveBaseT = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(work));
    } catch (e) {}
  }, 300);
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
  const top = W2S(0, 0),
    bot = W2S(0, 1),
    L = W2S(0, 0).X,
    R = W2S(w, 0).X;
  // orizzontali: cap(0), x-height(.333 per minuscole), mezzo(.5), baseline(1)
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
  // verticali: x=0, x=w
  gline(L, 30, L, cv.height - 30, "#3a4150");
  gline(R, 30, R, cv.height - 30, "#3a4150", [3, 4]);
  // etichette
  cx.fillStyle = "#5a6371";
  cx.font = "10px ui-sans-serif";
  cx.fillText("cap", 42, W2S(0, 0).Y - 4);
  cx.fillText("baseline", 42, W2S(0, 1).Y - 4);
  cx.fillText("w", R + 4, 42);
}
function drawTrace() {
  try {
    const glyph = traceFont.charToGlyph(cur);
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
    cx.fillStyle = "rgba(255,90,26,0.16)";
    cx.fill("evenodd");
  } catch (e) {}
}

// ---------- hit-test ----------
function hitNode(X, Y) {
  const g = work[cur];
  for (let ti = 0; ti < g.tratti.length; ti++)
    for (let pi = 0; pi < g.tratti[ti].pts.length; pi++) {
      const s = W2S(g.tratti[ti].pts[pi][0], g.tratti[ti].pts[pi][1]);
      if (Math.hypot(s.X - X, s.Y - Y) < 9) return { ti, pi };
    }
  return null;
}
function nearestSeg(X, Y) {
  const g = work[cur];
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
  const g = work[cur];
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
  const node = work[cur].tratti[sel.ti].pts[sel.pi],
    m = node[2];
  if (m && m.k === 2) node[2] = { k: 1 };
  else node[2] = { k: 2, h: estTangent(work[cur].tratti[sel.ti], sel.pi) };
  render();
}

// ---------- eventi canvas ----------
function evPos(e) {
  const r = cv.getBoundingClientRect();
  return { X: e.clientX - r.left, Y: e.clientY - r.top };
}
let dragH = null;
cv.addEventListener("pointerdown", (e) => {
  const { X, Y } = evPos(e);
  if (mode === "new") {
    const w = S2W(X, Y);
    const [sx, sy] = snapPoint(w.x, w.y);
    work[cur].tratti[sel.ti].pts.push([sx, sy]);
    sel.pi = work[cur].tratti[sel.ti].pts.length - 1;
    render();
    return;
  }
  const hh = hitHandle(X, Y);
  if (hh) {
    dragH = hh;
    sel = { ti: hh.ti, pi: hh.pi };
    cv.setPointerCapture(e.pointerId);
    render();
    return;
  }
  const h = hitNode(X, Y);
  if (h) {
    sel = h;
    drag = true;
    cv.setPointerCapture(e.pointerId);
  } else sel = null;
  render();
});
cv.addEventListener("pointermove", (e) => {
  const { X, Y } = evPos(e),
    w = S2W(X, Y);
  if (dragH) {
    const node = work[cur].tratti[dragH.ti].pts[dragH.pi],
      hx = w.x - node[0],
      hy = w.y - node[1];
    // maniglia simmetrica (k:2): out = +h, in = -h
    node[2] = { k: 2, h: dragH.which === "out" ? [hx, hy] : [-hx, -hy] };
    render();
    return;
  }
  if (!drag || !sel) return;
  const [sx, sy] = snapPoint(w.x, w.y),
    node = work[cur].tratti[sel.ti].pts[sel.pi];
  node[0] = sx; // muta sul posto → conserva il meta (maniglia)
  node[1] = sy;
  render();
});
cv.addEventListener("pointerup", () => {
  drag = false;
  dragH = null;
});
cv.addEventListener("dblclick", (e) => {
  const { X, Y } = evPos(e),
    seg = nearestSeg(X, Y);
  if (!seg) return;
  const w = S2W(X, Y),
    [sx, sy] = snapPoint(w.x, w.y);
  work[cur].tratti[seg.ti].pts.splice(seg.pi, 0, [sx, sy]);
  sel = { ti: seg.ti, pi: seg.pi };
  render();
});

// ---------- tastiera ----------
window.addEventListener("keydown", (e) => {
  if (/input|textarea/i.test((e.target.tagName || ""))) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    delNode();
    e.preventDefault();
  } else if (e.key === "n" || e.key === "N") newStroke();
  else if (e.key === "c" || e.key === "C") toggleClosed();
  else if (e.key === "s" || e.key === "S") toggleSmooth();
  else if (e.key === "Enter" || e.key === "Escape") finishNew();
});

// ---------- azioni ----------
function delNode() {
  if (!sel) return;
  const tr = work[cur].tratti[sel.ti];
  if (tr.pts.length <= 2) {
    work[cur].tratti.splice(sel.ti, 1);
  } else tr.pts.splice(sel.pi, 1);
  sel = null;
  render();
}
function newStroke() {
  if (mode === "new") {
    finishNew();
    return;
  }
  mode = "new";
  work[cur].tratti.push({ pts: [], chiuso: false });
  sel = { ti: work[cur].tratti.length - 1, pi: -1 };
  document.getElementById("newStroke").classList.add("on");
  toast("Nuovo tratto: clicca per aggiungere punti · Invio per finire");
}
function finishNew() {
  if (mode !== "new") return;
  mode = "idle";
  document.getElementById("newStroke").classList.remove("on");
  const tr = work[cur].tratti[sel.ti];
  if (!tr || tr.pts.length < 2) work[cur].tratti.splice(sel.ti, 1);
  sel = null;
  render();
}
function toggleClosed() {
  if (!sel) return;
  const tr = work[cur].tratti[sel.ti];
  tr.chiuso = !tr.chiuso;
  render();
}
function delStroke() {
  if (!sel) return;
  work[cur].tratti.splice(sel.ti, 1);
  sel = null;
  render();
}

// ---------- pannello / picker ----------
function buildGlyphs() {
  const host = document.getElementById("glyphs");
  host.innerHTML = "";
  for (const ch of CHARS) {
    const b = document.createElement("button");
    b.className = "gly" + (ch === cur ? " cur" : "");
    if (JSON.stringify(work[ch]) !== JSON.stringify(HERSHEY[ch]))
      b.classList.add("edited");
    b.textContent = ch;
    b.onclick = () => {
      finishNew();
      cur = ch;
      sel = null;
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
    const p = work[cur].tratti[sel.ti].pts[sel.pi];
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

// ---------- salva / carica ----------
// ---------- generazione codice per data.js ----------
const num = (n) => String(+(+n).toFixed(3));
function metaStr(m) {
  const parts = [];
  if (m.k != null) parts.push("k: " + m.k);
  if (m.h) parts.push("h: [" + num(m.h[0]) + ", " + num(m.h[1]) + "]");
  if (m.hIn) parts.push("hIn: [" + num(m.hIn[0]) + ", " + num(m.hIn[1]) + "]");
  if (m.hOut)
    parts.push("hOut: [" + num(m.hOut[0]) + ", " + num(m.hOut[1]) + "]");
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
    out = ch.length
      ? ch.map(glyphCode).join("\n")
      : "// nessun glifo modificato";
  } else out = glyphCode(cur);
  document.getElementById("codeOut").value = out;
  return out;
}

// ---------- wiring controlli ----------
document.getElementById("wRange").addEventListener("input", (e) => {
  work[cur].w = +e.target.value;
  render();
});
document.getElementById("wNum").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (isFinite(v)) {
    work[cur].w = v;
    render();
  }
});
document.getElementById("nx").addEventListener("change", (e) => {
  if (sel && sel.pi >= 0) {
    work[cur].tratti[sel.ti].pts[sel.pi][0] = parseFloat(e.target.value) || 0;
    render();
  }
});
document.getElementById("ny").addEventListener("change", (e) => {
  if (sel && sel.pi >= 0) {
    work[cur].tratti[sel.ti].pts[sel.pi][1] = parseFloat(e.target.value) || 0;
    render();
  }
});
document.getElementById("smoothNode").onclick = toggleSmooth;
document.getElementById("delNode").onclick = delNode;
document.getElementById("newStroke").onclick = newStroke;
document.getElementById("toggleClosed").onclick = toggleClosed;
document.getElementById("delStroke").onclick = delStroke;
document.getElementById("genCode").onclick = () => {
  genCode();
  toast("Codice generato");
};
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
  work[cur] = clone(HERSHEY[cur]);
  sel = null;
  buildGlyphs();
  render();
  toast("Glifo ripristinato a Hershey");
};
document.getElementById("resetAll").onclick = () => {
  if (!confirm("Reset di TUTTA la base alle forme Hershey?")) return;
  work = clone(HERSHEY);
  sel = null;
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
