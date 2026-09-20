// KO-Runde.
//
// Mit Andreas abgestimmte Regeln:
// - Bei Doppel bleiben Damen und Herren getrennt: zwei eigene KO-Bäume
//   ("damen", "herren"), jeder mit eigenem Platz 1-4.
// - Bei Mix gibt es einen gemeinsamen KO-Baum ("mix"). Für gültige Mix-Teams
//   kommen die besten (Größe/2) Damen UND die besten (Größe/2) Herren
//   getrennt nach Vorrunden-Platzierung weiter.
// - Paarungen werden jede KO-Runde neu ausgelost, Team-Partner dürfen sich
//   innerhalb der KO-Phase (innerhalb desselben Baums) nie wiederholen.
// - Bei 1:1 nach zwei Sätzen entscheidet ein dritter Satz.
// - Der gesamte Fortschritt (welche Runde gerade läuft, wer gewonnen hat)
//   wird ausschließlich aus den gespeicherten Spielen abgeleitet - es gibt
//   keinen zusätzlichen Zähler, der aus dem Ruder laufen könnte.

import { dbGetAll, dbPut } from './db.js';
import { listParticipants } from './participants.js';
import { getAllVorrundenMatches } from './vorrunde.js';
import { computeStandings } from './ranking.js';
import { getStatus, updateStatus } from './status.js';
import { bestEffortBipartiteMatch, bestEffortWithinGroupMatch, groupTeamsIntoMatches, buildHistory, shuffle } from './draw.js';

function levelLabel(matchCount) {
  if (matchCount === 1) return 'Finale';
  if (matchCount === 2) return 'Halbfinale';
  if (matchCount === 4) return 'Viertelfinale';
  if (matchCount === 8) return 'Achtelfinale';
  return `KO-Runde (${matchCount} Spiele)`;
}

// Für eine KO-Größe von N Spielern: N/2 Teams, N/4 Spiele in der ersten
// Runde, danach halbiert sich die Spielanzahl bis zum Finale (1 Spiel).
export function computeLevels(size) {
  const levels = [];
  let matches = size / 4;
  while (matches >= 1) {
    levels.push({ matches, label: levelLabel(matches) });
    matches = matches / 2;
  }
  return levels;
}

export function validKoSizes(count) {
  const sizes = [];
  let n = 8;
  while (n <= count) {
    sizes.push(n);
    n *= 2;
  }
  return sizes;
}

export async function getEligibleCounts() {
  const participants = await listParticipants();
  const vorrundenMatches = await getAllVorrundenMatches();
  const standings = computeStandings(participants, vorrundenMatches);
  return {
    women: standings.filter((s) => s.gender === 'W').length,
    men: standings.filter((s) => s.gender === 'M').length,
    standings,
  };
}

async function getKoMatches(bracket) {
  const all = await dbGetAll('matches');
  return all.filter((m) => m.phase === 'ko' && m.bracket === bracket);
}

function emptySets() {
  return [
    { a: null, b: null },
    { a: null, b: null },
    { a: null, b: null },
  ];
}

async function saveLevelMatches(bracket, levelIndex, label, teamPairs, isPlatz3 = false) {
  for (const { teamA, teamB } of teamPairs) {
    await dbPut('matches', {
      phase: 'ko',
      bracket,
      roundNumber: levelIndex + 1,
      koLevel: label,
      isPlatz3,
      teamA,
      teamB,
      isFillMatch: false,
      fillParticipantIds: [],
      sets: emptySets(),
      status: 'offen',
      winner: null,
    });
  }
}

function genderMap(participants) {
  return new Map(participants.map((p) => [p.id, p.gender]));
}

