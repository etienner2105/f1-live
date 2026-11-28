// Tableau de bord : prochain Grand Prix et compte à rebours, classements, dernier GP, infos de saison.

import { h, fmtDM, fmtFull, fmtDMY, fmtTimeOfDay, fmtDayShort, countdownParts, pad2, posBadge, unavailable, fmtInt } from '../util.js';
import { nextSession, nextRace, raceSummary, seasonInfo, driverStats } from '../model.js';
import { pageHead, tower, link, emptyState } from './common.js';
import { evolutionPanel } from './evolution.js';

function countdown(at, label) {
  const cells = [['jours', 'd'], ['heures', 'h'], ['minutes', 'm'], ['secondes', 's']].map(([name, k]) => ({ name, k, v: h('span', { class: 'n' }, '00') }));
  const sr = h('span', { class: 'sr' });
  const el = h('div', { class: 'cd', role: 'timer', 'aria-label': label },
    cells.map((c) => h('div', null, c.v, h('span', { class: 'u' }, c.name))), sr);
  let timer;
  const tick = () => {
    const p = countdownParts(at.getTime() - Date.now());
    cells.forEach((c) => { c.v.textContent = c.k === 'd' ? String(p.d) : pad2(p[c.k]); });
    sr.textContent = `${p.d} jours, ${p.h} heures et ${p.m} minutes`;
  };
  tick();
  timer = setInterval(tick, 1000);
  return { el, stop: () => clearInterval(timer) };
}

function hero(S, stops) {
  const ns = nextSession(S);
  const race = ns ? ns.race : nextRace(S);
  if (!race) {
    const info = seasonInfo(S);
    return h('section', { class: 'card hero' },
      h('div', { class: 'hero-main' },
        h('h2', { class: 'hero-title' }, 'Saison terminée'),
        h('p', { class: 'sub' }, info.driverChampion ? `Champion du monde : ${info.driverChampion.full}.` : 'Toutes les manches du calendrier sont disputées.')));
  }
  const now = Date.now();
  const cd = ns ? countdown(ns.session.at, `Temps avant ${ns.session.label}`) : null;
  if (cd) stops.push(cd.stop);
  return h('section', { class: 'card hero', 'aria-labelledby': 'hero-t' },
    h('div', { class: 'hero-main' },
      h('p', { class: 'kicker' }, `Prochain Grand Prix, manche ${race.round} sur ${S.races.length}`),
      h('h2', { class: 'hero-title', id: 'hero-t' }, race.title),
      h('p', { class: 'sub' }, `${race.circuit}, ${race.locality}. Du ${fmtDM(race.start)} au ${fmtDM(race.date)}.`),
      ns
        ? h('div', { class: 'hero-cd' }, h('p', { class: 'next-label' }, `${ns.session.label}, ${fmtFull(ns.session.at)}`), cd.el)
        : h('p', { class: 'sub' }, 'Les horaires du week-end ne sont pas encore publiés.'),
      h('div', { class: 'hero-links' }, link(`#/gp/${race.round}`, 'Programme du week-end', 'btn'), link(`#/meteo/${race.round}`, 'Météo du circuit', 'btn ghost'))),
    h('ol', { class: 'sched', 'aria-label': 'Programme du week-end' }, race.sessions.map((s) => {
      const state = s.at ? (s.at.getTime() < now ? 'done' : ns && s === ns.session ? 'next' : '') : '';
      return h('li', { class: state },
        h('span', { class: 'sn' }, s.label),
        h('span', { class: 'st' }, s.at ? `${fmtDayShort(s.at)}, ${fmtTimeOfDay(s.at)}` : fmtDayShort(s.date)));
    })));
}

function lastRace(S) {
  const n = S.lastRound;
  if (!n) return h('section', { class: 'card' }, h('h2', null, 'Dernier Grand Prix'), emptyState('Pas encore de course', 'Les résultats apparaîtront ici après le premier Grand Prix.'));
  const sm = raceSummary(S, n);
  if (!sm) return h('section', { class: 'card' }, h('h2', null, 'Dernier Grand Prix'), unavailable('Résultats indisponibles', `Les résultats de la manche ${n} n'ont pas pu être chargés.`));
  return h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', null, `Dernier Grand Prix : ${sm.race.title}`), link(`#/gp/${n}`, 'Détails')),
    h('ol', { class: 'podium' }, sm.podium.map((r) => h('li', null, posBadge(r.pos),
      h('span', { class: 'who' }, h('a', { href: `#/pilotes/${r.driverId}` }, h('b', null, r.full)), h('small', null, r.team)),
      h('span', { class: 'pts' }, r.pos === 1 ? r.time || '' : r.time || '')))),
    h('dl', { class: 'facts' },
      h('div', null, h('dt', null, 'Pole position'), h('dd', null, sm.pole ? sm.pole.full : 'Non disponible')),
      h('div', null, h('dt', null, 'Meilleur tour'), h('dd', null, sm.fastest ? `${sm.fastest.full}${sm.fastest.fl.time ? ' (' + sm.fastest.fl.time + ')' : ''}` : 'Non disponible')),
      h('div', null, h('dt', null, 'Abandons'), h('dd', null, sm.abandons.length ? sm.abandons.map((r) => r.code).join(', ') : 'Aucun')),
      sm.sprintWinner ? h('div', null, h('dt', null, 'Vainqueur du sprint'), h('dd', null, sm.sprintWinner.full)) : null),
    h('p', null, link('#/direct', 'Rejouer la course tour par tour', 'btn ghost')));
}

