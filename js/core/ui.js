// UI-Bausteine: Dialog/Bottom-Sheet, generische Formulare, Bestätigungen, Menüs, Toasts.
import { html, raw } from './html.js';
import { icon } from './icons.js';
import { WD } from './date.js';
import { moneyInput, parseMoney } from './format.js';
import { COURSE_COLORS } from '../logic/state.js';

let seq = 0;
const openDialogs = new Set();

export function anyDialogOpen() { return openDialogs.size > 0; }

/** Basis-Dialog. Gibt {el, close} zurück. */
export function openDialog({ content, className = 'sheet', wide = false, onClose, label = 'Dialog' }) {
  const dlg = document.createElement('dialog');
  dlg.className = `${className}${wide ? ' wide' : ''}`;
  dlg.setAttribute('aria-label', label);
  dlg.innerHTML = String(content);
  document.body.append(dlg);
  openDialogs.add(dlg);
  dlg.showModal();
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    openDialogs.delete(dlg);
    dlg.classList.add('closing');
    const finish = () => { try { dlg.close(); } catch { /* */ } dlg.remove(); };
    setTimeout(finish, 190);
    onClose?.(result);
  };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
  dlg.addEventListener('mousedown', (e) => { dlg._downOnBackdrop = e.target === dlg; });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg && dlg._downOnBackdrop) close(null);
    if (e.target.closest('[data-close]')) close(null);
  });
  return { el: dlg, close };
}

function sheetShell({ title, body, foot, formTag = true }) {
  const inner = html`
    <div class="sheet-grip"></div>
    <header class="sheet-head">
      <h2>${title}</h2>
      <button type="button" class="icon-btn sm" data-close aria-label="Schließen">${icon('x')}</button>
    </header>
    <div class="sheet-body">${body}</div>
    ${foot ? html`<footer class="sheet-foot">${foot}</footer>` : ''}`;
  return formTag ? html`<form class="sheet-form" novalidate autocomplete="off">${inner}</form>` : html`<div class="sheet-form">${inner}</div>`;
}

/* ---------------- Formular-Felder ---------------- */

export const GRADES = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0];

function flat(fields) {
  const out = [];
  for (const f of fields) {
    if (!f) continue;
    if (f.type === 'row') out.push(...flat(f.fields));
    else out.push(f);
  }
  return out;
}

