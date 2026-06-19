// ===== js/ui.js — interfaccia: pannelli, knob, toggle, chain/scope, kerning, scorciatoie, buildUI =====
let knobRefresh = {},
  fxKnobRefresh = {},
  togRefresh = {},
  setB = {},
  vizzes = [],
  vizForce = true,
  undoStack = [],
  redoStack = [],
  chainNodes = [],
  signalStage = null,
  scopeCv = null,
  scopePts = [],
  scopeSweep = 0,
  panelTab = { terminal: 0, curves: 0, metrics: 0, stroke: 0 };
function snap() {
  return JSON.stringify({
    fA: masters.A,
    fB: masters.B,
    mc: masterCur,
    k: kern,
    kc: classKern,
    e: skelEdits,
    lk: glyphLock,
    cf: compFree,
  });
}
function commit() {
  undoStack.push(snap());
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}
function restoreSnap(s) {
  const o = JSON.parse(s);
  if (o.fA) {
    masters.A = o.fA;
    masters.B = o.fB || null;
    masterCur = o.mc === "B" && masters.B ? "B" : "A";
    font = masters[masterCur];
  } else {
    font = o.f;
    masters.A = font;
    masters.B = null;
    masterCur = "A";
  }
  updMasterUI();
  kern = o.k || {};
  classKern = o.kc || {};
  skelEdits = o.e || {};
  glyphLock = o.lk || {};
  compFree = o.cf || {};
  cache = null;
  dirty = true;
  vizForce = true;
  load(Math.min(cur, SET().length - 1));
  updateKern();
  schedPersist();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snap());
  restoreSnap(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snap());
  restoreSnap(redoStack.pop());
}
// tacche del knob (come Knob.jsx): 11 tacche su 270°, le 0/5/10 più lunghe.
// Geometria viewBox 64: trackR 27, tacche da trackR+1 a trackR+(major?4:3).
const KNOB_TICKS = (() => {
  const cx = 32, cy = 32, START = -135, SWEEP = 270;
  const polar = (r, deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  };
  let lines = "";
  for (let i = 0; i <= 10; i++) {
    const deg = START + (i / 10) * SWEEP;
    const major = i % 5 === 0;
    const [x1, y1] = polar(28, deg);
    const [x2, y2] = polar(major ? 31 : 30, deg);
    lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--line-2)" stroke-width="${major ? 1.4 : 1}" stroke-linecap="round"/>`;
  }
  return lines;
})();
// DS Fader: imposta il fill arancio (--p) in base al valore dello slider
function setFaderFill(el) {
  if (!el) return;
  const mn = +el.min || 0,
    mx = +el.max || 100;
  el.style.setProperty(
    "--p",
    ((el.value - mn) / ((mx - mn) || 1)) * 100 + "%",
  );
}
function makeKnob(id) {
  const cf = SL.find((s) => s.id === id);
  const k = document.createElement("div");
  k.className = "knob";
  k.dataset.tip = cf.l + " — trascina su/giù · doppio click = reset";
  k.innerHTML = `<div class="ring"><svg class="kdial" viewBox="0 0 64 64" aria-hidden="true">${KNOB_TICKS}<g transform="rotate(135 32 32)"><circle class="ktrack" cx="32" cy="32" r="27"/><circle class="kval" cx="32" cy="32" r="27"/></g></svg><span class="kcap"></span><span class="kc"></span></div><div class="kl">${cf.l}</div><div class="kv"></div>`;
  const ring = k.querySelector(".ring"),
    kv = k.querySelector(".kv"),
    span = cf.max - cf.min;
  const show = (v) => {
    ring.style.setProperty("--f", (v - cf.min) / span);
    kv.textContent = cf.f(v);
    k.classList.toggle("mod", v !== cf.def);
  };
  const set = (v) => {
    v = Math.round(Math.min(cf.max, Math.max(cf.min, v)));
    editParam(id, v);
    show(v);
    dirty = true;
  };
  knobRefresh[id] = () => show(font[CUR()][id]);
  let drag = null;
  k.addEventListener("pointerdown", (e) => {
    commit();
    drag = { y: e.clientY, x: e.clientX, v: font[CUR()][id] };
    k.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  k.addEventListener("pointermove", (e) => {
    // scrub combinato: su/destra aumenta, giù/sinistra diminuisce
    if (drag)
      set(
        drag.v + ((drag.y - e.clientY + (e.clientX - drag.x)) * span) / 170,
      );
  });
  k.addEventListener("pointerup", () => (drag = null));
  k.addEventListener("pointercancel", () => (drag = null));
  k.addEventListener("dblclick", () => {
    commit();
    set(cf.def);
  });
  if (typeof bindTip === "function")
    bindTip(k, cf.l + " — trascina su/giù · doppio click = reset");
  return k;
}
function makeTog(key) {
  const tg = TOG[key],
    wrap = document.createElement("div");
  wrap.className = "tog";
  wrap.innerHTML = `<div class="tl">${tg.l}</div>`;
  const row = document.createElement("div");
  row.className = "pills";
  const btns = {};
  tg.opts.forEach(([v, t]) => {
    const b = document.createElement("button");
    b.className = "pill";
    b.textContent = t;
    b.onclick = () => {
      commit();
      editTog(key, v);
      togRefresh[key]();
      dirty = true;
    };
    btns[v] = b;
    row.appendChild(b);
  });
  togRefresh[key] = () => {
    const cv = font[CUR()][key];
    for (const v in btns) btns[v].classList.toggle("on", v === cv);
  };
  wrap.appendChild(row);
  return wrap;
}
function fillPolys2D(cx, polys) {
  cx.beginPath();
  for (const pg of polys) {
    const r = pg.outer;
    if (!r.length) continue;
    cx.moveTo(r[0].x, r[0].y);
    for (let i = 1; i < r.length; i++) cx.lineTo(r[i].x, r[i].y);
    cx.closePath();
    for (const h of pg.holes) {
      if (!h.length) continue;
      cx.moveTo(h[0].x, h[0].y);
      for (let i = 1; i < h.length; i++) cx.lineTo(h[i].x, h[i].y);
      cx.closePath();
    }
  }
  cx.fill("evenodd");
}
function vizGlyph(cx, W, H, ch, r) {
  const p = conv(r),
    gw = glw(ch),
    size = (H * 0.6) / Math.max(0.5, p.altezza),
    sx = size * p.larghezza,
    sy = size * p.altezza,
    px = W / 2 - (gw * sx) / 2,
    cap = (H - sy) / 2;
  cx.fillStyle = UI.glyphSoft;
  fillPolys2D(cx, costr(ch, r, px, cap, size).polys);
}
function drawViz(type, cx, W, H, r, p) {
  if (type === "pen") {
    const cxp = W / 2,
      cyp = H / 2,
      R = H * 0.42,
      sc = R / 0.46;
    cx.strokeStyle = UI.lineFaint;
    cx.lineWidth = 1;
    cx.beginPath();
    cx.arc(cxp, cyp, R, 0, TAU);
    cx.stroke();
    cx.beginPath();
    cx.moveTo(cxp - R, cyp);
    cx.lineTo(cxp + R, cyp);
    cx.moveTo(cxp, cyp - R);
    cx.lineTo(cxp, cyp + R);
    cx.stroke();
    cx.save();
    cx.translate(cxp, cyp);
    cx.rotate(p.penang);
    cx.fillStyle = UI.hotSoft;
    cx.strokeStyle = UI.hot;
    cx.lineWidth = 1.5;
    const ea = Math.max(2.5, p.peso * sc),
      eb = Math.max(2.5, p.peso * (1 - (p.contrasto || 0)) * sc); // asse stretto = peso*(1-contrasto)
    cx.beginPath();
    if (p.pen === "rect") cx.rect(-ea, -eb, ea * 2, eb * 2);
    else cx.ellipse(0, 0, ea, eb, 0, 0, TAU);
    cx.fill();
    cx.stroke();
    cx.restore();
    return;
  }
  if (type === "metrics") {
    const pad = 11,
      ascY = -p.asc,
      descY = 1 + 0.33 * p.desc,
      xY = 1 - p.xh,
      lo = Math.min(ascY, 0),
      hi = descY,
      rng = hi - lo || 1,
      Y = (v) => pad + ((v - lo) / rng) * (H - 2 * pad);
    const ln = (yv, col, dash) => {
      cx.strokeStyle = col;
      cx.lineWidth = 1;
      cx.setLineDash(dash || []);
      cx.beginPath();
      cx.moveTo(8, Y(yv));
      cx.lineTo(W - 8, Y(yv));
      cx.stroke();
      cx.setLineDash([]);
    };
    ln(ascY, UI.l1, [2, 3]);
    ln(0, UI.l2);
    ln(xY, UI.soft);
    ln(1, UI.l3);
    ln(descY, UI.l1, [2, 3]);
    const size = Y(1) - Y(0);
    cx.fillStyle = UI.glyphSoft;
    for (const [ch, fx] of [
      ["H", 0.36],
      ["o", 0.62],
    ]) {
      if (!font[ch]) continue;
      const gwc = glw(ch),
        px = W * fx - (gwc * size * p.larghezza) / 2;
      fillPolys2D(cx, costr(ch, r, px, Y(0), size).polys);
    }
    return;
  }
  if (type === "curves") {
    vizGlyph(cx, W, H, "O", r);
    return;
  }
  if (type === "lab") {
    // sul tab FX mostra il glifo con il layer globale applicato (fontR include fxLayer)
    const labCfg = PANELS.find((pp) => pp.id === "lab"),
      fxIdx = labCfg ? labCfg.tabs.findIndex((t) => t.fx) : -1;
    const onFx = fxIdx >= 0 && panelTab.lab === fxIdx;
    vizGlyph(cx, W, H, "R", onFx ? fontR(CUR()) : r);
    return;
  }
  if (type === "terminal") {
    if (panelTab.terminal === 0) drawApexEditor(cx, W, H, p);
    else vizGlyph(cx, W, H, "S", r);
    return;
  }
}
function drawApexEditor(cx, W, H, p) {
  const cxp = W / 2,
    baseY = H * 0.82,
    spread = W * 0.23,
    topBase = H * 0.26,
    tipY = topBase - p.apxOff * H * 0.55,
    tipW = Math.max(1.5, 9 * (1 - p.apxThin)),
    baseW = 9;
  const stroke = (bx) => {
    const dx = cxp - bx,
      dy = tipY - baseY,
      L = Math.hypot(dx, dy) || 1,
      nx = -dy / L,
      ny = dx / L;
    cx.beginPath();
    cx.moveTo(bx + nx * baseW, baseY + ny * baseW);
    cx.lineTo(cxp + nx * tipW, tipY + ny * tipW);
    cx.lineTo(cxp - nx * tipW, tipY - ny * tipW);
    cx.lineTo(bx - nx * baseW, baseY - ny * baseW);
    cx.closePath();
    cx.fill();
  };
  cx.fillStyle = UI.glyphSoft;
  stroke(cxp - spread);
  stroke(cxp + spread);
  cx.fillStyle = UI.trail;
  for (const bx of [cxp - spread, cxp + spread]) {
    cx.beginPath();
    cx.arc(bx, baseY, 3, 0, TAU);
    cx.fill();
  }
  cx.save();
  cx.shadowBlur = 8;
  cx.shadowColor = UI.hot;
  cx.fillStyle = UI.hot;
  cx.beginPath();
  cx.arc(cxp, tipY, 4.5, 0, TAU);
  cx.fill();
  cx.restore();
}
function apexGizmo(cv) {
  let drag = null;
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", (e) => {
    const t = panelTab.terminal;
    if (t !== 0 && t !== 1) return;
    commit();
    drag = {
      x: e.clientX,
      y: e.clientY,
      t,
      off: font[CUR()].apxOff,
      thin: font[CUR()].apxThin,
      tang: font[CUR()].tang,
    };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.t === 0) {
      editParam(
        "apxOff",
        Math.round(
          Math.min(22, Math.max(-22, drag.off + (e.clientX - drag.x) * 0.12)),
        ),
      );
      editParam(
        "apxThin",
        Math.round(
          Math.min(60, Math.max(0, drag.thin - (e.clientY - drag.y) * 0.28)),
        ),
      );
      if (knobRefresh.apxOff) knobRefresh.apxOff();
      if (knobRefresh.apxThin) knobRefresh.apxThin();
    } else {
      editParam(
        "tang",
        Math.round(
          Math.min(60, Math.max(-60, drag.tang + (e.clientX - drag.x) * 0.22)),
        ),
      );
      if (knobRefresh.tang) knobRefresh.tang();
    }
    dirty = true;
  });
  cv.addEventListener("pointerup", () => (drag = null));
  cv.addEventListener("pointercancel", () => (drag = null));
}
function curvesGizmo(cv) {
  let drag = null;
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", (e) => {
    if (panelTab.curves !== 0) return;
    commit();
    drag = { x: e.clientX, v: font[CUR()].convex };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    editParam(
      "convex",
      Math.round(
        Math.min(60, Math.max(-45, drag.v + (e.clientX - drag.x) * 0.28)),
      ),
    );
    if (knobRefresh.convex) knobRefresh.convex();
    dirty = true;
  });
  cv.addEventListener("pointerup", () => (drag = null));
  cv.addEventListener("pointercancel", () => (drag = null));
}
function metricsGizmo(cv) {
  let drag = null;
  cv.style.touchAction = "none";
  const H = cv.height,
    pad = 11;
  const lineYs = () => {
    const p = conv(font[CUR()]),
      ascY = -p.asc,
      descY = 1 + 0.33 * p.desc,
      xY = 1 - p.xh,
      lo = Math.min(ascY, 0),
      rng = descY - lo || 1,
      Y = (v) => pad + ((v - lo) / rng) * (H - 2 * pad);
    return { asc: Y(ascY), x: Y(xY), desc: Y(descY), rng };
  };
  cv.addEventListener("pointerdown", (e) => {
    const rc = cv.getBoundingClientRect(),
      y = e.clientY - rc.top,
      L = lineYs();
    let best = null,
      bd = 18;
    for (const k of ["asc", "x", "desc"]) {
      const d = Math.abs(y - L[k]);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (!best) return;
    commit();
    drag = {
      line: best,
      y: e.clientY,
      rng: L.rng,
      asc: font[CUR()].asc,
      xh: font[CUR()].xheight,
      desc: font[CUR()].desc,
    };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dVal = (((e.clientY - drag.y) * drag.rng) / (H - 2 * pad)) * 100;
    if (drag.line === "x") {
      editParam(
        "xheight",
        Math.round(Math.min(82, Math.max(45, drag.xh - dVal))),
      );
      if (knobRefresh.xheight) knobRefresh.xheight();
    } else if (drag.line === "asc") {
      editParam(
        "asc",
        Math.round(Math.min(25, Math.max(-10, drag.asc - dVal))),
      );
      if (knobRefresh.asc) knobRefresh.asc();
    } else {
      editParam(
        "desc",
        Math.round(Math.min(160, Math.max(40, drag.desc + dVal * 3))),
      );
      if (knobRefresh.desc) knobRefresh.desc();
    }
    dirty = true;
  });
  cv.addEventListener("pointerup", () => (drag = null));
  cv.addEventListener("pointercancel", () => (drag = null));
}
function drawVizzes() {
  const r = font[CUR()],
    p = conv(r);
  for (const v of vizzes) {
    const cx = v.canvas.getContext("2d");
    cx.clearRect(0, 0, v.canvas.width, v.canvas.height);
    try {
      drawViz(v.type, cx, v.canvas.width, v.canvas.height, r, p);
    } catch (e) {}
  }
  updateStats(r);
  drawChain();
}
function nodeSkeleton(cx, W, H, ch, r) {
  const g = srcGlifo(ch);
  let xn = 9,
    xx = -9,
    yn = 9,
    yy = -9;
  for (const t of g.tratti)
    for (const q of t.pts) {
      xn = Math.min(xn, q[0]);
      xx = Math.max(xx, q[0]);
      yn = Math.min(yn, q[1]);
      yy = Math.max(yy, q[1]);
    }
  const bw = xx - xn || 1,
    bh = yy - yn || 1,
    s = Math.min((W - 14) / bw, (H - 14) / bh),
    ox = (W - bw * s) / 2 - xn * s,
    oy = (H - bh * s) / 2 - yn * s;
  cx.strokeStyle = UI.hot;
  cx.lineWidth = 1.3;
  cx.lineJoin = "round";
  for (const t of g.tratti) {
    cx.beginPath();
    t.pts.forEach((q, i) => {
      const X = ox + q[0] * s,
        Y = oy + q[1] * s;
      i ? cx.lineTo(X, Y) : cx.moveTo(X, Y);
    });
    if (t.chiuso) cx.closePath();
    cx.stroke();
    cx.fillStyle = UI.soft;
    for (const q of t.pts) {
      cx.beginPath();
      cx.arc(ox + q[0] * s, oy + q[1] * s, 1.1, 0, TAU);
      cx.fill();
    }
  }
}
function nodePolys(cx, W, H, ch, r, fill) {
  const o = costr(ch, r, 0, 0, 100);
  let xn = 1e9,
    xx = -1e9,
    yn = 1e9,
    yy = -1e9;
  for (const pg of o.polys)
    for (const v of pg.outer) {
      xn = Math.min(xn, v.x);
      xx = Math.max(xx, v.x);
      yn = Math.min(yn, v.y);
      yy = Math.max(yy, v.y);
    }
  if (xx < xn) return;
  const bw = xx - xn || 1,
    bh = yy - yn || 1,
    s = Math.min((W - 14) / bw, (H - 14) / bh),
    ox = (W - bw * s) / 2 - xn * s,
    oy = (H - bh * s) / 2 - yn * s;
  cx.save();
  cx.translate(ox, oy);
  cx.scale(s, s);
  cx.beginPath();
  for (const pg of o.polys) {
    const rr = pg.outer;
    cx.moveTo(rr[0].x, rr[0].y);
    for (let i = 1; i < rr.length; i++) cx.lineTo(rr[i].x, rr[i].y);
    cx.closePath();
    for (const h of pg.holes) {
      cx.moveTo(h[0].x, h[0].y);
      for (let i = 1; i < h.length; i++) cx.lineTo(h[i].x, h[i].y);
      cx.closePath();
    }
  }
  if (fill) {
    cx.fillStyle = UI.glyphSoft;
    cx.fill("evenodd");
  } else {
    cx.strokeStyle = UI.glyphSoft;
    cx.lineWidth = 1.1 / s;
    cx.stroke();
  }
  cx.restore();
}
function drawChain() {
  const ch = CUR(),
    r = font[ch];
  for (const n of chainNodes) {
    const cx = n.cv.getContext("2d");
    cx.clearRect(0, 0, n.cv.width, n.cv.height);
    try {
      n.render(cx, n.cv.width, n.cv.height, ch, r);
    } catch (e) {}
  }
  if (scopeCv)
    try {
      const W = scopeCv.width,
        H = scopeCv.height,
        o = costr(ch, r, 0, 0, 100);
      let xn = 1e9,
        xx = -1e9,
        yn = 1e9,
        yy = -1e9;
      for (const pg of o.polys)
        for (const v of pg.outer) {
          xn = Math.min(xn, v.x);
          xx = Math.max(xx, v.x);
          yn = Math.min(yn, v.y);
          yy = Math.max(yy, v.y);
        }
      const bw = xx - xn || 1,
        bh = yy - yn || 1,
        s = Math.min((W - 12) / bw, (H - 12) / bh),
        ox = (W - bw * s) / 2 - xn * s,
        oy = (H - bh * s) / 2 - yn * s,
        pts = [];
      for (const pg of o.polys) {
        pg.outer.forEach((v, i) =>
          pts.push({ x: ox + v.x * s, y: oy + v.y * s, m: i === 0 }),
        );
        for (const h of pg.holes)
          h.forEach((v, i) =>
            pts.push({ x: ox + v.x * s, y: oy + v.y * s, m: i === 0 }),
          );
      }
      scopePts = pts;
      if (scopeSweep > pts.length) scopeSweep = 0;
    } catch (e) {
      scopePts = [];
    }
}
function drawScope() {
  if (!scopeCv) return;
  const cx = scopeCv.getContext("2d"),
    W = scopeCv.width,
    H = scopeCv.height;
  cx.clearRect(0, 0, W, H);
  const n = scopePts.length;
  if (!n) return;
  cx.strokeStyle = UI.trail;
  cx.lineWidth = 1;
  cx.beginPath();
  for (const p of scopePts) {
    if (p.m) cx.moveTo(p.x, p.y);
    else cx.lineTo(p.x, p.y);
  }
  cx.stroke();
  const head = Math.floor(scopeSweep) % n,
    tr = 26;
  cx.strokeStyle = UI.hot;
  cx.lineWidth = 1.5;
  cx.beginPath();
  for (let i = Math.max(0, head - tr); i <= head; i++) {
    const p = scopePts[i];
    if (!p) continue;
    p.m || i === Math.max(0, head - tr)
      ? cx.moveTo(p.x, p.y)
      : cx.lineTo(p.x, p.y);
  }
  cx.stroke();
  const hp = scopePts[head];
  if (hp) {
    cx.save();
    cx.shadowBlur = 7;
    cx.shadowColor = UI.hot;
    cx.fillStyle = UI.hot;
    cx.beginPath();
    cx.arc(hp.x, hp.y, 2, 0, TAU);
    cx.fill();
    cx.restore();
  }
  scopeSweep = (scopeSweep + 1.3) % n;
}
// fit bbox dell'outline dentro WxH con padding → trasform per disegnare in spazio canvas
function polyBBoxFit(o, W, H, pad) {
  let xn = 1e9,
    xx = -1e9,
    yn = 1e9,
    yy = -1e9;
  for (const pg of o.polys)
    for (const v of pg.outer) {
      xn = Math.min(xn, v.x);
      xx = Math.max(xx, v.x);
      yn = Math.min(yn, v.y);
      yy = Math.max(yy, v.y);
    }
  if (xx < xn) return null;
  const bw = xx - xn || 1,
    bh = yy - yn || 1,
    s = Math.min((W - pad) / bw, (H - pad) / bh);
  return {
    s,
    ox: (W - bw * s) / 2 - xn * s,
    oy: (H - bh * s) / 2 - yn * s,
    xn,
    xx,
    yn,
    yy,
    bw,
    bh,
  };
}
// spazio negativo: riempi il box, sottrai il glifo (evenodd) → restano controforme + sidebearing
function nodeCounter(cx, W, H, ch, r) {
  const o = costr(ch, r, 0, 0, 100),
    f = polyBBoxFit(o, W, H, 14);
  if (!f) return;
  cx.save();
  cx.fillStyle = UI.soft;
  cx.fillRect(f.ox + f.xn * f.s, f.oy + f.yn * f.s, f.bw * f.s, f.bh * f.s);
  cx.globalCompositeOperation = "destination-out";
  cx.translate(f.ox, f.oy);
  cx.scale(f.s, f.s);
  cx.beginPath();
  for (const pg of o.polys) {
    const rings = [pg.outer, ...pg.holes];
    for (const rg of rings) {
      rg.forEach((v, i) => (i ? cx.lineTo(v.x, v.y) : cx.moveTo(v.x, v.y)));
      cx.closePath();
    }
  }
  cx.fill("evenodd");
  cx.restore();
}
// profilo di contrasto: scanline orizzontali, ogni segmento d'inchiostro colorato per spessore (sottile→spesso = freddo→caldo)
function nodeContrast(cx, W, H, ch, r) {
  const o = costr(ch, r, 0, 0, 100),
    f = polyBBoxFit(o, W, H, 14);
  if (!f) return;
  const edges = [];
  for (const pg of o.polys)
    for (const rg of [pg.outer, ...pg.holes])
      for (let i = 0; i < rg.length; i++) {
        const a = rg[i],
          b = rg[(i + 1) % rg.length];
        edges.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      }
  const ROWS = Math.max(22, Math.floor(f.bh * f.s)),
    rows = [];
  let smax = 0;
  for (let i = 0; i < ROWS; i++) {
    const y = f.yn + ((i + 0.5) / ROWS) * f.bh,
      xs = [];
    for (const e of edges)
      if ((e.y0 <= y && e.y1 > y) || (e.y1 <= y && e.y0 > y)) {
        const t = (y - e.y0) / (e.y1 - e.y0);
        xs.push(e.x0 + t * (e.x1 - e.x0));
      }
    xs.sort((a, b) => a - b);
    const spans = [];
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      spans.push([xs[k], xs[k + 1], w]);
      if (w > smax) smax = w;
    }
    rows.push({ y, spans });
  }
  smax = smax || 1;
  cx.lineWidth = Math.max(1, (f.bh * f.s) / ROWS + 0.6);
  cx.lineCap = "butt";
  for (const row of rows)
    for (const sp of row.spans) {
      const t = Math.min(1, sp[2] / smax);
      cx.strokeStyle = `hsl(${Math.round(210 - 210 * t)}, 78%, 56%)`;
      cx.beginPath();
      cx.moveTo(f.ox + sp[0] * f.s, f.oy + row.y * f.s);
      cx.lineTo(f.ox + sp[1] * f.s, f.oy + row.y * f.s);
      cx.stroke();
    }
}
function buildChain() {
  const host = document.getElementById("chain");
  host.innerHTML =
    '<div class="ph" id="chainhead"><span class="dot"></span><span>Signal</span></div>';
  const body = document.createElement("div");
  body.className = "pb cbody";
  const renderPen = (c, W, H, ch, r) => {
    const sv = bypass;
    bypass = { curves: true, terminal: true };
    try {
      nodePolys(c, W, H, ch, r, false);
    } finally {
      bypass = sv;
    }
  };
  const stages = [
    ["Blueprint", nodeSkeleton],
    ["Pen", renderPen],
    ["Outline", (c, W, H, ch, r) => nodePolys(c, W, H, ch, r, true)],
    ["Counter", nodeCounter],
    ["Contrast", nodeContrast],
    ["Scope", null],
  ];
  stages.forEach((st, i) => {
    if (i > 0) {
      const ar = document.createElement("div");
      ar.className = "carrow";
      ar.textContent = "▸";
      body.appendChild(ar);
    }
    const node = document.createElement("div");
    node.className = "cnode";
    const cv = document.createElement("canvas");
    cv.width = 44;
    cv.height = 44;
    const lab = document.createElement("div");
    lab.className = "clab";
    lab.textContent = st[0];
    node.appendChild(cv);
    node.appendChild(lab);
    node.dataset.stage = st[0];
    node.style.cursor = "pointer";
    node.onclick = () => setSignalStage(st[0], st[1]);
    if (typeof bindTip === "function")
      bindTip(
        node,
        st[0] +
          "\n" +
          (st[1]
            ? "Click: vedi il glifo a questo stadio sul canvas (riclicca = off)"
            : "Oscilloscopio del tratto"),
      );
    body.appendChild(node);
    if (st[1]) chainNodes.push({ cv, render: st[1] });
    else scopeCv = cv;
  });
  host.appendChild(body);
  host.style.display = "none";
  dragify(host, document.getElementById("chainhead"));
  addCollapse(host, document.getElementById("chainhead"));
}
// Signal: "solo stadio" sul canvas grande. Click nodo → renderizza il glifo a
// quello stadio; riclicca lo stesso (o un nodo senza render = Scope) per off.
function setSignalStage(label, render) {
  if (!render || (signalStage && signalStage.label === label))
    signalStage = null;
  else signalStage = { label, render };
  for (const n of document.querySelectorAll("#chain .cnode"))
    n.classList.toggle(
      "on",
      !!signalStage && n.dataset.stage === signalStage.label,
    );
  cache = null;
  dirty = true;
  vizForce = true;
}
function updateStats(r) {
  const el = document.getElementById("stats");
  if (!el) return;
  try {
    const ch = CUR(),
      o = costr(ch, r, 0, 0, 700);
    let nodes = 0;
    for (const pg of o.polys) {
      nodes += pg.outer.length;
      for (const h of pg.holes) nodes += h.length;
    }
    let mod = 0;
    for (const s of SL) if (r[s.id] !== s.def) mod++;
    el.textContent = `▸ ${ch}  ·  ${o.polys.length} contorni  ·  ${nodes} nodi  ·  adv ${Math.round(o.advance)}  ·  ${mod} mod${glyphLocked(ch) ? "  ·  🔒 bloccato" : ""}${compLinked(ch) ? "  ·  ↳ " + COMPOSITES[ch][0] : ""}`;
  } catch (e) {}
}
function penGizmo(cv) {
  let drag = null;
  cv.style.touchAction = "none";
  cv.addEventListener("pointerdown", (e) => {
    commit();
    drag = {
      x: e.clientX,
      y: e.clientY,
      stem: font[CUR()].peso,
      contrasto: font[CUR()].contrasto || 0,
    };
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!drag) return;
    editParam(
      "peso",
      Math.round(
        Math.min(46, Math.max(2, drag.stem + (e.clientX - drag.x) * 0.32)),
      ),
    );
    editParam(
      "contrasto",
      Math.round(
        Math.min(85, Math.max(0, drag.contrasto - (e.clientY - drag.y) * 0.55)),
      ),
    );
    if (knobRefresh.peso) knobRefresh.peso();
    if (knobRefresh.contrasto) knobRefresh.contrasto();
    dirty = true;
  });
  cv.addEventListener("pointerup", () => (drag = null));
  cv.addEventListener("pointercancel", () => (drag = null));
}
function addCollapse(p, head) {
  const ch = document.createElement("span");
  ch.className = "chev";
  ch.textContent = "▾";
  ch.title = "Comprimi / espandi";
  ch.addEventListener("pointerdown", (e) => e.stopPropagation());
  ch.addEventListener("click", (e) => {
    e.stopPropagation();
    p.classList.toggle("collapsed");
  });
  head.appendChild(ch);
}
function dragify(p, handle) {
  let d = null;
  handle.addEventListener("pointerdown", (e) => {
    if (getComputedStyle(p).transform !== "none") {
      const rc = p.getBoundingClientRect();
      p.style.left = rc.left + "px";
      p.style.transform = "none";
    }
    d = { x: e.clientX, y: e.clientY, l: p.offsetLeft, t: p.offsetTop };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!d) return;
    p.style.left = d.l + e.clientX - d.x + "px";
    p.style.top = Math.max(50, d.t + e.clientY - d.y) + "px";
    p.style.right = "auto";
  });
  handle.addEventListener("pointerup", () => (d = null));
  handle.addEventListener("pointercancel", () => (d = null));
}
function makePanel(cfg) {
  const p = document.createElement("div");
  p.className = "pan";
  p.id = "pan-" + cfg.id;
  const head = document.createElement("div");
  head.className = "ph";
  head.innerHTML = `<span class="dot"></span><span>${cfg.t}</span>`;
  p.appendChild(head);
  if (cfg.id === "curves" || cfg.id === "terminal" || cfg.id === "lab") {
    const led = head.querySelector(".dot");
    led.style.cursor = "pointer";
    if (typeof bindTip === "function")
      bindTip(led, "Bypass modulo\nDisattiva temporaneamente Curves / Terminal / Lab sul glifo");
    led.addEventListener("pointerdown", (e) => e.stopPropagation());
    led.addEventListener("click", (e) => {
      e.stopPropagation();
      bypass[cfg.id] = !bypass[cfg.id];
      led.classList.toggle("off", bypass[cfg.id]);
      p.classList.toggle("byp", bypass[cfg.id]);
      dirty = true;
      vizForce = true;
    });
  }
  if (cfg.desc && typeof bindTip === "function")
    bindTip(head, cfg.t + "\n" + cfg.desc);
  const body = document.createElement("div");
  body.className = "pb";
  if (cfg.viz) {
    const cv = document.createElement("canvas");
    cv.className = "pviz";
    cv.width = 210;
    cv.height = 88;
    if (cfg.viz === "pen") {
      cv.classList.add("grab");
      if (typeof bindTip === "function")
        bindTip(cv, "Anteprima penna\nTrascina: Stem (←→) · Bar (↑↓)");
      penGizmo(cv);
    }
    if (cfg.viz === "terminal") {
      cv.classList.add("grab");
      if (typeof bindTip === "function")
        bindTip(cv, "Anteprima terminali\nApex: trascina la punta · Termin.: trascina = angolo");
      apexGizmo(cv);
    }
    if (cfg.viz === "curves") {
      cv.classList.add("grab");
      if (typeof bindTip === "function")
        bindTip(cv, "Anteprima curve\nTab Forma: trascina ←→ = bombatura (Convex)");
      curvesGizmo(cv);
    }
    if (cfg.viz === "metrics") {
      cv.classList.add("grab");
      if (typeof bindTip === "function")
        bindTip(cv, "Anteprima metriche\nTrascina le linee: x-height · ascender · descender");
      metricsGizmo(cv);
    }
    body.appendChild(cv);
    vizzes.push({ type: cfg.viz, canvas: cv });
  }
  if (cfg.tabs) {
    const tabRow = document.createElement("div");
    tabRow.className = "ptabs";
    const kw = document.createElement("div");
    const dots = document.createElement("div");
    dots.className = "pdots";
    const render = (ti) => {
      kw.innerHTML = "";
      const tab = cfg.tabs[ti];
      if (tab.fx) {
        buildFXTab(kw);
      } else {
        const grid = document.createElement("div");
        grid.className = "knobs";
        for (const id of tab.knobs) grid.appendChild(makeKnob(id));
        kw.appendChild(grid);
        for (const id of tab.knobs) if (knobRefresh[id]) knobRefresh[id]();
      }
      [...tabRow.children].forEach((b, i) =>
        b.classList.toggle("on", i === ti),
      );
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i === ti));
      panelTab[cfg.id] = ti;
      vizForce = true;
    };
    cfg.tabs.forEach((t, i) => {
      const b = document.createElement("button");
      b.className = "ptab";
      b.textContent = t.n;
      b.onclick = () => render(i);
      const tabKnobs = (t.knobs || [])
        .map((id) => (SL.find((s) => s.id === id) || {}).l || id)
        .join(", ");
      if (typeof bindTip === "function")
        bindTip(b, t.n + "\n" + (t.h || tabKnobs));
      tabRow.appendChild(b);
      const d = document.createElement("span");
      d.className = "pdot";
      d.onclick = () => render(i);
      dots.appendChild(d);
    });
    body.appendChild(tabRow);
    body.appendChild(kw);
    body.appendChild(dots);
    render(0);
  } else if (cfg.knobs) {
    const grid = document.createElement("div");
    grid.className = "knobs";
    for (const id of cfg.knobs) grid.appendChild(makeKnob(id));
    body.appendChild(grid);
  }
  if (cfg.togs) for (const t of cfg.togs) body.appendChild(makeTog(t));
  p.appendChild(body);
  p.style.display = "none";
  document.body.appendChild(p);
  dragify(p, head);
  addCollapse(p, head);
  p.dataset.col = cfg.col;
  return p;
}
function layoutPanels() {
  for (const cfg of PANELS) {
    const p = document.getElementById("pan-" + cfg.id);
    if (cfg.col === "L") {
      p.style.left = "18px";
      p.style.right = "auto";
    } else {
      // colonna destra: lascia spazio al dock verticale delle azioni (#dock2)
      p.style.right = "78px";
      p.style.left = "auto";
    }
    p.style.top = cfg.y + "px";
  }
}
function setZoom(z) {
  zoom = Math.min(4, Math.max(0.4, z));
  document.getElementById("zval").textContent = Math.round(zoom * 100) + "%";
}
// popover Consistenza: elenca i parametri che divergono tra i glifi, con bottone "Uniforma"
function renderConsist() {
  const body = document.getElementById("consistBody");
  if (!body) return;
  const { rows, total } = consistReport();
  body.innerHTML = "";
  if (!rows.length) {
    const ok = document.createElement("div");
    ok.className = "consist-ok";
    ok.textContent = "Parametri strutturali coerenti su tutti i " + total + " glifi ✓";
    body.appendChild(ok);
    return;
  }
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "consist-row";
    const info = document.createElement("div");
    info.className = "consist-info";
    info.innerHTML =
      '<span class="consist-l">' +
      r.l +
      '</span><span class="consist-d">' +
      r.nOut +
      " divers" +
      (r.nOut === 1 ? "o" : "i") +
      " · moda " +
      r.modeFmt +
      " (" +
      r.count +
      "/" +
      total +
      ")</span>";
    const btn = document.createElement("button");
    btn.textContent = "Uniforma";
    btn.title = "Porta tutti a " + r.modeFmt + " — diversi: " + r.outliers.join(" ");
    btn.onclick = (e) => {
      e.stopPropagation();
      consistApply(r.id);
    };
    row.appendChild(info);
    row.appendChild(btn);
    body.appendChild(row);
  }
}
// ===== Layer FX globale: pannello a knob come gli altri (additivo, reversibile, non distruttivo) =====
const FXLABELS = {
  wob: "Wobble",
  rough: "Ruvido",
  glitchN: "Glitch",
  twist: "Twist",
  inflate: "Gonfia",
  stepGrid: "Pixel",
  vortex: "Vortex",
};
// knob legato al layer FX globale (fxLayer[id]), stesso aspetto dei knob per-glifo ma def 0
function makeFXKnob(id) {
  const cf = SLById[id],
    mn = Math.min(0, cf.min),
    mx = cf.max,
    span = mx - mn,
    label = FXLABELS[id] || cf.l;
  const k = document.createElement("div");
  k.className = "knob";
  k.innerHTML = `<div class="ring"><svg class="kdial" viewBox="0 0 64 64" aria-hidden="true">${KNOB_TICKS}<g transform="rotate(135 32 32)"><circle class="ktrack" cx="32" cy="32" r="27"/><circle class="kval" cx="32" cy="32" r="27"/></g></svg><span class="kcap"></span><span class="kc"></span></div><div class="kl">${label}</div><div class="kv"></div>`;
  const ring = k.querySelector(".ring"),
    kv = k.querySelector(".kv");
  const show = (v) => {
    ring.style.setProperty("--f", (v - mn) / span);
    kv.textContent = cf.f(v);
    k.classList.toggle("mod", v !== 0);
  };
  const set = (v) => {
    v = Math.round(Math.min(mx, Math.max(mn, v)));
    fxLayer[id] = v;
    show(v);
    if (fxOn) {
      dirty = true;
      cache = null;
      lintCache = null;
    }
    schedPersist();
  };
  fxKnobRefresh[id] = () => show(fxLayer[id]);
  let drag = null;
  k.addEventListener("pointerdown", (e) => {
    drag = { y: e.clientY, x: e.clientX, v: fxLayer[id] };
    k.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  k.addEventListener("pointermove", (e) => {
    if (drag)
      set(drag.v + ((drag.y - e.clientY + (e.clientX - drag.x)) * span) / 170);
  });
  k.addEventListener("pointerup", () => (drag = null));
  k.addEventListener("pointercancel", () => (drag = null));
  k.addEventListener("dblclick", () => set(0));
  if (typeof bindTip === "function")
    bindTip(k, label + " — trascina su/giù · doppio click = azzera");
  show(fxLayer[id]);
  return k;
}
// sincronizza il pulsante On/Off del tab FX (se renderizzato) con fxOn
function syncFXToggle() {
  const b = document.getElementById("fxTabTog");
  if (!b) return;
  b.classList.toggle("on", fxOn);
  b.textContent = fxOn ? "On" : "Off";
}
// contenuto del tab "FX" del pannello Lab: toggle On/Off + knob globali + azzera
function buildFXTab(kw) {
  const tog = document.createElement("div");
  tog.className = "fxtab-tog";
  const lbl = document.createElement("span");
  lbl.textContent = "Effetti attivi";
  const btn = document.createElement("button");
  btn.id = "fxTabTog";
  btn.className = "fxtog" + (fxOn ? " on" : "");
  btn.textContent = fxOn ? "On" : "Off";
  btn.onclick = () => {
    fxOn = !fxOn;
    syncFXToggle();
    dirty = true;
    cache = null;
    lintCache = null;
    vizForce = true;
    schedPersist();
  };
  tog.append(lbl, btn);
  kw.appendChild(tog);
  const grid = document.createElement("div");
  grid.className = "knobs";
  for (const id of FXKEYS) grid.appendChild(makeFXKnob(id));
  kw.appendChild(grid);
  const rs = document.createElement("button");
  rs.className = "fxreset";
  rs.textContent = "Azzera effetti";
  rs.onclick = () => {
    for (const k of FXKEYS) fxLayer[k] = 0;
    for (const k in fxKnobRefresh) fxKnobRefresh[k]();
    dirty = true;
    cache = null;
    lintCache = null;
    vizForce = true;
    schedPersist();
    toast("Effetti azzerati");
  };
  kw.appendChild(rs);
}
// anteprima di uno stile rapido: rende "Aa" con il preset applicato su un default pulito
function drawPresetPrev(cv, preset) {
  const dpr = window.devicePixelRatio || 1,
    W = cv.clientWidth || 150,
    H = cv.clientHeight || 72;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = (
    getComputedStyle(document.body).getPropertyValue("--glyph") || "#eee"
  ).trim();
  const r = Object.assign(def0(), preset.set),
    p = conv(r),
    chars = ["A", "a"];
  let tw = 0;
  for (const c of chars) tw += glw(c) * p.larghezza + 0.12;
  const size = Math.min(
    (H * 0.62) / Math.max(0.5, p.altezza),
    (W * 0.8) / Math.max(0.3, tw),
  );
  let x = (W - tw * size) / 2;
  const cap = (H - size * p.altezza) / 2;
  for (const c of chars) {
    fillPolys2D(ctx, costr(c, r, x, cap, size).polys);
    x += (glw(c) * p.larghezza + 0.12) * size;
  }
}
// galleria Stili rapidi: stesso pannellino visivo della galleria scheletri
function initPresetGal() {
  const modal = document.getElementById("presetGal"),
    grid = document.getElementById("presetGrid"),
    btn = document.getElementById("presetB");
  if (!modal || !grid || !btn) return;
  let built = false;
  const close = () => modal.classList.remove("on");
  const open = () => {
    modal.classList.add("on");
    if (!built) {
      built = true;
      for (const pr of PRESETS) {
        const card = document.createElement("button");
        card.className = "bcard";
        const cv = document.createElement("canvas"),
          nm = document.createElement("span");
        nm.className = "bname";
        nm.textContent = pr.l;
        card.append(cv, nm);
        card.onclick = () => {
          applyPreset(pr.id);
          close();
        };
        if (typeof bindTip === "function") bindTip(card, pr.l + "\n" + pr.hint);
        grid.appendChild(card);
      }
    }
    [...grid.children].forEach((card, i) =>
      drawPresetPrev(card.querySelector("canvas"), PRESETS[i]),
    );
  };
  btn.onclick = open;
  document.getElementById("presetGalClose").onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("on")) close();
  });
}
function buildUI() {
  for (const cfg of PANELS) makePanel(cfg);
  layoutPanels();
  const stb = document.getElementById("settabs"),
    LBL = {
      upper: "ABC",
      lower: "abc",
      num: "123",
      acc: "àé",
      punct: ".,?",
      pairs: "Aa",
      all: "Tutto",
      abtest: "A/B",
    };
  for (const key of ["upper", "lower", "num", "acc", "punct"]) {
    const b = document.createElement("button");
    b.textContent = LBL[key];
    b.onclick = () => selSet(key);
    setB[key] = b;
    stb.appendChild(b);
  }
  for (const key of ["pairs", "all", "abtest"]) {
    const b = document.createElement("button");
    b.textContent = LBL[key];
    b.onclick = () => selView(key);
    setB[key] = b;
    stb.appendChild(b);
  }
  setB.upper.classList.add("on");
  document.getElementById("prev").onclick = () =>
    load((cur + SET().length - 1) % SET().length);
  document.getElementById("next").onclick = () =>
    load((cur + 1) % SET().length);
  const gridBtn = document.getElementById("grid");
  gridBtn.classList.toggle("on", mostra);
  gridBtn.onclick = (e) => {
    mostra = !mostra;
    e.currentTarget.classList.toggle("on", mostra);
  };
  const galBtn = document.getElementById("galToggle");
  if (galBtn) {
    galBtn.classList.toggle("on", galleryOn);
    galBtn.onclick = (e) => {
      galleryOn = !galleryOn;
      e.currentTarget.classList.toggle("on", galleryOn);
      dirty = true;
      vizForce = true;
    };
  }
  document.getElementById("hollow").onclick = (e) => {
    disp = disp === "line" ? "fill" : "line";
    e.currentTarget.classList.toggle("on", disp === "line");
  };
  document.getElementById("unite").onclick = (e) => {
    union0 = !union0;
    e.currentTarget.classList.toggle("on", union0);
    dirty = true;
  };
  document.getElementById("lintB").onclick = (e) => {
    lintOn = !lintOn;
    e.currentTarget.classList.toggle("on", lintOn);
    if (lintOn) {
      const r = lintAll();
      if (r.err || r.warn)
        toast(
          "Controllo qualità: " +
            r.err +
            " error" +
            (r.err === 1 ? "e" : "i") +
            ", " +
            r.warn +
            " avvis" +
            (r.warn === 1 ? "o" : "i"),
          r.err > 0,
        );
      else toast("Controllo qualità: tutti i glifi puliti ✓");
    } else lintCache = null;
  };
  document.getElementById("cmpB").onclick = (e) => {
    if (!masters.B) {
      toast("Crea prima il Master B (clic su B)", true);
      return;
    }
    cmpAB = !cmpAB;
    e.currentTarget.classList.toggle("on", cmpAB);
    dirty = true;
  };
  document.getElementById("autosp").onclick = (e) => {
    autoSpace = !autoSpace;
    e.currentTarget.classList.toggle("on", autoSpace);
    dirty = true;
    schedPersist();
  };
  document.getElementById("editB").onclick = (e) => {
    editMode = !editMode;
    e.currentTarget.classList.toggle("on", editMode);
    // sub-barra contestuale (disegna / rettangolo / tracciati) visibile solo in modifica
    document.getElementById("editTools").style.display = editMode ? "" : "none";
    if (!editMode) {
      // uscendo dalla modifica, spegni i sotto-strumenti
      drawMode = false;
      edPending = null;
      document.getElementById("drawB").classList.remove("on");
    }
    dirty = true;
  };
  document.getElementById("drawB").onclick = (e) => {
    drawMode = !drawMode;
    e.currentTarget.classList.toggle("on", drawMode);
    edPending = null;
    if (drawMode && !editMode) {
      editMode = true;
      document.getElementById("editB").classList.add("on");
    }
    dirty = true;
  };
  document.getElementById("copyStr").onclick = () => {
    const g = srcGlifo(CUR());
    glyphClip = JSON.parse(JSON.stringify({ w: g.w, tratti: g.tratti }));
    toast("Struttura di " + CUR() + " copiata");
  };
  document.getElementById("pasteStr").onclick = () => {
    if (!glyphClip) {
      toast("Nessuna struttura copiata", true);
      return;
    }
    commit();
    skelEdits[CUR()] = JSON.parse(JSON.stringify(glyphClip));
    dirty = true;
    vizForce = true;
    schedPersist();
    toast("Struttura incollata su " + CUR());
  };
  document.getElementById("joinPts").onclick = edJoinSel;
  const applyXY = () => {
    if (!edSel.length || !edTX) return;
    commit();
    const g = edEnsure(),
      s = edSel[edSel.length - 1],
      P = g.tratti[s.ti] && g.tratti[s.ti].pts[s.pi];
    if (!P) return;
    const vx = parseFloat(document.getElementById("enx").value),
      vy = parseFloat(document.getElementById("eny").value);
    if (isFinite(vx)) P[0] = vx;
    if (isFinite(vy)) P[1] = vy;
    dirty = true;
    vizForce = true;
    schedPersist();
  };
  for (const id of ["enx", "eny"]) {
    const inp = document.getElementById(id);
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        applyXY();
        inp.blur();
      }
    });
  }
  const selPts = () => {
    const g = edEnsure();
    return edSel
      .map((s) => g.tratti[s.ti] && g.tratti[s.ti].pts[s.pi])
      .filter(Boolean);
  };
  document.getElementById("ealx").onclick = () => {
    if (edSel.length < 2) return;
    commit();
    const ps = selPts(),
      ax = ps.reduce((a, p) => a + p[0], 0) / ps.length;
    for (const p of ps) p[0] = ax;
    dirty = true;
    vizForce = true;
    schedPersist();
  };
  document.getElementById("ealy").onclick = () => {
    if (edSel.length < 2) return;
    commit();
    const ps = selPts(),
      ay = ps.reduce((a, p) => a + p[1], 0) / ps.length;
    for (const p of ps) p[1] = ay;
    dirty = true;
    vizForce = true;
    schedPersist();
  };
  document.getElementById("emirx").onclick = () =>
    edTransformSel(
      (x, y, c) => [2 * c[0] - x, y],
      (v) => [-v[0], v[1]],
    );
  document.getElementById("emiry").onclick = () =>
    edTransformSel(
      (x, y, c) => [x, 2 * c[1] - y],
      (v) => [v[0], -v[1]],
    );
  const rotSel = (a) => {
    const ca = Math.cos(a),
      sa = Math.sin(a);
    edTransformSel(
      (x, y, c) => {
        const dx = x - c[0],
          dy = y - c[1];
        return [c[0] + dx * ca - dy * sa, c[1] + dx * sa + dy * ca];
      },
      (v) => [v[0] * ca - v[1] * sa, v[0] * sa + v[1] * ca],
    );
  };
  document.getElementById("erotl").onclick = () => rotSel(-Math.PI / 12);
  document.getElementById("erotr").onclick = () => rotSel(Math.PI / 12);
  document.getElementById("mA").onclick = () => setMaster("A");
  document.getElementById("mB").onclick = () => setMaster("B");
  const interpEl = document.getElementById("interp");
  setFaderFill(interpEl);
  interpEl.addEventListener("input", (e) => {
    interT = +e.target.value / 100;
    setFaderFill(e.target);
    cache = null;
    dirty = true;
    vizForce = true;
    schedPersist();
  });
  // type-tester: scrivi direttamente sulla riga cliccata (capture, prima delle scorciatoie)
  window.addEventListener(
    "keydown",
    (e) => {
      if (viewMode !== "abtest" || abEdit === null) return;
      const tn = (e.target && e.target.tagName) || "";
      if (tn === "INPUT" || tn === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" || e.key === "Enter") abEdit = null;
      else if (e.key === "Backspace")
        abTexts[abEdit] = abTexts[abEdit].slice(0, -1);
      else if (e.key.length === 1) abTexts[abEdit] += e.key;
      else return;
      dirty = true;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  document.getElementById("resetPts").onclick = () => {
    commit();
    delete skelEdits[CUR()];
    dirty = true;
    vizForce = true;
    toast("Punti del glifo " + CUR() + " ripristinati");
  };
  document.getElementById("reset").onclick = () => {
    commit();
    font[CUR()] = def0();
    load(cur);
  };
  document.getElementById("applyAll").onclick = () => {
    commit();
    const s = font[CUR()];
    for (const c of ALLCHARS) {
      const se = font[c].seme;
      font[c] = Object.assign({}, s, { seme: se });
    }
    dirty = true;
    toast("Parametri applicati a tutte le lettere");
  };
  document.getElementById("zin").onclick = () => setZoom(zoom + 0.15);
  document.getElementById("zout").onclick = () => setZoom(zoom - 0.15);
  const specDim = () => {
    const [w, h] = (
      document.getElementById("specFmt")?.value || "1080x1440"
    )
      .split("x")
      .map(Number);
    return [w, h];
  };
  document.getElementById("png").onclick = () => {
    const [W, H] = specDim();
    posterPNG(W, H);
    toast("Poster " + W + "×" + H + " PNG esportato");
  };
  document.getElementById("svg").onclick = () => {
    const [W, H] = specDim();
    dl(posterSVG(W, H), "specimen-" + W + "x" + H + ".svg");
    toast("Poster " + W + "×" + H + " SVG esportato");
  };
  document.getElementById("gsvg").onclick = () => {
    const S = 1000,
      m = 150,
      L = CUR(),
      p = conv(fontR(L));
    let gw = glw(L);
    const size = Math.min(
        (S - 2 * m) / p.altezza,
        (S - 2 * m) / Math.max(0.3, gw * p.larghezza),
      ),
      sx = size * p.larghezza,
      sy = size * p.altezza,
      penX = S / 2 - (gw * sx) / 2,
      capTop = S / 2 - sy / 2;
    dl(
      svg(costr(L, fontR(L), penX, capTop, size).polys, S, S),
      "lettera-" + L + ".svg",
    );
    toast("Glifo " + L + " esportato in SVG");
  };
  document.getElementById("autospace").onclick = autoSpaceAll;
  document.getElementById("otf").onclick = exportFont;
  document.getElementById("verifyB").onclick = verifyFont;
  document.getElementById("verifyClose").onclick = () =>
    document.getElementById("verify").classList.remove("on");
  document.getElementById("verify").addEventListener("click", (e) => {
    if (e.target.id === "verify")
      document.getElementById("verify").classList.remove("on");
  });
  const wordEl = document.getElementById("word"),
    wordClearEl = document.getElementById("wordClear"),
    syncWordClear = () => {
      wordClearEl.style.display = word.trim() ? "flex" : "none";
    };
  wordEl.addEventListener("input", (e) => {
    word = e.target.value;
    updateKern();
    syncWordClear();
    dirty = true;
  });
  wordClearEl.onclick = () => {
    word = "";
    wordEl.value = "";
    updateKern();
    syncWordClear();
    dirty = true;
    wordEl.focus();
  };
  document.getElementById("undoB").onclick = undo;
  document.getElementById("redoB").onclick = redo;
  document.getElementById("saveP").onclick = saveProject;
  const logoutBtn = document.getElementById("logoutB");
  if (logoutBtn)
    logoutBtn.onclick = () => {
      if (typeof ApiceLogout === "function") ApiceLogout();
    };
  const filein = document.getElementById("filein");
  document.getElementById("openP").onclick = () => {
    filein.value = "";
    filein.click();
  };
  filein.addEventListener("change", () => {
    const f = filein.files[0];
    if (!f) return;
    f.text()
      .then((t) => {
        applyProject(JSON.parse(t));
        toast("Progetto caricato — " + fontName);
      })
      .catch((e) => toast("Apertura fallita: " + e.message, true));
  });
  // font di riferimento (trace layer): importa OTF/TTF da tracciare
  const tracein = document.getElementById("tracein");
  const traceLoad = document.getElementById("traceLoad");
  if (traceLoad)
    traceLoad.onclick = () => {
      tracein.value = "";
      tracein.click();
    };
  if (tracein)
    tracein.addEventListener("change", () => {
      const f = tracein.files[0];
      if (!f) return;
      if (typeof opentype === "undefined") {
        toast("opentype.js non caricato", true);
        return;
      }
      f.arrayBuffer()
        .then((ab) => {
          traceFont = opentype.parse(ab);
          traceOn = true;
          dirty = true;
          toast("Font traccia: " + f.name + " — attiva");
        })
        .catch((e) => toast("Font non valido: " + e.message, true));
    });
  const traceTog = document.getElementById("traceTog");
  if (traceTog)
    traceTog.onclick = () => {
      if (!traceFont) {
        toast("Nessun font traccia caricato", true);
        return;
      }
      traceOn = !traceOn;
      dirty = true;
      toast(traceOn ? "Traccia mostrata" : "Traccia nascosta");
    };
  const traceClear = document.getElementById("traceClear");
  if (traceClear)
    traceClear.onclick = () => {
      traceFont = null;
      traceOn = false;
      dirty = true;
      toast("Font traccia rimosso");
    };
  // import font da editare: A (outline) / B (scheletrizza)
  const impin = document.getElementById("impin");
  let impMode = "A";
  const wireImp = (btnId, mode) => {
    const b = document.getElementById(btnId);
    if (b)
      b.onclick = () => {
        impMode = mode;
        impin.value = "";
        impin.click();
      };
  };
  wireImp("impOutline", "A");
  wireImp("impSkel", "B");
  if (impin)
    impin.addEventListener("change", () => {
      const f = impin.files[0];
      if (!f) return;
      if (typeof opentype === "undefined") {
        toast("opentype.js non caricato", true);
        return;
      }
      toast("Import in corso…");
      f.arrayBuffer()
        .then((ab) => {
          const font = opentype.parse(ab);
          commit();
          const n =
            impMode === "B" ? importSkeletons(font) : importOutlines(font);
          cache = null;
          dirty = true;
          vizForce = true;
          load(cur);
          schedPersist();
          toast(
            (impMode === "B" ? "Scheletrizzati" : "Outline importate") +
              ": " +
              n +
              " glifi — " +
              f.name,
          );
        })
        .catch((e) => toast("Import fallito: " + e.message, true));
    });
  const impClear = document.getElementById("impClear");
  if (impClear)
    impClear.onclick = () => {
      commit();
      clearImport();
      cache = null;
      dirty = true;
      vizForce = true;
      load(cur);
      schedPersist();
      toast("Import rimosso");
    };
  document.getElementById("fname").addEventListener("change", () => {
    fontName = cleanName();
    setFontName(fontName);
    schedPersist();
  });
  const bsel = document.getElementById("basefont");
  for (const [v, l] of BASEFONTS) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = l;
    bsel.appendChild(o);
  }
  bsel.value = "interno";
  bsel.addEventListener("change", () => setBase(bsel.value));
  initBaseGal();
  initPresetGal();
  const helpEl = document.getElementById("help");
  document.getElementById("helpB").onclick = () => helpEl.classList.add("on");
  document.getElementById("helpClose").onclick = () =>
    helpEl.classList.remove("on");
  helpEl.addEventListener("click", (e) => {
    if (e.target === helpEl) helpEl.classList.remove("on");
  });
  document.getElementById("newP").onclick = () => {
    if (
      !confirm(
        "Nuovo progetto: tutte le modifiche correnti andranno perse. Continuare?",
      )
    )
      return;
    commit();
    masterCur = "A";
    font = masters.A;
    masters.B = null;
    interT = 0;
    const slI = document.getElementById("interp");
    if (slI) {
      slI.value = 0;
      setFaderFill(slI);
    }
    updMasterUI();
    initFont();
    kern = {};
    classKern = {};
    skelEdits = {};
    glyphLock = {};
    compFree = {};
    glyphRaw = {};
    imported = {};
    // reset completo: layer FX globale, spaziatura auto, traccia, viste, bypass, base
    for (const k in fxLayer) fxLayer[k] = 0;
    fxOn = false;
    if (typeof syncFXToggle === "function") syncFXToggle();
    autoSpace = false;
    const abtn = document.getElementById("autosp");
    if (abtn) abtn.classList.remove("on");
    traceFont = null;
    traceOn = false;
    abTexts[0] = abTexts[1] = abTexts[2] = "Handgloves";
    abEdit = null;
    bypass = { curves: false, terminal: false, lab: false };
    viewMode = "single";
    editScope = "single";
    zoom = 1;
    panX = 0;
    panY = 0;
    editMode = false;
    drawMode = false;
    rectMode = false;
    edSel = [];
    edTX = null;
    document.getElementById("editB").classList.remove("on");
    const etools = document.getElementById("editTools");
    if (etools) etools.style.display = "none";
    word = "";
    const wEl = document.getElementById("word");
    if (wEl) wEl.value = "";
    BASE = HERSHEY;
    baseName = "interno";
    const bf = document.getElementById("basefont");
    if (bf) bf.value = "interno";
    setFontName("HersheyType");
    cache = null;
    dirty = true;
    vizForce = true;
    selSet("upper");
    updateKern();
    schedPersist();
    helpEl.classList.remove("on");
    toast("Nuovo progetto creato");
  };
  dragify(document.getElementById("kern"), document.getElementById("kernhead"));
  addCollapse(
    document.getElementById("kern"),
    document.getElementById("kernhead"),
  );
  {
    const kc = document.getElementById("kclass");
    kc.parentElement.addEventListener("pointerdown", (e) => e.stopPropagation()); // non collassare il pannello
    kc.addEventListener("change", () => {
      kclassMode = kc.checked;
      updateKern();
    });
  }
  buildChain();
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") {
      spaceDown = false;
      panDrag = null;
    }
  });
  window.addEventListener("beforeunload", () => {
    clearTimeout(persistT);
    persistNow();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      helpEl.classList.remove("on");
      // primo Esc: deseleziona/annulla; secondo Esc (niente da chiudere): esce dalla modalità modifica
      const hadSomething =
        edSel.length ||
        edBand ||
        edPending ||
        edRect ||
        helpEl.classList.contains("on");
      edSel = [];
      edBand = null;
      edPending = null;
      edRect = null;
      if (!hadSomething && (editMode || drawMode || rectMode)) {
        editMode = false;
        drawMode = false;
        rectMode = false;
        document.getElementById("editB").classList.remove("on");
        document.getElementById("drawB").classList.remove("on");
        document.getElementById("editTools").style.display = "none";
        dirty = true;
      }
      if (document.activeElement && document.activeElement.tagName === "INPUT")
        document.activeElement.blur();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveProject();
      return;
    }
    if (document.activeElement && document.activeElement.tagName === "INPUT")
      return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      spaceDown = true;
      return;
    }
    // Cmd/Ctrl+A in modalità modifica: seleziona tutti i nodi del glifo
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key.toLowerCase() === "a" &&
      editMode &&
      viewMode === "single" &&
      edTX
    ) {
      e.preventDefault();
      const g = srcGlifo(edTX.ch),
        all = [];
      for (let ti = 0; ti < g.tratti.length; ti++)
        for (let pi = 0; pi < g.tratti[ti].pts.length; pi++)
          all.push({ ti, pi });
      edSel = all;
      dirty = true;
      return;
    }
    if (e.key === "0") {
      setZoom(1);
      panX = 0;
      panY = 0;
      dirty = true;
      return;
    }
    if (e.key === "?") {
      helpEl.classList.toggle("on");
      return;
    }
    if (
      editMode &&
      drawMode &&
      edPending &&
      edPending.length >= 2 &&
      e.key === "Enter"
    ) {
      e.preventDefault();
      commit();
      edEnsure().tratti.push({ pts: edPending.slice(), chiuso: false });
      edPending = null;
      dirty = true;
      vizForce = true;
      schedPersist();
      toast("Tratto aggiunto");
      return;
    }
    if (editMode && edSel.length === 2 && (e.key === "j" || e.key === "J")) {
      e.preventDefault();
      edJoinSel();
      return;
    }
    // "t": toggla il terminale sulle estremità selezionate (capo iniziale/finale del tratto). off = butt piatto, niente cap/tang/tcut
    if (editMode && edSel.length && (e.key === "t" || e.key === "T")) {
      e.preventDefault();
      commit();
      const g = edEnsure();
      let any = false;
      for (const s of edSel) {
        const tr = g.tratti[s.ti];
        if (!tr || tr.chiuso) continue;
        const side = s.pi === 0 ? 0 : s.pi === tr.pts.length - 1 ? 1 : -1;
        if (side < 0) continue; // solo i capi, non i nodi interni
        if (!tr.term) tr.term = [1, 1];
        tr.term[side] = tr.term[side] ? 0 : 1;
        any = true;
      }
      if (any) {
        dirty = true;
        vizForce = true;
        schedPersist();
      }
      return;
    }
    if (
      editMode &&
      edSel.length &&
      (e.key === "Backspace" || e.key === "Delete")
    ) {
      e.preventDefault();
      edDeleteSel();
      return;
    }
    if (editMode && edSel.length && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const st = e.shiftKey ? 0.02 : 0.004,
        dx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0,
        dy = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
      commit();
      const g = edEnsure();
      for (const s of edSel) {
        const tr = g.tratti[s.ti];
        if (tr && tr.pts[s.pi]) {
          tr.pts[s.pi][0] += dx;
          tr.pts[s.pi][1] += dy;
        }
      }
      dirty = true;
      vizForce = true;
      schedPersist();
      return;
    }
    const n = SET().length;
    if (e.key === "ArrowLeft") load((cur + n - 1) % n);
    else if (e.key === "ArrowRight") load((cur + 1) % n);
  });
  initTheme();
  wireDock();
  initTips();
}
function selSet(key) {
  setKey = key;
  cur = 0;
  viewMode = "single";
  editScope = "single";
  dirty = true;
  cache = null;
  for (const k in setB) setB[k].classList.toggle("on", k === key);
  updateABPanel();
  load(0);
}
function updateABPanel() {
  if (viewMode !== "abtest") abEdit = null;
}
function selView(mode) {
  if (mode === "pairs") {
    setKey = "upper";
    viewMode = "pairs";
    editScope = "pair";
  } else if (mode === "abtest") {
    viewMode = "abtest";
    editScope = "global";
    setKey = allCase;
  } else {
    viewMode = "all";
    editScope = "global";
    setKey = allCase;
  }
  cur = 0;
  dirty = true;
  cache = null;
  vizForce = true;
  for (const k in setB) setB[k].classList.toggle("on", k === mode);
  updateABPanel();
  load(cur);
}
function rend(ch) {
  return !!(BASE[ch] || COMPOSITES[ch]);
}
function updateKern() {
  const host = document.getElementById("kern"),
    body = document.getElementById("kernbody"),
    w = word,
    pairs = [],
    seen = {};
  for (let i = 0; i < w.length - 1; i++) {
    const a = w[i],
      b = w[i + 1];
    if (!rend(a) || !rend(b)) continue;
    const k = a + b;
    if (!seen[k]) {
      seen[k] = 1;
      pairs.push(k);
    }
  }
  if (!pairs.length) {
    host.style.display = "none";
    return;
  }
  host.style.display = "block";
  body.classList.toggle("cls", kclassMode);
  body.innerHTML = "";
  // un cursore: etichetta, valore corrente (frazione), setter (frazione)
  const addRow = (label, cur, set) => {
    const row = document.createElement("div");
    row.className = "kpair";
    const v = Math.round(cur * 100);
    const lab = document.createElement("span");
    lab.className = "kl";
    lab.textContent = label;
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = -40;
    inp.max = 40;
    inp.value = v;
    setFaderFill(inp);
    const val = document.createElement("span");
    val.className = "kv2";
    val.textContent = v;
    inp.addEventListener("pointerdown", commit);
    inp.addEventListener("input", () => {
      set(+inp.value / 100);
      val.textContent = inp.value;
      setFaderFill(inp);
      dirty = true;
      schedPersist();
    });
    row.appendChild(lab);
    row.appendChild(inp);
    row.appendChild(val);
    body.appendChild(row);
  };
  if (kclassMode) {
    // raggruppa le coppie della parola per chiave-di-classe → un cursore per gruppo
    const groups = {};
    for (const k of pairs) {
      const key = classKey(k[0], k[1]);
      (groups[key] || (groups[key] = [])).push(k);
    }
    for (const key in groups)
      addRow(
        key + "  (" + groups[key].join(" ") + ")",
        classKern[key] || 0,
        (v) => (classKern[key] = v),
      );
  } else {
    for (const k of pairs)
      addRow(k, kern[k] || 0, (v) => (kern[k] = v));
  }
}
function load(i) {
  cur = i;
  dirty = true;
  edSel = [];
  edHover = null;
  edDrag = null;
  for (const id in knobRefresh) knobRefresh[id]();
  for (const k in togRefresh) togRefresh[k]();
  document.getElementById("big").textContent = SET()[i];
  document.getElementById("idx").textContent = i + 1 + "/" + SET().length;
  const lc = document.getElementById("ledCounter");
  if (lc)
    lc.textContent =
      SET()[i] +
      " " +
      String(i + 1).padStart(2, "0") +
      "/" +
      String(SET().length).padStart(2, "0");
}

