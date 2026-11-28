// Statistiques des pilotes : tableau de la saison et fiche individuelle.

import { h, fmtNum, fmtInt, posBadge, minus } from '../util.js';
import { driverStats } from '../model.js';
import { pageHead, table, tiles, teamLink, emptyState, link, select } from './common.js';
import { lineChart, SERIES_COLORS } from '../charts.js';
import { statusFR } from './gp.js';

function list(S) {
  const root = h('div');
  root.append(pageHead('Pilotes', `Statistiques de la saison ${S.season}.`));
  const ds = S.driverList;
  if (!ds.length) { root.append(emptyState('Aucun pilote', 'La liste sera disponible avec le premier classement.')); return root; }
  root.append(h('section', { class: 'card' }, table([
    { label: 'Pos.', get: (d) => (d.standing ? posBadge(d.standing.pos) : '–') },
    { label: 'Pilote', align: 'l', get: (d) => h('span', { class: 'who' }, h('a', { href: `#/pilotes/${d.id}` }, d.full), h('small', null, d.team)) },
    { label: 'Pts', cls: 'strong', get: (d) => d.standing ? d.standing.points : null },
    { label: 'Vict.', title: 'Victoires', get: (d) => driverStats(d).wins },
    { label: 'Pod.', title: 'Podiums', get: (d) => driverStats(d).podiums },
    { label: 'Poles', get: (d) => driverStats(d).poles },
    { label: 'MT', title: 'Meilleurs tours', hide: 'hide-s', get: (d) => driverStats(d).fastest },
    { label: 'Aband.', title: 'Abandons', hide: 'hide-s', get: (d) => driverStats(d).dnf },
    { label: 'Arr. moy.', title: 'Position moyenne à l’arrivée', hide: 'hide-m', get: (d) => fmtNum(driverStats(d).avgFinish) },
    { label: 'Grille moy.', title: 'Position moyenne sur la grille', hide: 'hide-m', get: (d) => fmtNum(driverStats(d).avgGrid) },
  ], ds, { caption: 'Statistiques des pilotes' })));
  root.append(h('p', { class: 'note' }, 'Position moyenne calculée sur les courses terminées. Les points incluent les sprints.'));
  return root;
}

function profile(S, id) {
  const d = S.drivers.get(id);
  const root = h('div');
  if (!d) {
    root.append(pageHead('Pilote introuvable'), emptyState('Ce pilote n’est pas dans la saison', 'Choisis un pilote dans la liste.'), link('#/pilotes', 'Voir les pilotes', 'btn'));
    return root;
  }
  const st = driverStats(d);
  const others = S.driverList.filter((x) => x.id !== d.id);
  root.append(pageHead(d.full, `${d.number ? '#' + d.number + ', ' : ''}${d.team || 'écurie inconnue'}${d.standing ? `. ${d.standing.pos}${d.standing.pos === 1 ? 'er' : 'e'} du championnat.` : '.'}`,
    others.length ? select({ id: 'cmp', label: 'Comparer avec', value: '', options: [{ value: '', label: 'Choisir un pilote' }, ...others.map((o) => ({ value: o.id, label: o.full }))], onChange: (v) => { if (v) location.hash = `#/comparateur/${d.id}/${v}`; } }) : null));
  root.append(tiles([
    { label: 'Points', value: st.points },
    { label: 'Victoires', value: st.wins },
    { label: 'Podiums', value: st.podiums },
    { label: 'Pole positions', value: st.poles },
    { label: 'Meilleurs tours', value: st.fastest },
    { label: 'Abandons', value: st.dnf },
    { label: 'Arrivée moyenne', value: fmtNum(st.avgFinish), sub: st.bestFinish ? `Meilleure : P${st.bestFinish}` : null },
    { label: 'Grille moyenne', value: fmtNum(st.avgGrid) },
  ]));
  if (!d.rows.length) { root.append(emptyState('Pas encore de résultat', 'Les statistiques apparaîtront après la première course.')); return root; }

  const labels = Array.from({ length: S.lastRound }, (_, i) => String(i + 1));
  const titles = labels.map((l, i) => `${l}. ${S.races[i].title}`);
  const byRound = new Map(d.rows.map((r) => [r.round, r]));
  const posVals = labels.map((_, i) => { const r = byRound.get(i + 1); return r && r.inRace && !r.abandon && r.pos != null ? r.pos : null; });
  const qVals = labels.map((_, i) => { const r = byRound.get(i + 1); return r && r.qpos != null ? r.qpos : null; });
  const gain = (v, i) => '';
  root.append(h('div', { class: 'grid-2' },
    h('section', { class: 'card' }, h('h2', null, 'Points cumulés'),
      lineChart({ series: [{ id: d.id, name: d.last, color: SERIES_COLORS[0], values: d.cum }], labels, titles, zero: true, height: 260, ariaLabel: `Points cumulés de ${d.full}`,
        delta: (s, i) => { const g = s.values[i] - (i ? s.values[i - 1] : 0); return g > 0 ? '+' + g : ''; } })),
    h('section', { class: 'card' }, h('h2', null, 'Positions au fil de la saison'),
      h('p', { class: 'sub' }, 'Plus la courbe est haute, meilleure est la position. Les abandons ne sont pas tracés.'),
      lineChart({ series: [{ id: 'race', name: 'Arrivée', color: SERIES_COLORS[0], values: posVals }, { id: 'q', name: 'Qualifications', color: SERIES_COLORS[1], values: qVals }], labels, titles, reverse: true, height: 260, ariaLabel: `Positions de ${d.full}`, yFmt: (v) => 'P' + Math.round(v) }))));

  const gp = (n) => S.races[n - 1];
  root.append(h('section', { class: 'card' }, h('h2', null, 'Résultats par Grand Prix'), table([
    { label: 'Manche', align: 'l', get: (r) => h('a', { href: `#/gp/${r.round}` }, `${r.round}. ${gp(r.round).title}`) },
    { label: 'Qualif.', hide: 'hide-s', get: (r) => (r.qpos != null ? 'P' + r.qpos : null) },
    { label: 'Grille', hide: 'hide-s', get: (r) => (r.grid == null ? null : r.grid === 0 ? 'Stands' : 'P' + r.grid) },
    { label: 'Arrivée', get: (r) => (!r.inRace ? null : r.abandon ? h('span', { class: 'pos out' }, 'Ab.') : posBadge(r.pos)) },
    { label: 'Sprint', hide: 'hide-s', get: (r) => (r.sPos != null ? 'P' + r.sPos : null) },
    { label: 'Pts', cls: 'strong', get: (r) => r.pts + r.sPts },
    { label: 'Remarque', align: 'l', hide: 'hide-m', get: (r) => [r.fl === 1 ? 'Meilleur tour' : '', r.qpos === 1 ? 'Pole' : '', r.abandon ? statusFR(r.status) : ''].filter(Boolean).join(', ') },
  ], d.rows.slice().sort((a, b) => a.round - b.round), { caption: `Résultats de ${d.full}` })));
  return root;
}

export function render(ctx, args) {
  return args[0] ? profile(ctx.S, args[0]) : list(ctx.S);
}
