// node test_mirror.js — verifica riflessione su x=w/2 (logica di mirrorX)
const assert = require("assert");
const w = 1;
const mir = (p) => {
  const q = [w - p[0], p[1]];
  if (p[2]) { const m = p[2], nm = { k: m.k }, nx = (h) => [-h[0], h[1]];
    if (m.h) nm.h = nx(m.h); if (m.hIn) nm.hIn = nx(m.hIn); if (m.hOut) nm.hOut = nx(m.hOut); q[2] = nm; }
  return q;
};
// punto: x riflesso, y invariata
assert.deepEqual(mir([0.19, 0.4]).slice(0, 2), [0.81, 0.4]);
// maniglia k2: x negata, y invariata
const r = mir([0.3, 0.5, { k: 2, h: [0.1, -0.2] }]);
assert.deepEqual(r.slice(0, 2), [0.7, 0.5]);
assert.deepEqual(r[2].h, [-0.1, -0.2]);
// hIn/hOut idem
const r2 = mir([0.3, 0.5, { k: 3, hIn: [0.1, 0], hOut: [0.2, 0.1] }]);
assert.deepEqual(r2[2].hIn, [-0.1, 0]);
assert.deepEqual(r2[2].hOut, [-0.2, 0.1]);
// punto sull'asse resta fermo
assert.deepEqual(mir([0.5, 0.3]).slice(0, 2), [0.5, 0.3]);
console.log("ok");
