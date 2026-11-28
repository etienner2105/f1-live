// Graphiques SVG et barres HTML, sans dépendance.

import { h, s, clear, niceStep, minus } from './util.js';

// Courbes : series = [{id, name, color, values:[n|null,…]}], labels = libellés d'axe, titles = titres d'infobulle.
export function lineChart({ series, labels, titles, yFmt = (v) => minus(Math.round(v)), reverse = false, zero = false, height = 320, ariaLabel = 'Graphique', delta = (v) => '' }) {
  let data = series;
  const host = h('div', { class: 'chartbox', tabindex: '0', role: 'group', 'aria-label': ariaLabel });
  const tip = h('div', { class: 'tip', hidden: true });
  let L = null;
  let active = Math.max(0, labels.length - 1);
  let hovering = false;
  const n = labels.length;

  function draw() {
    const old = host.querySelector('svg');
    if (old) old.remove();
    const W = Math.max(host.clientWidth, 280);
    const narrow = W < 560;
    const H = narrow ? Math.round(height * 0.85) : height;
    const m = { l: narrow ? 38 : 46, r: narrow ? 14 : 18, t: 10, b: 28 };
    const vals = data.flatMap((d) => d.values).filter((v) => v != null);
    let lo = vals.length ? Math.min(...vals) : 0;
    let hi = vals.length ? Math.max(...vals) : 10;
    if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (hi - lo < 4) hi = lo + 4;
    const step = niceStep((hi - lo) / 5);
    const y0 = Math.floor(lo / step) * step;
    const y1 = Math.ceil(hi / step) * step;
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const span = Math.max(n - 1, 1);
    const X = (i) => m.l + (n === 1 ? iw / 2 : (i * iw) / span);
    const Y = (v) => {
      const f = (v - y0) / (y1 - y0);
      return m.t + (reverse ? f : 1 - f) * ih;
    };
    L = { m, iw, span, X, Y, W, H };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel });
    host.insertBefore(svg, tip);
    for (let t = y0; t <= y1 + 1e-9; t += step) {
      const yy = Y(t);
      svg.append(s('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy, class: t === 0 && zero ? 'axis' : 'grid' }));
      svg.append(s('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end' }, yFmt(t)));
    }
    const every = narrow ? Math.ceil(n / 7) : n > 24 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      if (i % every !== 0 && i !== n - 1) continue;
      svg.append(s('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, labels[i]));
    }
    data.forEach((d) => {
      let p = '';
      let started = false;
      d.values.forEach((v, i) => {
        if (v == null) { started = false; return; }
        p += `${started ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
        started = true;
      });
      if (p) svg.append(s('path', { d: p, class: 'line', style: `stroke:${d.color}` }));
      const lastI = d.values.reduce((a, v, i) => (v != null ? i : a), -1);
      if (lastI >= 0) svg.append(s('circle', { cx: X(lastI), cy: Y(d.values[lastI]), r: 4, class: 'enddot', style: `fill:${d.color}` }));
    });
    L.cross = s('line', { y1: m.t, y2: m.t + ih, class: 'cross', visibility: 'hidden' });
    svg.append(L.cross);
    L.dots = data.map((d) => s('circle', { r: 4, class: 'enddot', style: `fill:${d.color}`, visibility: 'hidden' }));
    L.dots.forEach((c) => svg.append(c));
    setActive(Math.min(active, n - 1), hovering || document.activeElement === host);
  }

  function setActive(i, show) {
    active = i;
    if (!L) return;
    if (!show || !n) {
      L.cross.setAttribute('visibility', 'hidden');
      L.dots.forEach((c) => c.setAttribute('visibility', 'hidden'));
      tip.hidden = true;
      return;
    }
    const x = L.X(i);
    L.cross.setAttribute('x1', x); L.cross.setAttribute('x2', x); L.cross.setAttribute('visibility', 'visible');
    const rows = [];
    data.forEach((d, k) => {
      const v = d.values[i];
      const c = L.dots[k];
      if (v == null) { c.setAttribute('visibility', 'hidden'); return; }
      c.setAttribute('cx', x); c.setAttribute('cy', L.Y(v)); c.setAttribute('visibility', 'visible');
      rows.push({ d, v });
    });
    rows.sort((a, b) => (reverse ? a.v - b.v : b.v - a.v));
    clear(tip);
    tip.append(h('div', { class: 't' }, titles ? titles[i] : labels[i]));
    rows.forEach(({ d, v }) => tip.append(h('div', { class: 'r' },
      h('span', { class: 'key', style: { borderTopColor: d.color } }),
      h('b', null, yFmt(v)),
      h('i', null, delta(d, i)),
      h('span', { class: 'n' }, d.name))));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = x + 14;
    if (left + tw > L.W) left = x - 14 - tw;
    tip.style.left = Math.max(0, left) + 'px';
  }

  const idxOf = (e) => {
    const r = host.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.round((e.clientX - r.left - L.m.l) / (L.iw / L.span));
    return Math.max(0, Math.min(n - 1, i));
  };
  host.addEventListener('pointermove', (e) => { if (!L) return; hovering = true; setActive(idxOf(e), true); });
  host.addEventListener('pointerdown', (e) => { if (!L) return; hovering = true; setActive(idxOf(e), true); });
  host.addEventListener('pointerleave', () => { hovering = false; setActive(active, document.activeElement === host); });
  host.addEventListener('focus', () => setActive(active, true));
  host.addEventListener('blur', () => setActive(active, hovering));
  host.addEventListener('keydown', (e) => {
    let i = active;
    if (e.key === 'ArrowLeft') i = Math.max(0, i - 1);
    else if (e.key === 'ArrowRight') i = Math.min(n - 1, i + 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    setActive(i, true);
  });

  host.append(tip);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(() => {
      const w = host.clientWidth;
      if (w && w !== lastW) { lastW = w; draw(); }
    }).observe(host);
  } else window.addEventListener('resize', draw);
  host.setSeries = (next) => { data = next; draw(); };
  requestAnimationFrame(draw);
  return host;
}

// Légende à bascule : chaque entrée masque ou affiche sa courbe (au moins une reste visible).
export function legend(series, onChange) {
  const hidden = new Set();
  const wrap = h('div', { class: 'legend' });
  series.forEach((d) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'true' },
      h('span', { class: 'key', style: { borderTopColor: d.color } }), h('span', null, d.name));
    b.addEventListener('click', () => {
      const on = !hidden.has(d.id);
      if (on && series.length - hidden.size <= 1) return;
      if (on) hidden.add(d.id); else hidden.delete(d.id);
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      onChange(series.filter((x) => !hidden.has(x.id)));
    });
    wrap.append(b);
  });
  return wrap;
}

// Duel : deux colonnes de barres de part et d'autre d'un libellé. rows = [{label, a, b, fmt, lower}]
export function duel(rows, nameA, nameB) {
  const wrap = h('div', { class: 'duel', role: 'table', 'aria-label': `${nameA} contre ${nameB}` });
  rows.forEach((r) => {
    const av = r.a, bv = r.b;
    const ok = av != null && bv != null;
    const max = ok ? Math.max(Math.abs(av), Math.abs(bv), 1e-9) : 1;
    const fa = ok ? Math.abs(av) / max : 0, fb = ok ? Math.abs(bv) / max : 0;
    const winA = ok && av !== bv && (r.lower ? av < bv : av > bv);
    const winB = ok && av !== bv && (r.lower ? bv < av : bv > av);
    const fmt = r.fmt || ((v) => (v == null ? '–' : String(v)));
    wrap.append(h('div', { class: 'duel-row', role: 'row' },
      h('div', { class: 'duel-side a' + (winA ? ' win' : ''), role: 'cell' },
        h('span', { class: 'v' }, fmt(av)),
        h('span', { class: 'bar' }, h('i', { style: { width: (fa * 100).toFixed(1) + '%', background: 'var(--c1)' } }))),
      h('div', { class: 'duel-label', role: 'rowheader' }, r.label),
      h('div', { class: 'duel-side b' + (winB ? ' win' : ''), role: 'cell' },
        h('span', { class: 'bar' }, h('i', { style: { width: (fb * 100).toFixed(1) + '%', background: 'var(--c2)' } })),
        h('span', { class: 'v' }, fmt(bv)))));
  });
  return wrap;
}

// Barres horizontales simples : items = [{label, sub, value, text, mark}] ; value >= 0.
export function hbars(items, { max } = {}) {
  const top = max != null ? max : Math.max(...items.map((i) => i.value || 0), 1e-9);
  return h('div', { class: 'hbars' }, items.map((it) => h('div', { class: 'hbar' + (it.mark ? ' mark' : '') },
    h('span', { class: 'lbl' }, it.label, it.sub ? h('small', null, it.sub) : null),
    h('span', { class: 'bar' }, it.value != null ? h('i', { style: { width: Math.max(1.5, (it.value / top) * 100).toFixed(1) + '%' } }) : null),
    h('span', { class: 'val' }, it.text))));
}

export const SERIES_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
