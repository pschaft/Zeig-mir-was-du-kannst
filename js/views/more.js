// "Mehr": alle Module auf einen Blick (vor allem für die mobile Navigation).
import { html } from '../core/html.js';
import { icon } from '../core/icons.js';
import { today, monthKey } from '../core/date.js';
import { fmtMoney, fmtGrade, plural } from '../core/format.js';
import { dueCounts } from '../logic/srs.js';
import { summary } from '../logic/grades.js';
import { monthSummary } from '../logic/budget.js';
import { balances } from '../logic/split.js';
import { todayProgress } from '../logic/habits.js';

export default {
  title: 'Mehr',
  render({ state }) {
    const dc = state.cards.length ? dueCounts(state.cards, state.reviews, { newLimit: state.settings.newCardsPerDay }) : null;
    const gs = summary(state.modules, { totalEcts: state.profile.totalEcts, rounding: state.settings.gradeRounding });
    const ms = monthSummary(state.budget, monthKey(today()));
    const hp = todayProgress(state.habits);
    let wg = null;
    const g = state.groups[0];
    if (g) { const b = balances(g).get(g.meId) ?? 0; wg = b; }
    const planToday = state.plan.blocks.filter((b) => b.date === today() && !b.done).length;
    const items = [
      { to: 'lernen', icon: 'cards', color: '#8e4ec6', title: 'Karteikarten', desc: dc ? (dc.total ? `${dc.total} Karten fällig` : 'Alles wiederholt ✓') : 'Spaced Repetition mit FSRS' },
      { to: 'lernplan', icon: 'route', color: '#0b84e3', title: 'Lernplan', desc: planToday ? `${planToday} Lernblöcke für heute` : 'Automatischer Plan bis zur Prüfung' },
      { to: 'noten', icon: 'grad', color: '#2f9e5b', title: 'Noten', desc: gs.avg ? `Schnitt ${fmtGrade(gs.avg, 2)} · ${gs.doneEcts}/${gs.totalEcts} ECTS` : 'Notenschnitt & Zielrechner' },
      { to: 'budget', icon: 'wallet', color: '#ee6b12', title: 'Budget', desc: state.budget.transactions.length ? `${fmtMoney(ms.remaining)} übrig diesen Monat` : 'Ausgaben & Tagesbudget' },
      { to: 'wg', icon: 'users', color: '#d6409f', title: 'WG-Kasse', desc: wg == null ? 'Gemeinsame Kosten fair teilen' : wg === 0 ? 'Alles ausgeglichen ✓' : wg > 0 ? `Du bekommst ${fmtMoney(wg)}` : `Du schuldest ${fmtMoney(-wg)}` },
      { to: 'gewohnheiten', icon: 'flame', color: '#e5484d', title: 'Gewohnheiten', desc: hp.planned ? `${hp.done}/${hp.planned} heute erledigt` : 'Routinen & Serien' },
      { to: 'werkzeuge', icon: 'toolbox', color: '#12a594', title: 'Werkzeuge', desc: 'Wortzähler, Zitieren, Notenschlüssel, Glücksrad …' },
      { to: 'einstellungen', icon: 'settings', color: '#687076', title: 'Einstellungen', desc: 'Semester, Design, Backup & Daten' },
    ];
    return html`
      <header class="page-head"><div class="titles"><h1>Mehr</h1><p class="page-sub">Alle Module von Unikram</p></div>
        <div class="page-actions"><button class="icon-btn filled" data-action="palette" aria-label="Suchen">${icon('search')}</button></div></header>
      <div class="more-grid">${items.map((it) => html`
        <a class="card clickable tool-card" href="#/${it.to}" style="--c:${it.color}">
          <span class="tc-icon">${icon(it.icon)}</span>
          <span style="min-width:0"><div class="tc-title">${it.title}</div><div class="tc-desc">${it.desc}</div></span>
        </a>`)}</div>
      <p class="center tiny muted mt-24">Unikram · alle Daten bleiben auf diesem Gerät · ${plural(state.tasks.length + state.cards.length + state.budget.transactions.length, 'Eintrag', 'Einträge')}</p>`;
  },
};
