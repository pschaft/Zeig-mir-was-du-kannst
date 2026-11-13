// Lernsession: Karte umdrehen, bewerten, FSRS plant die nächste Wiederholung.
import { store } from '../core/store.js';
import { html, md } from '../core/html.js';
import { icon } from '../core/icons.js';
import { navigate } from '../core/router.js';
import { shuffle, vibrate } from '../core/util.js';
import { fmtInterval, plural } from '../core/format.js';
import { confetti } from '../core/confetti.js';
import { schedule, preview, buildQueue, introducedToday, RATINGS } from '../logic/srs.js';

let S = null;

function sessionKey(c) { return `${c.params.deck}|${c.query.mode ?? ''}|${c.query.reverse ?? ''}`; }

function build(c) {
  const st = store.state;
  const deckId = c.params.deck;
  const cards = deckId === 'alle' ? st.cards : st.cards.filter((x) => x.deckId === deckId);
  const cram = c.query.mode === 'cram';
  const queue = cram
    ? shuffle(cards).map((x) => x.id)
    : buildQueue(cards, { newLimit: st.settings.newCardsPerDay, introducedToday: introducedToday(st.reviews, st.cards) }).map((x) => x.id);
  S = { key: sessionKey(c), queue, flipped: false, done: 0, correct: 0, again: 0, started: Date.now(), cram, reverse: c.query.reverse === '1', finished: false, celebrated: false, history: [] };
}

function current() {
  return S?.queue.length ? store.state.cards.find((x) => x.id === S.queue[0]) : null;
}

function rate(g, c) {
  const card = current();
  if (!card || !S.flipped) return;
  const now = Date.now();
  if (!S.cram) {
    const prevState = card.srs.state;
    const next = schedule(card.srs, g, now);
    store.update((s) => {
      const x = s.cards.find((y) => y.id === card.id);
      if (x) x.srs = next;
      s.reviews.push({ cardId: card.id, ts: now, rating: g, prevState });
      if (s.reviews.length > 20000) s.reviews.splice(0, s.reviews.length - 20000);
    });
  }
  S.history.push({ id: card.id, g });
  S.done++;
  if (g > 1) S.correct++; else S.again++;
  S.queue.shift();
  if (g === 1) S.queue.splice(Math.min(3, S.queue.length), 0, card.id);
  S.flipped = false;
  if (!S.queue.length) S.finished = true;
  if (store.state.settings.haptics) vibrate(g === 1 ? [30, 40, 30] : 12);
  c.rerender();
}

function flip(c) {
  if (!current()) return;
  S.flipped = !S.flipped;
  c.rerender();
}

function exit(c) {
  navigate(c.params.deck === 'alle' ? 'lernen' : `lernen/${c.params.deck}`);
}

function summary(c) {
  const mins = Math.max(1, Math.round((Date.now() - S.started) / 60000));
  const rate = S.done ? Math.round((S.correct / S.done) * 100) : 0;
  if (!S.celebrated && S.done) { S.celebrated = true; setTimeout(() => confetti({ count: 150 }), 150); }
  return html`<div class="study"><div style="flex:1;display:grid;place-items:center"><div class="stack center" style="max-width:420px">
    <div style="font-size:64px">${rate >= 85 ? '🏆' : rate >= 60 ? '💪' : '🌱'}</div>
    <h1>${S.done ? 'Session geschafft!' : 'Nichts fällig'}</h1>
    <p class="muted">${S.done ? `${plural(S.done, 'Karte', 'Karten')} in ${mins} Min · ${rate} % gewusst` : 'Für diesen Stapel ist heute nichts mehr fällig. Du kannst trotzdem pauken – das beeinflusst den Plan nicht.'}</p>
    ${S.done ? html`<div class="stats"><div class="stat-tile"><div class="stat-value">${S.correct}</div><div class="stat-label">gewusst</div></div><div class="stat-tile"><div class="stat-value">${S.again}</div><div class="stat-label">nochmal</div></div><div class="stat-tile"><div class="stat-value">${mins}</div><div class="stat-label">Minuten</div></div></div>` : ''}
    <div class="row wrap" style="justify-content:center">
      <button class="btn btn-primary" data-action="exit">${icon('check')} Fertig</button>
      ${c.params.deck !== 'alle' ? html`<a class="btn btn-soft" href="#/lernen/${c.params.deck}/session?mode=cram&r=${Date.now()}">${icon('zap')} Weiter pauken</a>` : ''}
    </div>
    ${!S.cram && S.done ? html`<p class="tiny muted">FSRS hat die nächsten Wiederholungen eingeplant. Komm morgen wieder vorbei!</p>` : ''}
  </div></div></div>`;
}