// ===== galleria scheletri di base: griglia cliccabile con anteprima live di ogni set =====
function drawBasePrev(cv, map) {
  const dpr = window.devicePixelRatio || 1,
    W = cv.clientWidth || 150,
    H = cv.clientHeight || 72;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle =
    getComputedStyle(document.body).getPropertyValue("--text").trim() ||
    "#ddd";
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let chars = ["A", "a"].filter((c) => map[c] && map[c].tratti.length);
  if (!chars.length) chars = Object.keys(map).slice(0, 2);
  let tw = 0;
  for (const c of chars) tw += map[c].w + 0.12;
  const S = Math.min(H * 0.62, (W * 0.84) / Math.max(0.3, tw));
  let x = (W - tw * S) / 2;
  const y0 = H * 0.14; // y dello scheletro: 0 = cap, 1 = baseline, >1 discendenti
  for (const c of chars) {
    const g = map[c];
    for (const tr of g.tratti) {
      const sm = liscia(tr.pts, tr.chiuso);
      if (sm.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(x + sm[0][0] * S, y0 + sm[0][1] * S);
      for (let i = 1; i < sm.length; i++)
        ctx.lineTo(x + sm[i][0] * S, y0 + sm[i][1] * S);
      if (tr.chiuso) ctx.closePath();
      ctx.stroke();
    }
    x += (g.w + 0.12) * S;
  }
}
function initBaseGal() {
  const modal = document.getElementById("baseGal"),
    grid = document.getElementById("baseGrid"),
    btn = document.getElementById("baseB");
  if (!modal || !grid || !btn) return;
  let built = false;
  const close = () => modal.classList.remove("on");
  const markOn = () => {
    for (const el of grid.children)
      el.classList.toggle("on", el.dataset.base === baseName);
  };
  const drawCard = (card) =>
    loadBaseFont(card.dataset.base)
      .then((m) => drawBasePrev(card.querySelector("canvas"), m))
      .catch(() => {
        card.querySelector(".bname").textContent += " — non caricato";
      });
  const open = () => {
    modal.classList.add("on");
    if (!built) {
      built = true;
      for (const [v, l] of BASEFONTS) {
        const card = document.createElement("button");
        card.className = "bcard";
        card.dataset.base = v;
        const cv = document.createElement("canvas"),
          nm = document.createElement("span");
        nm.className = "bname";
        nm.textContent = l;
        card.append(cv, nm);
        card.onclick = () => {
          setBase(v).then(markOn);
          close();
        };
        grid.appendChild(card);
      }
    }
    // ridisegna a ogni apertura: tema e cache possono essere cambiati
    for (const card of grid.children) drawCard(card);
    markOn();
  };
  btn.onclick = open;
  document.getElementById("baseGalClose").onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("on")) close();
  });
}

// ===== masters: A/B + interpolazione =====
function setMaster(k) {
  if (k === "B" && !masters.B) {
    masters.B = {};
    for (const c of ALLCHARS) masters.B[c] = Object.assign({}, masters.A[c]);
    toast("Master B creato da A — modificalo (es. peso per un Bold)");
  }
  masterCur = k;
  font = masters[k];
  interT = k === "B" ? 1 : 0;
  const sl = document.getElementById("interp");
  if (sl) {
    sl.value = Math.round(interT * 100);
    setFaderFill(sl);
  }
  updMasterUI();
  cache = null;
  dirty = true;
  vizForce = true;
  load(cur);
  schedPersist();
}
function updMasterUI() {
  const a = document.getElementById("mA"),
    b = document.getElementById("mB");
  if (a) a.classList.toggle("on", masterCur === "A");
  if (b) b.classList.toggle("on", masterCur === "B");
}
