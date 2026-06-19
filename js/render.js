// ===== js/render.js — rendering p5: setup/draw, anteprima parola (+auto-spacing da profilo), specimen, input mouse =====
function setup() {
  const s = document.getElementById("stage"),
    c = createCanvas(s.clientWidth, s.clientHeight);
  c.parent(s);
  noiseSeed(7);
  noiseDetail(2, 0.5);
  glyphColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--glyph")
    .trim();
  initFont();
  buildUI();
  const rest = restoreLocal();
  load(0);
  if (rest) toast("Sessione precedente ripristinata");
}
function clampPanels() {
  const W = window.innerWidth,
    H = window.innerHeight;
  for (const p of document.querySelectorAll(".pan")) {
    if (p.style.display === "none") continue;
    // #chain e #kern sono centrati via CSS (translateX): non riposizionarli,
    // altrimenti perdono il centraggio e "scattano"
    if (p.id === "chain" || p.id === "kern") continue;
    const rc = p.getBoundingClientRect();
    let l = rc.left,
      t = rc.top,
      ch = false;
    if (l > W - 50) {
      l = W - 50;
      ch = true;
    }
    if (l + rc.width < 60) {
      l = 60 - rc.width;
      ch = true;
    }
    if (t > H - 40) {
      t = H - 40;
      ch = true;
    }
    if (t < 2) {
      t = 2;
      ch = true;
    }
    if (ch) {
      p.style.left = l + "px";
      p.style.right = "auto";
      p.style.transform = "none";
      p.style.top = t + "px";
    }
  }
}
function windowResized() {
  const s = document.getElementById("stage");
  resizeCanvas(s.clientWidth, s.clientHeight);
  dirty = true;
  vizForce = true;
  clampPanels();
}
function paint(big) {
  if (disp === "line") {
    noFill();
    stroke(glyphColor);
    strokeWeight(big ? 2.4 : 1.4);
    strokeJoin(ROUND);
  } else {
    noStroke();
    fill(glyphColor);
  }
}
// trace layer: disegna il glifo del font di riferimento importato, dietro al parametrico,
// allineato alla baseline (capTop+sy) e cap-height scalata sulla box → guida per tracciare lo scheletro
function drawTrace(L, capTop, sy, W) {
  if (!traceOn || !traceFont) return;
  try {
    const glyph = traceFont.charToGlyph(L);
    if (!glyph || !glyph.path) return;
    const upm = traceFont.unitsPerEm || 1000,
      os2 = traceFont.tables && traceFont.tables.os2,
      capH = (os2 && os2.sCapHeight) || 0.7 * upm,
      scale = sy / capH,
      fontSize = scale * upm,
      adv = (glyph.advanceWidth || upm) * scale,
      x = W / 2 - adv / 2,
      baseY = capTop + sy,
      path = glyph.getPath(x, baseY, fontSize),
      ctx = drawingContext;
    ctx.save();
    ctx.beginPath();
    for (const c of path.commands) {
      if (c.type === "M") ctx.moveTo(c.x, c.y);
      else if (c.type === "L") ctx.lineTo(c.x, c.y);
      else if (c.type === "C")
        ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else if (c.type === "Q") ctx.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
      else if (c.type === "Z") ctx.closePath();
    }
    ctx.fillStyle = (typeof UI !== "undefined" && UI.trace) || "rgba(110,130,255,0.22)";
    ctx.fill("evenodd");
    ctx.restore();
  } catch (e) {}
}
function disegna(pg) {
  beginShape();
  for (const v of pg.outer) vertex(v.x, v.y);
  const ao = areaP(pg.outer) > 0;
  for (const h of pg.holes) {
    beginContour();
    const r = areaP(h) > 0 === ao ? h.slice().reverse() : h;
    for (const v of r) vertex(v.x, v.y);
    endContour();
  }
  endShape(CLOSE);
}
// badge di qualità sulle celle della griglia: rosso = errore, giallo = avviso, verde = pulito
function drawLintBadges(cells) {
  push();
  noStroke();
  for (const ce of cells) {
    const r = lintCache.map[ce.ch];
    if (!r) continue;
    const cx = ce.x + ce.w - 9,
      cy = ce.y + 9;
    if (r.level === "err") {
      fill(LINT.col.err);
      circle(cx, cy, 9);
    } else if (r.level === "warn") {
      fill(LINT.col.warn);
      circle(cx, cy, 9);
    } else {
      fill(LINT.col.ok);
      circle(cx, cy, 4.5);
    }
  }
  pop();
}
// riga di stato qualità per il glifo corrente (vista singola)
function drawLintCur(x, y) {
  const r = lintCur();
  push();
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(12);
  const col =
    r.level === "err" ? LINT.col.err : r.level === "warn" ? LINT.col.warn : LINT.col.ok;
  const label =
    r.level === "ok"
      ? "glifo pulito ✓"
      : r.issues.map((i) => i.msg).join(" · ");
  fill(col);
  circle(x + 5, y, 9);
  fill(UI && UI.muted ? UI.muted : glyphColor);
  text(label, x + 16, y);
  pop();
}
// confronto affiancato Master A vs B sullo stesso glifo (scala comune, etichette + divisore)
function drawCompareAB(L, aTop, st, W) {
  const pA = conv(masters.A[L]),
    pB = conv(masters.B[L]),
    gw = glw(L),
    midY = (aTop + st) / 2,
    colW = W / 2;
  const fit = (p) =>
    Math.min(
      ((st - aTop) * 0.5) / p.altezza,
      (colW * 0.55) / Math.max(0.3, gw * p.larghezza),
    );
  const size = Math.min(fit(pA), fit(pB)) * zoom;
  const col = (raw, p, cx, lab) => {
    const sx = size * p.larghezza,
      sy = size * p.altezza,
      penX = cx - (gw * sx) / 2,
      capTop = midY - sy / 2;
    paint(true);
    for (const pg of costr(L, raw, penX, capTop, size).polys) disegna(pg);
    push();
    noStroke();
    fill(UI.hot);
    textSize(11);
    textAlign(CENTER, TOP);
    text(lab, cx, aTop + 8);
    pop();
  };
  col(masters.A[L], pA, W * 0.25, "MASTER A");
  col(masters.B[L], pB, W * 0.75, "MASTER B");
  push();
  stroke(UI.g2);
  strokeWeight(1);
  line(W / 2, aTop + 24, W / 2, st - 8);
  pop();
}
// vista test A/B: stesso testo in 3 righe — Master A, Master B, e blend interpolato (slider A↔B)
function abLine(str, paramFn, top, h, W, label, active) {
  const items = [];
  let tot = 0;
  for (const ch of str) {
    if (ch === " ") {
      items.push({ sp: true, adv: 0.42 });
      tot += 0.42;
      continue;
    }
    const raw = paramFn(ch);
    if (!raw) continue;
    const p = conv(raw),
      g = srcGlifo(ch),
      adv = glyphAdvN(p, g.w);
    items.push({ ch, raw, adv, lb: glyphLBN(p, g.w) });
    tot += adv;
  }
  const size = tot > 0 ? Math.min(h * 0.6, (W * 0.82) / tot) : h * 0.6,
    capTop = top + (h - size) / 2;
  let penX = W * 0.12;
  paint(true);
  for (const it of items) {
    if (it.sp) {
      penX += it.adv * size;
      continue;
    }
    for (const pg of costr(it.ch, it.raw, penX + it.lb * size, capTop, size).polys)
      disegna(pg);
    penX += it.adv * size;
  }
  // caret lampeggiante quando la riga è in editing diretto
  if (active && Math.floor(Date.now() / 500) % 2 === 0) {
    push();
    stroke(UI.hot);
    strokeWeight(Math.max(2, size * 0.02));
    line(penX + size * 0.04, capTop + size * 0.05, penX + size * 0.04, capTop + size);
    pop();
  }
  push();
  noStroke();
  fill(active ? UI.hot : UI.muted || UI.hot);
  textSize(10);
  textAlign(LEFT, TOP);
  text(label + (active ? "  ✎" : ""), 14, top + 7);
  pop();
}
function drawABTest(aTop, st, W) {
  if (!masters.B) {
    push();
    noStroke();
    fill(UI.muted || glyphColor);
    textAlign(CENTER, CENTER);
    textSize(13);
    text(
      "Crea il Master B (pannello Master) per il test A/B",
      W / 2,
      (aTop + st) / 2,
    );
    pop();
    return;
  }
  const t = (i) =>
    abEdit === i ? abTexts[i] : (abTexts[i] && abTexts[i].trim()) || "Handgloves";
  const h = (st - aTop) / 3;
  abLine(t(0), (ch) => masters.A[ch], aTop, h, W, "MASTER A", abEdit === 0);
  abLine(t(1), (ch) => masters.B[ch], aTop + h, h, W, "MASTER B", abEdit === 1);
  abLine(
    t(2),
    (ch) => fontBase(ch),
    aTop + 2 * h,
    h,
    W,
    "A → B  " + Math.round(interT * 100) + "%",
    abEdit === 2,
  );
  push();
  stroke(UI.g3);
  strokeWeight(1);
  line(0, aTop + h, W, aTop + h);
  line(0, aTop + 2 * h, W, aTop + 2 * h);
  pop();
}
// profilo dello spazio negativo: per fasce orizzontali, ascissa min/max dell'inchiostro (campiona anche i lati lunghi)
function profilo(polys, y0, y1, NB) {
  const L = new Array(NB).fill(Infinity),
    R = new Array(NB).fill(-Infinity),
    bh = (y1 - y0) / NB;
  const put = (x, y) => {
    const i = ((y - y0) / bh) | 0;
    if (i < 0 || i >= NB) return;
    if (x < L[i]) L[i] = x;
    if (x > R[i]) R[i] = x;
  };
  for (const pg of polys) {
    const r = pg.outer;
    for (let k = 0; k < r.length; k++) {
      const a = r[k],
        b = r[(k + 1) % r.length];
      put(a.x, a.y);
      const steps = Math.min(60, Math.ceil(Math.abs(b.y - a.y) / bh));
      for (let s = 1; s < steps; s++) {
        const u = s / steps;
        put(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
      }
    }
  }
  return { L, R };
}
function drawWord(str, aTop, st, W) {
  const items = [];
  let tot = 0;
  for (const raw of str) {
    let ch = raw;
    if (!rend(ch)) ch = raw.toUpperCase();
    if (raw === " " || !rend(ch) || !font[ch]) {
      items.push({ sp: true, adv: 0.45 });
      tot += 0.45;
      continue;
    }
    const p = conv(fontR(ch)),
      g = srcGlifo(ch),
      adv = glyphAdvN(p, g.w);
    items.push({ ch, adv, lb: glyphLBN(p, g.w) });
    tot += adv;
  }
  if (tot <= 0) return;
  const size = Math.min((st - aTop) * 0.42, (W * 0.88) / tot) * zoom,
    capTop = (aTop + st) / 2 - size / 2;
  paint(true);
  if (!autoSpace) {
    let penX = W / 2 - (tot * size) / 2,
      prev = null;
    for (const it of items) {
      if (it.sp) {
        penX += it.adv * size;
        prev = null;
        continue;
      }
      if (prev != null) penX += kpair(prev, it.ch) * size;
      const o = costr(it.ch, fontR(it.ch), penX + it.lb * size, capTop, size);
      for (const pg of o.polys) disegna(pg);
      penX += o.advance;
      prev = it.ch;
    }
    return;
  }
  // spaziatura automatica: distanza tra coppie dal profilo (min ponderato con media = i tondi rientrano)
  const NB = 28,
    y0 = capTop - 0.5 * size,
    y1 = capTop + 1.4 * size,
    G = 0.1 * size,
    placed = [];
  let Xprev = 0,
    penAbs = null,
    prev = null,
    prevProf = null;
  for (const it of items) {
    if (it.sp) {
      penAbs = (penAbs === null ? 0 : penAbs) + it.adv * size;
      prevProf = null;
      prev = null;
      continue;
    }
    const o = costr(it.ch, fontR(it.ch), 0, capTop, size),
      pr = profilo(o.polys, y0, y1, NB);
    let lmin = Infinity,
      rmax = -Infinity;
    for (let i = 0; i < NB; i++) {
      if (pr.L[i] < lmin) lmin = pr.L[i];
      if (pr.R[i] > rmax) rmax = pr.R[i];
    }
    if (!isFinite(lmin)) {
      lmin = 0;
      rmax = Math.max(1, o.advance);
    }
    let Xc;
    if (prevProf) {
      let dMax = -Infinity,
        sum = 0,
        cnt = 0;
      for (let i = 0; i < NB; i++) {
        if (!isFinite(prevProf.R[i]) || !isFinite(pr.L[i])) continue;
        const d = prevProf.R[i] - pr.L[i];
        if (d > dMax) dMax = d;
        sum += d;
        cnt++;
      }
      const spz = ((fontR(prev).spaz + fontR(it.ch).spaz) / 200) * size;
      Xc = cnt
        ? Xprev + 0.72 * dMax + 0.28 * (sum / cnt) + G + spz
        : penAbs - lmin + G;
    } else Xc = penAbs === null ? -lmin : penAbs - lmin;
    if (prev != null) Xc += kpair(prev, it.ch) * size;
    placed.push({ o, X: Xc });
    penAbs = Xc + rmax;
    Xprev = Xc;
    prevProf = pr;
    prev = it.ch;
  }
  if (!placed.length) return;
  const off = W / 2 - (penAbs || 1) / 2;
  for (const g of placed) {
    push();
    translate(g.X + off, 0);
    for (const pg of g.o.polys) disegna(pg);
    pop();
  }
}
function draw() {
  clear();
  const vd = dirty;
  if (viewMode !== "single") {
    if (viewMode === "abtest") drawABTest(64, height - 90, width);
    else drawSpecimen(viewMode === "pairs");
    if (vd || vizForce) {
      drawVizzes();
      vizForce = false;
    }
    drawScope();
    edInspectorSync();
    return;
  }
  const W = width,
    H = height,
    aTop = 58,
    dock = 78;
  const bh = galleryOn ? Math.max(116, (H - aTop - dock) * 0.27) : 0;
  const st = H - dock - bh;
  edStrip = st;
  const ST = SET(),
    STR = word.trim();
  if (STR) {
    drawWord(STR, aTop, st, W);
  } else if (cmpAB && masters.B && !editMode) {
    drawCompareAB(ST[cur], aTop, st, W);
  } else {
    const L = ST[cur],
      p = conv(fontR(L)),
      gw = glw(L);
    const fit = Math.min(
        ((st - aTop) * 0.6) / p.altezza,
        (W * 0.4) / Math.max(0.3, gw * p.larghezza),
      ),
      size = fit * zoom;
    const sx = size * p.larghezza,
      sy = size * p.altezza,
      penX = W / 2 - (gw * sx) / 2 + panX,
      capTop = (aTop + st) / 2 - sy / 2 + panY;
    if (mostra) {
      push();
      const xL = 60,
        xR = W - 60;
      // 5 linee metriche etichettate (come il DS): ascender, cap-height,
      // x-height, baseline, descender
      const guides = [
        [capTop - sy * 0.26, "ascender", UI.g2],
        [capTop, "cap-height", UI.g1],
        [capTop + sy * p.mid, "x-height", UI.g2],
        [capTop + sy, "baseline", UI.g1],
        [capTop + sy * 1.22, "descender", UI.g2],
      ];
      strokeWeight(1);
      for (const g of guides) {
        stroke(g[2]);
        line(xL, g[0], xR, g[0]);
      }
      stroke(UI.g2);
      line(W / 2, aTop + 6, W / 2, st - 8);
      // etichette mono in muted
      noStroke();
      fill(UI && UI.muted ? UI.muted : glyphColor);
      textSize(9);
      textAlign(LEFT, BOTTOM);
      for (const g of guides) text(g[1], xL, g[0] - 3);
      pop();
    }
    if (signalStage && signalStage.render) {
      // vista "solo stadio" dal pannello Signal: renderizza il glifo a quello
      // stadio della pipeline sul canvas grande
      const ctx = drawingContext;
      ctx.save();
      ctx.translate(0, aTop);
      signalStage.render(ctx, W, st - aTop, L, fontR(L));
      ctx.restore();
      edTX = null;
    } else {
      drawTrace(L, capTop, sy, W);
      paint(true);
      for (const pg of costr(L, fontR(L), penX, capTop, size).polys) disegna(pg);
      if (editMode) drawEditOverlay(L, penX, capTop, sx, sy);
      else edTX = null;
    }
  }
  if (lintOn) drawLintCur(64, aTop + 16);
  // galleria alfabeto (collassabile col tasto nel dock)
  if (galleryOn) {
    push();
    stroke(UI.g3);
    strokeWeight(1);
    line(0, st, W, st);
    pop();
    if (dirty || !cache) {
      cache = griglia(60, st + 12, W - 120, bh - 22, ST, gcols(ST.length));
      if (lintOn) lintAll();
      dirty = false;
    }
    const g = cache;
    celle = g.cells;
    const ce = g.cells[cur];
    push();
    noFill();
    // hover: evidenzia la cella sotto il mouse (se diversa da quella selezionata)
    for (const hc of g.cells)
      if (
        hc !== ce &&
        mouseX >= hc.x &&
        mouseX <= hc.x + hc.w &&
        mouseY >= hc.y &&
        mouseY <= hc.y + hc.h
      ) {
        stroke(UI.trail);
        strokeWeight(1);
        rect(hc.x + 2, hc.y + 2, hc.w - 4, hc.h - 4, 5);
        break;
      }
    stroke(UI.hot);
    strokeWeight(1.5);
    rect(ce.x + 2, ce.y + 2, ce.w - 4, ce.h - 4, 5);
    pop();
    paint(false);
    for (const pg of g.polys) disegna(pg);
    if (lintOn && lintCache) drawLintBadges(g.cells);
  } else {
    celle = [];
    dirty = false;
  }
  if (vd || vizForce) {
    drawVizzes();
    vizForce = false;
  }
  drawScope();
  edInspectorSync();
}
function mouseWheel(e) {
  const tgt = e && e.target;
  if (tgt && tgt.tagName && tgt.tagName !== "CANVAS") return;
  const d = (e && (e.delta !== undefined ? e.delta : e.deltaY)) || 0;
  setZoom(zoom - d * 0.0012);
  dirty = true;
  return false;
}
function mousePressed(e) {
  const tgt = e && e.target;
  if (tgt && tgt.tagName && tgt.tagName !== "CANVAS") return;
  if (e && e.button === 2) return; // tasto destro: gestito dal menu contestuale
  // vista A/B: click su una riga → la attiva per la digitazione diretta (type tester)
  if (viewMode === "abtest") {
    const aTop = 64,
      st = height - 90,
      h = (st - aTop) / 3,
      i = Math.floor((mouseY - aTop) / h);
    abEdit = i >= 0 && i < 3 ? i : null;
    dirty = true;
    return;
  }
  if (spaceDown && viewMode === "single") {
    panDrag = { lx: mouseX, ly: mouseY };
    return;
  }
  if (editMode && viewMode === "single" && edTX) {
    if (rectMode && mouseY < edStrip) {
      const px = (mouseX - edTX.penX) / edTX.sx,
        py = (mouseY - edTX.capTop) / edTX.sy;
      edRect = { x0: px, y0: py, x1: px, y1: py };
      return;
    }
    if (drawMode && mouseY < edStrip) {
      const px = (mouseX - edTX.penX) / edTX.sx,
        py = (mouseY - edTX.capTop) / edTX.sy;
      if (edPending && edPending.length >= 3) {
        const f = edPending[0],
          FX = edTX.penX + f[0] * edTX.sx,
          FY = edTX.capTop + f[1] * edTX.sy;
        if (Math.hypot(mouseX - FX, mouseY - FY) < 9) {
          commit();
          edEnsure().tratti.push({ pts: edPending.slice(), chiuso: true });
          edPending = null;
          dirty = true;
          vizForce = true;
          schedPersist();
          toast("Tratto chiuso aggiunto");
          return;
        }
      }
      (edPending = edPending || []).push([px, py]);
      return;
    }
    const hit = edHitTest();
    if (hit && hit.hd) {
      commit();
      edEnsure();
      edDrag = { handle: hit };
      return;
    }
    if (hit) {
      const inSel = edSel.some((s) => s.ti === hit.ti && s.pi === hit.pi);
      if (e && e.shiftKey) {
        edSel = inSel
          ? edSel.filter((s) => !(s.ti === hit.ti && s.pi === hit.pi))
          : edSel.concat([hit]);
        return;
      }
      if (!inSel) edSel = [hit];
      commit();
      edEnsure();
      edDrag = { lx: mouseX, ly: mouseY };
      return;
    }
    // click sul tracciato (non su un nodo): seleziona l'intero contorno e lo trascina (stile Glyphs)
    const sh = edSegHit(7);
    if (sh && mouseY < edStrip) {
      const tr = srcGlifo(edTX.ch).tratti[sh.ti],
        all = tr.pts.map((_, pi) => ({ ti: sh.ti, pi }));
      edSel =
        e && e.shiftKey
          ? edSel.concat(
              all.filter(
                (p2) => !edSel.some((s) => s.ti === p2.ti && s.pi === p2.pi),
              ),
            )
          : all;
      commit();
      edEnsure();
      edDrag = { lx: mouseX, ly: mouseY };
      return;
    }
    if (mouseY < edStrip) {
      edBand = {
        x0: mouseX,
        y0: mouseY,
        x1: mouseX,
        y1: mouseY,
        add: !!(e && e.shiftKey),
      };
      return;
    }
  }
  if (viewMode === "all")
    for (const b of caseBtns)
      if (
        mouseX >= b.x &&
        mouseX <= b.x + b.w &&
        mouseY >= b.y &&
        mouseY <= b.y + b.h
      ) {
        allCase = b.c;
        setKey = b.c;
        cur = 0;
        dirty = true;
        cache = null;
        vizForce = true;
        load(0);
        return;
      }
  if (!celle) return;
  for (const c of celle)
    if (
      mouseX >= c.x &&
      mouseX <= c.x + c.w &&
      mouseY >= c.y &&
      mouseY <= c.y + c.h
    ) {
      selectChar(c.ch);
      load(cur);
      return;
    }
}
function drawCellStr(str, cx, cy, cw, chh) {
  let adv = 0;
  const its = [];
  for (const c of str) {
    if (!font[c]) continue;
    const p = conv(fontR(c)),
      g = srcGlifo(c),
      a = g.w * p.larghezza + 2 * p.sb + p.spaz;
    its.push({ c, a });
    adv += a;
  }
  if (adv <= 0) return;
  const size = Math.min(chh * 0.5, (cw * 0.82) / adv) * zoom;
  let penX = cx - (adv * size) / 2;
  const capTop = cy - size * 0.5;
  for (const it of its) {
    const o = costr(it.c, fontR(it.c), penX, capTop, size);
    for (const pg of o.polys) disegna(pg);
    penX += o.advance;
  }
}
function specimenBand() {
  const W = width,
    H = height;
  let L = 0,
    R = W;
  for (const id of [
    "pan-stroke",
    "pan-metrics",
    "pan-curves",
    "pan-terminal",
  ]) {
    const p = document.getElementById(id);
    if (!p || p.style.display === "none") continue;
    const rc = p.getBoundingClientRect();
    if (rc.left + rc.width / 2 < W / 2) L = Math.max(L, rc.right);
    else R = Math.min(R, rc.left);
  }
  let y0 = 74;
  const ch = document.getElementById("chain");
  if (ch && !ch.classList.contains("collapsed")) {
    const rc = ch.getBoundingClientRect();
    if (rc.bottom > y0 && rc.left < R && rc.right > L) y0 = rc.bottom + 10;
  }
  let x0 = L + 22,
    x1 = R - 22;
  if (x1 < x0 + 90) {
    const c = (x0 + x1) / 2;
    x0 = c - 45;
    x1 = c + 45;
  }
  return { x0, x1, y0, y1: H - 92 };
}
function drawSpecimen(pairMode) {
  const items = pairMode ? SETS.upper.chars : SETS[allCase].chars,
    n = items.length,
    curc = CUR(),
    b = specimenBand();
  const cols = Math.max(1, Math.min(6, Math.floor((b.x1 - b.x0) / 108) || 1)),
    rows = Math.ceil(n / cols);
  const x0 = b.x0,
    y0 = b.y0,
    gw = b.x1 - b.x0,
    gh = b.y1 - b.y0,
    cw = gw / cols,
    chh = gh / rows;
  paint(true);
  celle = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols,
      r = (i / cols) | 0,
      x = x0 + c * cw,
      y = y0 + r * chh;
    drawCellStr(
      pairMode ? items[i] + items[i].toLowerCase() : items[i],
      x + cw / 2,
      y + chh / 2,
      cw,
      chh,
    );
    celle.push({ x, y, w: cw, h: chh, ch: items[i] });
  }
  push();
  noFill();
  stroke(UI.hot);
  strokeWeight(1.5);
  for (const ce of celle)
    if (ce.ch === curc) {
      rect(ce.x + 2, ce.y + 2, ce.w - 4, ce.h - 4, 5);
    }
  pop();
  push();
  noStroke();
  textSize(11);
  textAlign(LEFT, CENTER);
  caseBtns = [];
  const bx = x0;
  if (pairMode) {
    fill(UI.soft);
    text("● COPPIA — maiuscola + minuscola insieme", bx, y0 - 16);
  } else {
    fill(UI.hot);
    text("● GLOBALE", bx, y0 - 16);
    let px = bx + textWidth("● GLOBALE") + 14;
    for (const [c, lab] of [
      ["upper", "A–Z"],
      ["lower", "a–z"],
    ]) {
      const bw = 38,
        bh = 20,
        by = y0 - 26,
        on = allCase === c;
      fill(on ? UI.hot : UI.btn);
      rect(px, by, bw, bh, 5);
      fill(on ? UI.bg : UI.muted);
      textAlign(CENTER, CENTER);
      text(lab, px + bw / 2, by + bh / 2 + 1);
      textAlign(LEFT, CENTER);
      caseBtns.push({ x: px, y: by, w: bw, h: bh, c });
      px += bw + 6;
    }
  }
  pop();
}

