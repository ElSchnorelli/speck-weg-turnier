// Auslosungslogik für die Vorrunde.
//
// Regeln (mit Andreas abgestimmt):
// - Zwei Spieler dürfen nie zweimal Team-Partner sein (hartes Verbot).
// - Zwei Spieler sollen möglichst nie zweimal Gegner sein (weiches Verbot,
//   wird nur überschritten, wenn keine andere gültige Auslosung mehr möglich ist).
// - Reicht die Anzahl der gebildeten Teams nicht für volle Spiele (ungerade
//   Team-Anzahl), wird das letzte Spiel mit einem "Auffüll-Team" aus bereits
//   in dieser Runde spielenden Personen aufgefüllt.

export function pairKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildHistory(pastMatches) {
  const partnerPairs = new Set();
  const opponentPairs = new Set();
  for (const m of pastMatches) {
    partnerPairs.add(pairKey(m.teamA[0], m.teamA[1]));
    partnerPairs.add(pairKey(m.teamB[0], m.teamB[1]));
    for (const a of m.teamA) {
      for (const b of m.teamB) opponentPairs.add(pairKey(a, b));
    }
  }
  return { partnerPairs, opponentPairs };
}

// Bipartites perfektes Matching (Kuhn-Algorithmus): verbindet jede Person aus
// groupA mit genau einer Person aus groupB, ohne verbotene Paare. Wird für
// Mix-Teams (1 Dame + 1 Herr) verwendet. Gibt null zurück, wenn unmöglich.
export function bipartiteMatch(groupA, groupB, forbiddenPairs) {
  const adjacency = groupA.map((a) =>
    shuffle(groupB.map((b, j) => (forbiddenPairs.has(pairKey(a, b)) ? -1 : j)).filter((j) => j !== -1))
  );
  const matchOfB = new Array(groupB.length).fill(-1);

  function tryAssign(u, visited) {
    for (const v of adjacency[u]) {
      if (visited.has(v)) continue;
      visited.add(v);
      if (matchOfB[v] === -1 || tryAssign(matchOfB[v], visited)) {
        matchOfB[v] = u;
        return true;
      }
    }
    return false;
  }

  for (const u of shuffle([...groupA.keys()])) {
    if (!tryAssign(u, new Set())) return null;
  }

  return matchOfB.map((uIndex, vIndex) => [groupA[uIndex], groupB[vIndex]]);
}

// Perfektes Matching INNERHALB einer einzelnen Gruppe (z.B. alle Damen
// untereinander für Doppel-Teams), ohne verbotene Paare. Backtracking reicht
// für die kleinen Teilnehmerzahlen eines Vereinsturniers völlig aus.
export function withinGroupMatch(ids, forbiddenPairs) {
  const result = [];

  function backtrack(remaining) {
    if (remaining.length === 0) return true;
    const [first, ...rest] = remaining;
    const candidates = shuffle(rest.filter((id) => !forbiddenPairs.has(pairKey(first, id))));
    for (const candidate of candidates) {
      result.push([first, candidate]);
      const newRest = rest.filter((id) => id !== candidate);
      if (backtrack(newRest)) return true;
      result.pop();
    }
    return false;
  }

  if (!backtrack(shuffle(ids))) return null;
  return result;
}

// Gruppiert fertige Teams zu Spielen (je 2 Teams). Gegner-Wiederholungen
// werden über mehrere zufällige Versuche minimiert (weiches Verbot).
// "Best effort": versucht zuerst eine Paarung ganz ohne Wiederholung. Ist das
// nachweislich unmöglich (z.B. beim Spiel um Platz 3 mit nur noch 2+2
// Spielern), wird als allerletzter Ausweg eine Wiederholung in Kauf
// genommen - besser, als das Turnier komplett zu blockieren.
export function bestEffortBipartiteMatch(groupA, groupB, forbiddenPairs, attempts = 300) {
  const strict = bipartiteMatch(groupA, groupB, forbiddenPairs);
  if (strict) return { pairs: strict, violations: 0 };

  let best = null;
  let bestViolations = Infinity;
  for (let i = 0; i < attempts; i++) {
    const attempt = bipartiteMatch(groupA, groupB, new Set());
    if (!attempt) continue;
    const violations = attempt.filter(([a, b]) => forbiddenPairs.has(pairKey(a, b))).length;
    if (violations < bestViolations) {
      bestViolations = violations;
      best = attempt;
      if (violations === 0) break;
    }
  }
  return { pairs: best, violations: bestViolations };
}

export function bestEffortWithinGroupMatch(ids, forbiddenPairs, attempts = 300) {
  const strict = withinGroupMatch(ids, forbiddenPairs);
  if (strict) return { pairs: strict, violations: 0 };

  let best = null;
  let bestViolations = Infinity;
  for (let i = 0; i < attempts; i++) {
    const attempt = withinGroupMatch(ids, new Set());
    if (!attempt) continue;
    const violations = attempt.filter(([a, b]) => forbiddenPairs.has(pairKey(a, b))).length;
    if (violations < bestViolations) {
      bestViolations = violations;
      best = attempt;
      if (violations === 0) break;
    }
  }
  return { pairs: best, violations: bestViolations };
}

