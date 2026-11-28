// Statistiques des constructeurs : tableau de la saison et fiche d'écurie avec duel entre ses pilotes.

import { h, fmtNum, posBadge } from '../util.js';
import { driverStats, teamStats, headToHead } from '../model.js';
import { pageHead, table, tiles, driverLink, emptyState, link } from './common.js';
import { lineChart, duel, SERIES_COLORS } from '../charts.js';

function list(S) {
  const root = h('div');
  root.append(pageHead('Écuries', `Classement et statistiques ${S.season}.`));
  if (!S.teamList.length) { root.append(emptyState('Aucune écurie', 'Le classement sera disponible après la première course.')); return root; }
  root.append(h('section', { class: 'card' }, table([
    { label: 'Pos.', get: (t) => (t.standing ? posBadge(t.standing.pos) : '–') },
    { label: 'Écurie', align: 'l', get: (t) => h('a', { href: `#/ecuries/${t.id}` }, t.name) },
    { label: 'Pts', cls: 'strong', get: (t) => (t.standing ? t.standing.points : null) },
    { label: 'Vict.', title: 'Victoires', get: (t) => teamStats(t).wins },
    { label: 'Pod.', title: 'Podiums (cumul des deux voitures)', get: (t) => teamStats(t).podiums },
    { label: 'Poles', get: (t) => teamStats(t).poles },
    { label: 'Pilotes', align: 'l', hide: 'hide-s', get: (t) => [...t.driverIds].map((id) => S.drivers.get(id)).filter(Boolean).map((d) => d.last).join(', ') },
  ], S.teamList, { caption: 'Statistiques des écuries' })));
  return root;
}

// Pilote limité aux manches disputées pour cette écurie.
function withTeam(d, teamId) {
  return { ...d, standing: null, rows: d.rows.filter((r) => r.teamId === teamId) };
}

function detail(S, id) {
  const t = S.teams.get(id);
  const root = h('div');
  if (!t) { root.append(pageHead('Écurie introuvable'), emptyState('Cette écurie n’est pas dans la saison'), link('#/ecuries', 'Voir les écuries', 'btn')); return root; }
  const ts = teamStats(t);
  root.append(pageHead(t.name, t.standing ? `${t.standing.pos}${t.standing.pos === 1 ? 'er' : 'e'} du championnat des constructeurs.` : null));
  root.append(tiles([
    { label: 'Points', value: ts.points }, { label: 'Victoires', value: ts.wins },
    { label: 'Podiums', value: ts.podiums, sub: 'deux voitures cumulées' }, { label: 'Pole positions', value: ts.poles },
  ]));
  if (!t.rows.length) { root.append(emptyState('Pas encore de résultat', 'Les statistiques apparaîtront après la première course.')); return root; }

  const mem = [...t.driverIds].map((i) => S.drivers.get(i)).filter(Boolean)
    .map((d) => withTeam(d, id)).sort((a, b) => b.rows.length - a.rows.length || (S.drivers.get(b.id).standing?.points || 0) - (S.drivers.get(a.id).standing?.points || 0));
  const labels = Array.from({ length: S.lastRound }, (_, i) => String(i + 1));
  const titles = labels.map((l, i) => `${l}. ${S.races[i].title}`);

  const series = [{ id: t.id, name: t.name, color: SERIES_COLORS[0], values: t.cum }];
  root.append(h('section', { class: 'card' }, h('h2', null, 'Évolution des points de l’écurie'),
    lineChart({ series, labels, titles, zero: true, height: 260, ariaLabel: `Points de ${t.name}`, delta: (s, i) => { const g = s.values[i] - (i ? s.values[i - 1] : 0); return g > 0 ? '+' + g : ''; } })));

  if (mem.length >= 2) {
    const [a, b] = mem;
    const sa = driverStats(a), sb = driverStats(b);
    const hh = headToHead(a, b);
    root.append(h('section', { class: 'card' }, h('h2', null, `${a.last} contre ${b.last}`),
      h('div', { class: 'duel-head' }, h('b', { class: 'ca' }, a.full), h('b', { class: 'cb' }, b.full)),
      duel([
        { label: 'Points', a: sa.points, b: sb.points },
        { label: 'Victoires', a: sa.wins, b: sb.wins },
        { label: 'Podiums', a: sa.podiums, b: sb.podiums },
        { label: 'Pole positions', a: sa.poles, b: sb.poles },
        { label: 'Arrivée moyenne', a: sa.avgFinish, b: sb.avgFinish, lower: true, fmt: (v) => fmtNum(v) },
        { label: 'Qualif. moyenne', a: sa.avgQuali, b: sb.avgQuali, lower: true, fmt: (v) => fmtNum(v) },
      ], a.last, b.last),
      h('p', { class: 'sub' }, `En qualifications : ${a.last} ${hh.qa} – ${hh.qb} ${b.last}. En course : ${a.last} ${hh.ra} – ${hh.rb} ${b.last} (sur les manches disputées ensemble).`),
      h('p', null, link(`#/comparateur/${a.id}/${b.id}`, 'Voir le comparateur complet', 'btn ghost'))));
  }

  root.append(h('section', { class: 'card' }, h('h2', null, 'Résultats de chaque pilote'), table([
    { label: 'Manche', align: 'l', get: (r) => h('a', { href: `#/gp/${r.round}` }, `${r.round}. ${S.races[r.round - 1].title}`) },
    ...mem.slice(0, 3).map((d) => ({
      label: d.last,
      get: (r) => { const x = d.rows.find((y) => y.round === r.round); return !x ? null : !x.inRace ? null : x.abandon ? 'Ab.' : 'P' + x.pos; },
    })),
    { label: 'Pts écurie', cls: 'strong', get: (r) => r.pts },
  ], t.rows.slice().sort((a, b) => a.round - b.round), { caption: `Résultats de ${t.name}` })));
  return root;
}

export function render(ctx, args) {
  return args[0] ? detail(ctx.S, args[0]) : list(ctx.S);
}