async function drawTeamsForLevel(bracket, playerPool, participants) {
  const pastMatches = await getKoMatches(bracket);
  const history = buildHistory(pastMatches);

  if (bracket === 'mix') {
    const { pairs: teams, violations } = bestEffortBipartiteMatch(shuffle(playerPool.women), shuffle(playerPool.men), history.partnerPairs);
    if (!teams) throw new Error('KO-Auslosung nicht möglich: keine passenden Damen/Herren-Paare mehr übrig.');
    if (violations > 0) console.warn(`KO-Auslosung (${bracket}): ${violations} Team-Wiederholung(en) waren nicht vermeidbar.`);
    return groupTeamsIntoMatches(teams, history.opponentPairs);
  }

  const { pairs: teams, violations } = bestEffortWithinGroupMatch(shuffle(playerPool), history.partnerPairs);
  if (!teams) throw new Error('KO-Auslosung nicht möglich: keine passenden Paare mehr übrig.');
  if (violations > 0) console.warn(`KO-Auslosung (${bracket}): ${violations} Team-Wiederholung(en) waren nicht vermeidbar.`);
  return groupTeamsIntoMatches(teams, history.opponentPairs);
}

async function generateLevel(bracket, levelIndex, size, playerPool) {
  const levels = computeLevels(size);
  const level = levels[levelIndex];
  const participants = await listParticipants();
  const grouped = await drawTeamsForLevel(bracket, playerPool, participants);
  await saveLevelMatches(bracket, levelIndex, level.label, grouped.pairs);
}

export async function startBracket(bracket, size) {
  const { standings } = await getEligibleCounts();

  let initialPool;
  if (bracket === 'mix') {
    const half = size / 2;
    initialPool = {
      women: standings.filter((s) => s.gender === 'W').slice(0, half).map((s) => s.id),
      men: standings.filter((s) => s.gender === 'M').slice(0, half).map((s) => s.id),
    };
  } else {
    const gender = bracket === 'damen' ? 'W' : 'M';
    initialPool = standings.filter((s) => s.gender === gender).slice(0, size).map((s) => s.id);
  }

  await generateLevel(bracket, 0, size, initialPool);

  const status = await getStatus();
  await updateStatus({
    phase: 'ko',
    koBrackets: { ...status.koBrackets, [bracket]: { size } },
  });
}

function getCurrentLevelIndex(matches) {
  const regularRounds = matches.filter((m) => !m.isPlatz3).map((m) => m.roundNumber);
  if (regularRounds.length === 0) return -1;
  return Math.max(...regularRounds) - 1;
}

export async function getBracketView(bracket) {
  const status = await getStatus();
  const bracketConfig = status.koBrackets[bracket];
  if (!bracketConfig) return null;

  const size = bracketConfig.size;
  const levels = computeLevels(size);
  const matches = await getKoMatches(bracket);
  const levelIndex = getCurrentLevelIndex(matches);
  const currentLevel = levels[levelIndex];
  const currentMatches = matches.filter((m) => m.roundNumber === levelIndex + 1 && !m.isPlatz3);
  const platz3Match = matches.find((m) => m.isPlatz3) || null;

  const levelComplete = currentMatches.length > 0 && currentMatches.every((m) => m.status === 'abgeschlossen');
  const isLastLevel = levelIndex === levels.length - 1;
  const mainDone = isLastLevel && levelComplete;
  const platz3Done = !platz3Match || platz3Match.status === 'abgeschlossen';
  const bracketDone = mainDone && platz3Done;

  return {
    bracket,
    size,
    levels,
    levelIndex,
    currentLevel,
    currentMatches,
    platz3Match,
    levelComplete,
    isLastLevel,
    mainDone,
    bracketDone,
  };
}

function winnersAndLosers(matches) {
  const winners = [];
  const losers = [];
  for (const m of matches) {
    const winningTeam = m.winner === 'A' ? m.teamA : m.teamB;
    const losingTeam = m.winner === 'A' ? m.teamB : m.teamA;
    winners.push(...winningTeam);
    losers.push(...losingTeam);
  }
  return { winners, losers };
}