// ===== modifica punti stile Glyphs: nodi angolo/morbido con maniglie, lazo, disegno, inserimento/eliminazione =====
function edEnsure() {
  const ch = edTX.ch;
  if (!skelEdits[ch]) {
    const g = srcGlifo(ch);
    skelEdits[ch] = JSON.parse(JSON.stringify({ w: g.w, tratti: g.tratti }));
  }
  return skelEdits[ch];
}
function drawEditOverlay(ch, penX, capTop, sx, sy) {
  const g = srcGlifo(ch);
  edTX = { penX, capTop, sx, sy, ch };
  push();
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    noFill();
    stroke(UI.hotSoft);
    strokeWeight(1);
    // scheletro disegnato come curva campionata (la stessa del rendering), non come corde
    const sm = liscia(tr.pts, tr.chiuso);
    beginShape();
    for (const q of sm) vertex(penX + q[0] * sx, capTop + q[1] * sy);
    tr.chiuso ? endShape(CLOSE) : endShape();
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const q = tr.pts[pi],
        X = penX + q[0] * sx,
        Y = capTop + q[1] * sy,
        m2 = q[2];
      const sel = edSel.some((s) => s.ti === ti && s.pi === pi),
        hov = edHover && edHover.ti === ti && edHover.pi === pi && !edHover.hd;
      if (m2 && m2.k === 2 && m2.h) {
        const HX1 = X + m2.h[0] * sx,
          HY1 = Y + m2.h[1] * sy,
          HX2 = X - m2.h[0] * sx,
          HY2 = Y - m2.h[1] * sy;
        stroke(UI.trail);
        strokeWeight(1);
        line(HX1, HY1, HX2, HY2);
        stroke(UI.hot);
        fill(UI.bg);
        circle(HX1, HY1, 6);
        circle(HX2, HY2, 6);
      }
      if (m2 && m2.k === 3 && m2.hIn && m2.hOut) {
        const IX = X + m2.hIn[0] * sx,
          IY = Y + m2.hIn[1] * sy,
          OX = X + m2.hOut[0] * sx,
          OY = Y + m2.hOut[1] * sy;
        stroke(UI.trail);
        strokeWeight(1);
        line(X, Y, IX, IY);
        line(X, Y, OX, OY);
        stroke(UI.hot);
        fill(UI.bg);
        circle(IX, IY, 6);
        circle(OX, OY, 6);
      }
      stroke(UI.hot);
      strokeWeight(hov ? 1.6 : 1);
      fill(sel || hov ? UI.hot : UI.bg);
      if (m2 && m2.k === 1) rect(X - 3.5, Y - 3.5, 7, 7);
      else if (m2 && m2.k === 3) quad(X, Y - 5, X + 5, Y, X, Y + 5, X - 5, Y);
      else circle(X, Y, sel ? 9 : hov ? 10 : 7);
      // capo con terminale OFF (toggle "t"): anello vuoto attorno al nodo
      const side = pi === 0 ? 0 : pi === tr.pts.length - 1 ? 1 : -1;
      if (!tr.chiuso && side >= 0 && tr.term && tr.term[side] === 0) {
        noFill();
        stroke(UI.warn || "#e0552b");
        strokeWeight(1.6);
        circle(X, Y, 16);
      }
    }
  }
  if (edPending && edPending.length) {
    stroke(UI.hot);
    strokeWeight(1.2);
    noFill();
    beginShape();
    for (const q of edPending) vertex(penX + q[0] * sx, capTop + q[1] * sy);
    endShape();
    const lp = edPending[edPending.length - 1];
    drawingContext.setLineDash([3, 3]);
    line(penX + lp[0] * sx, capTop + lp[1] * sy, mouseX, mouseY);
    drawingContext.setLineDash([]);
    noStroke();
    fill(UI.hot);
    for (const q of edPending) circle(penX + q[0] * sx, capTop + q[1] * sy, 6);
    const f = edPending[0];
    noFill();
    stroke(UI.hot);
    circle(penX + f[0] * sx, capTop + f[1] * sy, 13);
  }
  if (edSnap && (edSnap.x !== null || edSnap.y !== null)) {
    stroke(UI.hot);
    strokeWeight(1);
    drawingContext.setLineDash([5, 4]);
    if (edSnap.x !== null) {
      const gx = penX + edSnap.x * sx;
      line(gx, 0, gx, height);
    }
    if (edSnap.y !== null) {
      const gy = capTop + edSnap.y * sy;
      line(0, gy, width, gy);
    }
    drawingContext.setLineDash([]);
  }
  if (edRect) {
    const RX = penX + Math.min(edRect.x0, edRect.x1) * sx,
      RY = capTop + Math.min(edRect.y0, edRect.y1) * sy,
      RW = Math.abs(edRect.x1 - edRect.x0) * sx,
      RH = Math.abs(edRect.y1 - edRect.y0) * sy;
    noFill();
    stroke(UI.hot);
    strokeWeight(1.2);
    drawingContext.setLineDash([5, 4]);
    rect(RX, RY, RW, RH);
    drawingContext.setLineDash([]);
    noStroke();
    fill(UI.hot);
    for (const [cx2, cy2] of [
      [RX, RY],
      [RX + RW, RY],
      [RX + RW, RY + RH],
      [RX, RY + RH],
    ])
      circle(cx2, cy2, 6);
  }
  if (edBand) {
    noFill();
    stroke(UI.hot);
    strokeWeight(1);
    drawingContext.setLineDash([4, 3]);
    rect(
      Math.min(edBand.x0, edBand.x1),
      Math.min(edBand.y0, edBand.y1),
      Math.abs(edBand.x1 - edBand.x0),
      Math.abs(edBand.y1 - edBand.y0),
    );
    drawingContext.setLineDash([]);
  }
  pop();
}
// campiona il segmento k del tratto (coordinate glifo) con la stessa curva del rendering
function edSegSamples(tr, k, sub) {
  const out = [];
  crcSeg(tr.pts, k, sub || 12, tr.chiuso, nodeHs(tr.pts), out);
  const b = tr.pts[(k + 1) % tr.pts.length];
  out.push([b[0], b[1]]);
  return out;
}
// segmento del tracciato più vicino al mouse: test sulla curva campionata, non sulla corda
function edSegHit(maxd) {
  if (!edTX) return null;
  const g = srcGlifo(edTX.ch);
  let best = null,
    bd = maxd || 7;
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti],
      n = tr.pts.length,
      m = tr.chiuso ? n : n - 1;
    for (let k = 0; k < m; k++) {
      const S = edSegSamples(tr, k, 12),
        ns = S.length;
      for (let j = 0; j < ns - 1; j++) {
        const ax = edTX.penX + S[j][0] * edTX.sx,
          ay = edTX.capTop + S[j][1] * edTX.sy,
          bx = edTX.penX + S[j + 1][0] * edTX.sx,
          by = edTX.capTop + S[j + 1][1] * edTX.sy,
          vx = bx - ax,
          vy = by - ay,
          L2 = vx * vx + vy * vy || 1;
        let u = ((mouseX - ax) * vx + (mouseY - ay) * vy) / L2;
        u = Math.max(0, Math.min(1, u));
        const d = Math.hypot(mouseX - (ax + vx * u), mouseY - (ay + vy * u));
        if (d < bd) {
          bd = d;
          best = {
            ti,
            k,
            t: (j + u) / (ns - 1),
            px: S[j][0] + (S[j + 1][0] - S[j][0]) * u,
            py: S[j][1] + (S[j + 1][1] - S[j][1]) * u,
          };
        }
      }
    }
  }
  return best;
}
function edHitTest() {
  if (!edTX) return null;
  const g = srcGlifo(edTX.ch);
  let best = null,
    bd = 8;
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const q = tr.pts[pi],
        m2 = q[2];
      if (!m2) continue;
      const X = edTX.penX + q[0] * edTX.sx,
        Y = edTX.capTop + q[1] * edTX.sy;
      if (m2.k === 2 && m2.h) {
        for (const sg of [1, -1]) {
          const d = Math.hypot(
            mouseX - (X + m2.h[0] * edTX.sx * sg),
            mouseY - (Y + m2.h[1] * edTX.sy * sg),
          );
          if (d < bd) {
            bd = d;
            best = { ti, pi, hd: sg };
          }
        }
      } else if (m2.k === 3 && m2.hIn && m2.hOut) {
        const dI = Math.hypot(
          mouseX - (X + m2.hIn[0] * edTX.sx),
          mouseY - (Y + m2.hIn[1] * edTX.sy),
        );
        if (dI < bd) {
          bd = dI;
          best = { ti, pi, hd: "i" };
        }
        const dO = Math.hypot(
          mouseX - (X + m2.hOut[0] * edTX.sx),
          mouseY - (Y + m2.hOut[1] * edTX.sy),
        );
        if (dO < bd) {
          bd = dO;
          best = { ti, pi, hd: "o" };
        }
      }
    }
  }
  if (best) return best;
  bd = 10;
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    for (let pi = 0; pi < tr.pts.length; pi++) {
      const X = edTX.penX + tr.pts[pi][0] * edTX.sx,
        Y = edTX.capTop + tr.pts[pi][1] * edTX.sy,
        d = Math.hypot(mouseX - X, mouseY - Y);
      if (d < bd) {
        bd = d;
        best = { ti, pi };
      }
    }
  }
  return best;
}
function mouseDragged(e) {
  const tgt = e && e.target;
  if (tgt && tgt.tagName && tgt.tagName !== "CANVAS") return;
  if (panDrag) {
    panX += mouseX - panDrag.lx;
    panY += mouseY - panDrag.ly;
    panDrag.lx = mouseX;
    panDrag.ly = mouseY;
    dirty = true;
    return false;
  }
  if (edRect && edTX) {
    edRect.x1 = (mouseX - edTX.penX) / edTX.sx;
    edRect.y1 = (mouseY - edTX.capTop) / edTX.sy;
    dirty = true;
    return false;
  }
  if (edBand) {
    edBand.x1 = mouseX;
    edBand.y1 = mouseY;
    return false;
  }
  if (!edDrag || !edTX) return;
  const g = skelEdits[edTX.ch];
  if (!g) return;
  if (edDrag.handle) {
    const s = edDrag.handle,
      P = g.tratti[s.ti] && g.tratti[s.ti].pts[s.pi];
    if (!P) return;
    const vx = (mouseX - edTX.penX) / edTX.sx - P[0],
      vy = (mouseY - edTX.capTop) / edTX.sy - P[1];
    if (s.hd === "i" || s.hd === "o") {
      const m2 = P[2] || { k: 3 };
      if (s.hd === "i") m2.hIn = [vx, vy];
      else m2.hOut = [vx, vy];
      m2.k = 3;
      P[2] = m2;
    } else P[2] = { k: 2, h: [vx * s.hd, vy * s.hd] };
    dirty = true;
    vizForce = true;
    schedPersist();
    return false;
  }
  if (edSel.length === 1) {
    const s = edSel[0],
      tr = g.tratti[s.ti],
      P = tr && tr.pts[s.pi];
    if (P) {
      let nx = (mouseX - edTX.penX) / edTX.sx,
        ny = (mouseY - edTX.capTop) / edTX.sy;
      if (!(e && e.altKey)) {
        const sn = edSnapCalc(nx, ny, s);
        nx = sn.x;
        ny = sn.y;
        edSnap = sn.g;
      } else edSnap = null;
      P[0] = nx;
      P[1] = ny;
    }
  } else {
    edSnap = null;
    const dx = (mouseX - edDrag.lx) / edTX.sx,
      dy = (mouseY - edDrag.ly) / edTX.sy;
    edDrag.lx = mouseX;
    edDrag.ly = mouseY;
    for (const s of edSel) {
      const tr = g.tratti[s.ti];
      if (tr && tr.pts[s.pi]) {
        tr.pts[s.pi][0] += dx;
        tr.pts[s.pi][1] += dy;
      }
    }
  }
  dirty = true;
  vizForce = true;
  schedPersist();
  return false;
}
function mouseReleased() {
  if (edRect && edTX) {
    const xa = Math.min(edRect.x0, edRect.x1),
      xb = Math.max(edRect.x0, edRect.x1),
      ya = Math.min(edRect.y0, edRect.y1),
      yb = Math.max(edRect.y0, edRect.y1);
    edRect = null;
    if (xb - xa > 0.02 && yb - ya > 0.02) {
      commit();
      const g = edEnsure(),
        ti = g.tratti.length;
      g.tratti.push({
        pts: [
          [xa, ya, { k: 1 }],
          [xb, ya, { k: 1 }],
          [xb, yb, { k: 1 }],
          [xa, yb, { k: 1 }],
        ],
        chiuso: true,
      });
      edSel = [0, 1, 2, 3].map((pi) => ({ ti, pi }));
      dirty = true;
      vizForce = true;
      schedPersist();
      toast("Rettangolo aggiunto");
    }
    dirty = true;
    return;
  }
  if (edBand && edTX) {
    const { x0, y0, x1, y1, add } = edBand;
    edBand = null;
    if (Math.hypot(x1 - x0, y1 - y0) < 4) {
      if (!add) edSel = [];
    } else {
      const g = srcGlifo(edTX.ch),
        xa = Math.min(x0, x1),
        xb = Math.max(x0, x1),
        ya = Math.min(y0, y1),
        yb = Math.max(y0, y1),
        pick = [];
      for (let ti = 0; ti < g.tratti.length; ti++) {
        const tr = g.tratti[ti];
        for (let pi = 0; pi < tr.pts.length; pi++) {
          const X = edTX.penX + tr.pts[pi][0] * edTX.sx,
            Y = edTX.capTop + tr.pts[pi][1] * edTX.sy;
          if (X >= xa && X <= xb && Y >= ya && Y <= yb) pick.push({ ti, pi });
        }
      }
      edSel = add
        ? edSel.concat(
            pick.filter(
              (p2) => !edSel.some((s) => s.ti === p2.ti && s.pi === p2.pi),
            ),
          )
        : pick;
    }
  }
  edDrag = null;
  panDrag = null;
  edSnap = null;
}
function mouseMoved(e) {
  if (!editMode || !edTX || viewMode !== "single") return;
  edHover = edHitTest();
}
function doubleClicked(e) {
  const tgt = e && e.target;
  if (tgt && tgt.tagName && tgt.tagName !== "CANVAS") return;
  if (!editMode || !edTX || viewMode !== "single") return;
  // in modalità disegno: doppio click termina il tratto aperto
  if (drawMode) {
    if (edPending) {
      edPending.pop();
      if (edPending.length >= 2) {
        commit();
        edEnsure().tratti.push({ pts: edPending.slice(), chiuso: false });
        toast("Tratto aggiunto");
      }
      edPending = null;
      dirty = true;
      vizForce = true;
      schedPersist();
    }
    return;
  }
  // su un nodo: cicla auto → angolo → morbido (con maniglie) → auto
  const hit = edHitTest();
  if (hit && !hit.hd) {
    commit();
    const g = edEnsure(),
      tr = g.tratti[hit.ti],
      P = tr.pts[hit.pi],
      m2 = P[2];
    if (!m2) {
      P[2] = { k: 1 };
      toast("Nodo: angolo");
    } else if (m2.k === 1) {
      const n2 = tr.pts.length,
        a = tr.pts[(hit.pi - 1 + n2) % n2],
        b = tr.pts[(hit.pi + 1) % n2];
      let hx = (b[0] - a[0]) * 0.25,
        hy = (b[1] - a[1]) * 0.25;
      if (Math.hypot(hx, hy) < 0.01) {
        const o2 = tr.pts[hit.pi === 0 ? 1 : hit.pi - 1] || tr.pts[hit.pi];
        hx = (P[0] - o2[0]) * 0.3;
        hy = (P[1] - o2[1]) * 0.3;
        if (Math.hypot(hx, hy) < 0.01) {
          hx = 0.12;
          hy = 0;
        }
      }
      P[2] = { k: 2, h: [hx, hy] };
      toast("Nodo: morbido — trascina le maniglie");
    } else if (m2.k === 2) {
      const h = m2.h || [0.12, 0];
      P[2] = { k: 3, hIn: [-h[0], -h[1]], hOut: [h[0], h[1]] };
      toast("Nodo: spezzato — maniglie indipendenti");
    } else {
      tr.pts[hit.pi] = [P[0], P[1]];
      toast("Nodo: automatico");
    }
    edSel = [{ ti: hit.ti, pi: hit.pi }];
    dirty = true;
    vizForce = true;
    schedPersist();
    return;
  }
  // su un segmento: inserisci nodo sulla curva
  const best = edSegHit(7);
  if (!best) return;
  commit();
  const g = edEnsure(),
    tr = g.tratti[best.ti],
    n = tr.pts.length,
    A = tr.pts[best.k],
    B = tr.pts[(best.k + 1) % n],
    hA = nodeH(A),
    hB = nodeH(B),
    t = Math.max(0.05, Math.min(0.95, best.t));
  if (hA && hA.o && hB && hB.i) {
    // cubica esatta: split di de Casteljau — la curva resta identica
    const b0 = [A[0], A[1]],
      b1 = [A[0] + hA.o[0], A[1] + hA.o[1]],
      b2 = [B[0] + hB.i[0], B[1] + hB.i[1]],
      b3 = [B[0], B[1]],
      L = (p, q) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t],
      q0 = L(b0, b1),
      q1 = L(b1, b2),
      q2 = L(b2, b3),
      r0 = L(q0, q1),
      r1 = L(q1, q2),
      s = L(r0, r1);
    const mA = A[2] || {};
    A[2] =
      mA.k === 2 && mA.h
        ? { k: 3, hIn: [-mA.h[0], -mA.h[1]], hOut: [q0[0] - A[0], q0[1] - A[1]] }
        : Object.assign({}, mA, {
            k: mA.k || 3,
            hOut: [q0[0] - A[0], q0[1] - A[1]],
          });
    const mB = B[2] || {};
    B[2] =
      mB.k === 2 && mB.h
        ? { k: 3, hIn: [q2[0] - B[0], q2[1] - B[1]], hOut: [mB.h[0], mB.h[1]] }
        : Object.assign({}, mB, {
            k: mB.k || 3,
            hIn: [q2[0] - B[0], q2[1] - B[1]],
          });
    tr.pts.splice(best.k + 1, 0, [
      s[0],
      s[1],
      {
        k: 3,
        hIn: [r0[0] - s[0], r0[1] - s[1]],
        hOut: [r1[0] - s[0], r1[1] - s[1]],
      },
    ]);
  } else
    tr.pts.splice(best.k + 1, 0, [best.px, best.py]);
  edSel = [{ ti: best.ti, pi: best.k + 1 }];
  dirty = true;
  vizForce = true;
  schedPersist();
  toast("Nodo inserito");
}
function edDeleteSel() {
  if (!edTX || !edSel.length) return;
  commit();
  const g = edEnsure(),
    byT = {};
  for (const s of edSel) (byT[s.ti] = byT[s.ti] || []).push(s.pi);
  const nt = [];
  g.tratti.forEach((tr, ti) => {
    if (!byT[ti]) {
      nt.push(tr);
      return;
    }
    const del = new Set(byT[ti]),
      pts = tr.pts.filter((_, pi) => !del.has(pi));
    if (pts.length >= 2)
      nt.push({ pts, chiuso: tr.chiuso && pts.length >= 3, e: null });
  });
  g.tratti = nt;
  edSel = [];
  edHover = null;
  dirty = true;
  vizForce = true;
  schedPersist();
}

