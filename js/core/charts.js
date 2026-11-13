// Diagramme: CSS-basierte Balken (gestochen scharf in jeder Breite), SVG-Donuts/Ringe, Heatmaps.
import { html, raw } from './html.js';
import { esc } from './html.js';

/**
 * Balkendiagramm.
 * data: [{ label, value, color?, highlight?, title?, segments?: [{value, color}] }]
 */
export function bars({ data, height = 120, goal = null, format = (v) => String(Math.round(v)), showValues = true, max = null }) {
  const m = Math.max(max ?? 0, goal ?? 0, ...data.map((d) => d.value || 0), 1);
  const goalPx = goal ? Math.round((goal / m) * height) : null;
  return html`<div class="bars" style="--h:${height}px">
    ${goalPx != null ? html`<div class="bars-goal" style="bottom:${goalPx + 24}px" title="Ziel"></div>` : ''}
    ${data.map((d) => {
      const h = Math.round(((d.value || 0) / m) * height);
      const segs = d.segments?.filter((s) => s.value > 0);
      return html`<div class="bar-col ${d.highlight ? 'hl' : ''}" title="${d.title ?? `${d.label}: ${format(d.value || 0)}`}">
        <span class="bar-val">${showValues && d.value ? format(d.value) : ''}</span>
        <div class="bar-fill ${d.value ? '' : 'zero'}" style="height:${Math.max(h, 3)}px;${d.color ? `--c:${d.color}` : ''}">
          ${segs?.length ? segs.map((s) => html`<i style="flex:${s.value};background:${s.color}"></i>`) : ''}
        </div>
        <span class="bar-lbl">${d.label}</span>
      </div>`;
    })}
  </div>`;
}

/** Donut. segments: [{ value, color, label }] */
export function donut({ segments, size = 148, thickness = 18, center = '' }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2, c = 2 * Math.PI * r, cx = size / 2;
  let offset = 0;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 2.5 : 0;
  const circles = total > 0 ? segments.filter((s) => s.value > 0).map((s) => {
    const len = (s.value / total) * c;
    const dash = Math.max(len - gap, 0.5);
    const out = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${esc(s.color)}" stroke-width="${thickness}" stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cx})"><title>${esc(s.label ?? '')}</title></circle>`;
    offset += len;
    return out;
  }).join('') : '';
  return html`<div class="ring-wrap" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="ring-track" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${thickness}"/>${raw(circles)}</svg>
    <div class="ring-label">${center}</div>
  </div>`;
}

/** Fortschrittsring 0..1 */
export function ring({ value, size = 64, thickness = 7, color = null, center = '' }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = (size - thickness) / 2, c = 2 * Math.PI * r, cx = size / 2;
  return html`<div class="ring-wrap" style="width:${size}px;height:${size}px;${color ? `--c:${color}` : ''}">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle class="ring-track" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${thickness}"/>
      <circle class="ring-val" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" ${v === 0 ? 'opacity="0"' : ''}/>
    </svg>
    <div class="ring-label">${center}</div>
  </div>`;
}

/**
 * Heatmap im GitHub-Stil (CSS-Grid, Spalten = Wochen, Zeilen = Mo–So).
 * days: [{ date, level (0–4), title, off }] beginnend an einem Montag.
 */
export function heatmap({ days, color = 'var(--accent)', monthLabels = true }) {
  const weeks = Math.ceil(days.length / 7);
  const months = [];
  if (monthLabels) {
    let last = null;
    for (let w = 0; w < weeks; w++) {
      const d = days[w * 7];
      if (!d) continue;
      const mo = Number(d.date.slice(5, 7));
      if (mo !== last) { months.push({ w, label: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][mo - 1] }); last = mo; }
    }
  }
  return html`<div class="hm-wrap" style="--c:${color};--weeks:${weeks}">
    ${monthLabels ? html`<div class="hm-months">${months.map((m) => html`<span style="grid-column:${m.w + 1}">${m.label}</span>`)}</div>` : ''}
    <div class="hm">${days.map((d) => html`<i class="${d.off ? 'off' : `l${d.level || 0}`}${d.today ? ' today' : ''}" title="${d.title ?? d.date}"></i>`)}</div>
  </div>`;
}

/** Horizontaler Mini-Balken mit Wert (für Listen). */
export function meter(value, max, color) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return html`<div class="progress sm ${value > max && max > 0 ? 'over' : ''}" style="${color ? `--c:${color}` : ''}"><div class="progress-bar" style="width:${p}%"></div></div>`;
}
