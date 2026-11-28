// Direct : rejeu tour par tour de la dernière course.
// Le temps réel pendant les séances est réservé par OpenF1 aux comptes sponsors (jeton côté serveur) :
// un site statique ne peut pas l'obtenir. Cette page rejoue donc la dernière course disponible.

import { h, fmtDelta, fmtLap, fmtFull, fmtDMY, unavailable, posBadge, store, notice } from '../util.js';
import { loadLaps, loadPitStops, ofStints, ofRaceControl, describeError } from '../api.js';
import { buildReplay, trackLabel, COMPOUNDS, nextSession } from '../model.js';
import { pageHead, gpSelect, driverLink, emptyState, link } from './common.js';
import { meetingFor, ttlFor } from './openf1.js';
import { statusFR } from './gp.js';

async function loadReplay(S, n, onProgress) {
  const rd = S.rounds[n];
  const race = S.races[n - 1];
  const notes = [];
  const laps = await loadLaps(S.season, n, onProgress);
  if (!laps.n) return { empty: true };
  let pits = [];
  try { pits = await loadPitStops(S.season, n); } catch (e) { notes.push(`Arrêts aux stands indisponibles : ${describeError(e)}.`); }
  let stints = [], rc = [];
  try {
    const m = await meetingFor(S, race);
    const sess = m && m.byName.Race;
    if (!sess) notes.push('OpenF1 n’a pas publié cette course : pneus, drapeaux et safety car sont indisponibles.');
    else {
      stints = await ofStints(sess.session_key, ttlFor(sess));
      rc = await ofRaceControl(sess.session_key, ttlFor(sess));
      if (!stints.length) notes.push('Les pneus ne sont pas publiés pour cette course.');
      if (!rc.length) notes.push('Les drapeaux et safety car ne sont pas publiés pour cette course.');
    }
  } catch (e) { notes.push(`Pneus, drapeaux et safety car indisponibles : ${describeError(e)}.`); }
  if (!pits.length) notes.push('Aucun arrêt aux stands publié pour cette course.');
  return { replay: buildReplay({ laps, results: rd.results, pits, stints, rc }), laps, notes };
}

function bestSoFar(laps, rd) {
  const byId = new Map(rd.results.map((r) => [r.driverId, r]));
  const out = [];
  let best = null;
  for (let L = 1; L <= laps.n; L++) {
    for (const id of Object.keys(laps.d)) {
      const t = laps.d[id].t[L - 1];
      if (t != null && (!best || t < best.ms)) best = { ms: t, code: (byId.get(id) || {}).code || id, lap: L };
    }
    out.push(best);
  }
  return out;
}

const TYPE_LABEL = { pit: 'Stands', out: 'Abandon', pos: 'Position', sc: 'Neutralisation', flag: 'Drapeau', rc: 'Direction de course' };