function renderField(f) {
  if (!f) return '';
  if (f.type === 'row') return html`<div class="field-row" data-field="${f.name ?? ''}">${f.fields.map(renderField)}</div>`;
  if (f.type === 'section') return html`<div class="section-title" data-field="${f.name ?? ''}">${f.label}</div>`;
  if (f.type === 'html') return html`<div class="field" data-field="${f.name ?? ''}">${f.html}</div>`;
  const id = `f_${f.name}_${++seq}`;
  const label = f.label ? html`<label class="label" for="${id}">${f.label}</label>` : '';
  const v = f.value;
  let control;
  switch (f.type) {
    case 'textarea':
      control = html`<textarea class="textarea" id="${id}" name="${f.name}" rows="${f.rows ?? 4}" placeholder="${f.placeholder ?? ''}" ${f.autofocus ? 'autofocus' : ''}>${v ?? ''}</textarea>`;
      break;
    case 'select':
      control = html`<select class="select" id="${id}" name="${f.name}">${f.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${o.label}</option>`)}</select>`;
      break;
    case 'money':
      control = html`<div class="input-group"><input class="input" id="${id}" name="${f.name}" inputmode="decimal" placeholder="${f.placeholder ?? '0,00'}" value="${moneyInput(v)}" style="padding-left:14px;padding-right:38px" ${f.autofocus ? 'autofocus' : ''}><span class="input-suffix">€</span></div>`;
      break;
    case 'color':
      control = html`<div class="swatches">${(f.options ?? COURSE_COLORS).map((c) => html`<label class="swatch" style="--c:${c}"><input type="radio" name="${f.name}" value="${c}" ${c === v ? 'checked' : ''} aria-label="Farbe ${c}"><span></span></label>`)}</div>`;
      break;
    case 'segmented':
      control = html`<div class="seg">${f.options.map((o) => html`<label><input type="radio" name="${f.name}" value="${o.value}" ${String(o.value) === String(v) ? 'checked' : ''}>${o.label}</label>`)}</div>`;
      break;
    case 'checkboxes':
      control = html`<div class="toggle-grid">${f.options.map((o) => html`<label class="toggle-pill"><input type="checkbox" name="${f.name}" value="${o.value}" ${(v ?? []).map(String).includes(String(o.value)) ? 'checked' : ''}><span>${o.label}</span></label>`)}</div>`;
      break;
    case 'weekdays':
      control = html`<div class="toggle-grid">${WD.map((d, i) => html`<label class="toggle-pill"><input type="checkbox" name="${f.name}" value="${i}" ${(v ?? []).map(Number).includes(i) ? 'checked' : ''}><span>${d}</span></label>`)}</div>`;
      break;
    case 'switch':
      control = html`<label class="row-between" style="cursor:pointer"><span class="small muted">${f.text ?? ''}</span><span class="switch"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}><span></span></span></label>`;
      break;
    case 'grade': {
      const opts = f.allowEmpty === false ? GRADES : [null, ...GRADES];
      control = html`<div class="grade-picker">${opts.map((g) => html`<label><input type="radio" name="${f.name}" value="${g ?? ''}" ${(g ?? null) === (v ?? null) ? 'checked' : ''}><span style="${g ? `--c:${gradeColor(g)}` : ''}">${g ? g.toFixed(1).replace('.', ',') : '–'}</span></label>`)}</div>`;
      break;
    }
    case 'range':
      control = html`<div class="row"><input type="range" id="${id}" name="${f.name}" min="${f.min ?? 0}" max="${f.max ?? 100}" step="${f.step ?? 1}" value="${v ?? 0}" data-suffix="${f.suffix ?? ''}"><output class="num semi" style="min-width:64px;text-align:right">${v ?? 0}${f.suffix ? ' ' + f.suffix : ''}</output></div>`;
      break;
    case 'number':
      control = html`<input class="input" id="${id}" name="${f.name}" type="text" inputmode="${f.integer ? 'numeric' : 'decimal'}" value="${v ?? ''}" placeholder="${f.placeholder ?? ''}" ${f.autofocus ? 'autofocus' : ''}>`;
      break;
    default:
      control = html`<input class="input" id="${id}" name="${f.name}" type="${f.type ?? 'text'}" value="${v ?? ''}" placeholder="${f.placeholder ?? ''}" ${f.autofocus ? 'autofocus' : ''} ${f.list ? raw(`list="${id}_list"`) : ''} ${f.maxlength ? raw(`maxlength="${f.maxlength}"`) : ''}>${f.list ? html`<datalist id="${id}_list">${f.list.map((o) => html`<option value="${o}"></option>`)}</datalist>` : ''}`;
  }
  return html`<div class="field" data-field="${f.name}">${label}${control}${f.hint ? html`<div class="hint">${f.hint}</div>` : ''}<div class="error-text" hidden></div></div>`;
}

export function gradeColor(g) {
  if (g == null) return 'var(--muted)';
  if (g <= 1.5) return '#1f9d55';
  if (g <= 2.5) return '#5fa30f';
  if (g <= 3.5) return '#d99a00';
  if (g <= 4.0) return '#ee6b12';
  return '#e5484d';
}

function collect(formEl, fields) {
  const fd = new FormData(formEl);
  const out = {};
  for (const f of flat(fields)) {
    if (!f.name || f.type === 'html' || f.type === 'section') continue;
    switch (f.type) {
      case 'checkboxes': out[f.name] = fd.getAll(f.name).map(String); break;
      case 'weekdays': out[f.name] = fd.getAll(f.name).map(Number); break;
      case 'switch': out[f.name] = fd.has(f.name); break;
      case 'number': case 'range': {
        const raw = String(fd.get(f.name) ?? '').trim().replace(',', '.');
        out[f.name] = raw === '' ? null : Number(raw);
        break;
      }
      case 'money': out[f.name] = parseMoney(fd.get(f.name)); break;
      case 'grade': { const g = fd.get(f.name); out[f.name] = g ? Number(g) : null; break; }
      default: out[f.name] = String(fd.get(f.name) ?? '').trim();
    }
  }
  return out;
}

function validate(formEl, fields, values, custom) {
  let ok = true;
  formEl.querySelectorAll('.error-text').forEach((e) => { e.hidden = true; e.textContent = ''; });
  formEl.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
  const fail = (name, msg) => {
    ok = false;
    const box = formEl.querySelector(`[data-field="${CSS.escape(name)}"]`);
    if (!box) return;
    const err = box.querySelector('.error-text');
    if (err) { err.textContent = msg; err.hidden = false; }
    box.querySelector('.input, .select, .textarea')?.classList.add('invalid');
  };
  for (const f of flat(fields)) {
    if (!f.name) continue;
    const box = formEl.querySelector(`[data-field="${CSS.escape(f.name)}"]`);
    if (box?.hidden) continue;
    const v = values[f.name];
    if (f.required && (v == null || v === '' || (Array.isArray(v) && !v.length))) {
      fail(f.name, f.type === 'money' ? 'Bitte gib einen gültigen Betrag ein.' : 'Pflichtfeld');
      continue;
    }
    if (f.type === 'money' && v == null && formEl.elements[f.name]?.value?.trim()) fail(f.name, 'Ungültiger Betrag');
    if ((f.type === 'number' || f.type === 'range') && v != null) {
      if (!Number.isFinite(v)) fail(f.name, 'Bitte eine Zahl eingeben.');
      else if (f.min != null && v < f.min) fail(f.name, `Mindestens ${f.min}`);
      else if (f.max != null && v > f.max) fail(f.name, `Höchstens ${f.max}`);
      else if (f.integer && !Number.isInteger(v)) fail(f.name, 'Bitte eine ganze Zahl eingeben.');
    }
  }
  if (ok && custom) {
    const errs = custom(values);
    if (errs) for (const [k, msg] of Object.entries(errs)) fail(k, msg);
  }
  if (!ok) formEl.querySelector('.invalid, .error-text:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return ok;
}

/**
 * Generisches Formular als Bottom-Sheet.
 * Resolves mit Werten-Objekt, null (abgebrochen) oder 'delete'.
 */
export function form({ title, fields, submitLabel = 'Speichern', cancelLabel = 'Abbrechen', danger, intro, wide, validate: customValidate, onMount, onChange }) {
  return new Promise((resolve) => {
    const body = html`${intro ? html`<p class="muted small mb-16">${intro}</p>` : ''}${fields.map(renderField)}`;
    const foot = html`
      ${danger ? html`<button type="button" class="btn btn-danger-ghost" data-danger>${icon('trash', 'sm')}<span class="hide-mobile">${danger}</span></button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn btn-ghost hide-mobile" data-close>${cancelLabel}</button>
      <button type="submit" class="btn btn-primary">${submitLabel}</button>`;
    let result = null;
    const { el, close } = openDialog({ content: sheetShell({ title, body, foot }), wide, label: title, onClose: () => resolve(result) });
    const formEl = el.querySelector('form');
    const refresh = () => {
      formEl.querySelectorAll('input[type=range]').forEach((r) => {
        const o = r.nextElementSibling;
        if (o?.tagName === 'OUTPUT') o.textContent = r.value + (r.dataset.suffix ? ' ' + r.dataset.suffix : '');
      });
      const values = collect(formEl, fields);
      for (const f of fields.flatMap((x) => (x?.type === 'row' ? [x, ...x.fields] : [x]))) {
        if (!f?.show) continue;
        const box = formEl.querySelector(`[data-field="${CSS.escape(f.name ?? '')}"]`);
        if (box) box.hidden = !f.show(values);
      }
      onChange?.(values, el);
    };
    formEl.addEventListener('input', refresh);
    formEl.addEventListener('change', refresh);
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = collect(formEl, fields);
      if (!validate(formEl, fields, values, customValidate)) return;
      result = values;
      close(values);
    });
    el.querySelector('[data-danger]')?.addEventListener('click', () => { result = 'delete'; close('delete'); });
    refresh();
    onMount?.(el, formEl, { collect: () => collect(formEl, fields), close: (v) => { result = v; close(v); } });
    const af = formEl.querySelector('[autofocus]');
    if (af && matchMedia('(pointer: fine)').matches) setTimeout(() => af.focus(), 60);
  });
}

