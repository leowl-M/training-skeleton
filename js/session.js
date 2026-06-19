// ===== js/session.js — guardia di sessione Supabase + logout per l'editor =====
// Stessa config di auth.html (la publishable key è pubblica: ok nel frontend).
const SUPABASE_URL = "https://tasepcbrgoojhswhsmdj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_hqdHdYaE5ew-Q9AfNpUniA_n5po1xsU";
const AUTH_PAGE = "/auth.html";

let sbClient = null;
try {
  sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.warn("Supabase non inizializzato:", e);
}

// guardia: se non c'è una sessione attiva, rimanda alla pagina di accesso
 if (sbClient) {
    sbClient.auth
      .getSession()
      .then(({ data }) => {
        if (!data || !data.session) window.location.replace(AUTH_PAGE);
      })
      .catch(() => window.location.replace(AUTH_PAGE));
  }

// // logout: chiamato dal bottone nel dock
  function ApiceLogout() {
    if (!sbClient) {
      window.location.replace(AUTH_PAGE);
      return;
    }
    sbClient.auth.signOut().finally(() => window.location.replace(AUTH_PAGE));
  }
