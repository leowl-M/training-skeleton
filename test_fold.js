// node test_fold.js — verifica circR3 + soglia fold (geometria pura, copia da skeleton-studio.js)
const assert = require("assert");
function circR3(a, b, c) {
  const ax = a[0] - b[0], ay = a[1] - b[1], gx = c[0] - b[0], gy = c[1] - b[1],
    ar = Math.abs(ax * gy - ay * gx) / 2;
  if (ar < 1e-12) return 1e9;
  return (Math.hypot(ax, ay) * Math.hypot(c[0] - a[0], c[1] - a[1]) * Math.hypot(gx, gy)) / (4 * ar);
}
// collineari → raggio ~∞, niente fold
assert(circR3([0, 0], [1, 0], [2, 0]) > 1e8);
// 3 punti su cerchio raggio noto r: i due check devono combaciare
const r = 0.1, pt = (t) => [r * Math.cos(t), r * Math.sin(t)];
assert(Math.abs(circR3(pt(-0.4), pt(0), pt(0.4)) - r) < 1e-6);
// fold scatta quando hw > raggio curva: hw=0.08 (peso 16) vs curva r=0.05
const hw = 16 / 100 / 2;
assert(circR3(pt(-0.4), pt(0), pt(0.4)) < hw === r < hw); // r=0.1 > hw=0.08 → no fold
const rTight = 0.05, ptT = (t) => [rTight * Math.cos(t), rTight * Math.sin(t)];
assert(circR3(ptT(-0.4), ptT(0), ptT(0.4)) < hw); // curva stretta → fold
console.log("ok");
