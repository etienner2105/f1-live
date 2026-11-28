// Actualités : résumés des derniers Grands Prix tirés des résultats, mouvements au championnat,
// et accès direct aux sources officielles. Aucun article n'est recopié et rien n'est inventé.

import { h, fmtDMY } from '../util.js';
import { raceSummary } from '../model.js';
import { pageHead, emptyState, link } from './common.js';
import { statusFR } from './gp.js';

function summary(sm) {
  const p = sm.podium;
  const out = [];
  if (sm.winner) {
    out.push(`${sm.winner.full} (${sm.winner.team}) remporte le ${sm.race.title}${p.length >= 3 ? `, devant ${p[1].full} et ${p[2].full}` : p.length === 2 ? `, devant ${p[1].full}` : ''}.`);
  }
  if (sm.pole) out.push(`Pole position : ${sm.pole.full}.`);
  if (sm.fastest) out.push(`Meilleur tour : ${sm.fastest.full}${sm.fastest.fl.time ? ' en ' + sm.fastest.fl.time : ''}.`);
  if (sm.sprintWinner) out.push(`Le sprint est revenu à ${sm.sprintWinner.full}.`);
  out.push(sm.abandons.length ? `Abandons : ${sm.abandons.map((r) => `${r.last} (${statusFR(r.status) || 'abandon'})`).join(', ')}.` : 'Tous les pilotes ont vu l’arrivée.');
  return out;
}

function movements(S) {
  const L = S.lastRound;
  if (L < 2) return null;
  const prev = S.driverList.filter((d) => d.cum.length >= L - 1 && d.standing)
    .map((d) => ({ d, p: d.cum[L - 2] })).sort((a, b) => b.p - a.p);
  const before = new Map(prev.map((x, i) => [x.d.id, i + 1]));
  const rows = S.driverList.filter((d) => d.standing && before.has(d.id))
    .map((d) => ({ d, now: d.standing.pos, was: before.get(d.id) })).filter((x) => x.now !== x.was && Math.min(x.now, x.was) <= 10)
    .sort((a, b) => a.now - b.now);
  return rows;
}

const SOURCES = [
  { name: 'Formula1.com, dernières actualités', href: 'https://www.formula1.com/en/latest', note: 'Le site officiel de la F1 : articles, vidéos et analyses.' },
  { name: 'Formula1.com, résultats', href: 'https://www.formula1.com/en/results', note: 'Résultats et classements officiels.' },
  { name: 'Formula1.com, pilotes', href: 'https://www.formula1.com/en/drivers', note: 'Fiches des pilotes et transferts.' },
  { name: 'Formula1.com, écuries', href: 'https://www.formula1.com/en/teams', note: 'Fiches des écuries et annonces techniques.' },
  { name: 'FIA', href: 'https://www.fia.com/', note: 'Règlements, décisions des commissaires et documents officiels.' },
];

export function render(ctx) {
  const S = ctx.S;
  const root = h('div');
  root.append(pageHead('Actualités', 'Résumés des Grands Prix construits à partir des résultats, et liens vers les sources officielles.'));

  const items = [];
  for (let n = S.lastRound; n > 0 && items.length < 6; n--) {
    const sm = raceSummary(S, n);
    if (sm && sm.winner) items.push({ n, sm });
  }
  const sec = h('section', { class: 'card' }, h('h2', null, 'Résumés des derniers Grands Prix'));
  if (!items.length) sec.append(emptyState('Pas encore de résumé', 'Ils apparaîtront après chaque course.'));
  else sec.append(h('div', { class: 'stories' }, items.map(({ n, sm }) => h('article', { class: 'story' },
    h('h3', null, h('a', { href: `#/gp/${n}` }, sm.race.title)),
    h('p', { class: 'sub' }, fmtDMY(sm.race.date)),
    summary(sm).map((t) => h('p', null, t))))));
  root.append(sec);

  const mv = movements(S);
  if (mv) {
    root.append(h('section', { class: 'card' }, h('h2', null, `Mouvements au championnat après ${S.races[S.lastRound - 1].title}`),
      mv.length
        ? h('ul', { class: 'plain' }, mv.map((x) => h('li', null, h('a', { href: `#/pilotes/${x.d.id}` }, h('b', null, x.d.full)),
          x.now < x.was ? ` gagne ${x.was - x.now} place${x.was - x.now > 1 ? 's' : ''}` : ` perd ${x.now - x.was} place${x.now - x.was > 1 ? 's' : ''}`, ` (${x.was}e → ${x.now}e).`)))
        : h('p', { class: 'sub' }, 'Le haut du classement n’a pas bougé lors de la dernière course.')));
  }

  root.append(h('section', { class: 'card' }, h('h2', null, 'Pour aller plus loin'),
    h('p', { class: 'sub' }, 'Les articles, déclarations, transferts et décisions de la FIA se lisent sur les sites d’origine. Cette application n’en recopie aucun et n’invente aucune information.'),
    h('div', { class: 'cards' }, SOURCES.map((s) => h('a', { class: 'src-card', href: s.href, target: '_blank', rel: 'noopener noreferrer' },
      h('b', null, s.name), h('small', null, s.note))))));
  return root;
}
