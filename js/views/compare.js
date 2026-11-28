// Comparateur : deux pilotes face à face, saison en cours.

import { h, fmtNum, fmtInt, posBadge, minus } from '../util.js';
import { driverStats, headToHead } from '../model.js';
import { pageHead, select, table, emptyState } from './common.js';
import { lineChart, duel } from '../charts.js';

export function render(ctx, args) {
  const S = ctx.S;
  const ds = S.driverList;
  const root = h('div');
  if (ds.length < 2) {
    root.append(pageHead('Comparateur'), emptyState('Pas assez de pilotes', 'Le comparateur sera disponible avec le classement de la saison.'));
    return root;
  }
  const A = S.drivers.get(args[0]) || ds[0];
  const B = S.drivers.get(args[1]) && args[1] !== A.id ? S.drivers.get(args[1]) : ds.find((d) => d.id !== A.id);
  const go = (a, b) => { location.hash = `#/comparateur/${a}/${b}`; };
  const opts = ds.map((d) => ({ value: d.id, label: d.full }));
  root.append(pageHead('Comparateur', 'Choisis deux pilotes pour les comparer sur la saison.',
    h('div', { class: 'fields' },
      select({ id: 'cmp-a', label: 'Pilote A', value: A.id, options: opts, onChange: (v) => go(v, v === B.id ? A.id : B.id) }),
      select({ id: 'cmp-b', label: 'Pilote B', value: B.id, options: opts, onChange: (v) => go(v === A.id ? B.id : A.id, v) }))));

  const sa = driverStats(A), sb = driverStats(B);
  const hh = headToHead(A, B);
  const fp = (v) => (v == null ? '–' : fmtNum(v));
  root.append(h('section', { class: 'card' },
    h('div', { class: 'duel-head' },
      h('div', { class: 'ca' }, h('b', null, A.full), h('small', null, A.team)),
      h('div', { class: 'cb' }, h('b', null, B.full), h('small', null, B.team))),
    duel([
      { label: 'Points', a: sa.points, b: sb.points },
      { label: 'Victoires', a: sa.wins, b: sb.wins },
      { label: 'Podiums', a: sa.podiums, b: sb.podiums },
      { label: 'Pole positions', a: sa.poles, b: sb.poles },
      { label: 'Meilleurs tours', a: sa.fastest, b: sb.fastest },
      { label: 'Abandons', a: sa.dnf, b: sb.dnf, lower: true },
      { label: 'Arrivée moyenne', a: sa.avgFinish, b: sb.avgFinish, lower: true, fmt: fp },
      { label: 'Grille moyenne', a: sa.avgGrid, b: sb.avgGrid, lower: true, fmt: fp },
      { label: 'Qualif. moyenne', a: sa.avgQuali, b: sb.avgQuali, lower: true, fmt: fp },
    ], A.last, B.last),
    h('p', { class: 'note' }, 'La barre la plus pleine est celle de la plus grande valeur ; la valeur en gras est la meilleure (la plus petite pour les abandons et les positions).')));

  const total = hh.rounds.length;
  root.append(h('section', { class: 'card' }, h('h2', null, 'Face à face'),
    total
      ? h('div', { class: 'h2h' },
        h('div', null, h('span', { class: 'tv' }, `${hh.qa} – ${hh.qb}`), h('span', { class: 'tl' }, 'En qualifications')),
        h('div', null, h('span', { class: 'tv' }, `${hh.ra} – ${hh.rb}`), h('span', { class: 'tl' }, 'À l’arrivée')))
      : h('p', { class: 'sub' }, 'Ces deux pilotes n’ont pas disputé de manche ensemble.'),
    total ? h('p', { class: 'note' }, `Score ${A.last} – ${B.last} sur ${total} manche${total > 1 ? 's' : ''} disputée${total > 1 ? 's' : ''} par les deux. Un abandon compte derrière tout pilote classé.`) : null));

  const labels = Array.from({ length: S.lastRound }, (_, i) => String(i + 1));
  const titles = labels.map((l, i) => `${l}. ${S.races[i].title}`);
  const at = (d, f) => labels.map((_, i) => { const r = d.rows.find((x) => x.round === i + 1); return r ? f(r) : null; });
  const pos = (r) => (r.inRace && !r.abandon && r.pos != null ? r.pos : null);
  root.append(h('div', { class: 'grid-2' },
    h('section', { class: 'card' }, h('h2', null, 'Points cumulés'),
      lineChart({ series: [{ id: A.id, name: A.last, color: 'var(--c1)', values: A.cum }, { id: B.id, name: B.last, color: 'var(--c2)', values: B.cum }], labels, titles, zero: true, height: 260, ariaLabel: 'Points cumulés des deux pilotes' })),
    h('section', { class: 'card' }, h('h2', null, 'Positions à l’arrivée'),
      h('p', { class: 'sub' }, 'Plus la courbe est haute, meilleure est la position. Les abandons ne sont pas tracés.'),
      lineChart({ series: [{ id: A.id, name: A.last, color: 'var(--c1)', values: at(A, pos) }, { id: B.id, name: B.last, color: 'var(--c2)', values: at(B, pos) }], labels, titles, reverse: true, height: 260, ariaLabel: 'Positions à l’arrivée des deux pilotes', yFmt: (v) => 'P' + Math.round(v) }))));

  root.append(h('section', { class: 'card' }, h('h2', null, 'Régularité'),
    h('dl', { class: 'facts wide' },
      h('div', null, h('dt', null, `${A.last}, courses dans les points`), h('dd', null, sa.pointsRate == null ? 'Non disponible' : `${Math.round(sa.pointsRate * 100)} % (${fmtInt(sa.pointsRate * sa.starts)} sur ${sa.starts})`)),
      h('div', null, h('dt', null, `${B.last}, courses dans les points`), h('dd', null, sb.pointsRate == null ? 'Non disponible' : `${Math.round(sb.pointsRate * 100)} % (${fmtInt(sb.pointsRate * sb.starts)} sur ${sb.starts})`)),
      h('div', null, h('dt', null, `${A.last}, dispersion des arrivées`), h('dd', null, sa.stdFinish == null ? 'Non disponible' : `±${fmtNum(sa.stdFinish)} places`)),
      h('div', null, h('dt', null, `${B.last}, dispersion des arrivées`), h('dd', null, sb.stdFinish == null ? 'Non disponible' : `±${fmtNum(sb.stdFinish)} places`))),
    h('p', { class: 'note' }, 'La dispersion est l’écart-type des positions à l’arrivée : plus elle est faible, plus le pilote est régulier.')));

  const gpName = (n) => S.races[n - 1].title;
  const cell = (r) => (!r.inRace ? null : r.abandon ? h('span', { class: 'pos out' }, 'Ab.') : posBadge(r.pos));
  root.append(h('section', { class: 'card' }, h('h2', null, 'Résultats sur chaque circuit'), total ? table([
    { label: 'Grand Prix', align: 'l', get: (x) => h('a', { href: `#/gp/${x.round}` }, `${x.round}. ${gpName(x.round)}`) },
    { label: `Qualif. ${A.code}`, hide: 'hide-s', get: (x) => (x.a.qpos != null ? 'P' + x.a.qpos : null) },
    { label: `Qualif. ${B.code}`, hide: 'hide-s', get: (x) => (x.b.qpos != null ? 'P' + x.b.qpos : null) },
    { label: A.code, get: (x) => cell(x.a) },
    { label: B.code, get: (x) => cell(x.b) },
    { label: 'Points', hide: 'hide-s', get: (x) => `${x.a.pts + x.a.sPts} – ${x.b.pts + x.b.sPts}` },
  ], hh.rounds, { caption: 'Résultats des deux pilotes par Grand Prix', rowClass: (x) => null }) : h('p', { class: 'sub' }, 'Aucune manche en commun pour l’instant.')));
  return root;
}
