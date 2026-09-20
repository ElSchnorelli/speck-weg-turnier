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

  const allMatches = await dbGetAll('matches');
  let nextMatchNumber = allMatches.reduce((max, m) => Math.max(max, m.matchNumber || 0), 0) + 1;

  for (const m of matches) {
    await dbPut('matches', {
      matchNumber: nextMatchNumber++,
      phase: 'vorrunde',
      roundNumber,
      koLevel: null,
      teamA: m.teamA,
      teamB: m.teamB,
      isFillMatch: m.isFillMatch,
      fillParticipantIds: m.fillParticipantIds,
      feldNummer: null,
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

// Zusätzliches Spaß-Spiel für Spieler, die in der aktuellen Runde
// pausieren. Läuft technisch wie jedes andere Vorrunden-Spiel mit; die
// Regel "bestes von zwei Ergebnissen pro Runde zählt" greift automatisch
// über ranking.js, weil dort nur nach roundNumber gruppiert wird.
export async function addExtraMatch(teamA, teamB) {
  const status = await getStatus();
  if (status.phase !== 'vorrunde') {
    throw new Error('Ein Spaßspiel kann nur während einer laufenden Vorrunde angesetzt werden.');
  }

  const allMatches = await dbGetAll('matches');
  const nextMatchNumber = allMatches.reduce((max, m) => Math.max(max, m.matchNumber || 0), 0) + 1;

  const roundMatches = allMatches.filter((m) => m.phase === 'vorrunde' && m.roundNumber === status.aktuelleRunde);
  const alreadyPlayingIds = new Set();
  roundMatches.forEach((m) => {
    m.teamA.forEach((id) => alreadyPlayingIds.add(id));
    m.teamB.forEach((id) => alreadyPlayingIds.add(id));
  });
  const fillParticipantIds = [...teamA, ...teamB].filter((id) => alreadyPlayingIds.has(id));

  const match = {
    matchNumber: nextMatchNumber,
    phase: 'vorrunde',
    roundNumber: status.aktuelleRunde,
    koLevel: null,
    teamA,
    teamB,
    isFillMatch: true,
    fillParticipantIds,
    feldNummer: null,
    sets: [
      { a: null, b: null },
      { a: null, b: null },
    ],
    status: 'offen',
    winner: null,
  };
  await dbPut('matches', match);
  return match;
}

// Tauscht bei einem Auffüllspiel eine der geliehenen Personen manuell
// gegen eine andere aus (z.B. wenn sich eine bestimmte Person lieber
// freiwillig melden soll als die automatisch ausgeloste).
export async function swapFillParticipant(matchId, oldId, newId) {
  const match = await dbGet('matches', matchId);
  if (!match) throw new Error('Spiel nicht gefunden.');
  if (!match.isFillMatch) throw new Error('Nur bei Auffüllspielen möglich.');
  if (match.status === 'abgeschlossen') throw new Error('Nach Erfassung des Ergebnisses nicht mehr änderbar.');

  const allIds = [...match.teamA, ...match.teamB];
  if (!allIds.includes(oldId)) throw new Error('Person ist nicht Teil dieses Spiels.');
  if (allIds.includes(newId)) throw new Error('Diese Person spielt in diesem Spiel bereits.');

  match.teamA = match.teamA.map((id) => (id === oldId ? newId : id));
  match.teamB = match.teamB.map((id) => (id === oldId ? newId : id));
  match.fillParticipantIds = match.fillParticipantIds.map((id) => (id === oldId ? newId : id));

  await dbPut('matches', match);
  return match;
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
