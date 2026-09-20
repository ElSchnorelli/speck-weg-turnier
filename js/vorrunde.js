import { dbGetAll, dbGet, dbPut } from './db.js';
import { listParticipants } from './participants.js';
import { generateRound } from './draw.js';
import { getStatus, updateStatus } from './status.js';

export { getStatus };

export async function getAllVorrundenMatches() {
  const all = await dbGetAll('matches');
  return all.filter((m) => m.phase === 'vorrunde');
}

export async function getRoundMatches(roundNumber) {
  const all = await getAllVorrundenMatches();
  return all.filter((m) => m.roundNumber === roundNumber);
}

async function drawAndSaveRound(settings, roundNumber) {
  const participants = (await listParticipants()).filter((p) => p.active);
  const pastMatches = await getAllVorrundenMatches();
  const { matches, pausingIds } = generateRound(settings.mode, participants, pastMatches);

  for (const m of matches) {
    await dbPut('matches', {
      phase: 'vorrunde',
      roundNumber,
      koLevel: null,
      teamA: m.teamA,
      teamB: m.teamB,
      isFillMatch: m.isFillMatch,
      fillParticipantIds: m.fillParticipantIds,
      sets: [
        { a: null, b: null },
        { a: null, b: null },
      ],
      status: 'offen',
      winner: null,
    });
  }

  await updateStatus({ phase: 'vorrunde', aktuelleRunde: roundNumber });
  return { pausingIds, matchCount: matches.length };
}

export async function startVorrunde(settings) {
  const status = await getStatus();
  if (status.phase !== 'setup') return status;
  await drawAndSaveRound(settings, 1);
  return getStatus();
}

export async function recordMatchResult(matchId, sets) {
  const match = await dbGet('matches', matchId);
  if (!match) throw new Error('Spiel nicht gefunden.');
  const complete = sets.every((s) => Number.isFinite(s.a) && Number.isFinite(s.b));
  match.sets = sets;
  match.status = complete ? 'abgeschlossen' : 'offen';
  await dbPut('matches', match);
  return match;
}

export async function isCurrentRoundComplete() {
  const status = await getStatus();
  if (status.phase !== 'vorrunde') return false;
  const matches = await getRoundMatches(status.aktuelleRunde);
  return matches.length > 0 && matches.every((m) => m.status === 'abgeschlossen');
}

export async function completeRoundAndAdvance(settings) {
  const status = await getStatus();
  const nextRound = status.aktuelleRunde + 1;

  if (nextRound > settings.vorrundenAnzahl) {
    await updateStatus({ phase: 'vorrunde_fertig', aktuelleRunde: status.aktuelleRunde });
    return { done: true };
  }

  const result = await drawAndSaveRound(settings, nextRound);
  return { done: false, roundNumber: nextRound, ...result };
}
