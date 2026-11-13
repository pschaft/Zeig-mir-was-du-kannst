// Minimales, sicheres Templating: html`...` escaped alle Interpolationen automatisch.
// raw() markiert bewusst vertrauenswürdiges HTML.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export class SafeHTML {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new SafeHTML(String(s ?? ''));

function toStr(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(toStr).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toStr(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

/** Klassen zusammensetzen: cls('a', cond && 'b', {c: true}) */
export function cls(...parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === 'string') out.push(p);
    else if (typeof p === 'object') for (const [k, v] of Object.entries(p)) if (v) out.push(k);
  }
  return out.join(' ');
}

/** Sehr kleines Markdown: **fett**, *kursiv*, `code`, Zeilenumbrüche, Listen mit "- ". */
export function md(text) {
  let s = esc(text ?? '');
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>');
  s = s.replace(/^- (.*)$/gm, '• $1');
  s = s.replace(/\n/g, '<br>');
  return raw(s);
}
