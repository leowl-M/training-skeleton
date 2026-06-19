// ===== js/import.js — import font esistente in 2 modi:
//   A) outline raw → glyphRaw (warp/metriche/spacing/effetti, NO modello tratto)
//   B) skeletonization (raster + Zhang-Suen thinning + tracing) → skelEdits (TUTTI i parametri)

function impCapH(font) {
  const os2 = font.tables && font.tables.os2;
  return (os2 && os2.sCapHeight) || 0.7 * (font.unitsPerEm || 1000);
}

// flatten dei comandi opentype → anelli di punti [x,y] in font units (y-up)
function impFlatten(glyph, steps) {
  const cmds = glyph.path.commands,
    rings = [];
  let cur = null,
    px = 0,
    py = 0;
  const cubic = (x1, y1, x2, y2, x, y) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        u = 1 - t;
      cur.push([
        u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
        u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
      ]);
    }
    px = x;
    py = y;
  };
  const quad = (x1, y1, x, y) => {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps,
        u = 1 - t;
      cur.push([
        u * u * px + 2 * u * t * x1 + t * t * x,
        u * u * py + 2 * u * t * y1 + t * t * y,
      ]);
    }
    px = x;
    py = y;
  };
  for (const c of cmds) {
    if (c.type === "M") {
      cur = [[c.x, c.y]];
      rings.push(cur);
      px = c.x;
      py = c.y;
    } else if (c.type === "L") {
      cur.push([c.x, c.y]);
      px = c.x;
      py = c.y;
    } else if (c.type === "C") cubic(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.type === "Q") quad(c.x1, c.y1, c.x, c.y);
  }
  return rings;
}

// ---- A: outline raw normalizzate ----
function importOutlines(font) {
  const capH = impCapH(font);
  let n = 0;
  for (const ch of ALLCHARS) {
    const g = font.charToGlyph(ch);
    if (!g || !g.path || !g.path.commands.length) continue;
    const rings = impFlatten(g, 8).filter((r) => r.length >= 3);
    if (!rings.length) continue;
    // font units (y-up, baseline 0) → spazio tool (0=cap-top, 1=baseline)
    const contours = rings.map((r) => ({
      pts: r.map((q) => [q[0] / capH, 1 - q[1] / capH]),
    }));
    glyphRaw[ch] = { w: (g.advanceWidth || capH) / capH, contours };
    delete skelEdits[ch];
    imported[ch] = "A";
    n++;
  }
  return n;
}

// ---- B: skeletonization ----
function zhangSuen(grid, R) {
  const P = (x, y) => (x >= 0 && y >= 0 && x < R && y < R ? grid[y][x] : 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of [0, 1]) {
      const del = [];
      for (let y = 1; y < R - 1; y++)
        for (let x = 1; x < R - 1; x++) {
          if (grid[y][x] !== 1) continue;
          const p2 = P(x, y - 1),
            p3 = P(x + 1, y - 1),
            p4 = P(x + 1, y),
            p5 = P(x + 1, y + 1),
            p6 = P(x, y + 1),
            p7 = P(x - 1, y + 1),
            p8 = P(x - 1, y),
            p9 = P(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let i = 0; i < 8; i++)
            if (seq[i] === 0 && seq[i + 1] === 1) A++;
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          del.push([x, y]);
        }
      if (del.length) {
        changed = true;
        for (const [x, y] of del) grid[y][x] = 0;
      }
    }
  }
}

function traceSkeleton(grid, R) {
  const on = (x, y) => x >= 0 && y >= 0 && x < R && y < R && grid[y][x] === 1;
  const nbrs = (x, y) => {
    const r = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (on(x + dx, y + dy)) r.push([x + dx, y + dy]);
      }
    return r;
  };
  const visited = new Set(),
    key = (x, y) => x + "," + y,
    lines = [];
  const walk = (sx, sy) => {
    const line = [[sx, sy]];
    visited.add(key(sx, sy));
    let cx = sx,
      cy = sy;
    while (true) {
      const ns = nbrs(cx, cy).filter(([x, y]) => !visited.has(key(x, y)));
      if (!ns.length) break;
      const [nx, ny] = ns[0];
      visited.add(key(nx, ny));
      line.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    return line;
  };
  const pix = [];
  for (let y = 0; y < R; y++)
    for (let x = 0; x < R; x++) if (grid[y][x] === 1) pix.push([x, y]);
  for (const [x, y] of pix)
    if (!visited.has(key(x, y)) && nbrs(x, y).length === 1)
      lines.push(walk(x, y));
  for (const [x, y] of pix)
    if (!visited.has(key(x, y))) lines.push(walk(x, y));
  return lines.filter((l) => l.length >= 2);
}

function simplifyPL(pts, eps) {
  if (pts.length < 3) return pts;
  const sq = (a, b) => {
    const dx = a[0] - b[0],
      dy = a[1] - b[1];
    return dx * dx + dy * dy;
  };
  const segDist = (p, a, b) => {
    const l2 = sq(a, b);
    if (l2 === 0) return Math.sqrt(sq(p, a));
    let t =
      ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(sq(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]));
  };
  const dp = (s, e) => {
    let dmax = 0,
      idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (dmax > eps && idx > 0)
      return dp(s, idx).slice(0, -1).concat(dp(idx, e));
    return [pts[s], pts[e]];
  };
  return dp(0, pts.length - 1);
}

function importSkeletons(font) {
  const capH = impCapH(font),
    R = 80,
    cnv = document.createElement("canvas");
  cnv.width = R;
  cnv.height = R;
  const cx = cnv.getContext("2d");
  let n = 0;
  for (const ch of ALLCHARS) {
    const g = font.charToGlyph(ch);
    if (!g || !g.path || !g.path.commands.length) continue;
    const scale = (0.74 * R) / capH,
      baseY = 0.86 * R,
      adv = g.advanceWidth || capH,
      ox = (R - adv * scale) / 2;
    cx.clearRect(0, 0, R, R);
    const path = g.getPath(ox, baseY, capH * scale);
    cx.fillStyle = "#000";
    cx.beginPath();
    for (const c of path.commands) {
      if (c.type === "M") cx.moveTo(c.x, c.y);
      else if (c.type === "L") cx.lineTo(c.x, c.y);
      else if (c.type === "C")
        cx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
      else if (c.type === "Q") cx.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
      else if (c.type === "Z") cx.closePath();
    }
    cx.fill("nonzero");
    const data = cx.getImageData(0, 0, R, R).data,
      grid = [];
    for (let y = 0; y < R; y++) {
      const row = [];
      for (let x = 0; x < R; x++) row.push(data[(y * R + x) * 4 + 3] > 80 ? 1 : 0);
      grid.push(row);
    }
    zhangSuen(grid, R);
    const lines = traceSkeleton(grid, R);
    if (!lines.length) continue;
    const tratti = [];
    for (const pl of lines) {
      const pts = pl.map(([x, y]) => {
        const fx = (x - ox) / scale,
          fy = (baseY - y) / scale;
        return [fx / capH, 1 - fy / capH];
      });
      const s = simplifyPL(pts, 0.014);
      if (s.length >= 2) tratti.push({ pts: s, chiuso: false });
    }
    if (!tratti.length) continue;
    skelEdits[ch] = { w: adv / capH, tratti };
    delete glyphRaw[ch];
    imported[ch] = "B";
    n++;
  }
  return n;
}

// rimuove tutto ciò che è stato importato (A e B)
function clearImport() {
  for (const ch in imported) {
    delete glyphRaw[ch];
    if (imported[ch] === "B") delete skelEdits[ch];
  }
  imported = {};
}