// unisce due estremi selezionati: stesso tratto → chiude ad anello; tratti diversi → un tratto solo
function edJoinSel() {
  if (!edTX || edSel.length !== 2) {
    toast("Seleziona esattamente 2 punti estremi da unire", true);
    return;
  }
  const g = edEnsure(),
    [a, b] = edSel,
    ta = g.tratti[a.ti],
    tb = g.tratti[b.ti];
  if (!ta || !tb) return;
  const isEnd = (tr, pi) =>
    !tr.chiuso && (pi === 0 || pi === tr.pts.length - 1);
  if (!isEnd(ta, a.pi) || !isEnd(tb, b.pi)) {
    toast("Si uniscono solo estremi di tratti aperti", true);
    return;
  }
  commit();
  if (a.ti === b.ti) {
    if (ta.pts.length < 3) {
      toast("Tratto troppo corto per chiudersi", true);
      return;
    }
    ta.chiuso = true;
    toast("Tratto chiuso ad anello");
  } else {
    const A = a.pi === 0 ? ta.pts.slice().reverse() : ta.pts.slice(),
      B = b.pi === 0 ? tb.pts.slice() : tb.pts.slice().reverse();
    if (
      Math.hypot(A[A.length - 1][0] - B[0][0], A[A.length - 1][1] - B[0][1]) <
      1e-6
    )
      B.shift();
    const merged = { pts: A.concat(B), chiuso: false, e: null };
    g.tratti = g.tratti.filter((_, i) => i !== a.ti && i !== b.ti);
    g.tratti.push(merged);
    toast("Tratti uniti in uno");
  }
  edSel = [];
  edHover = null;
  dirty = true;
  vizForce = true;
  schedPersist();
}

