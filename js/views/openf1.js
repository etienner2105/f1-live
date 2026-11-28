// Passerelle entre le calendrier (Jolpica) et les séances OpenF1.

import { ofSessions } from '../api.js';
import { matchMeeting } from '../model.js';

const cache = new Map();

export async function meetingFor(S, race) {
  const key = `${S.season}:${race.round}`;
  if (cache.has(key)) return cache.get(key);
  const sessions = await ofSessions(S.season);
  const m = matchMeeting(sessions, race);
  if (m) cache.set(key, m);
  return m;
}

// Une séance terminée depuis plus d'une heure ne change plus : on la garde en cache sans limite.
export function ttlFor(session) {
  if (!session || !session.date_end) return 5 * 60e3;
  return Date.parse(session.date_end) < Date.now() - 3600e3 ? Infinity : 5 * 60e3;
}
