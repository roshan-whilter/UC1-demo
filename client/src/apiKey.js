/**
 * The API key is entered by whoever opens the console and kept in this
 * browser's localStorage — deliberately NOT in an env var or the source.
 *
 * A Vite `VITE_*` variable is inlined into the built JavaScript, so baking the
 * key in would publish it to the repo and hand it to every visitor of the
 * deployed page. Keeping it browser-local means the deployed console is inert
 * until a teammate supplies their own key.
 */

const STORAGE_KEY = "uc1.apiKey";

export function loadApiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    // Private windows and blocked site-data both throw on access.
    return "";
  }
}

export function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal: the key still works for this page load, just isn't remembered.
  }
}