export default {
  title: 'Lernen',
  immersive: true,
  render(c) {
    if (!S || S.key !== sessionKey(c) + (c.query.r ?? '')) { build(c); S.key = sessionKey(c) + (c.query.r ?? ''); }
    const card = current();
    if (!card || S.finished) return summary(c);
    const st = store.state;
    const deck = st.decks.find((d) => d.id === card.deckId);
    const total = S.done + S.queue.length;
    const front = S.reverse ? card.back : card.front;
    const back = S.reverse ? card.front : card.back;
    const pv = S.cram ? null : preview(card.srs);
    const isNew = card.srs.state === 'new';
    return html`<div class="study">
      <div class="study-top">
        <button class="icon-btn filled" data-action="exit" aria-label="Beenden">${icon('x')}</button>
        <div class="progress"><div class="progress-bar" style="width:${(S.done / total) * 100}%"></div></div>
        <span class="small semi num muted">${S.queue.length} übrig</span>
      </div>
      <div class="row wrap tiny muted" style="justify-content:center">
        <span>${deck?.name ?? ''}</span>
        ${S.cram ? html`<span class="badge badge-warning">${icon('zap')} Pauken – ohne Wertung</span>` : isNew ? html`<span class="badge badge-accent">Neue Karte</span>` : card.srs.state !== 'review' ? html`<span class="badge badge-warning">Lernphase</span>` : ''}
      </div>
      <div class="flashcard ${S.flipped ? 'flipped' : ''}" data-action="flip" data-swipe>
        <div class="fc-inner">
          <div class="fc-face fc-front"><span class="fc-tag">${S.reverse ? 'Antwort' : 'Frage'}</span><div class="fc-content md">${md(front)}</div><span class="fc-hint hide-mobile">Leertaste zum Umdrehen</span><span class="fc-hint hide-desktop">Tippen zum Umdrehen</span></div>
          <div class="fc-face fc-back"><span class="fc-tag">${S.reverse ? 'Frage' : 'Antwort'}</span><div class="fc-question-small md">${md(front)}</div><div class="fc-content md">${md(back)}</div><span class="fc-hint hide-desktop">← nochmal · gut →</span></div>
        </div>
      </div>
      ${S.flipped ? html`<div class="rate-grid">${RATINGS.map((r) => html`<button class="rate-btn ${r.key}" data-action="rate" data-g="${r.value}" title="Taste ${r.value}">${r.label}<small>${pv ? fmtInterval(pv[r.key]) : r.value === 1 ? 'nochmal' : '✓'}</small></button>`)}</div>`
        : html`<button class="btn btn-primary btn-lg btn-block" data-action="flip">Antwort zeigen</button>`}
    </div>`;
  },
  mount(el, c) {
    let sx = 0, sy = 0, active = false;
    const onStart = (e) => {
      if (!e.target.closest('[data-swipe]')) return;
      active = true;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const onEnd = (e) => {
      if (!active) return;
      active = false;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (S?.flipped && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.preventDefault();
        rate(dx > 0 ? 3 : 1, c);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
      S = null;
    };
  },
  onKey(e, c) {
    if (e.key === 'Escape') { exit(c); return true; }
    if (!current() || S.finished) return false;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (S.flipped) rate(3, c); else flip(c);
      return true;
    }
    if (S.flipped && ['1', '2', '3', '4'].includes(e.key)) { rate(Number(e.key), c); return true; }
    return false;
  },
  actions: {
    flip: (c) => flip(c),
    rate: (c, el, e) => { e.stopPropagation(); rate(Number(el.dataset.g), c); },
    exit: (c) => exit(c),
  },
};
