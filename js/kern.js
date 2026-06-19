// ===== js/kern.js — kerning a classi: un valore per coppia-di-classi invece che per coppia-di-glifi =====
// kern[a+b] (coppia esplicita) vince sempre come override. Altrimenti vale classKern[clsR(a)+"|"+clsL(b)].
// clsR = forma del bordo DESTRO del glifo sinistro; clsL = bordo SINISTRO del glifo destro: il kerning
// dipende solo da queste due forme, quindi una manciata di classi copre centinaia di coppie.
// Mappa di partenza coarse e EDITABILE: la metrica fine è giudizio tipografico, non sta nel codice (knob).
const KCLASS = {
  // bordo destro del glifo (chi precede)
  R: {
    O: "o", C: "o", D: "o", G: "o", Q: "o", U: "o",
    o: "o", c: "o", d: "o", e: "o", q: "o", g: "o",
    T: "t", V: "t", W: "t", Y: "t", v: "t", w: "t", y: "t",
    F: "f", P: "f", L: "L", r: "f",
    A: "a",
  },
  // bordo sinistro del glifo (chi segue)
  L: {
    O: "o", C: "o", G: "o", Q: "o",
    o: "o", c: "o", e: "o", d: "o", q: "o", g: "o", b: "o", p: "o",
    A: "a", T: "t", V: "t", W: "t", Y: "t", v: "t", w: "t", y: "t",
    J: "j",
  },
};
let classKern = {};
const clsR = (a) => KCLASS.R[a] || "n";
const clsL = (a) => KCLASS.L[a] || "n";
const classKey = (a, b) => clsR(a) + "|" + clsL(b);

// valore di kerning risolto per la coppia a→b, in frazione di size
function kpair(a, b) {
  if (a + b in kern) return kern[a + b]; // override esplicito (anche 0)
  return classKern[classKey(a, b)] || 0;
}

function kpairSelfTest() {
  const sv = JSON.stringify(kern),
    svc = JSON.stringify(classKern);
  kern = {};
  classKern = { "a|t": -0.1 }; // A→T (clsR(A)=a, clsL(T)=t)
  console.assert(kpair("A", "T") === -0.1, "classe deve applicarsi a A,T", kpair("A", "T"));
  console.assert(kpair("A", "V") === -0.1, "stessa classe-coppia: A,V eredita", kpair("A", "V"));
  console.assert(kpair("H", "H") === 0, "neutra-neutra: 0", kpair("H", "H"));
  kern["AT"] = 0; // override esplicito a 0 vince sulla classe
  console.assert(kpair("A", "T") === 0, "override esplicito vince", kpair("A", "T"));
  kern = JSON.parse(sv);
  classKern = JSON.parse(svc);
  console.log("kpairSelfTest ok");
  return true;
}