export async function advanceBracket(bracket) {
  const view = await getBracketView(bracket);
  if (!view) throw new Error('KO-Baum wurde noch nicht gestartet.');
  if (!view.levelComplete) throw new Error('Bitte zuerst alle Ergebnisse dieser Runde eintragen.');

  const { winners, losers } = winnersAndLosers(view.currentMatches);
  const participants = await listParticipants();

  if (view.currentLevel.matches === 2 && !view.platz3Match) {
    const platz3Pool = bracket === 'mix'
      ? { women: losers.filter((id) => genderMap(participants).get(id) === 'W'), men: losers.filter((id) => genderMap(participants).get(id) === 'M') }
      : losers;
    const grouped = await drawTeamsForLevel(bracket, platz3Pool, participants);
    await saveLevelMatches(bracket, view.levelIndex, 'Spiel um Platz 3', grouped.pairs, true);
  }

  if (!view.isLastLevel) {
    const nextPool = bracket === 'mix'
      ? { women: winners.filter((id) => genderMap(participants).get(id) === 'W'), men: winners.filter((id) => genderMap(participants).get(id) === 'M') }
      : winners;
    await generateLevel(bracket, view.levelIndex + 1, view.size, nextPool);
  }

  await checkAndFinalizeTournament();
}

export async function recordKoMatchResult(matchId, sets) {
  const all = await dbGetAll('matches');
  const match = all.find((m) => m.id === matchId);
  if (!match) throw new Error('Spiel nicht gefunden.');

  const filled = sets.filter((s) => s && Number.isFinite(s.a) && Number.isFinite(s.b));
  let winner = null;
  let status = 'offen';

  if (filled.length >= 2) {
    let winsA = 0;
    let winsB = 0;
    for (const s of filled.slice(0, 2)) {
      if (s.a > s.b) winsA++;
      else if (s.b > s.a) winsB++;
    }

    if (winsA === 2) {
      winner = 'A';
      status = 'abgeschlossen';
    } else if (winsB === 2) {
      winner = 'B';
      status = 'abgeschlossen';
    } else if (filled.length >= 3) {
      const third = filled[2];
      if (third.a === third.b) throw new Error('Der dritte Satz darf nicht unentschieden enden.');
      winner = third.a > third.b ? 'A' : 'B';
      status = 'abgeschlossen';
    }
  }

  match.sets = sets;
  match.winner = winner;
  match.status = status;
  await dbPut('matches', match);

  // Nach dem Finale bzw. dem Spiel um Platz 3 ist nichts mehr auszulosen -
  // ohne diesen Check würde der Gesamtstatus nie auf "fertig" wechseln,
  // weil dann kein "Nächste Runde auslosen"-Klick mehr stattfindet.
  if (status === 'abgeschlossen') {
    await checkAndFinalizeTournament();
  }

  return match;
}

export function needsThirdSet(sets) {
  const filled = sets.filter((s) => s && Number.isFinite(s.a) && Number.isFinite(s.b));
  if (filled.length < 2) return false;
  const [s1, s2] = filled;
  const winsA = (s1.a > s1.b ? 1 : 0) + (s2.a > s2.b ? 1 : 0);
  const winsB = (s1.b > s1.a ? 1 : 0) + (s2.b > s2.a ? 1 : 0);
  return winsA === 1 && winsB === 1;
}

export async function getFinalPlacements(bracket) {
  const view = await getBracketView(bracket);
  if (!view || !view.bracketDone) return null;

  const finalMatch = view.currentMatches[0];
  const platz1 = finalMatch.winner === 'A' ? finalMatch.teamA : finalMatch.teamB;
  const platz2 = finalMatch.winner === 'A' ? finalMatch.teamB : finalMatch.teamA;

  let platz3 = [];
  let platz4 = [];
  if (view.platz3Match) {
    platz3 = view.platz3Match.winner === 'A' ? view.platz3Match.teamA : view.platz3Match.teamB;
    platz4 = view.platz3Match.winner === 'A' ? view.platz3Match.teamB : view.platz3Match.teamA;
  }

  return { platz1, platz2, platz3, platz4 };
}

async function checkAndFinalizeTournament() {
  const status = await getStatus();
  const bracketNames = Object.keys(status.koBrackets);
  if (bracketNames.length === 0) return;

  const views = await Promise.all(bracketNames.map((b) => getBracketView(b)));
  const allDone = views.every((v) => v && v.bracketDone);
  if (allDone && status.phase !== 'fertig') {
    await updateStatus({ phase: 'fertig' });
  }
}
