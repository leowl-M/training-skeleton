// ===== js/ctxmenu.js — menu tasto destro: azioni rapide sul glifo sotto il cursore =====
// Click destro sul canvas (lettera grande o cella della griglia) → menu contestuale.
function ctxClose() {
  const m = document.getElementById("ctxMenu");
  if (m) m.classList.remove("open");
}
function ctxNavTo(ch) {
  const i = SET().indexOf(ch);
  if (i >= 0) load(i);
  else {
    selectChar(ch);
    if (typeof selSet === "function") selSet(setKey);
  }
  dirty = true;
}
function ctxApplyFrom(ch) {
  commit();
  const s = font[ch];
  for (const c of ALLCHARS) {
    const se = font[c].seme;
    font[c] = Object.assign({}, s, { seme: se });
  }
  dirty = true;
  cache = null;
  lintCache = null;
  toast('Stile di "' + ch + '" applicato a tutte');
}
function ctxItems(ch, onCell) {
  const items = [];
  if (onCell) items.push({ l: 'Vai a "' + ch + '"', fn: () => ctxNavTo(ch) });
  items.push({
    l: "Rigenera seme casuale",
    fn: () => {
      commit();
      font[ch].seme = Math.floor(Math.random() * 99999);
      dirty = true;
      cache = null;
    },
  });
  items.push({ l: "Applica stile a tutte", fn: () => ctxApplyFrom(ch) });
  items.push({ sep: true });
  items.push({
    l: "Copia struttura",
    fn: () => {
      const g = srcGlifo(ch);
      glyphClip = JSON.parse(JSON.stringify({ w: g.w, tratti: g.tratti }));
      toast('Struttura di "' + ch + '" copiata');
    },
  });
  items.push({
    l: "Incolla struttura",
    dim: !glyphClip,
    fn: () => {
      commit();
      skelEdits[ch] = JSON.parse(JSON.stringify(glyphClip));
      dirty = true;
      cache = null;
      vizForce = true;
      schedPersist();
      toast('Struttura incollata su "' + ch + '"');
    },
  });
  items.push({
    l: "Carica SVG come scheletro…",
    fn: () => importSvgToGlyph(ch),
  });
  items.push({
    l: "Reset punti modificati",
    dim: !skelEdits[ch],
    fn: () => {
      commit();
      delete skelEdits[ch];
      dirty = true;
      cache = null;
      vizForce = true;
      toast('Punti di "' + ch + '" ripristinati');
    },
  });
  items.push({ sep: true });
  items.push({
    l: glyphLocked(ch) ? 'Sblocca "' + ch + '" 🔓' : 'Blocca "' + ch + '" (finale) 🔒',
    fn: () => {
      commit();
      if (glyphLocked(ch)) {
        unlockGlyph(ch);
        toast('"' + ch + '" sbloccato — segue di nuovo i parametri globali');
      } else {
        lockGlyph(ch);
        toast('"' + ch + '" bloccato — immune a parametri, interpolazione e FX');
      }
      dirty = true;
      cache = null;
      vizForce = true;
      if (ch === CUR()) load(cur);
      schedPersist();
    },
  });
  if (COMPOSITES[ch]) {
    const linked = compLinked(ch),
      bch = COMPOSITES[ch][0];
    items.push({
      l: linked
        ? 'Scollega "' + ch + '" da "' + bch + '" ⛓'
        : 'Ricollega "' + ch + '" a "' + bch + '"',
      fn: () => {
        commit();
        if (linked) {
          detachComposite(ch);
          toast('"' + ch + '" scollegato — parametri propri');
        } else {
          relinkComposite(ch);
          toast('"' + ch + '" ricollegato a "' + bch + '"');
        }
        dirty = true;
        cache = null;
        vizForce = true;
        if (ch === CUR()) load(cur);
        schedPersist();
      },
    });
  }
  items.push({ sep: true });
  items.push({
    l: "Controlla qualità",
    fn: () => {
      const r = lintGlyph(ch);
      toast(
        "[" + ch + "] " + (r.level === "ok" ? "pulito ✓" : r.issues.map((i) => i.msg).join(" · ")),
        r.level === "err",
      );
    },
  });
  items.push({
    l: "Reset parametri glifo",
    danger: true,
    fn: () => {
      commit();
      unlockGlyph(ch);
      font[ch] = def0();
      if (ch === CUR()) load(cur);
      else {
        dirty = true;
        cache = null;
      }
      toast('Parametri di "' + ch + '" azzerati');
    },
  });
  return items;
}
function ctxShow(x, y, items) {
  const m = document.getElementById("ctxMenu");
  if (!m) return;
  m.innerHTML = "";
  for (const it of items) {
    if (it.sep) {
      const s = document.createElement("div");
      s.className = "ctx-sep";
      m.appendChild(s);
      continue;
    }
    const b = document.createElement("button");
    b.className = "ctx-item" + (it.danger ? " danger" : "") + (it.dim ? " dim" : "");
    b.textContent = it.l;
    b.onclick = (e) => {
      e.stopPropagation();
      ctxClose();
      if (!it.dim) it.fn();
    };
    m.appendChild(b);
  }
  m.classList.add("open");
  const mw = m.offsetWidth,
    mh = m.offsetHeight;
  m.style.left = Math.max(6, Math.min(x, window.innerWidth - mw - 8)) + "px";
  m.style.top = Math.max(6, Math.min(y, window.innerHeight - mh - 8)) + "px";
}
function initCtxMenu() {
  document.addEventListener("contextmenu", (e) => {
    const cv = document.querySelector("#stage canvas");
    if (!cv || !e.target.closest || !e.target.closest("#stage")) {
      ctxClose();
      return;
    }
    e.preventDefault();
    const rect = cv.getBoundingClientRect(),
      mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    let ch = null,
      onCell = false;
    if (celle)
      for (const c of celle)
        if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) {
          ch = c.ch;
          onCell = true;
          break;
        }
    if (!ch) ch = CUR();
    ctxShow(e.clientX, e.clientY, ctxItems(ch, onCell));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("#ctxMenu")) ctxClose();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") ctxClose();
  });
}
initCtxMenu();
