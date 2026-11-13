// Wortzähler mit Lesezeit, Normseiten und Füllwort-Analyse.
import { store } from '../../core/store.js';
import { html } from '../../core/html.js';
import { icon } from '../../core/icons.js';
import { debounce, copyText } from '../../core/util.js';
import { fmtNum } from '../../core/format.js';
import { toast } from '../../core/ui.js';

const STOP = new Set('der die das und oder aber in im an am auf aus bei mit nach von vor zu zum zur für über unter durch gegen ohne um ist sind war waren wird werden wurde wurden sein hat haben hatte hatten kann können muss müssen soll sollen darf dürfen nicht kein keine ein eine einer eines einem einen den dem des es er sie wir ihr ich du man sich auch als wie wenn dass daß so noch nur schon sehr mehr dann da hier dort diese dieser dieses diesem diesen jene jener welche welcher welches was wer wo the a an of to and or in on for is are be it this that with as by at from'.split(' '));
const FILLERS = ['eigentlich', 'halt', 'quasi', 'sozusagen', 'irgendwie', 'ziemlich', 'wirklich', 'natürlich', 'einfach', 'eben', 'mal', 'wohl', 'gewissermaßen', 'letztendlich', 'grundsätzlich', 'tatsächlich', 'praktisch', 'durchaus', 'absolut', 'total', 'regelrecht', 'echt'];

