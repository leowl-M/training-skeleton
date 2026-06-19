// ===== js/preset.js — stili rapidi: applica un look a TUTTO l'alfabeto (master attivo), componibili =====
// Pensati per il divertimento: parti da un'idea (Bold, Italic, Slab…) e poi raffini.
// Sono override PARZIALI (solo le chiavi del loro stile) → componibili: Bold + Italic + Slab.
// "Regular" è l'unico che azzera lo stile, riportando a un sans pulito. Tutto è undoable.
const PRESETS = [
  {
    id: "regular",
    l: "Regular",
    hint: "Sans pulito — azzera lo stile",
    set: {
      peso: 12,
      bar: 12,
      serif: "none",
      slant: 0,
      corner: 0,
      cornerIn: 0,
      cap: "butt",
      join: "miter",
      penang: 0,
      convex: 0,
      taper: 0,
    },
  },
  { id: "bold", l: "Bold", hint: "Tratto pesante", set: { peso: 28, bar: 26 } },
  { id: "light", l: "Light", hint: "Tratto sottile", set: { peso: 6, bar: 6 } },
  { id: "italic", l: "Italic", hint: "Inclinazione", set: { slant: 14 } },
  {
    id: "slab",
    l: "Slab",
    hint: "Grazie squadrate",
    set: { serif: "slab", cap: "butt" },
  },
  { id: "wedge", l: "Wedge", hint: "Grazie a cuneo", set: { serif: "wedge" } },
  {
    id: "rounded",
    l: "Rounded",
    hint: "Angoli e terminali tondi",
    set: { corner: 9, cornerIn: 6, cap: "round", join: "round" },
  },
];

// applica un preset a tutto l'alfabeto del master attivo (con undo)
function applyPreset(id) {
  const pr = PRESETS.find((p) => p.id === id);
  if (!pr) return;
  commit();
  for (const c of ALLCHARS) Object.assign(font[c], pr.set);
  schedPersist();
  dirty = true;
  cache = null;
  lintCache = null;
  load(cur); // rinfresca knob + toggle dell'UI per il glifo corrente
  toast("Stile " + pr.l + " applicato a tutto l'alfabeto");
}
