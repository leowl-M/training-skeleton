// ===== js/export.js — export: OTF (opentype.js), SVG =====
function addContour(path, pts, cw) {
  let P = pts;
  if (P.length < 3) return;
  let A = 0;
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length;
    A += P[i].x * P[j].y - P[j].x * P[i].y;
  }
  const ccw = A > 0;
  if ((cw && ccw) || (!cw && !ccw)) P = P.slice().reverse();
  path.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length; i++) path.lineTo(P[i].x, P[i].y);
  path.close();
}
function buildFont() {
  const EM = 1000,
    CAP = 700,
    sv = union0;
  union0 = true;
  const glyphs = [
    new opentype.Glyph({
      name: ".notdef",
      unicode: 0,
      advanceWidth: 300,
      path: new opentype.Path(),
    }),
  ];
  glyphs.push(
    new opentype.Glyph({
      name: "space",
      unicode: 32,
      advanceWidth: Math.round(0.45 * CAP),
      path: new opentype.Path(),
    }),
  );
  for (const ch of ALLCHARS) {
    // offset orizzontale = left side bearing (sb base + metà spacing + LSB) → l'outline
    // siede correttamente dentro l'advance e LSB/RSB per-glifo contano nell'OTF
    const pc = conv(fontR(ch)),
      lb = glyphLBN(pc, glw(ch)),
      o = costr(ch, fontR(ch), lb * CAP, 0, CAP),
      path = new opentype.Path();
    for (const pg of o.polys) {
      addContour(
        path,
        pg.outer.map((v) => ({ x: v.x, y: CAP - v.y })),
        true,
      );
      for (const h of pg.holes)
        addContour(
          path,
          h.map((v) => ({ x: v.x, y: CAP - v.y })),
          false,
        );
    }
    glyphs.push(
      new opentype.Glyph({
        name: ch === " " ? "space" : "u" + ch.charCodeAt(0),
        unicode: ch.charCodeAt(0),
        advanceWidth: Math.max(1, Math.round(o.advance)),
        path,
      }),
    );
  }
  union0 = sv;
  const fontO = new opentype.Font({
    familyName: fontName,
    styleName: "Regular",
    unitsPerEm: EM,
    ascender: 780,
    descender: -260,
    glyphs,
  });
  // espande coppie esplicite + classi in coppie reali (l'OTF kern table è pair-based). Emette solo i non-zero.
  const kp = {};
  for (let ia = 0; ia < ALLCHARS.length; ia++)
    for (let ib = 0; ib < ALLCHARS.length; ib++) {
      const v = kpair(ALLCHARS[ia], ALLCHARS[ib]);
      if (v) kp[2 + ia + "," + (2 + ib)] = Math.round(v * CAP);
    }
  fontO.kerningPairs = kp;
  return fontO;
}
function exportFont() {
  if (typeof opentype === "undefined") {
    toast("opentype.js non caricato — controlla la connessione", true);
    return;
  }
  try {
    fontName = cleanName();
    buildFont().download(fontName.replace(/\s+/g, "") + "-Regular.otf");
    toast("Font OTF esportato — " + fontName + " Regular");
  } catch (e) {
    toast("Errore export: " + e.message, true);
  }
}
// verifica export: costruisce l'OTF, lo ricarica nel motore font del browser (FontFace) e mostra
// un'anteprima REALE — non il canvas. Se l'OTF è malformato, FontFace.load() fallisce e lo segnaliamo.
async function verifyFont() {
  if (typeof opentype === "undefined") {
    toast("opentype.js non caricato — controlla la connessione", true);
    return;
  }
  let fontO, ab;
  try {
    fontName = cleanName();
    fontO = buildFont();
    ab = fontO.toArrayBuffer();
  } catch (e) {
    toast("Errore build font: " + e.message, true);
    return;
  }
  const fam = "ApiceVerify_" + Date.now();
  try {
    const ff = new FontFace(fam, ab);
    await ff.load();
    document.fonts.add(ff);
  } catch (e) {
    toast("OTF non valido — il browser lo rifiuta: " + e.message, true);
    return;
  }
  // ri-parse per le metriche reali del file generato
  let stats = null;
  try {
    const re = opentype.parse(ab);
    stats = {
      glyphs: re.glyphs.length,
      upm: re.unitsPerEm,
      asc: re.ascender,
      desc: re.descender,
    };
  } catch (e) {}
  const kpairs = Object.keys(fontO.kerningPairs || {}).length;
  showVerifyModal(fam, stats, kpairs);
}
function showVerifyModal(fam, stats, kpairs) {
  const m = document.getElementById("verify");
  if (!m) return;
  const st = document.getElementById("verifyStats");
  st.textContent = stats
    ? stats.glyphs +
      " glifi · EM " +
      stats.upm +
      " · ascender " +
      stats.asc +
      " · descender " +
      stats.desc +
      " · " +
      kpairs +
      " coppie kerning"
    : kpairs + " coppie kerning";
  document.getElementById("verifyAll").textContent = SET().join("");
  for (const el of m.querySelectorAll(".vsample > *"))
    el.style.fontFamily = "'" + fam + "', sans-serif";
  m.classList.add("on");
  toast("Font verificato: OTF valido e caricato dal browser");
}
function polyPaths(polys, strokeW = 6) {
  const ring = (r) =>
    "M" +
    r
      .map((v, i) => (i ? "L" : "") + v.x.toFixed(1) + " " + v.y.toFixed(1))
      .join(" ") +
    "Z";
  const st =
    disp === "line"
      ? `fill="none" stroke="${glyphColor}" stroke-width="${strokeW}" stroke-linejoin="round"`
      : `fill="${glyphColor}"`;
  let s = "";
  for (const pg of polys) {
    let d = ring(pg.outer);
    for (const h of pg.holes) d += ring(h);
    s += `<path d="${d}" ${st} fill-rule="${pg.holes.length ? "evenodd" : "nonzero"}"/>`;
  }
  return s;
}
function svg(polys, W, H) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${UI.bg}"/>` +
    polyPaths(polys) +
    "</svg>"
  );
}
// metrica glifo a size=1: estensione orizzontale (gw*larghezza) e altezza (cap/x-height)
function glyphMetric(ch) {
  const p = conv(fontR(ch));
  return { ch, ext: glw(ch) * Math.max(0.3, p.larghezza), alt: p.altezza };
}
// token = mini-parola (es. "Aa") con baseline condivisa, gap stretto tra glifi
const PAIR_GAP = 0.06; // frazione di size tra glifi di una coppia
function tokenUnit(str) {
  // larghezza del token a size=1
  const M = [...str].map(glyphMetric);
  let w = 0;
  for (const m of M) w += m.ext;
  return w + PAIR_GAP * Math.max(0, M.length - 1);
}
function renderToken(str, penX, baseline, size, polys) {
  let x = penX;
  const gap = PAIR_GAP * size;
  for (const ch of str) {
    const p = conv(fontR(ch)),
      gW = glw(ch) * size * Math.max(0.3, p.larghezza),
      capTop = baseline - size * p.altezza;
    polys.push(...costr(ch, fontR(ch), x, capTop, size).polys);
    x += gW + gap;
  }
}
// specimen composto stile foundry: coppie Aa Bb… + riga numeri + riga simboli.
// Ogni riga GIUSTIFICATA su tutta la larghezza (riempie edge-to-edge come reference),
// size UNICA limitata solo da altezza riga e non-sovrapposizione.
const SPEC_SYMS = [".", ",", "!", "?", ":", ";", "&", "@", "#", "%"];
const MIN_GAP = 0.12; // gap minimo tra token (frazione di size) → vincolo anti-overlap
function rowUnit(tokens) {
  // somma estensioni token a size=1 (gap esclusi)
  let s = 0;
  for (const t of tokens) s += tokenUnit(t);
  return s;
}
function specimenComposed(x0, y0, w, h) {
  const up = SETS.upper.chars,
    lo = SETS.lower.chars,
    cols = 4,
    pairs = up.map((U, i) => U + (lo[i] || "")),
    nums = SETS.num.chars.slice(),
    syms = SPEC_SYMS.filter((c) => font[c]),
    rows = [];
  for (let i = 0; i < pairs.length; i += cols)
    rows.push({ tokens: pairs.slice(i, i + cols), full: i + cols <= pairs.length });
  if (nums.length) rows.push({ tokens: nums, full: true });
  if (syms.length) rows.push({ tokens: syms.map(String), full: true });
  const rh = h / rows.length,
    capFrac = 0.66; // cap height max rispetto alla riga
  // size unica: min tra vincolo altezza (ogni glifo) e vincolo larghezza (ogni riga senza overlap)
  let size = Infinity;
  for (const ch of [...up, ...lo, ...nums, ...syms]) {
    const a = glyphMetric(ch).alt;
    if (a > 0) size = Math.min(size, (rh * capFrac) / a);
  }
  for (const row of rows) {
    const n = row.tokens.length,
      denom = rowUnit(row.tokens) + MIN_GAP * Math.max(0, n - 1);
    if (denom > 0) size = Math.min(size, w / denom);
  }
  if (!isFinite(size)) size = rh * 0.5;
  const polys = [];
  rows.forEach((row, r) => {
    const base = y0 + r * rh + rh * 0.74,
      n = row.tokens.length,
      widths = row.tokens.map((t) => tokenUnit(t) * size),
      sumW = widths.reduce((a, b) => a + b, 0);
    let gap, startX;
    if (row.full && n > 1) {
      // giustifica edge-to-edge
      gap = (w - sumW) / (n - 1);
      startX = x0;
    } else {
      // riga incompleta: centra col gap minimo
      gap = MIN_GAP * size;
      startX = x0 + (w - (sumW + gap * (n - 1))) / 2;
    }
    let x = startX;
    row.tokens.forEach((t, i) => {
      renderToken(t, x, base, size, polys);
      x += widths[i] + gap;
    });
  });
  return { polys, size };
}
// poster specimen: layout foundry minimale per social (1080x1440, 1080x1920)
function posterLayout(W, H) {
  const Mx = Math.round(W * 0.055), // margine laterale stretto
    My = Math.round(H * 0.045), // margine verticale stretto
    grid = specimenComposed(Mx, My, W - 2 * Mx, H - 2 * My);
  return { grid, W, H };
}
function posterSVG(W, H) {
  const L = posterLayout(W, H);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="100%" height="100%" fill="${UI.bg}"/>` +
    polyPaths(L.grid.polys, Math.max(4, Math.round(W / 270))) +
    "</svg>"
  );
}
function esc(s) {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}
function posterPNG(W, H) {
  const L = posterLayout(W, H),
    gp = createGraphics(W, H);
  gp.background(UI.bg);
  if (disp === "line") {
    gp.noFill();
    gp.stroke(glyphColor);
    gp.strokeWeight(Math.max(4, Math.round(W / 270)));
    gp.strokeJoin(gp.ROUND);
  } else {
    gp.noStroke();
    gp.fill(glyphColor);
  }
  for (const pg of L.grid.polys) {
    gp.beginShape();
    for (const v of pg.outer) gp.vertex(v.x, v.y);
    const ao = areaP(pg.outer) > 0;
    for (const h of pg.holes) {
      gp.beginContour();
      const r = areaP(h) > 0 === ao ? h.slice().reverse() : h;
      for (const v of r) gp.vertex(v.x, v.y);
      gp.endContour();
    }
    gp.endShape(gp.CLOSE);
  }
  saveCanvas(gp, "specimen-" + W + "x" + H, "png");
  gp.remove();
}
