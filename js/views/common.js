// Briques d'interface partagées par les pages.

import { h, posBadge, fmtInt } from '../util.js';

export function pageHead(title, sub, right) {
  return h('header', { class: 'page-head' },
    h('div', null, h('h1', null, title), sub ? h('p', { class: 'sub' }, sub) : null),
    right ? h('div', { class: 'page-actions' }, right) : null);
}

export function link(href, text, cls) {
  return h('a', { href, class: cls || null }, text);
}
export const driverLink = (d, text) => link(`#/pilotes/${d.id || d.driverId}`, text || d.full || d.last);
export const teamLink = (id, name) => link(`#/ecuries/${id}`, name);

export function select({ id, label, options, value, onChange }) {
  const sel = h('select', { id }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'field', for: id }, h('span', null, label), sel);
}

export function gpSelect(S, current, onChange, { only } = {}) {
  const list = S.races.filter((r) => (only ? only(r) : true));
  return select({
    id: 'gp-select', label: 'Grand Prix', value: current,
    options: list.map((r) => ({ value: r.round, label: `${r.round}. ${r.title}` })),
    onChange,
  });
}

// Tableau générique. cols = [{label, key|get, align, cls, num}] ; get(row,i) peut renvoyer un Node.
export function table(cols, rows, { caption, rowClass, className } = {}) {
  const t = h('table', { class: 'tbl ' + (className || '') },
    caption ? h('caption', { class: 'sr' }, caption) : null,
    h('thead', null, h('tr', null, cols.map((c) => h('th', { scope: 'col', class: (c.align === 'l' ? 'l ' : '') + (c.hide || ''), title: c.title || null }, c.label)))),
    h('tbody', null, rows.map((r, i) => h('tr', { class: rowClass ? rowClass(r, i) : null },
      cols.map((c) => {
        const v = c.get ? c.get(r, i) : r[c.key];
        return h('td', { class: (c.align === 'l' ? 'l ' : '') + (c.cls || '') + (c.hide ? ' ' + c.hide : '') }, v == null || v === '' ? '–' : v);
      })))));
  return h('div', { class: 'scroll' }, t);
}

export function tiles(items) {
  return h('div', { class: 'tiles' }, items.map((t) => h('div', { class: 'tile' },
    h('span', { class: 'tv' }, t.value == null ? '–' : t.value),
    h('span', { class: 'tl' }, t.label),
    t.sub ? h('span', { class: 'ts' }, t.sub) : null)));
}

// Tour de chronométrage : classement compact, style écran de direction de course.
export function tower(rows, { onPick } = {}) {
  return h('ol', { class: 'tower' }, rows.map((r) => h('li', { class: r.pos === 1 ? 'lead' : null },
    posBadge(r.pos),
    h('span', { class: 'who' },
      h('a', { href: r.href }, h('b', { class: 'code' }, r.code), h('span', { class: 'nm' }, r.name)),
      r.sub ? h('small', null, r.sub) : null),
    h('span', { class: 'pts' }, r.pts))));
}

export function podiumChip(r) {
  return h('li', null, posBadge(r.pos), h('span', { class: 'who' }, h('b', null, r.full), h('small', null, r.team)),
    h('span', { class: 'pts' }, r.time && r.pos !== 1 ? r.time : r.time || ''));
}

export function emptyState(title, text) {
  return h('div', { class: 'empty' }, h('strong', null, title), text ? h('p', null, text) : null);
}

// Onglets à contenu chargé à la demande : build() peut renvoyer un Node ou une promesse.
export function tabs(defs, { start = 0, label = 'Sections' } = {}) {
  const list = h('div', { class: 'tablist', role: 'tablist', 'aria-label': label });
  const panel = h('div', { class: 'tabpanel', role: 'tabpanel', tabindex: '0' });
  const built = new Map();
  let current = -1;
  const buttons = defs.map((d, i) => {
    const b = h('button', { type: 'button', role: 'tab', id: `tab-${d.id}`, 'aria-selected': 'false', tabindex: '-1' }, d.label);
    b.addEventListener('click', () => show(i));
    b.addEventListener('keydown', (e) => {
      let k = i;
      if (e.key === 'ArrowRight') k = (i + 1) % defs.length;
      else if (e.key === 'ArrowLeft') k = (i - 1 + defs.length) % defs.length;
      else return;
      e.preventDefault();
      show(k);
      buttons[k].focus();
    });
    list.append(b);
    return b;
  });
  async function show(i) {
    if (i === current) return;
    current = i;
    buttons.forEach((b, k) => { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
    panel.setAttribute('aria-labelledby', `tab-${defs[i].id}`);
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    if (built.has(i)) { panel.append(built.get(i)); return; }
    panel.append(h('div', { class: 'loading', role: 'status' }, h('span', { class: 'dot' }), 'Chargement…'));
    let node;
    try { node = await defs[i].build(); } catch (e) { node = h('div', { class: 'unavail' }, h('strong', null, 'Données indisponibles'), h('span', null, (e && e.message) || '')); }
    if (current !== i) return;
    built.set(i, node);
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    panel.append(node);
  }
  show(Math.min(start, defs.length - 1));
  return h('div', { class: 'tabs' }, list, panel);
}

export const initials = (d) => d.code;
export const pts = (v) => (v == null ? '–' : fmtInt(v));