function player(S, n, data) {
  const { replay, laps } = data;
  const rd = S.rounds[n];
  const best = bestSoFar(laps, rd);
  const sm = { pole: rd.quali[0] || rd.results.find((r) => r.grid === 1), fl: rd.results.find((r) => r.fl && r.fl.rank === 1) };
  let lap = 1;
  let timer = null;
  let speed = 900;

  const lapOut = h('span', { class: 'lap-n' }, '1');
  const status = h('span', { class: 'chip' }, '');
  const bestOut = h('span', { class: 'chip ghost' }, '');
  const body = h('tbody');
  const feed = h('ol', { class: 'feed', 'aria-live': 'off' });
  const slider = h('input', { type: 'range', min: '1', max: String(replay.n), value: '1', 'aria-label': 'Tour affiché', class: 'range' });
  const playBtn = h('button', { type: 'button', class: 'btn' }, 'Lecture');

  const tyreChip = (t) => {
    if (!t || !COMPOUNDS[t.compound]) return t ? t.compound || '–' : '–';
    const c = COMPOUNDS[t.compound];
    return h('span', { class: 'tyre', title: `${c.name}, ${t.age} tour${t.age > 1 ? 's' : ''}` }, h('i', { class: 'tc-' + t.compound }, c.letter), h('small', null, String(t.age)));
  };

  function draw() {
    const f = replay.frame(lap);
    lapOut.textContent = String(lap);
    slider.value = String(lap);
    status.textContent = trackLabel(f.track);
    status.className = 'chip st-' + f.track;
    const b = best[lap - 1];
    bestOut.textContent = b ? `Meilleur tour : ${b.code} ${fmtLap(b.ms)} (tour ${b.lap})` : '';
    body.replaceChildren(...f.rows.map((r) => h('tr', { class: r.state === 'out' ? 'out' : r.inPit ? 'pit' : null },
      h('td', null, r.state === 'out' ? h('span', { class: 'pos out' }, 'Ab.') : posBadge(r.rank)),
      h('td', { class: 'l' }, h('span', { class: 'who' }, h('a', { href: `#/pilotes/${(S.drivers.get(r.id) || {}).id || r.id}` }, h('b', { class: 'code' }, r.code), ' ', r.name), h('small', null, r.team))),
      h('td', { class: 'num' }, r.state === 'run' ? (r.gap === 0 ? 'Leader' : r.gap != null ? fmtDelta(r.gap) : '–') : ''),
      h('td', { class: 'num hide-s' }, r.state === 'run' && r.rank > 1 && r.interval != null ? fmtDelta(r.interval) : ''),
      h('td', { class: 'num hide-s' }, r.state === 'run' && r.lastMs ? fmtLap(r.lastMs) : ''),
      h('td', null, String(r.stops)),
      h('td', null, r.state === 'out' ? '–' : tyreChip(r.tyre)),
      h('td', { class: 'l hide-m' }, r.state === 'out' ? `Abandon au tour ${Math.min(r.outLap, replay.n)}${r.status ? ' (' + (statusFR(r.status) || r.status) + ')' : ''}` : r.inPit ? 'Aux stands' : r.state === 'done' ? 'Arrivé' : ''))));
    const ev = f.events.slice(-14).reverse();
    feed.replaceChildren(...(ev.length ? ev.map((e) => h('li', { class: 'ev-' + e.type },
      h('span', { class: 'el' }, `T${e.lap}`),
      h('span', { class: 'et' }, TYPE_LABEL[e.type] || ''),
      h('span', { class: 'etx' }, e.text))) : [h('li', { class: 'ev-empty' }, 'Aucun événement jusqu’ici.')]));
  }
  const stop = () => { if (timer) clearInterval(timer); timer = null; playBtn.textContent = lap >= replay.n ? 'Rejouer' : 'Lecture'; };
  const play = () => {
    if (lap >= replay.n) lap = 1;
    playBtn.textContent = 'Pause';
    timer = setInterval(() => {
      if (lap >= replay.n) { stop(); draw(); return; }
      lap += 1; draw();
    }, speed);
  };
  playBtn.addEventListener('click', () => (timer ? stop() : play()));
  slider.addEventListener('input', () => { lap = +slider.value; draw(); });
  const step = (d) => { stop(); lap = Math.max(1, Math.min(replay.n, lap + d)); draw(); };
  const speedSel = h('select', { 'aria-label': 'Vitesse de lecture' },
    [['Lent', 1800], ['Normal', 900], ['Rapide', 450], ['Très rapide', 200]].map(([l, v]) => h('option', { value: v, selected: v === 900 }, l)));
  speedSel.addEventListener('change', () => { speed = +speedSel.value; if (timer) { stop(); play(); } });

  const el = h('div', { class: 'stack' },
    h('div', { class: 'live-head' },
      h('div', { class: 'lapbox' }, h('span', { class: 'sr' }, 'Tour'), lapOut, h('span', { class: 'of' }, `sur ${replay.n}`)),
      h('div', { class: 'chips' }, status, bestOut,
        sm.pole ? h('span', { class: 'chip ghost' }, `Pole : ${sm.pole.last}`) : null,
        sm.fl ? h('span', { class: 'chip ghost' }, `Meilleur tour de la course : ${sm.fl.last}${sm.fl.fl.time ? ' ' + sm.fl.fl.time : ''}`) : null)),
    h('div', { class: 'controls' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => step(-1), 'aria-label': 'Tour précédent' }, '‹'),
      playBtn,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => step(1), 'aria-label': 'Tour suivant' }, '›'),
      slider,
      h('label', { class: 'field inline' }, h('span', { class: 'sr' }, 'Vitesse'), speedSel)),
    h('div', { class: 'live-grid' },
      h('div', { class: 'scroll' }, h('table', { class: 'tbl live' },
        h('caption', { class: 'sr' }, 'Classement à ce tour'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Pos.'), h('th', { scope: 'col', class: 'l' }, 'Pilote'), h('th', { scope: 'col' }, 'Écart'),
          h('th', { scope: 'col', class: 'hide-s' }, 'Interv.'), h('th', { scope: 'col', class: 'hide-s' }, 'Dernier tour'),
          h('th', { scope: 'col', title: 'Arrêts effectués' }, 'Stands'), h('th', { scope: 'col', title: 'Pneu et âge en tours' }, 'Pneus'), h('th', { scope: 'col', class: 'l hide-m' }, 'État'))),
        body)),
      h('div', null, h('h3', null, 'Événements'), feed)),
    h('p', { class: 'note' }, 'Les écarts sont calculés à partir des temps au tour, au même numéro de tour que le leader. Les changements de position regroupent dépassements et arrêts aux stands.'),
    ...data.notes.map((t) => notice(t)));
  draw();
  el.destroy = stop;
  return el;
}

