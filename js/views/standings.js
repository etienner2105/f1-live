// Classements pilotes et constructeurs, avec l'évolution du championnat.

import { h, fmtInt, posBadge, unavailable } from '../util.js';
import { driverStats, teamStats } from '../model.js';
import { pageHead, table, driverLink, teamLink, emptyState } from './common.js';
import { evolutionPanel } from './evolution.js';
import { hbars } from '../charts.js';

export function render(ctx) {
  const S = ctx.S;
  const root = h('div');
  root.append(pageHead('Classements', `Championnat ${S.season}, après ${S.lastRound} manche${S.lastRound > 1 ? 's' : ''} sur ${S.races.length}.`));
  if (!S.driverList.some((d) => d.standing)) {
    root.append(emptyState('Aucun classement pour l’instant', 'Le championnat commence avec le premier Grand Prix.'));
    return root;
  }
  const leaderPts = S.driverList[0].standing.points || 1;
  const drivers = S.driverList.filter((d) => d.standing);
  const dTable = table([
    { label: 'Pos.', get: (d) => posBadge(d.standing.pos) },
    { label: 'Pilote', align: 'l', get: (d) => h('span', { class: 'who' }, driverLink(d, d.full), h('small', null, d.team)) },
    { label: 'Pts', cls: 'strong', get: (d) => d.standing.points },
    { label: 'Écart', hide: 'hide-s', get: (d) => (d.standing.pos === 1 ? '' : '−' + (leaderPts - d.standing.points)) },
    { label: 'Vict.', title: 'Victoires', get: (d) => d.standing.wins },
    { label: 'Pod.', title: 'Podiums', hide: 'hide-s', get: (d) => driverStats(d).podiums },
    { label: 'Poles', hide: 'hide-s', get: (d) => driverStats(d).poles },
    { label: '', cls: 'barcell hide-s', get: (d) => h('span', { class: 'mini' }, h('i', { style: { width: (100 * d.standing.points / leaderPts) + '%' } })) },
  ], drivers, { caption: 'Classement pilotes' });

  const teams = S.teamList.filter((t) => t.standing);
  const tLead = teams.length ? teams[0].standing.points || 1 : 1;
  const tTable = table([
    { label: 'Pos.', get: (t) => posBadge(t.standing.pos) },
    { label: 'Écurie', align: 'l', get: (t) => teamLink(t.id, t.name) },
    { label: 'Pts', cls: 'strong', get: (t) => t.standing.points },
    { label: 'Écart', hide: 'hide-s', get: (t) => (t.standing.pos === 1 ? '' : '−' + (tLead - t.standing.points)) },
    { label: 'Vict.', title: 'Victoires', get: (t) => t.standing.wins },
    { label: '', cls: 'barcell hide-s', get: (t) => h('span', { class: 'mini' }, h('i', { style: { width: (100 * t.standing.points / tLead) + '%' } })) },
  ], teams, { caption: 'Classement constructeurs' });

  root.append(evolutionPanel(S, S.driverList.slice(0, 6), { title: 'Évolution des six premiers pilotes' }));
  root.append(h('div', { class: 'grid-2 wide-left' },
    h('section', { class: 'card' }, h('h2', null, 'Pilotes'), dTable,
      S.driverList.some((d) => !d.standing) ? null : h('p', { class: 'note' }, 'Le classement s’appuie sur les points officiels, sprints compris.')),
    h('section', { class: 'card' }, h('h2', null, 'Constructeurs'), tTable)));
  return root;
}
