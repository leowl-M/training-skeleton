// ===== js/base.js — base scheletro: bypass moduli, parser JHF, selezione set Hershey (BASE), srcGlifo =====
let bypass = { curves: false, terminal: false, lab: false };
const TOGDEF = {
  cap: "butt",
  join: "miter",
  serif: "none",
  dot: "round",
  pen: "ellipse",
  trapShape: "triangle",
};
function applyBypass(raw) {
  if (!bypass.curves && !bypass.terminal) return raw;
  const o = Object.assign({}, raw);
  for (const cfg of PANELS) {
    if (!bypass[cfg.id]) continue;
    for (const t of cfg.tabs || [])
      for (const id of t.knobs || []) o[id] = SL.find((s) => s.id === id).def;
    for (const tg of cfg.togs || []) o[tg] = TOGDEF[tg];
  }
  return o;
}
// base scheletro intercambiabile: HERSHEY interno o set .jhf caricati da hershey/
let BASE = HERSHEY,
  baseName = "interno";
const BASEFONTS = [
  ["interno", "Geometrico (interno)"],
  ["custom", "Personalizzata (editor)"],
  ["futural", "Sans Simplex"],
  ["futuram", "Sans Duplex"],
  ["rowmans", "Roman Simplex"],
  ["rowmand", "Roman Duplex"],
  ["rowmant", "Roman Triplex"],
  ["timesr", "Times Roman"],
  ["timesrb", "Times Bold"],
  ["timesi", "Times Italic"],
  ["timesib", "Times Bold Italic"],
  ["scripts", "Script Simplex"],
  ["scriptc", "Script Complex"],
  ["cursive", "Cursive"],
  ["gothiceng", "Gothic English"],
  ["gothicger", "Gothic German"],
  ["gothicita", "Gothic Italian"],
  ["greek", "Greek Plain"],
  ["greeks", "Greek Simplex"],
  ["greekc", "Greek Complex"],
];
const jhfCache = {};
function parseJHF(txt) {
  const S = txt.replace(/\r/g, "");
  let pos = 0;
  const glyphs = [];
  const next = () => {
    while (S[pos] === "\n") pos++;
    return S[pos++];
  };
  while (true) {
    while (pos < S.length && S[pos] === "\n") pos++;
    if (pos >= S.length) break;
    let head = "";
    for (let k = 0; k < 8; k++) head += next();
    const nv = parseInt(head.slice(5), 10);
    if (!nv || nv < 1) break;
    const L = next(),
      R = next(),
      lm = L.charCodeAt(0) - 82,
      rm = R.charCodeAt(0) - 82,
      strokes = [];
    let run = [];
    for (let k = 0; k < nv - 1; k++) {
      const a = next(),
        b = next();
      if (a === " " && b === "R") {
        if (run.length > 1) strokes.push(run);
        run = [];
        continue;
      }
      run.push([a.charCodeAt(0) - 82, b.charCodeAt(0) - 82]);
    }
    if (run.length > 1) strokes.push(run);
    glyphs.push({ lm, rm, strokes });
  }
  return glyphs;
}
// ===== fitting: polilinea JHF → nodi con maniglie di Bézier (Schneider, Graphics Gems) =====
// le polilinee Hershey campionano le curve ogni 18–53°: il fitting le riduce a pochi nodi
// veri (angolo k:1 / morbido k:3) così editor, ink trap e grazie lavorano su spigoli reali
function fitCubics(d, tHat1, tHat2, tol) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]],
    add = (a, b) => [a[0] + b[0], a[1] + b[1]],
    scl = (a, s) => [a[0] * s, a[1] * s],
    dot = (a, b) => a[0] * b[0] + a[1] * b[1],
    d2 = (a, b) => {
      const x = a[0] - b[0],
        y = a[1] - b[1];
      return x * x + y * y;
    },
    nrm = (a) => {
      const L = Math.hypot(a[0], a[1]) || 1;
      return [a[0] / L, a[1] / L];
    };
  const B0 = (t) => (1 - t) ** 3,
    B1 = (t) => 3 * t * (1 - t) ** 2,
    B2 = (t) => 3 * t * t * (1 - t),
    B3 = (t) => t ** 3;
  const bezPt = (b, t) =>
    add(
      add(scl(b[0], B0(t)), scl(b[1], B1(t))),
      add(scl(b[2], B2(t)), scl(b[3], B3(t))),
    );
  const out = [];
  const chordU = (first, last) => {
    const u = [0];
    for (let i = first + 1; i <= last; i++)
      u.push(u[i - first - 1] + Math.sqrt(d2(d[i], d[i - 1])));
    const L = u[u.length - 1] || 1;
    return u.map((v) => v / L);
  };
  const genBez = (first, last, uP, t1, t2) => {
    const n = last - first + 1,
      p0 = d[first],
      p3 = d[last];
    let C00 = 0,
      C01 = 0,
      C11 = 0,
      X0 = 0,
      X1 = 0;
    for (let i = 0; i < n; i++) {
      const u = uP[i],
        A0 = scl(t1, B1(u)),
        A1 = scl(t2, B2(u)),
        tmp = sub(
          d[first + i],
          add(scl(p0, B0(u) + B1(u)), scl(p3, B2(u) + B3(u))),
        );
      C00 += dot(A0, A0);
      C01 += dot(A0, A1);
      C11 += dot(A1, A1);
      X0 += dot(A0, tmp);
      X1 += dot(A1, tmp);
    }
    const det = C00 * C11 - C01 * C01;
    let aL = det ? (X0 * C11 - X1 * C01) / det : 0,
      aR = det ? (C00 * X1 - C01 * X0) / det : 0;
    const segL = Math.sqrt(d2(p0, p3));
    if (aL < 1e-6 * segL || aR < 1e-6 * segL) aL = aR = segL / 3;
    return [p0, add(p0, scl(t1, aL)), add(p3, scl(t2, aR)), p3];
  };
  const maxErr = (first, last, b, uP) => {
    let mx = 0,
      ix = (first + last) >> 1;
    for (let i = first + 1; i < last; i++) {
      const e = d2(bezPt(b, uP[i - first]), d[i]);
      if (e > mx) {
        mx = e;
        ix = i;
      }
    }
    return [mx, ix];
  };
  const newton = (b, p, u) => {
    const d1 = [],
      dd = [];
    for (let i = 0; i < 3; i++) d1.push(scl(sub(b[i + 1], b[i]), 3));
    for (let i = 0; i < 2; i++) dd.push(scl(sub(d1[i + 1], d1[i]), 2));
    const q = bezPt(b, u),
      q1 = add(
        add(scl(d1[0], (1 - u) ** 2), scl(d1[1], 2 * u * (1 - u))),
        scl(d1[2], u * u),
      ),
      q2 = add(scl(dd[0], 1 - u), scl(dd[1], u)),
      num = dot(sub(q, p), q1),
      den = dot(q1, q1) + dot(sub(q, p), q2);
    return Math.abs(den) < 1e-12 ? u : u - num / den;
  };
  const fitRec = (first, last, t1, t2, depth) => {
    if (last - first === 1) {
      const p0 = d[first],
        p3 = d[last],
        L = Math.sqrt(d2(p0, p3)) / 3;
      out.push([p0, add(p0, scl(t1, L)), add(p3, scl(t2, L)), p3]);
      return;
    }
    let uP = chordU(first, last),
      b = genBez(first, last, uP, t1, t2),
      [mx, ix] = maxErr(first, last, b, uP);
    if (mx < tol) {
      out.push(b);
      return;
    }
    if (mx < tol * 16)
      for (let k = 0; k < 4; k++) {
        uP = uP.map((u, i) =>
          Math.min(1, Math.max(0, newton(b, d[first + i], u))),
        );
        b = genBez(first, last, uP, t1, t2);
        [mx, ix] = maxErr(first, last, b, uP);
        if (mx < tol) {
          out.push(b);
          return;
        }
      }
    if (depth > 16) {
      out.push(b);
      return;
    }
    const tC = nrm(sub(d[ix - 1], d[ix + 1]));
    fitRec(first, ix, t1, tC, depth + 1);
    fitRec(ix, last, [-tC[0], -tC[1]], t2, depth + 1);
  };
  fitRec(0, d.length - 1, tHat1, tHat2, 0);
  return out;
}
const FIT_TOL = 5e-5; // errore² massimo in unità em (≈ 0.007 em di scarto, sotto la quantizzazione JHF di 1/42)
const FIT_CORNER = Math.cos((66 * Math.PI) / 180); // svolta > 66° = angolo vero (le curve JHF girano ≤ ~53°/vertice)
function fitTratto(pts, chiuso) {
  const Q = [];
  for (const q of pts) {
    const l = Q[Q.length - 1];
    if (!l || q[0] !== l[0] || q[1] !== l[1]) Q.push([q[0], q[1]]);
  }
  while (
    chiuso &&
    Q.length > 1 &&
    Q[0][0] === Q[Q.length - 1][0] &&
    Q[0][1] === Q[Q.length - 1][1]
  )
    Q.pop();
  const n = Q.length;
  if (n < (chiuso ? 4 : 3)) return { pts: Q, chiuso };
  const dir = (a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  const isCorner = (i) => {
    const u = dir(Q[(i - 1 + n) % n], Q[i]),
      v = dir(Q[i], Q[(i + 1) % n]);
    return u[0] * v[0] + u[1] * v[1] < FIT_CORNER;
  };
  const cs = [];
  for (let i = chiuso ? 0 : 1; i <= (chiuso ? n - 1 : n - 2); i++)
    if (isCorner(i)) cs.push(i);
  const at = (i) => Q[((i % n) + n) % n];
  // fitta l'arco [a..b] (indici, b può sfondare n per i chiusi); null = segmento retto
  const fitArc = (a, b) => {
    if (b - a === 1) return null;
    const D = [];
    for (let i = a; i <= b; i++) D.push(at(i));
    return fitCubics(
      D,
      dir(D[0], D[1]),
      dir(D[D.length - 1], D[D.length - 2]),
      FIT_TOL,
    );
  };
  const nodes = []; // {p, hIn, hOut, corner}
  const emitArc = (a, b) => {
    const bez = fitArc(a, b);
    if (!bez) {
      nodes.push({ p: at(b), corner: true });
      return;
    }
    const prev = nodes[nodes.length - 1],
      sub = (x, y) => [x[0] - y[0], x[1] - y[1]];
    prev.hOut = sub(bez[0][1], bez[0][0]);
    for (let k = 0; k < bez.length - 1; k++)
      nodes.push({
        p: bez[k][3],
        hIn: sub(bez[k][2], bez[k][3]),
        hOut: sub(bez[k + 1][1], bez[k + 1][0]),
        corner: false,
      });
    const L = bez[bez.length - 1];
    nodes.push({ p: L[3], hIn: sub(L[2], L[3]), corner: true });
  };
  if (!chiuso) {
    nodes.push({ p: Q[0], corner: true });
    const bd = [0, ...cs, n - 1];
    for (let k = 0; k < bd.length - 1; k++) emitArc(bd[k], bd[k + 1]);
  } else if (cs.length) {
    nodes.push({ p: Q[cs[0]], corner: true });
    for (let k = 0; k < cs.length; k++)
      emitArc(cs[k], k + 1 < cs.length ? cs[k + 1] : cs[0] + n);
    // il nodo di chiusura coincide col primo: fonde la maniglia in entrata
    const last = nodes.pop();
    nodes[0].hIn = last.hIn;
  } else {
    // anello senza angoli: cucitura morbida in 0 con tangente centrata
    const sub = (x, y) => [x[0] - y[0], x[1] - y[1]],
      tS = dir(Q[n - 1], Q[1]),
      D = [...Q, Q[0]],
      bez = fitCubics(D, tS, [-tS[0], -tS[1]], FIT_TOL);
    nodes.push({
      p: Q[0],
      hIn: sub(bez[bez.length - 1][2], bez[bez.length - 1][3]),
      hOut: sub(bez[0][1], bez[0][0]),
      corner: false,
    });
    for (let k = 0; k < bez.length - 1; k++)
      nodes.push({
        p: bez[k][3],
        hIn: sub(bez[k][2], bez[k][3]),
        hOut: sub(bez[k + 1][1], bez[k + 1][0]),
        corner: false,
      });
  }
  const outPts = nodes.map((nd) => {
    if (!nd.hIn && !nd.hOut && nd.corner) return [nd.p[0], nd.p[1], { k: 1 }];
    const m = { k: nd.corner ? 1 : 3 };
    if (nd.hIn) m.hIn = nd.hIn;
    if (nd.hOut) m.hOut = nd.hOut;
    return [nd.p[0], nd.p[1], m];
  });
  return { pts: outPts, chiuso };
}
function jhfToFont(glyphs) {
  const map = {};
  for (let i = 0; i < glyphs.length; i++) {
    const ch = String.fromCharCode(32 + i);
    if (ch === " ") continue;
    const g = glyphs[i];
    const tratti = g.strokes.map((st) => {
      let pts = st.map(([x, y]) => [(x - g.lm) / 21, (y + 12) / 21]);
      let chiuso = false;
      const a = pts[0],
        b = pts[pts.length - 1];
      if (pts.length > 3 && a[0] === b[0] && a[1] === b[1]) {
        chiuso = true;
        pts = pts.slice(0, -1);
      }
      return fitTratto(pts, chiuso);
    });
    map[ch] = { w: (g.rm - g.lm) / 21, tratti };
  }
  return map;
}
function baseLabel(n) {
  const e = BASEFONTS.find((b) => b[0] === n);
  return e ? e[1] : n;
}
async function loadBaseFont(name) {
  if (name === "interno") return HERSHEY;
  if (name === "custom") {
    const s = localStorage.getItem("ht_base_custom");
    if (!s) throw new Error("nessuna base personalizzata salvata (usa l'editor)");
    return Object.assign({}, HERSHEY, JSON.parse(s));
  }
  if (!jhfCache[name]) {
    const r = await fetch("hershey/" + name + ".jhf");
    if (!r.ok) throw new Error("HTTP " + r.status);
    jhfCache[name] = jhfToFont(parseJHF(await r.text()));
  }
  return jhfCache[name];
}
async function setBase(name) {
  const sel = document.getElementById("basefont");
  try {
    BASE = await loadBaseFont(name);
    baseName = name;
    if (sel) sel.value = name;
    cache = null;
    dirty = true;
    vizForce = true;
    load(Math.min(cur, SET().length - 1));
    schedPersist();
    toast("Base: " + baseLabel(name));
  } catch (e) {
    toast("Base non caricata: " + e.message, true);
    if (sel) sel.value = baseName;
  }
}
// l'editor base salva su localStorage da un'altra scheda: se la base attiva è "custom", ricarica live
window.addEventListener("storage", (e) => {
  if (e.key === "ht_base_custom" && baseName === "custom") setBase("custom");
});
function srcGlifo(ch) {
  if (skelEdits[ch]) return skelEdits[ch];
  if (BASE[ch]) return BASE[ch];
  const c = COMPOSITES[ch];
  if (c) {
    // component glyph: la base è srcGlifo(base) → eredita anche i nodi modificati della base
    const bt = srcGlifo(c[0]);
    if (!bt || !bt.tratti.length) return { w: 0.5, tratti: [] };
    const up = c[0] >= "A" && c[0] <= "Z";
    let tratti = bt.tratti;
    if (c[0] === "i" || c[0] === "j")
      tratti = tratti.filter((t) => {
        if (!t.chiuso) return true;
        let xn = 1e9,
          xx = -1e9,
          yn = 1e9,
          yx = -1e9;
        for (const q of t.pts) {
          xn = Math.min(xn, q[0]);
          xx = Math.max(xx, q[0]);
          yn = Math.min(yn, q[1]);
          yx = Math.max(yx, q[1]);
        }
        return !(xx - xn < 0.16 && yx - yn < 0.16);
      });
    return { w: bt.w, tratti: [...tratti, ...accentStrokes(c[1], bt.w, up)] };
  }
  return { w: 0.5, tratti: [] };
}
function glw(ch) {
  return srcGlifo(ch).w;
}
