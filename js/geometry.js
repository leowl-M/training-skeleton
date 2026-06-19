// ===== js/geometry.js — geometria: spline centripetale, smoothing, offset tratto (traccia), giunzioni, grazie, fusione tratti =====
const cosd = (d) => Math.cos((d * Math.PI) / 180),
  sind = (d) => Math.sin((d * Math.PI) / 180);
function arco(cx, cy, rx, ry, d0, d1, n) {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const d = d0 + ((d1 - d0) * i) / n;
    o.push([cx + cosd(d) * rx, cy + sind(d) * ry]);
  }
  return o;
}
// maniglie di un nodo nel formato di crc: k2 simmetrica, hIn/hOut parziali su qualsiasi k
function nodeH(q) {
  const m2 = q && q[2];
  if (!m2) return null;
  if (m2.k === 2 && m2.h) return { i: [-m2.h[0], -m2.h[1]], o: m2.h };
  if (m2.hIn || m2.hOut) return { i: m2.hIn || null, o: m2.hOut || null };
  return null;
}
function nodeHs(arr) {
  let any = false;
  const h = arr.map((q) => {
    const v = nodeH(q);
    if (v) any = true;
    return v;
  });
  return any ? h : null;
}
// campiona il segmento i (nodo i → i+1) con sub punti (escluso l'estremo finale), appende a out
function crcSeg(P, i, sub, closed, H, out) {
  const n = P.length,
    pt = closed
      ? (j) => P[((j % n) + n) % n]
      : (j) => P[Math.max(0, Math.min(n - 1, j))],
    dst = (a, b) =>
      Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const p1 = pt(i),
    p2 = pt(i + 1);
  const h1 = H ? H[((i % n) + n) % n] : null,
    h2 = H ? H[(((i + 1) % n) + n) % n] : null,
    hO = h1 && h1.o,
    hI = h2 && h2.i;
  if (hO && hI) {
    // cubica di Bézier esatta tra i due nodi con le rispettive maniglie
    const b0 = p1,
      b1 = [p1[0] + hO[0], p1[1] + hO[1]],
      b2 = [p2[0] + hI[0], p2[1] + hI[1]],
      b3 = p2;
    for (let j = 0; j < sub; j++) {
      const t = j / sub,
        mt = 1 - t,
        a = mt * mt * mt,
        b = 3 * mt * mt * t,
        c = 3 * mt * t * t,
        d = t * t * t;
      out.push([
        a * b0[0] + b * b1[0] + c * b2[0] + d * b3[0],
        a * b0[1] + b * b1[1] + c * b2[1] + d * b3[1],
      ]);
    }
    return;
  }
  // fallback: Catmull-Rom centripeta (maniglia singola come vicino virtuale)
  let p0 = pt(i - 1),
    p3 = pt(i + 2);
  if (hO) p0 = [p1[0] - hO[0], p1[1] - hO[1]];
  if (hI) p3 = [p2[0] - hI[0], p2[1] - hI[1]];
  const t1 = dst(p0, p1),
    t2 = t1 + dst(p1, p2),
    t3 = t2 + dst(p2, p3);
  for (let j = 0; j < sub; j++) {
    const t = t1 + ((t2 - t1) * j) / sub,
      L = (a, b, ta, tb) => {
        const u = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      },
      A1 = L(p0, p1, 0, t1),
      A2 = L(p1, p2, t1, t2),
      A3 = L(p2, p3, t2, t3),
      B1 = L(A1, A2, 0, t2),
      B2 = L(A2, A3, t1, t3);
    out.push(L(B1, B2, t1, t2));
  }
}
function crc(P, sub, closed, H) {
  const n = P.length;
  if (n < 2 || (n < 3 && !(H && (H[0] || H[1]))))
    return P.map((p) => [p[0], p[1]]);
  const o = [],
    m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) crcSeg(P, i, sub, closed, H, o);
  if (!closed) o.push([P[n - 1][0], P[n - 1][1]]);
  return o;
}
function thin(pts, closed, eps) {
  const n = pts.length;
  if (n < 5) return pts;
  const limit = closed ? n : n - 1,
    keep = [0];
  let anchor = 0,
    i = anchor + 2;
  while (i <= limit) {
    const a = pts[anchor % n],
      c = pts[i % n],
      ux = c[0] - a[0],
      uy = c[1] - a[1],
      L = Math.hypot(ux, uy) || 1;
    let ok = true;
    for (let j = anchor + 1; j < i; j++) {
      const b = pts[j % n],
        d = Math.abs((b[0] - a[0]) * uy - (b[1] - a[1]) * ux) / L;
      if (d > eps) {
        ok = false;
        break;
      }
    }
    if (ok) i++;
    else {
      keep.push((i - 1) % n);
      anchor = i - 1;
      i = anchor + 2;
    }
  }
  if (!closed && keep[keep.length - 1] !== n - 1) keep.push(n - 1);
  const out = keep.map((ix) => pts[ix]);
  return out.length >= (closed ? 3 : 2) ? out : pts;
}
function uni(x, y) {
  const L = Math.hypot(x, y) || 1;
  return { x: x / L, y: y / L };
}
function seg(a, b) {
  const d = uni(b.x - a.x, b.y - a.y);
  return { d, nl: { x: -d.y, y: d.x } };
}
function inter(p1, d1, p2, d2) {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}
function dista(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function areaP(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const j = (i + 1) % p.length;
    s += p[i].x * p[j].y - p[j].x * p[i].y;
  }
  return s / 2;
}
// punto dentro anello (ray casting) — usato per assemblare outer/holes delle outline importate
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x,
      yi = ring[i].y,
      xj = ring[j].x,
      yj = ring[j].y;
    if (
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
function dedup(P, cl, eps) {
  eps = eps || 1e-7;
  const o = [];
  for (const p of P) {
    const q = { x: p.x, y: p.y };
    if (
      !o.length ||
      Math.hypot(q.x - o[o.length - 1].x, q.y - o[o.length - 1].y) > eps
    )
      o.push(q);
  }
  if (
    cl &&
    o.length > 1 &&
    Math.hypot(o[0].x - o[o.length - 1].x, o[0].y - o[o.length - 1].y) < eps
  )
    o.pop();
  return o;
}
function arcP(c, fr, to, r, out) {
  let a0 = Math.atan2(fr.y - c.y, fr.x - c.x),
    a1 = Math.atan2(to.y - c.y, to.x - c.x),
    da = a1 - a0;
  while (da <= -Math.PI) da += TAU;
  while (da > Math.PI) da -= TAU;
  const n = Math.max(3, Math.ceil(Math.abs(da) / 0.16));
  for (let k = 0; k <= n; k++) {
    const a = a0 + (da * k) / n;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
}
function arcCap(c, fr, to, r, fw, out) {
  let a0 = Math.atan2(fr.y - c.y, fr.x - c.x),
    a1 = Math.atan2(to.y - c.y, to.x - c.x),
    da = a1 - a0;
  while (da <= -Math.PI) da += TAU;
  while (da > Math.PI) da -= TAU;
  const am = a0 + da / 2;
  if (Math.cos(am) * fw.x + Math.sin(am) * fw.y < 0) da += da > 0 ? -TAU : TAU;
  const n = Math.max(5, Math.ceil(Math.abs(da) / 0.16));
  for (let k = 0; k <= n; k++) {
    const a = a0 + (da * k) / n;
    out.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
}
// terminale di un'estremità aperta tra i due lati fr→to (c = punto del tratto, fw = direzione uscente)
function termCap(c, fr, to, h, fw, cap, out) {
  if (cap === "round" || cap === "ball") {
    const g = cap === "ball" ? h * 1.15 : 0,
      cc = { x: c.x + fw.x * g, y: c.y + fw.y * g },
      rr = cap === "ball" ? Math.hypot(fr.x - cc.x, fr.y - cc.y) : h;
    arcCap(cc, fr, to, rr, fw, out);
    return;
  }
  const ax = uni(fr.x - to.x, fr.y - to.y); // direzione trasversale (lato fr)
  if (cap === "flared") {
    out.push({
      x: fr.x + fw.x * h * 0.7 + ax.x * h * 0.85,
      y: fr.y + fw.y * h * 0.7 + ax.y * h * 0.85,
    });
    out.push({
      x: to.x + fw.x * h * 0.7 - ax.x * h * 0.85,
      y: to.y + fw.y * h * 0.7 - ax.y * h * 0.85,
    });
    return;
  }
  if (cap === "beak") {
    out.push({
      x: c.x + fw.x * h * 1.7 + ax.x * h * 1.05,
      y: c.y + fw.y * h * 1.7 + ax.y * h * 1.05,
    });
    return;
  }
  // butt: nessun punto (collegamento dritto fr→to)
}
function traccia(P, w, o) {
  o = o || {};
  const cl = !!o.closed;
  P = dedup(
    P.map((p) => ({ x: p.x, y: p.y })),
    cl,
    Math.max(1e-7, w * 0.05),
  );
  const n = P.length;
  if (n < 2) return null;
  const join = o.join || "miter",
    cap = o.cap || "butt",
    ml = o.miterLimit || 8,
    trap = o.inktrap || 0,
    tMin = o.trapMin || Math.PI / 3,
    tMax = o.trapMax || (Math.PI * 17) / 18,
    pr = o.penrot || 0,
    ra = (o.stem || w) / 2,
    rb = (o.bar || w) / 2;
  const sg = [];
  for (let i = 0; i < n - 1; i++) sg.push(seg(P[i], P[i + 1]));
  if (cl) sg.push(seg(P[n - 1], P[0]));
  const m = sg.length;
  const inc = (i) => (cl ? sg[(i - 1 + m) % m] : i > 0 ? sg[i - 1] : null),
    out = (i) => (cl ? sg[i % m] : i < n - 1 ? sg[i] : null);
  const tSa = o.taperS || 0,
    tEa = o.taperE || 0,
    tspan = Math.max(2, Math.floor(n * 0.42));
  const hw = (i) => {
    const a = inc(i),
      b = out(i);
    let nx = 0,
      ny = 0;
    if (a) {
      nx += a.nl.x;
      ny += a.nl.y;
    }
    if (b) {
      nx += b.nl.x;
      ny += b.nl.y;
    }
    const L = Math.hypot(nx, ny) || 1;
    const phi = Math.atan2(ny / L, nx / L) - pr,
      cs = Math.cos(phi),
      sn = Math.sin(phi);
    let h =
      o.pen === "rect"
        ? Math.abs(ra * cs) + Math.abs(rb * sn)
        : o.pen === "pointed"
          ? // nib appuntito/flessibile: contrasto da espansione (verticali spesse, orizzontali
            // sottili) con transizione netta → aste piene, grazie/curve a filo (stile Didone)
            rb + (ra - rb) * Math.pow(Math.abs(cs), 1.8)
          : Math.sqrt(ra * ra * cs * cs + rb * rb * sn * sn);
    const pIn = o.pressIn || 1,
      pOut = o.pressOut || 1;
    if (!cl && (pIn !== 1 || pOut !== 1)) {
      const u = n > 1 ? i / (n - 1) : 0;
      h *= pIn + (pOut - pIn) * u;
    }
    if (o.gravity && o.gys) {
      const gy = (P[i].y - o.gy0) / o.gys;
      h *= Math.max(0.12, 1 + o.gravity * 1.6 * (gy - 0.5));
    }
    if (o.wob) {
      h *= Math.max(0.1, 1 + o.wob * Math.sin(i * (o.wobFreq || 4) * 0.55));
    }
    if (tSa > 0 && i < tspan) h *= 1 - tSa * (1 - i / tspan);
    if (tEa > 0 && i > n - 1 - tspan) h *= 1 - tEa * (1 - (n - 1 - i) / tspan);
    return h;
  };
  const lato = (s) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const I = inc(i),
        O = out(i),
        h = hw(i);
      if (I && O) {
        const np = { x: I.nl.x * s, y: I.nl.y * s },
          nn = { x: O.nl.x * s, y: O.nl.y * s },
          A = { x: P[i].x + np.x * h, y: P[i].y + np.y * h },
          B = { x: P[i].x + nn.x * h, y: P[i].y + nn.y * h },
          cr = I.d.x * O.d.y - I.d.y * O.d.x,
          cv = s * cr < 0,
          M = inter(A, I.d, B, O.d);
        if (!cv) {
          if (trap > 0) {
            const cT = I.d.x * O.d.x + I.d.y * O.d.y,
              tau = Math.acos(Math.max(-1, Math.min(1, cT))),
              sh =
                tau < tMin || tau > tMax
                  ? 0
                  : Math.min(1, (tau - tMin) / Math.max(0.02, tMax - tMin));
            if (sh > 0) {
              const ob = uni(-(np.x + nn.x), -(np.y + nn.y));
              p.push(
                A,
                { x: P[i].x + ob.x * trap * sh, y: P[i].y + ob.y * trap * sh },
                B,
              );
            } else p.push(M && dista(M, P[i]) <= ml * h * 1.2 ? M : A);
          } else p.push(M && dista(M, P[i]) <= ml * h * 1.2 ? M : A);
        } else if (join === "round") arcP(P[i], A, B, h, p);
        else if (join === "bevel") p.push(A, B);
        else {
          if (M && dista(M, P[i]) <= ml * h) p.push(M);
          else p.push(A, B);
        }
      } else if (O)
        p.push({ x: P[i].x + O.nl.x * s * h, y: P[i].y + O.nl.y * s * h });
      else if (I)
        p.push({ x: P[i].x + I.nl.x * s * h, y: P[i].y + I.nl.y * s * h });
    }
    return p;
  };
  if (cl) {
    const A = lato(1),
      B = lato(-1);
    return Math.abs(areaP(A)) >= Math.abs(areaP(B))
      ? { outer: A, holes: [B] }
      : { outer: B, holes: [A] };
  }
  const L = lato(1),
    R = lato(-1);
  const ta = o.tang || 0;
  if (ta && cap === "butt" && L.length && R.length) {
    const tn = Math.tan(ta),
      clampT = (v, lim) => Math.max(-lim, Math.min(lim, v)),
      de = sg[m - 1].d,
      he = clampT(hw(n - 1) * tn, dista(P[n - 1], P[n - 2]) * 0.85),
      li = L.length - 1,
      ri = R.length - 1;
    L[li] = { x: L[li].x + de.x * he, y: L[li].y + de.y * he };
    R[ri] = { x: R[ri].x - de.x * he, y: R[ri].y - de.y * he };
    const ds = sg[0].d,
      hs = clampT(hw(0) * tn, dista(P[0], P[1]) * 0.85);
    L[0] = { x: L[0].x - ds.x * hs, y: L[0].y - ds.y * hs };
    R[0] = { x: R[0].x + ds.x * hs, y: R[0].y + ds.y * hs };
  }
  const outer = L.slice();
  termCap(
    P[n - 1],
    L[L.length - 1],
    R[R.length - 1],
    hw(n - 1),
    sg[m - 1].d,
    cap,
    outer,
  );
  for (let i = R.length - 1; i >= 0; i--) outer.push(R[i]);
  termCap(P[0], R[0], L[0], hw(0), { x: -sg[0].d.x, y: -sg[0].d.y }, cap, outer);
  return { outer, holes: [] };
}
function distSeg(p, a, b) {
  const vx = b.x - a.x,
    vy = b.y - a.y,
    wx = p.x - a.x,
    wy = p.y - a.y,
    c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(wx, wy);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}
function weldEnds(cl, eps, ext) {
  const op = cl.filter((c) => !c.chiuso && c.pts.length >= 2),
    D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const c of op) {
    const P = c.pts;
    for (const end of [0, 1]) {
      const i = end ? P.length - 1 : 0,
        j = end ? P.length - 2 : 1,
        p = P[i],
        q = P[j];
      let side = false;
      for (const c2 of op) {
        if (c2 === c) continue;
        const Q = c2.pts;
        if (D(p, Q[0]) < eps || D(p, Q[Q.length - 1]) < eps) continue;
        for (let k = 0; k < Q.length - 1; k++)
          if (distSeg(p, Q[k], Q[k + 1]) < eps) {
            side = true;
            break;
          }
        if (side) break;
      }
      if (side) {
        const t = uni(p.x - q.x, p.y - q.y);
        P[i] = { x: p.x + t.x * ext, y: p.y + t.y * ext };
      }
    }
  }
  return cl;
}
function liscia(pts, cl) {
  const n = pts.length;
  if (n < 3) {
    const h0 = nodeH(pts[0]),
      h1 = nodeH(pts[1]);
    if (n === 2 && (h0 || h1)) return crc(pts, 16, false, [h0, h1]);
    return pts.map((p) => [p[0], p[1]]);
  }
  const SUB = 16,
    COS = Math.cos((40 * Math.PI) / 180);
  const dir = (a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  const meta = (i) => pts[i] && pts[i][2],
    HN = nodeHs,
    corner = (i) => {
      const m2 = meta(i);
      if (m2 && m2.k === 1) return true;
      if (m2 && (m2.k === 2 || m2.k === 3)) return false;
      const a = pts[(i - 1 + n) % n],
        b = pts[i],
        c = pts[(i + 1) % n],
        d1 = dir(a, b),
        d2 = dir(b, c);
      return d1[0] * d2[0] + d1[1] * d2[1] < COS;
    };
  if (cl) {
    const cs = [];
    for (let i = 0; i < n; i++) if (corner(i)) cs.push(i);
    if (!cs.length) return crc(pts, SUB, true, HN(pts));
    const out = [];
    for (let k = 0; k < cs.length; k++) {
      const a = cs[k],
        b = cs[(k + 1) % cs.length],
        run = [];
      let i = a;
      do {
        run.push(pts[i]);
        i = (i + 1) % n;
      } while (i !== b);
      run.push(pts[b]);
      const sm = crc(run, SUB, false, HN(run));
      for (let j = 0; j < sm.length - 1; j++) out.push(sm[j]);
    }
    return out;
  }
  const an = [0];
  for (let i = 1; i < n - 1; i++) if (corner(i)) an.push(i);
  an.push(n - 1);
  const out = [];
  for (let k = 0; k < an.length - 1; k++) {
    const run = pts.slice(an[k], an[k + 1] + 1),
      sm = crc(run, SUB, false, HN(run));
    if (k > 0) sm.shift();
    for (const p of sm) out.push(p);
  }
  return out;
}
function termini(cls, eps) {
  const op = cls.filter((c) => !c.chiuso && c.pts.length >= 2),
    res = [];
  for (const c of op)
    for (const e of [0, 1]) {
      const P = c.pts,
        p = e ? P[P.length - 1] : P[0],
        q = e ? P[P.length - 2] : P[1];
      let at = false;
      for (const c2 of op) {
        if (c2 === c) continue;
        const Q = c2.pts;
        for (let i = 0; i < Q.length - 1; i++)
          if (distSeg(p, Q[i], Q[i + 1]) < eps) {
            at = true;
            break;
          }
        if (at) break;
      }
      if (!at) {
        const t = uni(p.x - q.x, p.y - q.y);
        res.push({ x: p.x, y: p.y, tx: t.x, ty: t.y });
      }
    }
  return res;
}
function taggedTerms(cl) {
  const res = [];
  for (const c of cl) {
    if (c.chiuso || !c.e || c.pts.length < 2) continue;
    const P = c.pts;
    if (c.e[0] === "t") {
      const p = P[0],
        q = P[1],
        t = uni(p.x - q.x, p.y - q.y);
      res.push({ x: p.x, y: p.y, tx: t.x, ty: t.y });
    }
    if (c.e[1] === "t") {
      const p = P[P.length - 1],
        q = P[P.length - 2],
        t = uni(p.x - q.x, p.y - q.y);
      res.push({ x: p.x, y: p.y, tx: t.x, ty: t.y });
    }
  }
  return res;
}
function grazia(t, half, thk, st) {
  const px = -t.ty,
    py = t.tx,
    h = thk / 2;
  // punto a offset perpendicolare (pp, ±half) e lungo il tratto (tt, ±tangente)
  const Q = (pp, tt) => ({
    x: t.x + px * pp + t.tx * tt,
    y: t.y + py * pp + t.ty * tt,
  });
  if (st === "wedge")
    return {
      outer: [Q(-half, 0), Q(0, h), Q(half, 0), Q(0, -h)],
      holes: [],
    };
  if (st === "hairline") {
    const hh = Math.min(h, half * 0.16);
    return {
      outer: [Q(-half, -hh), Q(half, -hh), Q(half, hh), Q(-half, hh)],
      holes: [],
    };
  }
  if (st === "cupped") {
    // piede concavo (a coppa): bordo esterno che rientra al centro
    const out = [Q(-half, -h), Q(half, -h)],
      N = 6,
      depth = h * 1.1;
    for (let k = 0; k <= N; k++) {
      const u = k / N,
        s = 1 - 2 * u, // da +1 a -1 sul lato perpendicolare
        cup = h - depth * (1 - s * s); // parabola: massimo rientro al centro
      out.push(Q(s * half, cup));
    }
    return { outer: out, holes: [] };
  }
  if (st === "bracketed") {
    // piede largo + raccordo curvo (bracket) che risale verso il fusto
    const neck = half * 0.34,
      brk = h * 2.3,
      N = 5,
      ease = (u) => u * u,
      out = [Q(-half, h), Q(half, h)];
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      out.push(Q(half + (neck - half) * ease(u), -h - brk * u));
    }
    for (let k = N; k >= 0; k--) {
      const u = k / N;
      out.push(Q(-(half + (neck - half) * ease(u)), -h - brk * u));
    }
    return { outer: out, holes: [] };
  }
  // slab (default)
  return {
    outer: [Q(-half, -h), Q(half, -h), Q(half, h), Q(-half, h)],
    holes: [],
  };
}
function trasl(pg, dx, dy) {
  return {
    outer: pg.outer.map((v) => ({ x: v.x + dx, y: v.y + dy })),
    holes: pg.holes.map((h) => h.map((v) => ({ x: v.x + dx, y: v.y + dy }))),
  };
}
function makeTX(p, penX, capTop, size, cxp, cyp, cc) {
  let idx = 0;
  return (pt) => {
    let x = pt[0],
      y = pt[1];
    if (p.onda > 0) {
      x += p.onda * Math.sin(y * p.ondaFreq * TAU);
      y += p.onda * 0.6 * Math.sin(x * p.ondaFreq * TAU);
    }
    x += (1 - y) * p.slant;
    let X = penX + x * size * p.larghezza,
      Y = capTop + y * size * p.altezza;
    if (p.caos > 0) {
      const k = p.seme * 0.013 + cc * 0.7 + idx * 0.37;
      X += Math.cos(noise(k) * TAU * 2) * noise(k + 33) * p.caos * size;
      Y += Math.sin(noise(k + 7) * TAU * 2) * noise(k + 40) * p.caos * size;
    }
    if (p.rot) {
      const dx = X - cxp,
        dy = Y - cyp,
        c = Math.cos(p.rot),
        s = Math.sin(p.rot);
      X = cxp + dx * c - dy * s;
      Y = cyp + dx * s + dy * c;
    }
    if (p.vortex) {
      const dx = X - cxp,
        dy = Y - cyp,
        rr = Math.hypot(dx, dy),
        a = p.vortex * Math.max(0, 1 - rr / (size * 0.72)),
        c2 = Math.cos(a),
        s2 = Math.sin(a);
      X = cxp + dx * c2 - dy * s2;
      Y = cyp + dx * s2 + dy * c2;
    }
    if (p.twist) {
      const a = p.twist * ((Y - cyp) / (size * 0.5)),
        c2 = Math.cos(a),
        s2 = Math.sin(a),
        dx = X - cxp,
        dy = Y - cyp;
      X = cxp + dx * c2 - dy * s2;
      Y = cyp + dx * s2 + dy * c2;
    }
    if (p.bend) {
      const u = (Y - cyp) / size;
      X += p.bend * size * (u * u * 2 - 0.17);
    }
    if (p.lens) {
      const dx = X - cxp,
        dy = Y - cyp,
        rr = Math.hypot(dx, dy),
        f = 1 + p.lens * Math.max(0, 1 - rr / (size * 0.75));
      X = cxp + dx * f;
      Y = cyp + dy * f;
    }
    if (p.persp) {
      X = cxp + (X - cxp) * (1 + p.persp * ((Y - cyp) / size));
    }
    if (p.skewY) {
      Y += p.skewY * (X - cxp);
    }
    idx++;
    return { x: X, y: Y };
  };
}
// fonde tratti aperti che condividono un estremo (L, Z, gambo+ciotola) così le giunzioni (miter/bevel/round) si applicano davvero; esclude estremi taggati "j" e angoli da apice (troppo acuti)
function mergeRemap(trs, relax) {
  const out = [],
    open = [];
  for (const t of trs) {
    if (t.chiuso || t.pts.length < 2) out.push(t);
    else
      open.push({
        pts: t.pts.slice(),
        e: t.e ? t.e.slice() : null,
        chiuso: false,
        cnt: 1,
      });
  }
  const D2 = (a, b) => {
      const dx = a[0] - b[0],
        dy = a[1] - b[1];
      return dx * dx + dy * dy;
    },
    EPS = 1e-9,
    COSL = Math.cos((127 * Math.PI) / 180);
  const dir = (a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  // fonde i meta dei due nodi coincidenti a una giunzione: hIn dal tratto entrante,
  // hOut da quello uscente; k:1 così liscia() spezza lì (se le tangenti sono continue
  // le cubiche esatte restano comunque morbide)
  const fuseMeta = (mIn, mOut) => {
    if (!mIn && !mOut) return null;
    const hi =
        mIn &&
        (mIn.hIn || (mIn.k === 2 && mIn.h ? [-mIn.h[0], -mIn.h[1]] : null)),
      ho = mOut && (mOut.hOut || (mOut.k === 2 && mOut.h ? mOut.h : null)),
      nm = { k: 1 };
    if (hi) nm.hIn = hi;
    if (ho) nm.hOut = ho;
    return nm;
  };
  // inverte un tratto scambiando le maniglie in/out di ogni nodo (k:2 → -h, k:3 → swap)
  const revH = (arr) =>
    arr
      .slice()
      .reverse()
      .map((q) => {
        if (!q[2]) return q;
        const m = q[2],
          nm = { k: m.k };
        if (m.h) nm.h = [-m.h[0], -m.h[1]];
        if (m.hIn || m.hOut) {
          nm.hIn = m.hOut;
          nm.hOut = m.hIn;
        }
        return [q[0], q[1], nm];
      });
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < open.length; i++)
      for (let j = i + 1; j < open.length; j++) {
        const A = open[i],
          B = open[j];
        for (const ea of [0, 1])
          for (const eb of [0, 1]) {
            const pa = ea ? A.pts[A.pts.length - 1] : A.pts[0],
              pb = eb ? B.pts[B.pts.length - 1] : B.pts[0];
            if (D2(pa, pb) > EPS) continue;
            // chiusura in anello ammessa solo tra 2 tratti originali (D): con 3+ l'anello ripercorre segmenti condivisi e degenera
            const oa = ea ? A.pts[0] : A.pts[A.pts.length - 1],
              ob = eb ? B.pts[0] : B.pts[B.pts.length - 1];
            if (D2(oa, ob) < EPS && A.cnt + B.cnt > 2) continue;
            const A2 = ea ? A.pts : revH(A.pts),
              B2 = eb ? revH(B.pts) : B.pts;
            const din = dir(A2[A2.length - 2], A2[A2.length - 1]),
              dou = dir(B2[0], B2[1]);
            if (din[0] * dou[0] + din[1] * dou[1] < COSL) continue;
            const e0 = A.e ? (ea ? A.e[0] : A.e[1]) : undefined,
              e1 = B.e ? (eb ? B.e[0] : B.e[1]) : undefined;
            A.pts = A2.concat(B2.slice(1));
            const jm = fuseMeta(A2[A2.length - 1][2], B2[0][2]);
            if (jm) {
              const J = A.pts[A2.length - 1];
              A.pts[A2.length - 1] = [J[0], J[1], jm];
            }
            A.e = e0 || e1 ? [e0, e1] : null;
            A.cnt += B.cnt;
            open.splice(j, 1);
            merged = true;
            break outer;
          }
      }
  }
  for (const t of open) {
    if (t.pts.length > 3 && D2(t.pts[0], t.pts[t.pts.length - 1]) < EPS) {
      const jm = fuseMeta(t.pts[t.pts.length - 1][2], t.pts[0][2]);
      t.pts = t.pts.slice(0, -1);
      if (jm) t.pts[0] = [t.pts[0][0], t.pts[0][1], jm];
      t.chiuso = true;
      t.e = null;
    }
    out.push(t);
  }
  return out;
}
