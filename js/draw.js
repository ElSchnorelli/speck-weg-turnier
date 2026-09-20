// Auslosungslogik für die Vorrunde.
//
// Regeln (mit Andreas abgestimmt):
// - Zwei Spieler dürfen nie zweimal Team-Partner sein (hartes Verbot).
// - Zwei Spieler sollen möglichst nie zweimal Gegner sein (weiches Verbot,
//   wird nur überschritten, wenn keine andere gültige Auslosung mehr möglich ist).
// - Ein Spiel braucht 4 Personen (2 Teams). Reicht die Teilnehmerzahl nicht
//   für volle Spiele, werden die übrigen Personen (1-3) automatisch in ein
//   Auffüllspiel gesteckt: Freiwillige aus bereits vollständigen Spielen
//   füllen die fehlenden Plätze auf. Niemand muss deswegen pausieren -
//   außer es sind insgesamt zu wenige Teilnehmer da, um überhaupt ein
//   erstes volles Spiel zu bilden.

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

// Baut EIN Auffüllspiel innerhalb einer Geschlechtsgruppe (Doppel): restIds
// (leftoverPair und/oder oddOne, zusammen 1-3 Personen ohne eigenes Spiel)
// werden in ein Spiel gesetzt. Die fehlenden Plätze bleiben absichtlich OFFEN
// (null) - der Trainer wählt die Auffüller-Person(en) danach manuell per
// Dropdown aus (siehe fillSlots). Gibt null zurück, wenn es rein rechnerisch
// gar keine Person mehr geben kann, die auffüllen könnte (zu wenige
// Teilnehmer/innen dieses Geschlechts insgesamt).
function buildAuffuellMatch(leftoverPair, oddOne, gender, totalGenderCount) {
  const restCount = (leftoverPair ? 2 : 0) + (oddOne != null ? 1 : 0);
  if (restCount === 0) return null;

  const needed = 4 - restCount;
  const possibleVolunteers = totalGenderCount - restCount;
  if (possibleVolunteers < needed) return null;

  let teamA;
  let teamB;
  if (leftoverPair) {
    teamA = [leftoverPair[0], leftoverPair[1]];
    teamB = oddOne != null ? [oddOne, null] : [null, null];
  } else {
    teamA = [oddOne, null];
    teamB = [null, null];
  }

  const fillSlots = [];
  for (const team of ['A', 'B']) {
    const arr = team === 'A' ? teamA : teamB;
    arr.forEach((value, index) => {
      if (value === null) fillSlots.push({ team, index, gender });
    });
  }

  return { teamA, teamB, fillSlots };
}

// Wie buildAuffuellMatch, aber für Mix: das übrig gebliebene Team
// (leftoverTeam = [Dame, Herr]) ist schon vollständig - es fehlt nur noch
// ein zweites Mix-Team als Gegner. Beide Plätze bleiben offen, damit der
// Trainer Dame und Herr manuell zuweisen kann.
function buildMixAuffuellMatch(leftoverTeam, womenPlaying, menPlaying) {
  const [leftWoman, leftMan] = leftoverTeam;
  const womenAvailable = womenPlaying.filter((id) => id !== leftWoman).length;
  const menAvailable = menPlaying.filter((id) => id !== leftMan).length;
  if (womenAvailable === 0 || menAvailable === 0) return null;

  const teamB = [null, null];
  const fillSlots = [
    { team: 'B', index: 0, gender: 'W' },
    { team: 'B', index: 1, gender: 'M' },
  ];
  return { teamA: leftoverTeam, teamB, fillSlots };
}