export function render(ctx, args) {
  const S = ctx.S;
  const done = S.races.filter((r) => S.rounds[r.round] && S.rounds[r.round].results.length);
  const def = done.length ? done[done.length - 1].round : null;
  const n = +args[0] || def;
  const root = h('div');
  const ns = nextSession(S);
  root.append(pageHead('Direct', 'Rejeu de la dernière course, tour par tour.',
    done.length ? gpSelect(S, n, (v) => { location.hash = `#/direct/${v}`; }, { only: (r) => done.includes(r) }) : null));
  root.append(h('section', { class: 'card callout-card' },
    h('p', null, h('strong', null, 'Pas de temps réel ici. '), 'Le fournisseur de données (OpenF1) réserve le direct pendant les séances aux comptes sponsors, avec un jeton qui doit rester sur un serveur. Cette page rejoue donc la dernière course disponible, avec les mêmes informations qu’un suivi en direct.'),
    ns ? h('p', { class: 'sub' }, `Prochaine séance : ${ns.session.label} du ${ns.race.title}, ${fmtFull(ns.session.at)}.`) : null));
  if (!n || !S.rounds[n]) {
    root.append(emptyState('Aucune course à rejouer', 'Le rejeu sera disponible après le premier Grand Prix de la saison.'));
    return root;
  }
  const race = S.races[n - 1];
  const holder = h('section', { class: 'card' }, h('h2', null, `${race.title}, ${fmtDMY(race.date)}`));
  root.append(holder);
  const prog = h('progress', { max: '1', value: '0', 'aria-label': 'Chargement de la course' });
  const loading = h('div', { class: 'loading', role: 'status' }, h('span', { class: 'dot' }), 'Chargement de la course tour par tour (la première fois, environ 15 requêtes)… ', prog);
  holder.append(loading);
  let alive = true;
  let child = null;
  loadReplay(S, n, (p) => { prog.value = p; }).then((data) => {
    if (!alive) return;
    loading.remove();
    if (data.empty) { holder.append(unavailable('Course indisponible', 'Les temps au tour de cette course ne sont pas publiés par le fournisseur.')); return; }
    child = player(S, n, data);
    holder.append(child);
  }).catch((e) => {
    if (!alive) return;
    loading.remove();
    holder.append(unavailable('Chargement impossible', describeError(e)));
    holder.append(h('p', null, h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Réessayer')));
  });
  root.destroy = () => { alive = false; if (child && child.destroy) child.destroy(); };
  return root;
}
