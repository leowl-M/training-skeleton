// ===== js/svg.js — importa un tracciato SVG come scheletro del glifo (skelEdits) =====
// Disegna la lettera (linea centrale) in qualsiasi software, esporta SVG, caricala col
// tasto destro. Ogni subpath (M…) = un tratto. Curve campionate con l'API nativa
// getPointAtLength → niente parser. Va in skelEdits, quindi viaggia col progetto (anche online).

function svgToTratti(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) throw new Error("SVG non valido");
  const ds = [...doc.querySelectorAll("path")]
    .map((p) => p.getAttribute("d"))
    .filter(Boolean);
  if (!ds.length)
    throw new Error("nessun <path>: esporta i tracciati come path, non forme");
  // ogni moveto apre un tratto. m iniziale = M (spec SVG), quindi i subpath isolati restano corretti
  const subs = [];
  for (const d of ds)
    for (const seg of d.split(/(?=[Mm])/)) if (seg.trim()) subs.push(seg.trim());
  const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const rings = [];
  let xn = 1e9, xx = -1e9, yn = 1e9, yx = -1e9;
  for (const seg of subs) {
    tmp.setAttribute("d", seg);
    const L = tmp.getTotalLength();
    if (!L) continue;
    const step = Math.max(L / 200, 0.5),
      pts = [];
    for (let s = 0; s <= L; s += step) {
      const p = tmp.getPointAtLength(s);
      pts.push([p.x, p.y]);
      xn = Math.min(xn, p.x); xx = Math.max(xx, p.x);
      yn = Math.min(yn, p.y); yx = Math.max(yx, p.y);
    }
    rings.push({ pts, chiuso: /z/i.test(seg) });
  }
  const h = yx - yn || 1; // SVG y cresce in basso = come lo spazio tool. scala uniforme per altezza (cap→baseline)
  const tratti = rings
    .map((r) => ({
      pts: simplifyPL(r.pts.map(([x, y]) => [(x - xn) / h, (y - yn) / h]), 0.01),
      chiuso: r.chiuso,
    }))
    .filter((t) => t.pts.length >= 2);
  if (!tratti.length) throw new Error("tracciato vuoto");
  return { w: (xx - xn) / h, tratti };
}

// tasto destro → file picker → applica al glifo ch
function importSvgToGlyph(ch) {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".svg,image/svg+xml";
  inp.onchange = () => {
    const f = inp.files[0];
    if (!f) return;
    f.text()
      .then((txt) => {
        const g = svgToTratti(txt);
        commit();
        skelEdits[ch] = g;
        dirty = true;
        cache = null;
        vizForce = true;
        if (ch === CUR()) load(cur);
        schedPersist();
        toast('SVG importato su "' + ch + '"');
      })
      .catch((e) => toast("SVG: " + (e.message || e), true));
  };
  inp.click();
}

// ponytail: SVG mappato sul bounding box (altezza = cap..baseline). Se la lettera non
// tocca cap/baseline esce alta: si rifinisce coi nodi. add when serve allineamento metrico vero.
if (typeof module !== "undefined" && module.exports) module.exports = { svgToTratti };