// snap del nodo trascinato: metriche (cap, x-height, mezzo, baseline), bordi glifo, assi degli altri nodi — Alt disattiva
function edSnapCalc(nx, ny, sel) {
  const g = srcGlifo(edTX.ch),
    tolX = 6 / edTX.sx,
    tolY = 6 / edTX.sy;
  let bx = null,
    by = null,
    bdx = tolX,
    bdy = tolY;
  const tryX = (v) => {
      const d = Math.abs(nx - v);
      if (d < bdx) {
        bdx = d;
        bx = v;
      }
    },
    tryY = (v) => {
      const d = Math.abs(ny - v);
      if (d < bdy) {
        bdy = d;
        by = v;
      }
    };
  for (const v of [0, 0.333, 0.5, 1]) tryY(v);
  tryX(0);
  tryX(g.w);
  for (let ti = 0; ti < g.tratti.length; ti++) {
    const tr = g.tratti[ti];
    for (let pi = 0; pi < tr.pts.length; pi++) {
      if (ti === sel.ti && pi === sel.pi) continue;
      tryX(tr.pts[pi][0]);
      tryY(tr.pts[pi][1]);
    }
  }
  return {
    x: bx !== null ? bx : nx,
    y: by !== null ? by : ny,
    g: { x: bx, y: by },
  };
}
// trasforma la selezione (punti + maniglie) attorno al baricentro
function edTransformSel(fp, fv) {
  if (!edTX || !edSel.length) return;
  commit();
  const g = edEnsure();
  const ps = edSel
    .map((s) => g.tratti[s.ti] && g.tratti[s.ti].pts[s.pi])
    .filter(Boolean);
  if (!ps.length) return;
  let cx = 0,
    cy = 0;
  for (const p of ps) {
    cx += p[0];
    cy += p[1];
  }
  const c = [cx / ps.length, cy / ps.length];
  for (const P of ps) {
    const [nx2, ny2] = fp(P[0], P[1], c);
    P[0] = nx2;
    P[1] = ny2;
    const m2 = P[2];
    if (m2) {
      if (m2.h) m2.h = fv(m2.h);
      if (m2.hIn) m2.hIn = fv(m2.hIn);
      if (m2.hOut) m2.hOut = fv(m2.hOut);
    }
  }
  dirty = true;
  vizForce = true;
  schedPersist();
}
// mini-inspector della selezione
let _einsLast = "";
function edInspectorSync() {
  const el = document.getElementById("edinsp");
  if (!el) return;
  const show =
    editMode && viewMode === "single" && edSel.length > 0 && !word.trim();
  el.style.display = show ? "" : "none";
  if (!show) return;
  const g = srcGlifo(edTX ? edTX.ch : CUR()),
    s = edSel[edSel.length - 1],
    P = g.tratti[s.ti] && g.tratti[s.ti].pts[s.pi];
  document.getElementById("einfo").textContent =
    (edSel.length === 1 ? "1 nodo" : edSel.length + " nodi") +
    " · " +
    (edTX ? edTX.ch : CUR());
  const ex = document.getElementById("enx"),
    ey = document.getElementById("eny");
  if (P && document.activeElement !== ex && document.activeElement !== ey) {
    const key =
      s.ti + ":" + s.pi + ":" + P[0].toFixed(3) + ":" + P[1].toFixed(3);
    if (key !== _einsLast) {
      _einsLast = key;
      ex.value = P[0].toFixed(3);
      ey.value = P[1].toFixed(3);
    }
  }
}
