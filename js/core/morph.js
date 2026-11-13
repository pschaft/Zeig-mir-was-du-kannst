// Leichtgewichtiges DOM-Morphing (inspiriert von morphdom).
// Re-Render ganzer Views ohne Fokus-, Scroll- oder Eingabeverlust.
// - data-key="..."     → stabile Identität für Listenelemente
// - data-morph-skip    → Kinder dieses Elements werden nicht angefasst

const getKey = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);
const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName;

export function morph(target, htmlString) {
  const tpl = document.createElement('template');
  tpl.innerHTML = htmlString;
  morphChildren(target, tpl.content);
}

function morphChildren(from, to) {
  const keyed = new Map();
  for (let c = from.firstChild; c; c = c.nextSibling) {
    const k = getKey(c);
    if (k != null) keyed.set(k, c);
  }
  let cur = from.firstChild;
  let n = to.firstChild;
  while (n) {
    const next = n.nextSibling;
    const k = getKey(n);
    let match = null;
    if (k != null) {
      const m = keyed.get(k);
      if (m && same(m, n)) { match = m; keyed.delete(k); }
    } else if (cur && getKey(cur) == null && same(cur, n)) {
      match = cur;
    }
    if (match) {
      if (match === cur) cur = cur.nextSibling;
      else from.insertBefore(match, cur);
      morphNode(match, n);
    } else {
      from.insertBefore(n, cur);
    }
    n = next;
  }
  while (cur) {
    const nx = cur.nextSibling;
    from.removeChild(cur);
    cur = nx;
  }
}

function morphNode(from, to) {
  if (from.nodeType === 3 || from.nodeType === 8) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  if (from.nodeType !== 1) return;
  syncAttrs(from, to);
  const tag = from.nodeName;
  if (tag === 'INPUT') return syncInput(from, to);
  if (tag === 'TEXTAREA') {
    if (to.hasAttribute('data-sync') && document.activeElement !== from) from.value = to.textContent;
    return;
  }
  if (from.hasAttribute('data-morph-skip')) return;
  morphChildren(from, to);
  if (tag === 'SELECT') syncSelect(from, to);
}

function syncAttrs(from, to) {
  const fa = from.attributes;
  for (let i = fa.length - 1; i >= 0; i--) {
    const name = fa[i].name;
    if (!to.hasAttribute(name)) {
      if (from.nodeName === 'DETAILS' && name === 'open') continue;
      from.removeAttribute(name);
    }
  }
  const ta = to.attributes;
  for (let i = 0; i < ta.length; i++) {
    const { name, value } = ta[i];
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }
}

function syncInput(from, to) {
  const type = from.type;
  if (type === 'checkbox' || type === 'radio') {
    from.checked = to.hasAttribute('checked');
  } else if (to.hasAttribute('value') && document.activeElement !== from) {
    const v = to.getAttribute('value');
    if (from.value !== v) from.value = v;
  }
}

function syncSelect(from, to) {
  if (document.activeElement === from) return;
  const sel = to.querySelector('option[selected]');
  if (sel) from.value = sel.getAttribute('value') ?? sel.textContent;
}