export function analyze(text) {
  const t = text ?? '';
  const words = t.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? [];
  const chars = t.length;
  const charsNoSpace = t.replace(/\s/g, '').length;
  const sentences = (t.match(/[^.!?…]+[.!?…]+(\s|$)/g) ?? []).length || (words.length ? 1 : 0);
  const paragraphs = t.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const freq = new Map();
  let fillers = 0;
  const fillerHits = new Map();
  for (const w of words) {
    const l = w.toLowerCase();
    if (FILLERS.includes(l)) { fillers++; fillerHits.set(l, (fillerHits.get(l) ?? 0) + 1); }
    if (l.length < 3 || STOP.has(l) || /^\d+$/.test(l)) continue;
    freq.set(l, (freq.get(l) ?? 0) + 1);
  }
  const top = [...freq.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const avgSentence = sentences ? words.length / sentences : 0;
  const longWords = words.filter((w) => w.length > 15).length;
  return {
    words: words.length, chars, charsNoSpace, sentences, paragraphs,
    readMin: words.length / 230, speakMin: words.length / 130,
    normPages: chars / 1500, pages: words.length / 350,
    top, fillers, fillerHits: [...fillerHits.entries()].sort((a, b) => b[1] - a[1]), avgSentence, longWords,
  };
}

function fmtTime(min) {
  if (min < 1) return `${Math.max(0, Math.round(min * 60))} Sek`;
  const m = Math.floor(min), s = Math.round((min - m) * 60);
  return m >= 60 ? `${Math.floor(m / 60)} Std ${m % 60} Min` : `${m}:${String(s).padStart(2, '0')} Min`;
}

function statsHTML(a, target, unit) {
  const val = unit === 'chars' ? a.chars : a.words;
  const p = target ? Math.min(100, (val / target) * 100) : 0;
  return html`
    <div class="wc-stats">
      <div class="stat-tile"><div class="stat-value">${fmtNum(a.words)}</div><div class="stat-label">Wörter</div></div>
      <div class="stat-tile"><div class="stat-value">${fmtNum(a.chars)}</div><div class="stat-label">Zeichen</div></div>
      <div class="stat-tile"><div class="stat-value">${fmtNum(a.charsNoSpace)}</div><div class="stat-label">ohne Leerzeichen</div></div>
      <div class="stat-tile"><div class="stat-value">${fmtNum(a.sentences)}</div><div class="stat-label">Sätze</div></div>
      <div class="stat-tile"><div class="stat-value">${fmtNum(a.normPages, 1)}</div><div class="stat-label">Normseiten (1.500 Z.)</div></div>
      <div class="stat-tile"><div class="stat-value">≈ ${fmtNum(a.pages, 1)}</div><div class="stat-label">Seiten (Hausarbeit)</div></div>
      <div class="stat-tile"><div class="stat-value">${fmtTime(a.readMin)}</div><div class="stat-label">Lesezeit</div></div>
      <div class="stat-tile"><div class="stat-value">${fmtTime(a.speakMin)}</div><div class="stat-label">Sprechzeit (Vortrag)</div></div>
    </div>
    ${target ? html`<div class="mt-16"><div class="row-between small mb-8"><span>Ziel: ${fmtNum(target)} ${unit === 'chars' ? 'Zeichen' : 'Wörter'}</span><b class="${val > target * 1.1 ? 'danger-text' : val >= target * 0.9 ? 'success-text' : ''}">${Math.round((val / target) * 100)} %</b></div>
      <div class="progress lg ${val > target * 1.1 ? 'over' : ''}" style="--c:${val >= target * 0.9 && val <= target * 1.1 ? 'var(--success)' : 'var(--accent)'}"><div class="progress-bar" style="width:${p}%"></div></div>
      <p class="tiny muted mt-4">${val < target ? `Noch ${fmtNum(target - val)} ${unit === 'chars' ? 'Zeichen' : 'Wörter'}` : val > target * 1.1 ? 'Mehr als 10 % drüber – kürzen!' : 'Im grünen Bereich (±10 %) ✓'}</p></div>` : ''}
    <div class="grid grid-2 mt-16">
      <div><div class="section-title" style="margin-top:0">Häufigste Wörter</div>
        ${a.top.length ? html`<div class="chips wrap">${a.top.map(([w, n]) => html`<span class="chip sm">${w} <span class="count">${n}×</span></span>`)}</div>` : html`<p class="tiny muted">Noch keine Wiederholungen.</p>`}</div>
      <div><div class="section-title" style="margin-top:0">Stil-Check</div>
        <div class="stack-sm small">
          <div class="row-between"><span>Füllwörter</span><b class="${a.words && a.fillers / a.words > 0.02 ? 'warning-text' : ''}">${a.fillers}${a.words ? ` (${fmtNum((a.fillers / a.words) * 100, 1)} %)` : ''}</b></div>
          ${a.fillerHits.length ? html`<div class="tiny muted">${a.fillerHits.slice(0, 6).map(([w, n]) => `${w} ${n}×`).join(' · ')}</div>` : ''}
          <div class="row-between"><span>Ø Wörter pro Satz</span><b class="${a.avgSentence > 25 ? 'warning-text' : ''}">${fmtNum(a.avgSentence, 1)}</b></div>
          <div class="row-between"><span>Sehr lange Wörter (>15)</span><b>${a.longWords}</b></div>
          ${a.avgSentence > 25 ? html`<div class="tiny muted">Tipp: Sätze über 25 Wörter sind schwer lesbar.</div>` : ''}
        </div></div>
    </div>`;
}

const save = debounce((text) => store.update((s) => { s.tools.wordText = text.slice(0, 200000); }), 700);

export default {
  title: 'Wortzähler',
  render({ state }) {
    const text = state.tools.wordText ?? '';
    const unit = state.tools.wordUnit ?? 'words';
    return html`
      <header class="page-head"><div class="titles"><h1>Wortzähler</h1><p class="page-sub">Text einfügen – alles wird live gezählt und lokal gespeichert.</p></div>
        <div class="page-actions"><button class="icon-btn filled" data-action="wc-copy" aria-label="Kopieren" title="Text kopieren">${icon('copy')}</button><button class="icon-btn filled danger" data-action="wc-clear" aria-label="Leeren" title="Text löschen">${icon('trash')}</button></div></header>
      <div class="grid grid-2">
        <div class="card"><textarea class="textarea" style="min-height:360px;font-size:15.5px" placeholder="Text hier einfügen oder schreiben …" data-input="wc-input" aria-label="Text">${text}</textarea>
          <div class="row wrap mt-12"><span class="small muted">Ziel:</span>
            <input class="input sm" style="width:110px" inputmode="numeric" placeholder="z. B. 3000" value="${state.tools.wordTarget || ''}" data-change="wc-target" aria-label="Zielwert">
            <div class="seg sm">${[['words', 'Wörter'], ['chars', 'Zeichen']].map(([k, l]) => html`<button class="${unit === k ? 'active' : ''}" data-action="wc-unit" data-u="${k}">${l}</button>`)}</div>
          </div></div>
        <div class="card" data-wc-stats>${statsHTML(analyze(text), state.tools.wordTarget, unit)}</div>
      </div>`;
  },
  actions: {
    'wc-input': (c, el) => {
      const box = document.querySelector('[data-wc-stats]');
      if (box) box.innerHTML = String(statsHTML(analyze(el.value), c.state.tools.wordTarget, c.state.tools.wordUnit ?? 'words'));
      save(el.value);
    },
    'wc-target': (c, el) => store.update((s) => { s.tools.wordTarget = Math.max(0, parseInt(el.value.replace(/\D/g, ''), 10) || 0); }),
    'wc-unit': (c, el) => store.update((s) => { s.tools.wordUnit = el.dataset.u; }),
    'wc-copy': async () => { if (await copyText(store.state.tools.wordText ?? '')) toast('Text kopiert', { type: 'success' }); },
    'wc-clear': () => {
      const prev = store.state.tools.wordText;
      store.update((s) => { s.tools.wordText = ''; });
      const ta = document.querySelector('[data-input="wc-input"]');
      if (ta) ta.value = '';
      toast('Text gelöscht', { action: { label: 'Rückgängig', onClick: () => { store.update((s) => { s.tools.wordText = prev; }); const t = document.querySelector('[data-input="wc-input"]'); if (t) t.value = prev; } } });
    },
  },
};