function seasonCard(S) {
  const i = seasonInfo(S);
  const rows = [];
  rows.push(['Avancement', `${i.done} manche${i.done > 1 ? 's' : ''} sur ${i.total}`]);
  if (i.remaining) rows.push(['À venir', `${i.remaining} course${i.remaining > 1 ? 's' : ''}${i.remainingSprints ? ` dont ${i.remainingSprints} sprint${i.remainingSprints > 1 ? 's' : ''}` : ''}`]);
  if (i.remaining) rows.push(['Points encore en jeu', `${i.maxDriver} par pilote au maximum, ${i.maxTeam} par écurie`]);
  rows.push(['Titre pilotes', i.driverChampion ? `Décerné à ${i.driverChampion.full}` : i.leader ? `Ouvert, ${i.leader.last} en tête` : 'Ouvert']);
  rows.push(['Titre constructeurs', i.teamChampion ? `Décerné à ${i.teamChampion.name}` : S.teamList[0] ? `Ouvert, ${S.teamList[0].name} en tête` : 'Ouvert']);
  if (i.mostWins) rows.push(['Plus de victoires', `${i.mostWins.d.full} (${i.mostWins.n})`]);
  if (i.mostPoles) rows.push(['Plus de poles', `${i.mostPoles.d.full} (${i.mostPoles.n})`]);
  return h('section', { class: 'card' }, h('h2', null, 'La saison en bref'),
    h('dl', { class: 'facts wide' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))));
}

function newsTeaser(S) {
  const items = [];
  for (let n = S.lastRound; n > 0 && items.length < 2; n--) {
    const sm = raceSummary(S, n);
    if (!sm || !sm.winner) continue;
    items.push(h('li', null, h('b', null, sm.race.title), h('span', null, ` : victoire de ${sm.winner.full} (${sm.winner.team}).`)));
  }
  return h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', null, 'Actualités'), link('#/actus', 'Tout voir')),
    items.length ? h('ul', { class: 'plain' }, items) : emptyState('Rien à résumer pour l’instant'),
    h('p', { class: 'sub' }, 'Les actualités détaillées sont à lire sur les sites officiels, listés dans la rubrique Actualités.'));
}

export function render(ctx) {
  const S = ctx.S;
  const stops = [];
  const root = h('div', { class: 'dash' });
  root.append(pageHead('Tableau de bord', `Saison ${S.season}`));
  root.append(hero(S, stops));

  const dRows = S.driverList.filter((d) => d.standing).slice(0, 10).map((d) => ({
    pos: d.standing.pos, code: d.code, name: d.last, sub: d.team, pts: d.standing.points, href: `#/pilotes/${d.id}`,
  }));
  const driversCard = h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', null, 'Classement pilotes'), link('#/classements', 'Classement complet')),
    dRows.length ? tower(dRows) : emptyState('Classement vide', 'Il sera publié après la première course.'));
  const tRows = S.teamList.filter((t) => t.standing).slice(0, 5).map((t) => ({
    pos: t.standing.pos, code: t.name.slice(0, 3).toUpperCase(), name: t.name, pts: t.standing.points, href: `#/ecuries/${t.id}`,
  }));
  const teamsCard = h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', null, 'Classement constructeurs'), link('#/ecuries', 'Écuries')),
    tRows.length ? tower(tRows) : emptyState('Classement vide'));

  root.append(h('div', { class: 'grid-3' }, lastRace(S), driversCard, teamsCard));
  root.append(h('div', { class: 'grid-2' }, seasonCard(S), newsTeaser(S)));
  root.append(evolutionPanel(S, S.driverList.slice(0, 6), { title: 'Évolution des six premiers' }));
  root.destroy = () => stops.forEach((f) => f());
  return root;
}
