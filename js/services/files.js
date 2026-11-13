// Dateien speichern & Links öffnen – funktioniert als PWA und eingebettet.
// Eingebettet sind direkte Downloads gesperrt: dann über die downloads-Fähigkeit
// (mit Bestätigung) oder als Fallback zum Kopieren anzeigen.
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { sheet, toast } from '../core/ui.js';
import { download, copyText } from '../core/util.js';
import { EMBED, capability } from '../core/env.js';

const ALLOWED = ['txt', 'json', 'md', 'csv', 'html'];

function copySheet(filename, content, note) {
  sheet({
    title: 'Datei kopieren',
    body: html`<p class="small muted mb-12">${note ?? 'Downloads sind in dieser Ansicht nicht möglich.'} Kopiere den Inhalt und speichere ihn als <b>${filename}</b>.</p>
      <textarea class="textarea mono" rows="10" readonly style="font-size:12px" data-content>${content.length > 400000 ? content.slice(0, 400000) + '\n…' : content}</textarea>`,
    foot: html`<span class="spacer"></span><button class="btn btn-primary" data-copy>${icon('copy')} Kopieren</button>`,
    onMount: (el, close) => {
      el.querySelector('[data-copy]').addEventListener('click', async () => {
        if (await copyText(content)) { toast('In die Zwischenablage kopiert', { type: 'success' }); close(); }
        else { el.querySelector('[data-content]').select(); toast('Bitte manuell markieren und kopieren', { type: 'error' }); }
      });
    },
  });
}

/**
 * Datei anbieten. Gibt true zurück, wenn gespeichert (oder zum Kopieren angeboten) wurde.
 * @param {string} filename
 * @param {string} content
 * @param {string} mime
 * @param {{embedNote?: string}} [opts]
 */
export async function saveFile(filename, content, mime = 'text/plain', opts = {}) {
  if (!EMBED) {
    download(filename, content, mime);
    return true;
  }
  const ext = filename.split('.').pop().toLowerCase();
  const dl = ALLOWED.includes(ext) ? await capability('downloads') : null;
  if (dl) {
    try {
      await dl.save({ filename, data: content });
      return true;
    } catch (e) {
      if (e?.code === 'declined') return false;
      if (e?.code === 'rate_limited') { toast('Bitte einen Moment warten und erneut versuchen', { type: 'error' }); return false; }
    }
  }
  copySheet(filename, content, opts.embedNote);
  return true;
}

/** Externen Link öffnen (eingebettet blockiert window.open oft → Link kopieren). */
export async function openExternal(url) {
  let w = null;
  try { w = window.open(url, '_blank'); } catch { /* blockiert */ }
  if (w) { try { w.opener = null; } catch { /* egal */ } return; }
  if (await copyText(url)) toast('Link kopiert – im Browser einfügen', { type: 'info', iconName: 'link' });
}