/** Ja/Nein-Abfrage. */
export function confirm({ title = 'Bist du sicher?', message = '', confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const body = message ? html`<p class="muted">${message}</p>` : '';
    const foot = html`<span class="spacer"></span><button type="button" class="btn btn-ghost" data-close>${cancelLabel}</button><button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${confirmLabel}</button>`;
    const { el, close } = openDialog({ content: sheetShell({ title, body, foot }), label: title, onClose: () => resolve(ok) });
    el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); ok = true; close(true); });
    setTimeout(() => el.querySelector('[type=submit]')?.focus(), 50);
  });
}

/** Aktionsmenü (Action Sheet). items: [{icon, label, sub, color, onClick, danger}] */
export function menu({ title, items }) {
  const body = html`<div class="menu-list">${items.filter(Boolean).map((it, i) => html`
    <button type="button" class="menu-item" data-i="${i}" style="${it.color ? `--c:${it.color}` : ''}${it.danger ? ';color:var(--danger)' : ''}">
      <span class="mi-icon">${it.emoji ? html`<span class="emoji">${it.emoji}</span>` : icon(it.icon ?? 'arrowRight')}</span>
      <span>${it.label}${it.sub ? html`<span class="mi-sub">${it.sub}</span>` : ''}</span>
    </button>`)}</div>`;
  const list = items.filter(Boolean);
  const { el, close } = openDialog({ content: sheetShell({ title, body, formTag: false }), label: title });
  el.querySelectorAll('.menu-item').forEach((b) => b.addEventListener('click', () => {
    close();
    setTimeout(() => list[Number(b.dataset.i)].onClick?.(), 10);
  }));
}

/** Freier Inhalt im Sheet (z. B. Vorschau, Teilen). */
export function sheet({ title, body, foot, wide, onMount }) {
  const d = openDialog({ content: sheetShell({ title, body, foot, formTag: false }), wide, label: title });
  onMount?.(d.el, d.close);
  return d;
}

/* ---------------- Toasts ---------------- */

export function toast(message, { type = 'info', action, timeout = 3200, iconName } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', 'status');
  const ic = iconName ?? (type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info');
  el.innerHTML = String(html`${icon(ic)}<span>${message}</span>${action ? html`<button class="toast-action" type="button">${action.label}</button>` : ''}`);
  box.append(el);
  let t;
  const remove = () => { clearTimeout(t); el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  t = setTimeout(remove, action ? Math.max(timeout, 5500) : timeout);
  el.querySelector('.toast-action')?.addEventListener('click', () => { remove(); action.onClick(); });
  return remove;
}
