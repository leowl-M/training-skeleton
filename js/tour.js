// ===== js/tour.js — onboarding interattivo: spotlight + bolla guida, primo avvio o da Aiuto =====
// Lo strumento è denso: un tour di pochi passi mostra dove sono le cose senza spaventare.
const TOUR = [
  {
    sel: null,
    title: "Benvenuto in Apice Studio",
    text: "Disegni font parametriche: ogni lettera è uno scheletro su cui un motore costruisce l'outline. Ti mostro le basi in pochi passi — puoi saltare quando vuoi.",
  },
  {
    sel: "#pt-stroke",
    title: "Stroke",
    text: "Penna, peso del tratto, giunzioni. Trascina i knob su/giù per cambiare i valori; doppio click li azzera.",
  },
  {
    sel: "#pt-metrics",
    title: "Metrics",
    text: "Altezze e proporzioni: x-height, ascender, descender, larghezza, spaziatura.",
  },
  {
    sel: "#editB",
    title: "Modifica punti",
    text: "Sposta direttamente i nodi dello scheletro della lettera. Doppio click su un nodo cicla angolo → morbido → spezzato.",
  },
  {
    sel: "#lintB",
    title: "Controllo qualità",
    text: "Segnala difetti nelle singole lettere (glifi vuoti, contorni degeneri, frammenti). Badge verde = pulito, giallo = avviso, rosso = errore.",
  },
  {
    sel: "#consistB",
    title: "Consistenza",
    text: "Trova stem, x-height, ascender… che divergono tra i glifi e li uniforma con un click. Per una font coerente.",
  },
  {
    sel: "#word",
    title: "Prova una parola",
    text: "Scrivi qui per vedere la font in parola: spaziatura e ritmo, non solo la lettera isolata.",
  },
  {
    sel: "#expB",
    title: "Esporta",
    text: "Quando sei pronto: font OTF reale, specimen SVG/PNG, o salva il progetto. Buon divertimento!",
  },
];
let tourI = -1;
function tourEls() {
  return {
    root: document.getElementById("tour"),
    spot: document.getElementById("tourSpot"),
    bubble: document.getElementById("tourBubble"),
    title: document.getElementById("tourTitle"),
    text: document.getElementById("tourText"),
    dots: document.getElementById("tourDots"),
    prev: document.getElementById("tourPrev"),
    next: document.getElementById("tourNext"),
  };
}
function startTour() {
  tourI = 0;
  tourEls().root.classList.add("on");
  showTourStep();
}
function endTour() {
  tourI = -1;
  tourEls().root.classList.remove("on");
}
function tourGo(d) {
  const ni = tourI + d;
  if (ni < 0) return;
  if (ni >= TOUR.length) return endTour();
  tourI = ni;
  showTourStep();
}
function showTourStep() {
  const e = tourEls(),
    step = TOUR[tourI];
  e.title.textContent = step.title;
  e.text.textContent = step.text;
  e.prev.style.visibility = tourI === 0 ? "hidden" : "visible";
  e.next.textContent = tourI === TOUR.length - 1 ? "Fine" : "Avanti";
  // pallini di avanzamento
  e.dots.innerHTML = "";
  for (let i = 0; i < TOUR.length; i++) {
    const d = document.createElement("span");
    d.className = "tourDot" + (i === tourI ? " on" : "");
    e.dots.appendChild(d);
  }
  const tgt = step.sel && document.querySelector(step.sel);
  const vw = window.innerWidth,
    vh = window.innerHeight;
  if (!tgt) {
    // passo centrale: nessuno spotlight, bolla al centro
    e.spot.style.opacity = "0";
    e.bubble.style.left = Math.round(vw / 2 - 160) + "px";
    e.bubble.style.top = Math.round(vh / 2 - 80) + "px";
    return;
  }
  const r = tgt.getBoundingClientRect(),
    pad = 6;
  e.spot.style.opacity = "1";
  e.spot.style.left = r.left - pad + "px";
  e.spot.style.top = r.top - pad + "px";
  e.spot.style.width = r.width + pad * 2 + "px";
  e.spot.style.height = r.height + pad * 2 + "px";
  // posiziona la bolla: sopra se il target è in basso, altrimenti sotto; clamp ai bordi
  const bw = 320,
    bh = e.bubble.offsetHeight || 150,
    below = r.bottom + 14,
    above = r.top - bh - 14,
    placeAbove = r.top > vh / 2;
  let top = placeAbove ? above : below;
  top = Math.max(12, Math.min(vh - bh - 12, top));
  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(12, Math.min(vw - bw - 12, left));
  e.bubble.style.left = Math.round(left) + "px";
  e.bubble.style.top = Math.round(top) + "px";
}
function initTour() {
  const e = tourEls();
  if (!e.root) return;
  e.prev.onclick = () => tourGo(-1);
  e.next.onclick = () => tourGo(1);
  document.getElementById("tourSkip").onclick = endTour;
  window.addEventListener("keydown", (ev) => {
    if (tourI < 0) return;
    if (ev.key === "Escape") endTour();
    else if (ev.key === "ArrowRight" || ev.key === "Enter") tourGo(1);
    else if (ev.key === "ArrowLeft") tourGo(-1);
  });
  window.addEventListener("resize", () => {
    if (tourI >= 0) showTourStep();
  });
  // replay dalla guida
  const rep = document.getElementById("tourReplay");
  if (rep)
    rep.onclick = () => {
      document.getElementById("help").classList.remove("on");
      startTour();
    };
}
initTour();
