// Qualifications : Q1, Q2, Q3, écarts, pole, grille de départ et changements de grille.

import { h, fmtLap, fmtDelta, unavailable, posBadge, fmtDMY } from '../util.js';
import { pageHead, table, driverLink, gpSelect, emptyState } from './common.js';
import { hbars } from '../charts.js';

export function qualiPanel(S, n) {
  const rd = S.rounds[n];
  const race = S.races[n - 1];
  if (!rd || !rd.quali.length) {
    return race && race.at && race.at.getTime() > Date.now() - 36e5 * 48
      ? unavailable('Qualifications pas encore disputées', `Les résultats de ${race.title} seront affichés après la séance.`)
      : unavailable('Résultats indisponibles', 'Le fournisseur de données n’a pas publié les qualifications de cette manche.');
  }
  const q = rd.quali;
  const gridBy = new Map(rd.results.map((r) => [r.driverId, r.grid]));
  const hasGrid = rd.results.length > 0;
  const pole = q[0];
  const second = q[1];
  const wrap = h('div', { class: 'stack' });
  const poleTime = pole && pole.time != null ? fmtLap(pole.time) : null;
  wrap.append(h('div', { class: 'callout' },
    h('span', { class: 'big' }, pole ? pole.last : '–'),
    h('span', null, pole ? `${pole.full} (${pole.team}) signe la pole position${poleTime ? ` en ${poleTime}` : ''}${second && second.gap != null && second.session === 3 ? `, devant ${second.last} de ${fmtDelta(second.gap).replace('+', '')} s` : ''}.` : 'Pole position non disponible.')));

  const cols = [
    { label: 'Pos.', get: (r) => posBadge(r.pos) },
    { label: 'Pilote', align: 'l', get: (r) => h('span', { class: 'who' }, driverLink(r, r.full), h('small', null, r.team)) },
    { label: 'Q1', get: (r) => r.q[0] },
    { label: 'Q2', get: (r) => r.q[1] },
    { label: 'Q3', get: (r) => r.q[2] },
    { label: 'Écart', title: 'Écart au meilleur temps de la séance où le pilote a été éliminé', get: (r) => (r.gap == null || r.gap === 0 ? '' : fmtDelta(r.gap)) },
  ];
  if (hasGrid) cols.push({
    label: 'Grille', title: 'Position de départ de la course',
    get: (r) => {
      const g = gridBy.get(r.driverId);
      if (g == null) return null;
      const label = g === 0 ? 'Stands' : 'P' + g;
      const diff = g > 0 && g !== r.pos ? (g < r.pos ? ` (+${r.pos - g})` : ` (−${g - r.pos})`) : g === 0 ? '' : '';
      return h('span', { class: g !== r.pos ? 'chg' : null }, label + diff);
    },
  });
  wrap.append(table(cols, q, { caption: 'Résultats des qualifications', rowClass: (r) => (r.pos === 1 ? 'is-pole' : null) }));

  const q3 = q.filter((r) => r.session === 3 && r.gap != null);
  if (q3.length > 1) {
    wrap.append(h('div', null, h('h3', null, 'Écarts à la pole en Q3'),
      hbars(q3.map((r) => ({ label: r.last, sub: r.code, value: r.gap, text: r.gap === 0 ? fmtLap(r.time) : fmtDelta(r.gap), mark: r.gap === 0 })))));
  }

  if (hasGrid) {
    const changes = q.filter((r) => {
      const g = gridBy.get(r.driverId);
      return g != null && g !== r.pos;
    });
    wrap.append(h('div', null, h('h3', null, 'Changements de grille'),
      changes.length
        ? h('ul', { class: 'plain' }, changes.map((r) => {
          const g = gridBy.get(r.driverId);
          return h('li', null, h('b', null, r.last), g === 0 ? ` part depuis la voie des stands (qualifié P${r.pos}).` : ` part P${g} pour une qualification en P${r.pos}.`);
        }))
        : h('p', { class: 'sub' }, 'Aucun écart entre les qualifications et la grille de départ.'),
      h('p', { class: 'note' }, 'Les motifs (pénalités, changements de moteur) ne sont pas fournis par la source ; seul l’écart de position est affiché.')));
  } else {
    wrap.append(h('p', { class: 'note' }, 'La grille de départ sera affichée avec les résultats de la course.'));
  }
  return wrap;
}

export function render(ctx, args) {
  const S = ctx.S;
  const withQ = S.races.filter((r) => S.rounds[r.round] && S.rounds[r.round].quali.length);
  const def = withQ.length ? withQ[withQ.length - 1].round : S.races[0] && S.races[0].round;
  const n = +args[0] || def;
  const root = h('div');
  root.append(pageHead('Qualifications', 'Q1, Q2, Q3, pole position et grille de départ.',
    S.races.length ? gpSelect(S, n, (v) => { location.hash = `#/qualifs/${v}`; }) : null));
  if (!n) { root.append(emptyState('Calendrier indisponible')); return root; }
  const race = S.races[n - 1];
  root.append(h('section', { class: 'card' }, h('h2', null, `${race.title}, ${fmtDMY(race.date)}`), qualiPanel(S, n)));
  return root;
}