// Füllt die Damen bzw. Herren auf, die bei Mix wegen eines
// Geschlechter-Überschusses ohne eigenes Team geblieben sind: je 2
// Überschuss-Personen bekommen ein eigenes Auffüllspiel mit 2 offenen
// Plätzen für das andere Geschlecht. Bleibt eine einzelne Person übrig,
// bekommt sie zusätzlich ein komplett offenes Gegner-Team. Die konkrete
// Auffüller-Person wählt der Trainer danach manuell per Dropdown.
function fillMixExcess(excessIds, excessGender) {
  if (excessIds.length === 0) return { matches: [], pausingIds: [] };

  const opponentGender = excessGender === 'W' ? 'M' : 'W';
  const partnerSlotIndex = excessGender === 'W' ? 1 : 0;
  const partnerTeam = (excessId) => (excessGender === 'W' ? [excessId, null] : [null, excessId]);

  const matches = [];
  const remaining = [...excessIds];

  while (remaining.length >= 2) {
    const p1 = remaining[0];
    const p2 = remaining[1];
    matches.push({
      teamA: partnerTeam(p1),
      teamB: partnerTeam(p2),
      isFillMatch: true,
      fillSlots: [
        { team: 'A', index: partnerSlotIndex, gender: opponentGender },
        { team: 'B', index: partnerSlotIndex, gender: opponentGender },
      ],
      fillParticipantIds: [],
    });
    remaining.splice(0, 2);
  }

  if (remaining.length === 1) {
    const p1 = remaining[0];
    matches.push({
      teamA: partnerTeam(p1),
      teamB: [null, null],
      isFillMatch: true,
      fillSlots: [
        { team: 'A', index: partnerSlotIndex, gender: opponentGender },
        { team: 'B', index: 0, gender: excessGender },
        { team: 'B', index: 1, gender: opponentGender },
      ],
      fillParticipantIds: [],
    });
    remaining.pop();
  }

  return { matches, pausingIds: remaining };
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
  const excessWomen = women.slice(teamsCount);
  const excessMen = men.slice(teamsCount);

  const teamPairs = bipartiteMatch(womenPlaying, menPlaying, history.partnerPairs);
  if (!teamPairs) {
    throw new Error('Keine gültige Auslosung ohne Wiederholung der Team-Partner gefunden. Evtl. sind zu viele Vorrunden für die Teilnehmerzahl geplant.');
  }

  const grouped = groupTeamsIntoMatches(teamPairs, history.opponentPairs);
  const matches = grouped
    ? grouped.pairs.map(({ teamA, teamB }) => ({ teamA, teamB, isFillMatch: false, fillParticipantIds: [], fillSlots: [] }))
    : [];

  // Übrig gebliebenes Team bei ungerader Team-Anzahl: Auffüllspiel mit
  // offenen Plätzen für ein zweites Mix-Team (Trainer wählt manuell).
  if (grouped?.leftover) {
    const auffuell = buildMixAuffuellMatch(grouped.leftover, womenPlaying, menPlaying);
    if (auffuell) {
      matches.push({
        teamA: auffuell.teamA,
        teamB: auffuell.teamB,
        isFillMatch: true,
        fillParticipantIds: [],
        fillSlots: auffuell.fillSlots,
      });
    }
  }

  // Geschlechter-Überschuss (mehr Damen als Herren oder umgekehrt) ebenfalls
  // über Auffüllspiele einbinden statt pausieren zu lassen.
  const excessIds = excessWomen.length > 0 ? excessWomen : excessMen;
  const excessGender = excessWomen.length > 0 ? 'W' : 'M';
  const { matches: excessMatches, pausingIds } = fillMixExcess(excessIds, excessGender);
  matches.push(...excessMatches);

  return { matches, pausingIds };
}

function generateSameGenderGroup(ids, history, gender) {
  // Für die Team-Bildung selbst wird die größtmögliche gerade Anzahl
  // genutzt (nicht nur Vielfache von 4) - das gibt der Partner-Rotation
  // über mehrere Runden hinweg den größtmöglichen Spielraum.
  const playableCount = ids.length - (ids.length % 2);
  const playing = ids.slice(0, playableCount);
  const oddOneOut = ids.slice(playableCount); // 0 oder 1 Person ohne Team

  const matches = [];

  if (playing.length === 0) {
    return { matches, pausingIds: oddOneOut };
  }

  const teams = withinGroupMatch(playing, history.partnerPairs);
  if (!teams) {
    throw new Error('Keine gültige Auslosung ohne Wiederholung der Team-Partner gefunden. Evtl. sind zu viele Vorrunden für die Teilnehmerzahl geplant.');
  }
  const grouped = groupTeamsIntoMatches(teams, history.opponentPairs);
  if (grouped) {
    matches.push(...grouped.pairs.map(({ teamA, teamB }) => ({ teamA, teamB, isFillMatch: false, fillParticipantIds: [], fillSlots: [] })));
  }

  // Restpersonen fürs Auffüllspiel: das evtl. übrig gebliebene Team (bei
  // ungerader Team-Anzahl) UND die evtl. einzelne Person ohne Team (bei
  // ungerader Gesamtzahl). Die fehlenden Plätze bleiben offen - der Trainer
  // wählt die Auffüller-Person(en) manuell per Dropdown.
  const leftoverPair = grouped?.leftover || null;
  const oddOne = oddOneOut[0] ?? null;
  let pausingIds = [];

  if (leftoverPair || oddOne != null) {
    const auffuell = buildAuffuellMatch(leftoverPair, oddOne, gender, ids.length);
    if (auffuell) {
      matches.push({
        teamA: auffuell.teamA,
        teamB: auffuell.teamB,
        isFillMatch: true,
        fillParticipantIds: [],
        fillSlots: auffuell.fillSlots,
      });
    } else {
      // Zu wenige Teilnehmer/innen dieses Geschlechts insgesamt, um
      // überhaupt noch jemanden zum Auffüllen finden zu können.
      pausingIds = [...(leftoverPair || []), ...(oddOne != null ? [oddOne] : [])];
    }
  }

  return { matches, pausingIds };
}

function generateDoppelRound(activeParticipants, history) {
  const women = shuffle(activeParticipants.filter((p) => p.gender === 'W').map((p) => p.id));
  const men = shuffle(activeParticipants.filter((p) => p.gender === 'M').map((p) => p.id));

  const womenResult = generateSameGenderGroup(women, history, 'W');
  const menResult = generateSameGenderGroup(men, history, 'M');

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
