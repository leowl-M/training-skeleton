// ===== js/theme.js — tema grayscale dark/light + toolbar: toggle pannelli, popover =====
let UI = {};
function refreshTheme() {
  const light = document.documentElement.dataset.theme !== "dark";
  const cs = getComputedStyle(document.documentElement);
  glyphColor = cs.getPropertyValue("--glyph").trim();
  UI.bg = cs.getPropertyValue("--bg").trim();
  UI.hot = light ? "#ff4d06" : "#ff5a1a";
  UI.hotSoft = light ? "rgba(255,77,6,.4)" : "rgba(255,90,26,.45)";
  UI.glyphSoft = light ? "rgba(20,20,22,.92)" : "rgba(245,245,245,.92)";
  UI.muted = light ? "#6e6e74" : "#9a9aa0";
  UI.soft = light ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.55)";
  UI.btn = light ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.07)";
  UI.g1 = light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.07)";
  UI.g2 = light ? "rgba(0,0,0,.07)" : "rgba(255,255,255,.04)";
  UI.g3 = light ? "rgba(0,0,0,.10)" : "rgba(255,255,255,.055)";
  UI.l1 = light ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.13)";
  UI.l2 = light ? "rgba(0,0,0,.30)" : "rgba(255,255,255,.28)";
  UI.l3 = light ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.45)";
  UI.lineFaint = light ? "rgba(0,0,0,.14)" : "rgba(255,255,255,.1)";
  UI.trail = light ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.18)";
  dirty = true;
  vizForce = true;
  cache = null;
}
function setTheme(t) {
  // Convenzione DS: default = light instrument (nessun attr); dark = charcoal.
  if (t === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("ht_theme", t);
  } catch (e) {}
  refreshTheme();
}
function initTheme() {
  let t = "light";
  try {
    t = localStorage.getItem("ht_theme") || "light";
  } catch (e) {}
  setTheme(t);
}
function panelTipText(cfg) {
  const lines = [];
  if (cfg.tabs) {
    for (const tab of cfg.tabs) {
      const knobs = (tab.knobs || [])
        .map((id) => (SL.find((s) => s.id === id) || {}).l || id)
        .join(", ");
      lines.push(tab.n + ": " + (knobs || tab.h || ""));
    }
  }
  if (cfg.togs) {
    const togs = cfg.togs.map((k) => TOG[k] && TOG[k].l).filter(Boolean);
    if (togs.length) lines.push("Opzioni: " + togs.join(", "));
  }
  return lines.join("\n");
}
let tipEl, tipTimer, tipTarget;
function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.id = "uitip";
  tipEl.innerHTML = '<div class="tip-t"></div><div class="tip-b"></div>';
  document.body.appendChild(tipEl);
  return tipEl;
}
function hideTip() {
  clearTimeout(tipTimer);
  if (tipEl) tipEl.classList.remove("show");
  tipTarget = null;
}
function showTip(el, text) {
  if (!text) return;
  const tip = ensureTip();
  const parts = text.split("\n");
  tip.querySelector(".tip-t").textContent = parts[0];
  const body = tip.querySelector(".tip-b");
  const rest = parts.slice(1).join("\n");
  body.textContent = rest;
  body.style.display = rest ? "" : "none";
  tip.classList.add("show");
  const r = el.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  let left = r.left + r.width / 2 - tr.width / 2;
  let top = r.top - tr.height - 10;
  if (top < 8) top = r.bottom + 10;
  left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, left));
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}
function bindTip(el, text) {
  if (!el || !text || el.dataset.tipBound) return;
  el.dataset.tipBound = "1";
  if (el.hasAttribute("title")) el.removeAttribute("title");
  el.addEventListener("mouseenter", () => {
    clearTimeout(tipTimer);
    tipTarget = el;
    tipTimer = setTimeout(() => {
      if (tipTarget === el) showTip(el, text);
    }, 420);
  });
  el.addEventListener("mouseleave", hideTip);
  el.addEventListener("mousedown", hideTip);
}
function initTips() {
  for (const cfg of PANELS) {
    const btn = document.getElementById("pt-" + cfg.id);
    if (btn) bindTip(btn, cfg.t + "\n" + panelTipText(cfg));
  }
  bindTip(
    document.getElementById("pt-chain"),
    "Signal\nPipeline Blueprint → Pen → Outline → Scope di modifica",
  );
  const dockTips = {
    grid: "Guide e griglia\nMostra ascender, x-height, descender e griglia di riferimento",
    hollow: "Solo contorno\nVisualizza il glifo come tratto, senza riempimento",
    unite: "Unisci tratti\nBoolean union: fonde i tratti sovrapposti in un unico contorno",
    autosp: "Spaziatura automatica\nCalcola sidebearing dal profilo dello spazio negativo",
    editB:
      "Modifica punti\nSeleziona e trascina i nodi dello scheletro · lazo · frecce · Canc",
    drawB:
      "Disegna tratto\nClick per i punti · Invio termina · click sul primo chiude ad anello",
    pathsB:
      "Elaborazione tracciati\nUnisci estremi, copia/incolla struttura, reset punti",
    prev: "Glifo precedente\n← scorciatoia da tastiera",
    next: "Glifo successivo\n→ scorciatoia da tastiera",
    zout: "Zoom −\nRotella mouse sul canvas",
    zin: "Zoom +\nRotella mouse sul canvas",
    mA: "Master A\nMaster di riferimento — clic per modificarlo",
    mB: "Master B\nPrimo clic lo crea da A, poi lo modifichi (es. Bold)",
    undoB: "Annulla\nCmd/Ctrl+Z",
    redoB: "Ripristina\nShift+Cmd/Ctrl+Z",
    expB: "Esporta\nPNG specimen, SVG, OTF",
    saveP: "Salva progetto\nCmd/Ctrl+S · file .json",
    openP: "Apri progetto\nCarica un file .json salvato",
    themeB: "Tema\nAlterna chiaro / scuro",
    helpB: "Aiuto\nGuida rapida e scorciatoie · ?",
  };
  for (const id in dockTips) bindTip(document.getElementById(id), dockTips[id]);
  document.querySelectorAll("[data-tip]").forEach((el) => {
    bindTip(el, el.getAttribute("data-tip"));
    el.removeAttribute("data-tip");
  });
  document.querySelectorAll(".pill").forEach((pill) => {
    const tog = pill.closest(".tog");
    if (!tog) return;
    const label = tog.querySelector(".tl");
    if (label) bindTip(pill, label.textContent + "\n" + pill.textContent);
  });
}
function wireDock() {
  // toggle pannelli parametri (stile figma: icona nel dock apre/chiude il pannello flottante)
  const panMap = {
    "pt-stroke": "pan-stroke",
    "pt-metrics": "pan-metrics",
    "pt-curves": "pan-curves",
    "pt-terminal": "pan-terminal",
    "pt-chain": "chain",
    "pt-lab": "pan-lab",
  };
  for (const bid in panMap) {
    const b = document.getElementById(bid),
      p = document.getElementById(panMap[bid]);
    b.onclick = () => {
      const show = p.style.display === "none";
      p.style.display = show ? "" : "none";
      b.classList.toggle("on", show);
      // chiudendo Signal mentre uno stadio è soloato → ripristina il canvas
      if (!show && panMap[bid] === "chain" && typeof setSignalStage === "function")
        setSignalStage(null, null);
      if (show) {
        clampPanels();
        dirty = true;
        vizForce = true;
      }
    };
  }
  // popover (azioni glifo, export)
  const pops = [
    ["pathsB", "popPaths"],
    ["expB", "popExport"],
    ["consistB", "popConsist"],
  ];
  const closePops = () => {
    document
      .querySelectorAll(".pop")
      .forEach((x) => x.classList.remove("open"));
    for (const [bid] of pops)
      document.getElementById(bid).classList.remove("on");
  };
  for (const [bid, pid] of pops) {
    const b = document.getElementById(bid),
      pop = document.getElementById(pid);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = pop.classList.contains("open");
      closePops();
      if (!wasOpen) {
        if (pid === "popConsist") renderConsist();
        pop.classList.add("open");
        b.classList.add("on");
        // misura la larghezza reale del popover (ora visibile) e clampa ai bordi
        const rc = b.getBoundingClientRect(),
          pw = pop.offsetWidth || 170,
          ph = pop.offsetHeight || 200;
        if (b.closest("#dock2")) {
          // tasto nel dock verticale destro → popover ACCANTO (a sinistra), allineato
          pop.style.left = Math.max(8, rc.left - pw - 10) + "px";
          pop.style.bottom = "auto";
          pop.style.top =
            Math.max(
              8,
              Math.min(
                window.innerHeight - ph - 8,
                rc.top + rc.height / 2 - ph / 2,
              ),
            ) + "px";
        } else {
          pop.style.bottom = "";
          pop.style.top = "";
          pop.style.left =
            Math.max(
              8,
              Math.min(
                window.innerWidth - pw - 8,
                rc.left + rc.width / 2 - pw / 2,
              ),
            ) + "px";
        }
      }
    });
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".pop")) closePops();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePops();
      const v = document.getElementById("verify");
      if (v) v.classList.remove("on");
    }
  });
  // tema
  document.getElementById("themeB").onclick = () => {
    const dark = document.documentElement.dataset.theme === "dark";
    setTheme(dark ? "light" : "dark");
    toast(dark ? "Tema chiaro" : "Tema scuro");
  };
  // primo avvio: pannello Stroke chiuso (era aperto con .onclick())
  // document.getElementById("pt-stroke").onclick();
  // prima visita in assoluto: benvenuto + guida aperta
  try {
    if (!localStorage.getItem("ht_seen")) {
      localStorage.setItem("ht_seen", "1");
      setTimeout(() => {
        if (typeof startTour === "function") startTour();
      }, 700);
    }
  } catch (e) {}
  // cursore contestuale sul canvas (pan, modifica nodi, disegno)
  const cv = document.querySelector("#stage canvas");
  if (cv) {
    let lastCur = "";
    setInterval(() => {
      let c = "default";
      if (spaceDown || panDrag) c = panDrag ? "grabbing" : "grab";
      else if (drawMode) c = "crosshair";
      else if (editMode && (edHover || edDrag)) c = "move";
      else if (editMode) c = "crosshair";
      if (c !== lastCur) {
        lastCur = c;
        cv.style.cursor = c;
      }
    }, 80);
  }
}
