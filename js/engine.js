// ===== js/engine.js — motore: costr() scheletro→outline per glifo, griglia specimen =====
// advance e left-bearing normalizzati (×size dal chiamante). Mono Aspect interpola
// verso una cella a larghezza fissa (monospazio) centrando il glifo.
const MONO_EM = 1.0;
function glyphAdvN(p, gw) {
  const nat = gw * p.larghezza + 2 * p.sb + p.spaz + p.lsb + p.rsb;
  return p.mono ? nat * (1 - p.mono) + MONO_EM * p.mono : nat;
}
function glyphLBN(p, gw) {
  const nat = p.sb + p.spaz / 2 + p.lsb;
  if (!p.mono) return nat;
  const mono = (glyphAdvN(p, gw) - gw * p.larghezza) / 2;
  return nat * (1 - p.mono) + mono * p.mono;
}
function costr(ch, raw, penX, capTop, size) {
  const p = conv(applyBypass(raw)),
    g =
      typeof glyphRaw !== "undefined" && glyphRaw[ch]
        ? { w: glyphRaw[ch].w, tratti: [] }
        : srcGlifo(ch),
    sx = size * p.larghezza,
    sy = size * p.altezza,
    wpx = p.peso * size;
  const cxp = penX + (g.w * sx) / 2,
    cyp = capTop + sy / 2,
    TX = makeTX(p, penX, capTop, size, cxp, cyp, ch.charCodeAt(0));
  const opt = {
    pen: p.pen,
    pressIn: p.pressIn,
    pressOut: p.pressOut,
    gravity: p.gravity,
    gy0: capTop,
    gys: size,
    wob: p.wob,
    wobFreq: p.wobFreq,
    join: p.join,
    cap: p.cap,
    miterLimit: p.miterLimit,
    // con union attiva il trap per-tratto verrebbe coperto dai tratti sovrapposti:
    // si scava dopo la union (trapPolys), qui si disattiva
    inktrap: union0 ? 0 : p.inktrap * size,
    trapMin: p.trapMin,
    trapMax: p.trapMax,
    penrot: p.penang,
    tang: p.tang,
    tcut: p.tcut,
    stem: p.peso * size,           // asse largo della nib (peso)
    contrast: p.contrasto || 0,    // asse stretto = stem*(1-contrast)
  };
  const isLow = ch >= "a" && ch <= "z",
    xt0 = 0.333,
    xtN = 1 - p.xh,
    ascTop = -p.asc,
    descF = p.desc;
  const cbar = 0.5 - p.mid,
    ov = p.oversh || 0;
  const remapYy = (y) => {
    let ny = y;
    if (isLow)
      ny =
        y < xt0
          ? ascTop + (y / xt0) * (xtN - ascTop)
          : xtN + ((y - xt0) * (1 - xtN)) / (1 - xt0);
    if (ny > 1) ny = 1 + (ny - 1) * descF;
    return ny;
  };
  // rimappa un punto + scala le maniglie di Bézier secondo la pendenza locale della metrica (maniglie = delta su endpoint)
  const remapPt = (q) => {
    const ny = remapYy(q[1]),
      r = [q[0], ny];
    if (q[2]) {
      const m = q[2],
        nm = { k: m.k },
        sc = (h) => [h[0], remapYy(q[1] + h[1]) - ny];
      if (m.h) nm.h = sc(m.h);
      if (m.hIn) nm.hIn = sc(m.hIn);
      if (m.hOut) nm.hOut = sc(m.hOut);
      r[2] = nm;
    }
    return r;
  };
  // === modo A (outline importata): salta lo stroking, trasforma i contorni con TX
  // (box/slant/rot + warp) e applica gli effetti post-union. NB: niente remapPt
  // (le proporzioni reali del font non vanno rimappate come gli scheletri sintetici).
  if (typeof glyphRaw !== "undefined" && glyphRaw[ch]) {
    const rings = glyphRaw[ch].contours.map((ct) =>
      ct.pts.map((q) => TX([q[0], q[1]])),
    );
    const mb = assembleRaw(rings);
    return {
      polys: postFX(mb, p, size, penX, capTop),
      advance: glyphAdvN(p, g.w) * size,
    };
  }
  // pass 1: remap (crossbar + vertical metrics)
  const remap = g.tratti.map((tr) => {
    let pts = tr.pts;
    if (Math.abs(cbar) > 1e-3) {
      const ys = pts.map((q) => q[1]),
        xs = pts.map((q) => q[0]),
        mn = Math.min(...ys),
        mx = Math.max(...ys),
        dx = Math.max(...xs) - Math.min(...xs),
        mean = (mn + mx) / 2;
      if (mx - mn < 0.06 && dx > 0.18 && mean > 0.2 && mean < 0.82)
        pts = pts.map((q) => {
          const r = [q[0], q[1] + cbar];
          if (q[2]) r[2] = q[2];
          return r;
        });
    }
    pts = pts.map(remapPt);
    return { pts, chiuso: tr.chiuso, e: tr.e, term: tr.term };
  });
  // glyph extremes (for overshoot + quadrant center)
  let ymin = 1e9,
    ymax = -1e9,
    xmin = 1e9,
    xmax = -1e9;
  for (const tr of remap)
    for (const q of tr.pts) {
      if (q[1] < ymin) ymin = q[1];
      if (q[1] > ymax) ymax = q[1];
      if (q[0] < xmin) xmin = q[0];
      if (q[0] > xmax) xmax = q[0];
    }
  const qcx = (xmin + xmax) / 2,
    qcy = (ymin + ymax) / 2;
  // overshoot adattivo: pesato sulla curvatura locale (raggio del cerchio per 3 punti) — curve strette piena compensazione, curve piatte quasi nulla
  const circR = (a, b, c) => {
    const ax = a[0] - b[0],
      ay = a[1] - b[1],
      gx = c[0] - b[0],
      gy = c[1] - b[1],
      ar = Math.abs(ax * gy - ay * gx) / 2;
    if (ar < 1e-12) return 1e9;
    return (
      (Math.hypot(ax, ay) *
        Math.hypot(c[0] - a[0], c[1] - a[1]) *
        Math.hypot(gx, gy)) /
      (4 * ar)
    );
  };
  const oshoot = (pts, closed) => {
    if (ov <= 0) return pts;
    const n = pts.length,
      nb = (i) => (closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))),
      res = pts.map((q) => {
        const r = [q[0], q[1]];
        if (q[2]) r[2] = q[2];
        return r;
      }),
      B = 0.12,
      e = 0.01;
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      const A = pts[nb(i - 1)],
        C = pts[nb(i + 1)],
        y = pts[i][1],
        ya = A[1],
        yb = C[1];
      const f = Math.min(1, 0.3 / Math.max(0.03, circR(A, pts[i], C)));
      if (y - ymin < B && ya > y + e && yb > y + e)
        res[i][1] -= ov * f * (1 - (y - ymin) / B);
      else if (ymax - y < B && ya < y - e && yb < y - e)
        res[i][1] += ov * f * (1 - (ymax - y) / B);
    }
    return res;
  };
  // pass 2: dots + strokes
  const cl = [],
    dots = [],
    remapM = mergeRemap(remap, !(p.apxOff || p.apxThin));
  for (const tr of remapM) {
    let xn = 1e9,
      xx = -1e9,
      yn = 1e9,
      yx = -1e9;
    for (const q of tr.pts) {
      xn = Math.min(xn, q[0]);
      xx = Math.max(xx, q[0]);
      yn = Math.min(yn, q[1]);
      yx = Math.max(yx, q[1]);
    }
    if (tr.chiuso && xx - xn < 0.16 && yx - yn < 0.16) {
      dots.push({ cx: (xn + xx) / 2, cy: (yn + yx) / 2 });
      continue;
    }
    let base0 = oshoot(tr.pts, tr.chiuso);
    if (p.convex) base0 = bulge(base0, p.convex, tr.chiuso);
    if (p.quadOn) base0 = bulgeQuad(base0, tr.chiuso, p.quad, qcx, qcy);
    const sm = thin(liscia(base0, tr.chiuso), tr.chiuso, 0.0004);
    cl.push({ pts: sm.map(TX), chiuso: tr.chiuso, e: tr.e, term: tr.term });
  }
  const epsJ = Math.max(wpx * 0.7, size * 0.015),
    openS = cl.filter((c) => !c.chiuso && c.pts.length >= 2),
    D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ePt = (c, e) => (e ? c.pts[c.pts.length - 1] : c.pts[0]),
    eNb = (c, e) => (e ? c.pts[c.pts.length - 2] : c.pts[1]),
    eSet = (c, e, v) => {
      if (e) c.pts[c.pts.length - 1] = v;
      else c.pts[0] = v;
    };
  for (const c of cl) {
    c.tS = 0;
    c.tE = 0;
    c.s0 = false;
    c.s1 = false;
  }
  const sideLand = (pp, self) => {
    for (const c2 of openS) {
      if (c2 === self) continue;
      const Q = c2.pts;
      if (D(pp, Q[0]) < epsJ || D(pp, Q[Q.length - 1]) < epsJ) continue;
      for (let k = 0; k < Q.length - 1; k++)
        if (distSeg(pp, Q[k], Q[k + 1]) < epsJ) return [Q[k], Q[k + 1]];
    }
    return null;
  };
  for (const c of openS) {
    const g0 = sideLand(ePt(c, 0), c),
      g1 = sideLand(ePt(c, 1), c);
    if (g0) {
      c.s0 = true;
      c.g0 = g0;
      c.tS = Math.max(c.tS, p.taper);
    }
    if (g1) {
      c.s1 = true;
      c.g1 = g1;
      c.tE = Math.max(c.tE, p.taper);
    }
  }
  const ofs = p.apxOff,
    thn = p.apxThin;
  if (ofs || thn)
    for (let a = 0; a < openS.length; a++)
      for (const ea of [0, 1]) {
        const A = openS[a],
          pa = ePt(A, ea);
        for (let b = a + 1; b < openS.length; b++)
          for (const eb of [0, 1]) {
            const B = openS[b],
              pb = ePt(B, eb);
            if (D(pa, pb) < epsJ) {
              const da = uni(pa.x - eNb(A, ea).x, pa.y - eNb(A, ea).y),
                db = uni(pb.x - eNb(B, eb).x, pb.y - eNb(B, eb).y),
                ox = da.x + db.x,
                oy = da.y + db.y,
                oL = Math.hypot(ox, oy);
              if (thn) {
                if (ea) A.tE = Math.max(A.tE, thn);
                else A.tS = Math.max(A.tS, thn);
                if (eb) B.tE = Math.max(B.tE, thn);
                else B.tS = Math.max(B.tS, thn);
              }
              if (ofs && oL > 0.01) {
                const mx = (ox / oL) * ofs * size,
                  my = (oy / oL) * ofs * size;
                eSet(A, ea, { x: pa.x + mx, y: pa.y + my });
                eSet(B, eb, { x: pb.x + mx, y: pb.y + my });
              }
            }
          }
      }
  // saldatura: estende l'estremo fino alla mezzeria del tratto bersaglio + affondo 0.6×mezza-larghezza (mai oltre il bordo opposto: niente sporgenze)
  const weldExt = (pp, qq, seg) => {
    const t = uni(pp.x - qq.x, pp.y - qq.y),
      a = seg[0],
      b = seg[1],
      vx = b.x - a.x,
      vy = b.y - a.y,
      L2 = vx * vx + vy * vy || 1;
    let u = ((pp.x - a.x) * vx + (pp.y - a.y) * vy) / L2;
    u = Math.max(0, Math.min(1, u));
    const cp = { x: a.x + vx * u, y: a.y + vy * u },
      along = (cp.x - pp.x) * t.x + (cp.y - pp.y) * t.y,
      ext = Math.max(0, along) + p.peso * size * 0.3;
    return { x: pp.x + t.x * ext, y: pp.y + t.y * ext };
  };
  if (union0)
    for (const c of openS) {
      if (c.s0) eSet(c, 0, weldExt(ePt(c, 0), eNb(c, 0), c.g0));
      if (c.s1) eSet(c, 1, weldExt(ePt(c, 1), eNb(c, 1), c.g1));
    }
  const base = [];
  for (const c of cl) {
    const rb = traccia(
      c.pts,
      wpx,
      Object.assign({ closed: c.chiuso, taperS: c.tS, taperE: c.tE, term: c.term }, opt),
    );
    if (rb) base.push(rb);
  }
  for (const d of dots) {
    const sq = p.dot === "square",
      rr = p.peso * 0.78,
      N = sq ? 4 : 30,
      off = sq ? Math.PI / 4 : 0,
      k2 = sq ? 1.3 : 1,
      ring = [];
    for (let k = 0; k < N; k++) {
      const a = off + (k / N) * TAU;
      ring.push(
        TX([d.cx + Math.cos(a) * rr * k2, d.cy + Math.sin(a) * rr * k2]),
      );
    }
    base.push({ outer: ring, holes: [] });
  }
  if (p.serif !== "none") {
    const ov = p.sLen * size,
      thk = p.sThk * size,
      half = wpx / 2 + ov,
      eps = wpx * 0.5 + size * 0.012;
    const tagged = g.tratti.some((t) => t.e);
    for (const t of tagged ? taggedTerms(cl) : termini(cl, eps))
      base.push(grazia(t, half, thk, p.serif));
  }
  let mb = union0 ? unionPolys(base) : base;
  return {
    polys: postFX(mb, p, size, penX, capTop),
    advance: glyphAdvN(p, g.w) * size,
  };
}
// pipeline effetti post-union: gira sui poligoni finiti → riusata sia dal path
// scheletro che dal modo A (outline importata)
function postFX(mb, p, size, penX, capTop) {
  if (union0 && p.inktrap > 0)
    mb = trapPolys(mb, p.inktrap * size, p.trapMin, p.trapMax, p.trapShape);
  if (p.corner > 0 || p.cornerIn > 0)
    mb = roundPolys(mb, p.corner * size, p.cornerIn * size);
  if (p.glitchN > 0 && p.glitchOff) {
    const bh2 = (size * 1.35) / p.glitchN,
      off = p.glitchOff * size,
      gq = (v) => {
        const band = Math.floor((v.y - capTop + size * 0.18) / bh2);
        return { x: v.x + (((band % 2) + 2) % 2 ? off : -off) * 0.5, y: v.y };
      };
    mb = mb.map((pg) => ({
      outer: pg.outer.map(gq),
      holes: pg.holes.map((h) => h.map(gq)),
    }));
  }
  if (p.rough > 0) {
    // noise ancorato al glifo e normalizzato per size: zoom e pan non cambiano la resa
    // (31.5/em = 0.045 × CAP 700 dell'export: l'anteprima ora coincide con l'OTF)
    const am = p.rough * size,
      nf = 31.5 / size,
      rq = (v) => {
        const nx = (v.x - penX) * nf,
          ny = (v.y - capTop) * nf;
        return {
          x: v.x + (noise(nx + (p.seme % 97), ny) - 0.5) * 2 * am,
          y: v.y + (noise(ny + (p.seme % 97) + 57, nx) - 0.5) * 2 * am,
        };
      };
    mb = mb.map((pg) => ({
      outer: pg.outer.map(rq),
      holes: pg.holes.map((h) => h.map(rq)),
    }));
  }
  if (p.inflate) {
    const dn = p.inflate * size,
      blow = (ring) => {
        const n2 = ring.length;
        if (n2 < 3) return ring;
        const sgn = areaP(ring) > 0 ? -1 : 1,
          o2 = [];
        for (let i = 0; i < n2; i++) {
          const a = ring[(i - 1 + n2) % n2],
            b = ring[i],
            c = ring[(i + 1) % n2];
          let nx = -(c.y - a.y),
            ny = c.x - a.x;
          const L = Math.hypot(nx, ny) || 1;
          o2.push({
            x: b.x + (nx / L) * dn * sgn,
            y: b.y + (ny / L) * dn * sgn,
          });
        }
        return o2;
      };
    mb = mb.map((pg) => ({ outer: blow(pg.outer), holes: pg.holes.map(blow) }));
  }
  if (p.stepGrid > 0) {
    // griglia ancorata all'origine del glifo, non al canvas: stessa resa a ogni zoom
    const g = p.stepGrid * size,
      q = (v) => ({
        x: penX + Math.round((v.x - penX) / g) * g,
        y: capTop + Math.round((v.y - capTop) / g) * g,
      });
    mb = mb
      .map((pg) => ({
        outer: dedup(pg.outer.map(q), true),
        holes: pg.holes.map((h) => dedup(h.map(q), true)),
      }))
      .filter((pg) => pg.outer.length > 2);
  }
  if (p.inline > 0)
    mb = inlinePolys(mb, p.inline * size, Math.max(size * 0.03, p.inline * size * 0.5));
  if (p.stencil > 0)
    mb = stencilPolys(mb, p.stencil * size, capTop, capTop + size);
  let polys = [];
  if (p.eco > 0) {
    const off = p.ecoOff * size;
    for (let k = p.eco; k >= 1; k--)
      for (const pg of mb) polys.push(trasl(pg, k * off, k * off));
  }
  polys = polys.concat(mb);
  return polys;
}
// modo A: assembla gli anelli trasformati in poligoni outer+holes (containment per area)
function assembleRaw(rings) {
  const out = [];
  const list = rings
    .map((r) => ({ pts: r, a: Math.abs(areaP(r)) }))
    .sort((x, y) => y.a - x.a);
  for (const r of list) {
    let host = null;
    for (const pg of out)
      if (pointInRing(r.pts[0], pg.outer)) {
        host = pg;
        break;
      }
    if (host) host.holes.push(r.pts);
    else out.push({ outer: r.pts, holes: [] });
  }
  return out;
}
function griglia(x0, y0, w, h, chars, cols) {
  const n = chars.length,
    rows = Math.ceil(n / cols),
    cw = w / cols,
    ch = h / rows,
    polys = [],
    cells = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols,
      r = (i / cols) | 0,
      ccx = x0 + c * cw,
      ccy = y0 + r * ch,
      L = chars[i],
      p = conv(fontR(L));
    let gw = glw(L);
    const size = Math.min(
        (ch * 0.6) / p.altezza,
        (cw * 0.6) / Math.max(0.3, gw * p.larghezza),
      ),
      sx = size * p.larghezza,
      sy = size * p.altezza,
      penX = ccx + (cw - gw * sx) / 2,
      capTop = ccy + (ch - sy) / 2;
    polys.push(...costr(L, fontR(L), penX, capTop, size).polys);
    cells.push({ x: ccx, y: ccy, w: cw, h: ch, i, ch: L });
  }
  return { polys, cells };
}
