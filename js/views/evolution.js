// Panneau « évolution du championnat » : points cumulés ou écart au leader, avec légende à bascule.

import { h, minus } from '../util.js';
import { lineChart, legend, SERIES_COLORS } from '../charts.js';

export function evolutionPanel(S, entities, { nameOf = (e) => e.last || e.name, title = 'Évolution du championnat', unit = 'Points cumulés après chaque manche, sprints compris.' } = {}) {
  const wrap = h('section', { class: 'card' });
  if (!S.lastRound || !entities.length) {
    wrap.append(h('h2', null, title), h('p', { class: 'sub' }, 'Le graphique apparaîtra après la première course de la saison.'));
    return wrap;
  }
  const labels = Array.from({ length: S.lastRound }, (_, i) => String(i + 1));
  const titles = labels.map((l, i) => `${l}. ${S.races[i] ? S.races[i].title : ''}`);
  let mode = 'cum';
  let visible = null;
  const base = entities.map((e, i) => ({ id: e.id, name: nameOf(e), color: SERIES_COLORS[i % SERIES_COLORS.length], cum: e.cum }));
  const lead = base[0];
  const build = () => base
    .filter((b) => !visible || visible.has(b.id))
    .map((b) => ({ id: b.id, name: b.name, color: b.color, cum: b.cum, values: mode === 'cum' ? b.cum : b.cum.map((v, i) => v - lead.cum[i]) }));

  const sub = h('p', { class: 'sub' }, unit);
  const chart = lineChart({
    series: build(), labels, titles, zero: true, height: 320,
    ariaLabel: title,
    yFmt: (v) => (mode === 'gap' && v > 0 ? '+' + Math.round(v) : minus(Math.round(v))),
    delta: (d, i) => {
      if (mode !== 'cum') return '';
      const g = d.cum[i] - (i ? d.cum[i - 1] : 0);
      return g > 0 ? '+' + g : '';
    },
  });
  const refresh = () => chart.setSeries(build());
  const bCum = h('button', { type: 'button', role: 'radio', 'aria-checked': 'true' }, 'Points cumulés');
  const bGap = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false' }, `Écart à ${lead.name}`);
  const set = (m) => {
    mode = m;
    bCum.setAttribute('aria-checked', m === 'cum');
    bGap.setAttribute('aria-checked', m === 'gap');
    sub.textContent = m === 'cum' ? unit : `Points de chacun moins ceux de ${lead.name} après chaque manche. Au-dessus de zéro, il devance le leader actuel.`;
    refresh();
  };
  bCum.addEventListener('click', () => set('cum'));
  bGap.addEventListener('click', () => set('gap'));
  const leg = legend(build(), (vis) => { visible = new Set(vis.map((v) => v.id)); refresh(); });

  wrap.append(
    h('div', { class: 'row between' }, h('h2', null, title), h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Type de courbe' }, bCum, bGap)),
    sub, leg, chart,
    h('details', null, h('summary', null, 'Voir les points par manche'),
      h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', { class: 'l', scope: 'col' }, 'Manche'), base.map((b) => h('th', { scope: 'col' }, b.name)))),
        h('tbody', null, labels.map((l, i) => h('tr', null,
          h('td', { class: 'l' }, titles[i]),
          base.map((b) => h('td', null, String(b.cum[i] - (i ? b.cum[i - 1] : 0)))))))))));
  return wrap;
}
