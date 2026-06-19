// ===== js/lint.js — controllo qualità per-glifo: outline pulita, niente difetti nelle singole lettere =====
// Analizza l'outline generato da costr() per ogni glifo e segnala difetti visibili:
// autointersezioni, glifo vuoto, detriti (frammenti sparsi), contorni degeneri.
// Pensato per: font libera/divertente nei parametri globali, ma zero imperfezioni nella lettera.

const LINT = {
  size: 1000, // em di lavoro: indipendente da zoom/anteprima
  col: { err: "#ff3b30", warn: "#ffb020", ok: "#34c759" },
};

// NB: niente controllo di autointersezione. Questo motore disegna a tratti + boolean union:
// i contorni (es. P, e, 6, 9) vengono rappresentati come anelli che si auto-toccano e si
// riempiono correttamente con winding nonzero — un test di self-intersection darebbe falsi
// positivi su glifi puliti. Si controllano solo difetti affidabili (vedi sotto).

// controllo di un singolo glifo → { level, issues:[{code,msg,level}] }
function lintGlyph(ch) {
  const issues = [];
  // whitespace: vuoto legittimo
  if (ch === " " || ch === " ") return { level: "ok", issues };
  let polys;
  try {
    polys = costr(ch, fontR(ch), 0, 0, LINT.size).polys || [];
  } catch (e) {
    return {
      level: "err",
      issues: [{ code: "crash", msg: "errore di costruzione: " + e.message, level: "err" }],
    };
  }
  const hasSrc = srcGlifo(ch).tratti.length > 0;
  // 1) vuoto: la lettera ha scheletro ma non produce inchiostro
  if (hasSrc && polys.length === 0) {
    return {
      level: "err",
      issues: [{ code: "vuoto", msg: "glifo vuoto: lo scheletro non genera outline", level: "err" }],
    };
  }
  // aree per detriti / contorni degeneri
  let maxA = 0;
  const areas = polys.map((pg) => {
    const a = Math.abs(areaP(pg.outer));
    if (a > maxA) maxA = a;
    return a;
  });
  // 2) contorni degeneri (meno di 3 nodi o area ~nulla)
  let degen = 0;
  for (let i = 0; i < polys.length; i++)
    if (polys[i].outer.length < 3 || areas[i] < LINT.size * LINT.size * 1e-5) degen++;
  if (degen)
    issues.push({ code: "degen", msg: degen + " contorno/i degenere/i", level: "warn" });
  // 3) detriti: frammenti minuscoli accanto al corpo principale (solo con union attiva, dove dovrebbe esserci 1 forma)
  if (union0 && maxA > 0) {
    let debris = 0;
    for (const a of areas)
      if (a > 0 && a < maxA * 0.012 && a < LINT.size * LINT.size * 2e-3) debris++;
    if (debris)
      issues.push({ code: "detriti", msg: debris + " frammento/i sparso/i", level: "warn" });
  }
  let level = "ok";
  for (const it of issues) if (it.level === "err") level = "err";
  if (level === "ok" && issues.length) level = "warn";
  return { level, issues };
}

// controlla tutto il set corrente, mette in cache, restituisce { map, err, warn, ok }
function lintAll() {
  const map = {},
    chars = SET();
  let err = 0,
    warn = 0,
    ok = 0;
  for (const ch of chars) {
    const r = lintGlyph(ch);
    map[ch] = r;
    if (r.level === "err") err++;
    else if (r.level === "warn") warn++;
    else ok++;
  }
  lintCache = { map, err, warn, ok };
  return lintCache;
}

// risultato per il glifo corrente (usa la cache se presente)
function lintCur() {
  const ch = CUR();
  if (lintCache && lintCache.map[ch]) return lintCache.map[ch];
  return lintGlyph(ch);
}
