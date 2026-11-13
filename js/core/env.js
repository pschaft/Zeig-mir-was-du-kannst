// Laufzeitumgebung: eigenständige PWA oder eingebettet (z. B. als claude.ai-Artifact).

/** true, wenn die App als eingebettete Ein-Datei-Version läuft (Flag wird vom Build gesetzt). */
export const EMBED = typeof window !== 'undefined' && !!window.UNIKRAM_EMBED;

/** true, wenn die Seite in einem iframe läuft. */
export const FRAMED = (() => {
  try { return window.top !== window.self; } catch { return true; }
})();

/** Plattform-Fähigkeit holen (nur eingebettet), sonst null. */
export async function capability(name) {
  try {
    if (!window.claude?.use) return null;
    return await window.claude.use(name);
  } catch {
    return null;
  }
}
