// ===== js/project.js — progetto: toast, persistenza localStorage, salva/apri .json, nome font =====
function dl(t, name, mime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([t], { type: mime || "image/svg+xml" }),
  );
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
function toast(msg, err) {
  const h = document.getElementById("toasts"),
    t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  h.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s";
    t.style.opacity = "0";
    setTimeout(() => t.remove(), 260);
  }, 2600);
}
let fontName = "HersheyType",
  persistT = null;
function cleanName() {
  const v = (document.getElementById("fname").value || "")
    .replace(/[^\w\s-]/g, "")
    .trim();
  return v || "HersheyType";
}
function setFontName(n) {
  fontName = n;
  const el = document.getElementById("fname");
  if (el) el.value = n;
  document.title = n + " — " + (window.APP_NAME || "Type Tool");
}
// oggetto canonico del progetto (stesso formato di salvataggio/export)
function projectData() {
  return {
    v: 2,
    name: fontName,
    b: baseName,
    as: autoSpace,
    f: masters.A,
    fB: masters.B,
    mc: masterCur,
    it: interT,
    k: kern,
    kc: classKern,
    e: skelEdits,
    lk: glyphLock,
    cf: compFree,
    fx: fxLayer,
    fxOn: fxOn,
  };
}
function persistNow() {
  try {
    localStorage.setItem(
      "ht_proj",
      JSON.stringify({
        v: 2,
        name: fontName,
        b: baseName,
        as: autoSpace,
        f: masters.A,
        fB: masters.B,
        mc: masterCur,
        it: interT,
        k: kern,
        kc: classKern,
        e: skelEdits,
        fx: fxLayer,
        fxOn: fxOn,
      }),
    );
  } catch (e) {}
}
function schedPersist() {
  clearTimeout(persistT);
  persistT = setTimeout(persistNow, 700);
}
function restoreLocal() {
  try {
    const s = localStorage.getItem("ht_proj");
    if (!s) return false;
    const o = JSON.parse(s);
    if (!o || typeof o.f !== "object") return false;
    for (const c of ALLCHARS)
      if (o.f[c]) font[c] = Object.assign(def0(), o.f[c]);
    if (o.fB) {
      masters.B = {};
      for (const c of ALLCHARS)
        masters.B[c] = Object.assign(def0(), o.fB[c] || {});
    } else masters.B = null;
    masterCur = o.mc === "B" && masters.B ? "B" : "A";
    font = masters[masterCur];
    interT = typeof o.it === "number" ? Math.max(0, Math.min(1, o.it)) : 0;
    const slR = document.getElementById("interp");
    if (slR) slR.value = Math.round(interT * 100);
    updMasterUI();
    kern = o.k || {};
    classKern = o.kc || {};
    skelEdits = o.e || {};
    glyphLock = o.lk || {};
    compFree = o.cf || {};
    restoreFX(o);
    const mg = migrateProject(o);
    if (mg)
      setTimeout(() => {
        persistNow();
        toast(
          "Progetto aggiornato: apici riparati" +
            (mg.length
              ? " · scheletri base ripristinati: " + mg.join(" ")
              : ""),
        );
      }, 700);
    if (o.name) setFontName(o.name);
    if (o.b && o.b !== "interno") setBase(o.b);
    autoSpace = !!o.as;
    const ab = document.getElementById("autosp");
    if (ab) ab.classList.toggle("on", autoSpace);
    return true;
  } catch (e) {
    return false;
  }
}
function saveProject() {
  fontName = cleanName();
  persistNow();
  dl(
    JSON.stringify({
      v: 2,
      name: fontName,
      b: baseName,
      as: autoSpace,
      f: masters.A,
      fB: masters.B,
      mc: masterCur,
      it: interT,
      k: kern,
      kc: classKern,
      e: skelEdits,
      fx: fxLayer,
      fxOn: fxOn,
    }),
    fontName.replace(/\s+/g, "") + ".progetto.json",
    "application/json",
  );
  toast("Progetto salvato — " + fontName);
}
function applyProject(o) {
  if (!o || typeof o.f !== "object") throw new Error("formato non valido");
  commit();
  masterCur = "A";
  font = masters.A;
  for (const c of ALLCHARS)
    font[c] = o.f[c] ? Object.assign(def0(), o.f[c]) : def0();
  if (o.fB) {
    masters.B = {};
    for (const c of ALLCHARS)
      masters.B[c] = Object.assign(def0(), o.fB[c] || {});
  } else masters.B = null;
  masterCur = o.mc === "B" && masters.B ? "B" : "A";
  font = masters[masterCur];
  interT = typeof o.it === "number" ? Math.max(0, Math.min(1, o.it)) : 0;
  const slP = document.getElementById("interp");
  if (slP) slP.value = Math.round(interT * 100);
  updMasterUI();
  kern = o.k || {};
  classKern = o.kc || {};
  skelEdits = o.e || {};
  restoreFX(o);
  const mgP = migrateProject(o);
  if (mgP && mgP.length) toast("Scheletri base ripristinati: " + mgP.join(" "));
  if (o.name) setFontName(o.name);
  setBase(o.b || "interno");
  autoSpace = !!o.as;
  const ab = document.getElementById("autosp");
  if (ab) ab.classList.toggle("on", autoSpace);
  cache = null;
  dirty = true;
  vizForce = true;
  load(Math.min(cur, SET().length - 1));
  updateKern();
  schedPersist();
}

// ripristina il layer FX globale da un progetto salvato (non distruttivo, opzionale)
function restoreFX(o) {
  if (o.fx) for (const k of FXKEYS) if (typeof o.fx[k] === "number") fxLayer[k] = o.fx[k];
  fxOn = !!o.fxOn;
  if (typeof syncFXToggle === "function") syncFXToggle();
}
// progetti v1: ripara Miter 8 (vecchio default che rompeva gli apici) e scarta override-scheletro stantii (cloni densi senza maniglie del vecchio campionamento)
function migrateProject(o) {
  if ((o.v || 1) >= 2) return null;
  for (const c of ALLCHARS) {
    if (masters.A[c] && masters.A[c].apice === 8) masters.A[c].apice = 2;
    if (masters.B && masters.B[c] && masters.B[c].apice === 8)
      masters.B[c].apice = 2;
  }
  const dropped = [];
  for (const ch in skelEdits) {
    const g = skelEdits[ch];
    let metas = 0,
      dense = false;
    for (const t of g.tratti) {
      if (t.pts.some((q) => q[2])) metas++;
      if (t.pts.length >= 12) dense = true;
    }
    if (dense && !metas) {
      delete skelEdits[ch];
      dropped.push(ch);
    }
  }
  return dropped;
}