export function groupTeamsIntoMatches(teams, opponentPairs, attempts = 200) {
  let best = null;
  let bestConflicts = Infinity;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = shuffle(teams);
    const pairs = [];
    let conflicts = 0;

    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const teamA = shuffled[i];
      const teamB = shuffled[i + 1];
      for (const a of teamA) {
        for (const b of teamB) {
          if (opponentPairs.has(pairKey(a, b))) conflicts++;
        }
      }
      pairs.push({ teamA, teamB });
    }

    const leftover = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;

    if (conflicts < bestConflicts) {
      bestConflicts = conflicts;
      best = { pairs, leftover };
      if (conflicts === 0) break;
    }
  }

  return best;
}

function pickAuffuellerPair(candidatePool, excludeIds, forbiddenPairs) {
  const pool = shuffle(candidatePool.filter((id) => !excludeIds.includes(id)));
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (!forbiddenPairs.has(pairKey(pool[i], pool[j]))) return [pool[i], pool[j]];
    }
  }
  // Keine perfekte Lösung gefunden: lieber ein wiederholtes Team-Paar als das
  // Spiel ganz ausfallen zu lassen.
  return pool.length >= 2 ? [pool[0], pool[1]] : null;
}

function buildMatches(teams, history, allPlayingIds) {
  const grouped = groupTeamsIntoMatches(teams, history.opponentPairs);
  if (!grouped) return [];

  const matches = grouped.pairs.map(({ teamA, teamB }) => ({
    teamA,
    teamB,
    isFillMatch: false,
    fillParticipantIds: [],
  }));

  if (grouped.leftover) {
    // Das Auffüll-Team darf auch keine Kombination sein, die in DIESER
    // Runde bereits als reguläres Team gebildet wurde.
    const currentRoundTeamPairs = new Set(teams.map(([a, b]) => pairKey(a, b)));
    const forbiddenForFill = new Set([...history.partnerPairs, ...currentRoundTeamPairs]);
    const fillPair = pickAuffuellerPair(allPlayingIds, grouped.leftover, forbiddenForFill);
    if (fillPair) {
      matches.push({
        teamA: grouped.leftover,
        teamB: fillPair,
        isFillMatch: true,
        fillParticipantIds: fillPair,
      });
    }
  }

  return matches;
}

function generateMixRound(activeParticipants, history) {
  const women = shuffle(activeParticipants.filter((p) => p.gender === 'W').map((p) => p.id));
  const men = shuffle(activeParticipants.filter((p) => p.gender === 'M').map((p) => p.id));
  const teamsCount = Math.min(women.length, men.length);

  if (teamsCount === 0) {
    throw new Error('Mix-Modus benötigt mindestens eine Dame und einen Herrn.');
  }

  const womenPlaying = women.slice(0, teamsCount);
  const menPlaying = men.slice(0, teamsCount);
  const pausingIds = [...women.slice(teamsCount), ...men.slice(teamsCount)];

  const teamPairs = bipartiteMatch(womenPlaying, menPlaying, history.partnerPairs);
  if (!teamPairs) {
    throw new Error('Keine gültige Auslosung ohne Wiederholung der Team-Partner gefunden. Evtl. sind zu viele Vorrunden für die Teilnehmerzahl geplant.');
  }

  const matches = buildMatches(teamPairs, history, [...womenPlaying, ...menPlaying]);
  return { matches, pausingIds };
}

function generateSameGenderGroup(ids, history) {
  const playableCount = ids.length - (ids.length % 2);
  const playing = ids.slice(0, playableCount);
  const pausingIds = ids.slice(playableCount);

  if (playing.length === 0) return { matches: [], pausingIds };

  const teams = withinGroupMatch(playing, history.partnerPairs);
  if (!teams) {
    throw new Error('Keine gültige Auslosung ohne Wiederholung der Team-Partner gefunden. Evtl. sind zu viele Vorrunden für die Teilnehmerzahl geplant.');
  }

  const matches = buildMatches(teams, history, playing);
  return { matches, pausingIds };
}

function generateDoppelRound(activeParticipants, history) {
  const women = shuffle(activeParticipants.filter((p) => p.gender === 'W').map((p) => p.id));
  const men = shuffle(activeParticipants.filter((p) => p.gender === 'M').map((p) => p.id));

  const womenResult = generateSameGenderGroup(women, history);
  const menResult = generateSameGenderGroup(men, history);

  return {
    matches: [...womenResult.matches, ...menResult.matches],
    pausingIds: [...womenResult.pausingIds, ...menResult.pausingIds],
  };
}

export function generateRound(mode, activeParticipants, pastMatches) {
  const history = buildHistory(pastMatches);
  return mode === 'mix'
    ? generateMixRound(activeParticipants, history)
    : generateDoppelRound(activeParticipants, history);
}
