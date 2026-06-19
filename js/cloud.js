// ===== js/cloud.js — carica/salva il progetto corrente su Supabase (tabella projects) =====
// Riusa sbClient da session.js. Se non loggato o senza ?p=id, l'editor funziona come prima (locale).
let currentProjectId = null;

function cloudClient() {
  return typeof sbClient !== "undefined" && sbClient ? sbClient : null;
}

// indicatore di stato salvataggio in topbar
function setSaveStatus(text, saved) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("show", !!text);
  el.classList.toggle("saved", !!saved);
}

// id del progetto dall'URL: editor.html?p=<uuid>
function cloudProjectIdFromURL() {
  try {
    return new URLSearchParams(location.search).get("p");
  } catch (e) {
    return null;
  }
}

// carica un progetto dal cloud e lo applica all'editor
async function loadCloudProject(id) {
  const c = cloudClient();
  if (!c || !id) return;
  try {
    const { data, error } = await c
      .from("projects")
      .select("id, name, data")
      .eq("id", id)
      .single();
    if (error) {
      toast("Progetto non caricato dal cloud: " + error.message, true);
      return;
    }
    currentProjectId = data.id;
    if (data.data && data.data.f) {
      applyProject(data.data); // formato identico all'export
    } else if (data.name) {
      // progetto nuovo/vuoto: tieni il default, imposta solo il nome
      setFontName(data.name);
    }
    toast("Progetto caricato: " + (data.name || "senza nome"));
  } catch (e) {
    toast("Errore cloud: " + (e.message || e), true);
  }
}

// salva (upsert) il progetto corrente nel cloud. silent=true per l'autosave (niente toast).
async function saveCloudProject(silent) {
  const c = cloudClient();
  if (!c) {
    if (!silent) saveProject(); // fallback: salvataggio locale + download .json
    return;
  }
  fontName = cleanName();
  const row = {
    name: fontName,
    data: projectData(),
    sample: (SET()[0] || "A") + (SET()[1] || "a"),
    is_draft: false,
  };
  try {
    persistNow(); // cache locale comunque
    setSaveStatus("Salvataggio…");
    if (currentProjectId) {
      const { error } = await c
        .from("projects")
        .update(row)
        .eq("id", currentProjectId);
      if (error) throw error;
    } else {
      const { data: sess } = await c.auth.getSession();
      const uid = sess && sess.session && sess.session.user.id;
      if (!uid) {
        if (!silent) toast("Non autenticato — salvato solo in locale", true);
        return;
      }
      const { data, error } = await c
        .from("projects")
        .insert({ ...row, user_id: uid })
        .select("id")
        .single();
      if (error) throw error;
      currentProjectId = data.id;
      // rifletti l'id nell'URL senza ricaricare
      history.replaceState(null, "", "?p=" + currentProjectId);
    }
    if (!silent) toast("Salvato nel cloud — " + fontName);
    setSaveStatus("Salvato ✓", true);
  } catch (e) {
    setSaveStatus("Errore salvataggio", false);
    if (!silent) toast("Salvataggio cloud fallito: " + (e.message || e), true);
  }
}

// autosave: salva in silenzio ~2s dopo l'ultima modifica (solo se un progetto cloud è aperto)
let _cloudSaveTimer = null;
function cloudAutosave() {
  if (!cloudClient() || !currentProjectId) return;
  setSaveStatus("Modifiche…");
  clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(() => saveCloudProject(true), 2000);
}

// torna alla dashboard salvando prima (no perdita lavoro)
async function goDashboard() {
  try {
    if (cloudClient() && currentProjectId) await saveCloudProject(true);
  } catch (e) {}
  window.location.href = "/dashboard.html";
}

// init: dopo che l'editor è pronto, carica l'eventuale progetto da URL e
// dirotta il pulsante Salva + Cmd/Ctrl+S sul salvataggio cloud.
(function initCloud() {
  function ready() {
    return (
      typeof applyProject === "function" &&
      typeof masters !== "undefined" &&
      masters.A &&
      document.getElementById("saveP")
    );
  }
  function start() {
    if (!ready()) {
      setTimeout(start, 150);
      return;
    }
    // pulsante Salva → cloud
    const sp = document.getElementById("saveP");
    if (sp) sp.onclick = () => saveCloudProject(false);
    // bottone "Torna alla dashboard" (salva prima)
    const db = document.getElementById("dashB");
    if (db) db.onclick = goDashboard;
    // anche il logo in alto a sinistra torna alla dashboard (più visibile)
    const lg = document.querySelector("#topbar .logo");
    if (lg) {
      lg.classList.add("link");
      lg.title = "Torna alla dashboard";
      lg.onclick = goDashboard;
    }
    // Cmd/Ctrl+S → cloud
    window.addEventListener(
      "keydown",
      (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          saveCloudProject(false);
        }
      },
      true, // capture: precede l'handler locale di project/ui
    );
    // autosave: aggancia schedPersist (chiamato a ogni modifica) → salvataggio cloud silenzioso
    if (typeof schedPersist === "function") {
      const _sp = schedPersist;
      schedPersist = function () {
        _sp.apply(this, arguments);
        cloudAutosave();
      };
    }
    // salvataggio best-effort all'uscita
    window.addEventListener("pagehide", () => {
      if (cloudClient() && currentProjectId) saveCloudProject(true);
    });
    const id = cloudProjectIdFromURL();
    if (id) loadCloudProject(id);
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
