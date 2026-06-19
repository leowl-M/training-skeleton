// ===== js/consist.js — consistenza globale: trova parametri strutturali che divergono tra i glifi =====
// Una font coerente usa lo stesso stem, x-height, ascender… su tutte le lettere. Se modifichi i
// glifi uno a uno è facile che qualcuno resti indietro (la "n" più spessa della "m").
// Qui NON si misura il rendering (rischio falsi positivi, vedi lint): si confrontano i PARAMETRI
// del master attivo. Esatto e deterministico. "Uniforma" porta tutti al valore più diffuso (moda).

// parametri che, per una font coerente, dovrebbero essere uguali su tutto l'alfabeto
const CONSIST_NUM = [
  { id: "peso", l: "Stem" },
  { id: "bar", l: "Bar" },
  { id: "altezza", l: "Altezza" },
  { id: "mid", l: "Crossbar" },
  { id: "xheight", l: "x-Height" },
  { id: "asc", l: "Ascender" },
  { id: "desc", l: "Descender" },
  { id: "overshoot", l: "Overshoot" },
  { id: "slant", l: "Slant" },
  { id: "penang", l: "Rotazione penna" },
];
const CONSIST_TOG = [
  { id: "serif", l: "Grazie" },
  { id: "pen", l: "Penna" },
  { id: "join", l: "Giunzione" },
  { id: "cap", l: "Terminale" },
];
const _SLmap = (() => {
  const m = {};
  for (const s of SL) m[s.id] = s;
  return m;
})();

// valore più frequente + quante varianti distinte esistono
function consistMode(vals) {
  const m = new Map();
  for (const v of vals) m.set(v, (m.get(v) || 0) + 1);
  let mode = null,
    bc = -1;
  for (const [v, c] of m) if (c > bc) {
    bc = c;
    mode = v;
  }
  return { mode, count: bc, distinct: m.size };
}
function consistFmtNum(id, v) {
  const s = _SLmap[id];
  return s && s.f ? s.f(v) : String(v);
}
function consistFmtTog(id, v) {
  const t = TOG[id];
  if (t) for (const [val, lab] of t.opts) if (val === v) return lab;
  return String(v);
}

// report sul master attivo (font): solo i parametri che divergono
function consistReport() {
  const chars = ALLCHARS,
    rows = [];
  const scan = (defs, type) => {
    for (const k of defs) {
      const vals = chars.map((c) => font[c][k.id]);
      const { mode, count, distinct } = consistMode(vals);
      if (distinct > 1) {
        const outliers = chars.filter((c) => font[c][k.id] !== mode);
        rows.push({
          id: k.id,
          l: k.l,
          type,
          mode,
          modeFmt: type === "num" ? consistFmtNum(k.id, mode) : consistFmtTog(k.id, mode),
          count,
          nOut: outliers.length,
          outliers,
        });
      }
    }
  };
  scan(CONSIST_NUM, "num");
  scan(CONSIST_TOG, "tog");
  return { rows, total: chars.length };
}

// porta TUTTI i glifi al valore moda per il parametro id (con undo)
function consistApply(id) {
  commit();
  const vals = ALLCHARS.map((c) => font[c][id]),
    { mode } = consistMode(vals);
  let n = 0;
  for (const c of ALLCHARS)
    if (font[c][id] !== mode) {
      font[c][id] = mode;
      n++;
    }
  schedPersist();
  dirty = true;
  cache = null;
  lintCache = null;
  for (const k in knobRefresh) knobRefresh[k]();
  toast("Uniformato: " + n + " glifo/i allineato/i");
  renderConsist();
  return n;
}
