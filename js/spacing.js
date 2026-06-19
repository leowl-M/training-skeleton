// ===== js/spacing.js — auto-spacing ottico (Letterspacer-lite): side bearing dai margini reali dell'inchiostro =====
// Misura quanto la sagoma RINCULA dal suo bordo estremo (media dei margini per scanline, clip a DEPTH).
// Tonde/aperte (O,C,e) → rinculo alto → bearing minore. Piatte (H,I,L) → rinculo ~0 → bearing pieno.
// Risultato: bianco ottico uniforme tra glifi, non bianco geometrico. È ciò che separa "fun" da foundry.
// Knob (calibrazione — il giudizio tipografico non sta nel codice):
const SPACE_TARGET = 0.06; // bianco voluto per lato (frazione di size) — alza per testo più arioso
const SPACE_DEPTH = 0.25; // profondità max contata nel margine — evita che contropunzoni profondi dominino
const SPACE_MINSB = 0.012; // bearing minimo per lato (anti-collisione)
const SPACE_SAMPLES = 48; // scanline orizzontali sul corpo del glifo

// x di attraversamento del contorno outer alla quota y → [xmin, xmax] dell'inchiostro, o null
function inkSpanAt(polys, y) {
  let lo = Infinity,
    hi = -Infinity;
  for (const pg of polys) {
    const P = pg.outer,
      n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i],
        b = P[(i + 1) % n];
      if (a.y <= y === (b.y <= y)) continue; // segmento non attraversa la scanline
      const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

// rinculo medio (clip DEPTH) dal bordo estremo, per lato, + bbox inchiostro
function recession(polys) {
  let y0 = Infinity,
    y1 = -Infinity,
    xmin = Infinity,
    xmax = -Infinity;
  for (const pg of polys)
    for (const v of pg.outer) {
      if (v.y < y0) y0 = v.y;
      if (v.y > y1) y1 = v.y;
      if (v.x < xmin) xmin = v.x;
      if (v.x > xmax) xmax = v.x;
    }
  if (!isFinite(y0) || y1 - y0 < 1e-6) return null;
  let sL = 0,
    sR = 0,
    n = 0;
  for (let i = 0; i < SPACE_SAMPLES; i++) {
    const y = y0 + ((i + 0.5) / SPACE_SAMPLES) * (y1 - y0),
      sp = inkSpanAt(polys, y);
    if (!sp) continue;
    sL += Math.min(SPACE_DEPTH, sp[0] - xmin);
    sR += Math.min(SPACE_DEPTH, xmax - sp[1]);
    n++;
  }
  return n ? { recL: sL / n, recR: sR / n, xmin, xmax } : null;
}

// calcola lsb/rsb (unità percentuali, come li legge conv) per portare il bianco ottico a SPACE_TARGET.
// ink a penX=0 è indipendente da lsb/rsb (stanno solo in glyphAdv/glyphLB lato chiamante) → un passo, no iterazione.
function autoSpaceGlyph(ch, store) {
  const r = (store || font)[ch];
  if (!r) return false;
  const p = conv(fontR(ch)),
    gw = glw(ch),
    o = costr(ch, fontR(ch), 0, 0, 1),
    m = recession(o.polys);
  if (!m) return false;
  const sbL = Math.max(SPACE_MINSB, SPACE_TARGET - m.recL),
    sbR = Math.max(SPACE_MINSB, SPACE_TARGET - m.recR);
  // inverti glyphLBN/glyphAdvN (non-mono) per ricavare lsb,rsb dal bearing voluto
  r.lsb = Math.round((sbL - m.xmin - p.sb - p.spaz / 2) * 100);
  r.rsb = Math.round((sbR + m.xmax - gw * p.larghezza - p.sb - p.spaz / 2) * 100);
  return true;
}

function autoSpaceAll() {
  let k = 0;
  for (const ch of ALLCHARS) if (autoSpaceGlyph(ch)) k++;
  dirty = true;
  if (typeof refreshKnobs === "function") refreshKnobs(); // ponytail: best-effort, ignora se assente
  if (typeof toast === "function") toast("Auto-spacing: " + k + " glifi ribilanciati");
  return k;
}

// self-check: quadrato pieno → rinculo 0 entrambi i lati, bearing simmetrico = SPACE_TARGET.
// triangolo rettangolo (lato sinistro verticale, ipotenusa a destra) → recR > recL.
// Esegui da console: spaceSelfTest()
function spaceSelfTest() {
  const sq = [{ outer: [{ x: 0.2, y: 0 }, { x: 0.6, y: 0 }, { x: 0.6, y: 1 }, { x: 0.2, y: 1 }], holes: [] }];
  const a = recession(sq);
  console.assert(Math.abs(a.recL) < 1e-6 && Math.abs(a.recR) < 1e-6, "square: rinculo deve essere 0", a);
  const tri = [{ outer: [{ x: 0.2, y: 0 }, { x: 0.2, y: 1 }, { x: 0.8, y: 1 }], holes: [] }];
  const b = recession(tri);
  console.assert(b.recR > b.recL + 0.05, "triangolo: lato ipotenusa rincula piu del lato dritto", b);
  console.log("spaceSelfTest ok", { square: a, triangle: b });
  return true;
}
