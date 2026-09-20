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

// Wählt `count` verschiedene, noch nicht ausgeschlossene Personen zufällig
// aus einem Pool (z.B. um Freiwillige für ein Auffüllspiel zu finden).
function pickVolunteers(pool, excludeIds, count) {
  const excludeSet = new Set(excludeIds);
  const candidates = shuffle(pool.filter((id) => !excludeSet.has(id)));
  return candidates.slice(0, count);
}

// Baut EIN Auffüllspiel innerhalb einer Geschlechtsgruppe (Doppel): restIds
// (1-3 Personen ohne eigenes Spiel) werden mit Freiwilligen aus dem Pool der
// bereits verplanten Spieler zu einem vollen Spiel (4 Personen, 2 Teams)
// ergänzt. Gibt null zurück, wenn nicht genug Freiwillige verfügbar sind.
function buildAuffuellMatch(restIds, volunteerPool, forbiddenPairs, attempts = 30) {
  const needed = 4 - restIds.length;
  if (needed <= 0 || needed > volunteerPool.length) return null;

  for (let i = 0; i < attempts; i++) {
    const volunteers = pickVolunteers(volunteerPool, restIds, needed);
    if (volunteers.length < needed) return null;
    const group = [...restIds, ...volunteers];
    const teams = withinGroupMatch(group, forbiddenPairs);
    if (teams && teams.length === 2) {
      return { teamA: teams[0], teamB: teams[1], fillParticipantIds: volunteers };
    }
  }

  // Fallback: lieber ein wiederholtes Team-Paar als gar kein Spiel.
  const volunteers = pickVolunteers(volunteerPool, restIds, needed);
  if (volunteers.length < needed) return null;
  const group = shuffle([...restIds, ...volunteers]);
  return {
    teamA: [group[0], group[1]],
    teamB: [group[2], group[3]],
    fillParticipantIds: volunteers,
  };
}

// Wie buildAuffuellMatch, aber für Mix: das übrig gebliebene Team
// (leftoverTeam = [Dame, Herr]) ist schon vollständig - es fehlt nur noch
// ein zweites, komplett geliehenes Mix-Team als Gegner.
function buildMixAuffuellMatch(leftoverTeam, womenPlaying, menPlaying, forbiddenPairs, attempts = 30) {
  const [leftWoman, leftMan] = leftoverTeam;
  const womenPool = womenPlaying.filter((id) => id !== leftWoman);
  const menPool = menPlaying.filter((id) => id !== leftMan);
  if (womenPool.length === 0 || menPool.length === 0) return null;

  for (let i = 0; i < attempts; i++) {
    const w = shuffle(womenPool)[0];
    const m = shuffle(menPool)[0];
    if (!forbiddenPairs.has(pairKey(w, m))) {
      return { teamA: leftoverTeam, teamB: [w, m], fillParticipantIds: [w, m] };
    }
  }

  // Fallback: lieber eine wiederholte Team-Paarung als gar kein Spiel.
  const w = shuffle(womenPool)[0];
  const m = shuffle(menPool)[0];
  return { teamA: leftoverTeam, teamB: [w, m], fillParticipantIds: [w, m] };
}

// Füllt die Damen bzw. Herren auf, die bei Mix wegen eines
// Geschlechter-Überschusses ohne eigenes Team geblieben sind: je 2
// Überschuss-Personen werden mit 2 geliehenen Partnern des anderen
// Geschlechts zu einem eigenen Auffüllspiel zusammengestellt. Bleibt eine
// einzelne Person übrig, wird für sie zusätzlich ein komplett geliehenes
// Gegner-Team gesucht. Reichen die Freiwilligen nicht mehr aus, pausiert
// der Rest (pausingIds).
function fillMixExcess(excessIds, excessGender, womenPlaying, menPlaying) {
  if (excessIds.length === 0) return { matches: [], pausingIds: [] };

  const opponentPool = excessGender === 'W' ? menPlaying : womenPlaying;
  const samePool = excessGender === 'W' ? womenPlaying : menPlaying;
  const usedVolunteers = new Set();

  function takeVolunteer(pool) {
    const available = shuffle(pool.filter((id) => !usedVolunteers.has(id)));
    if (available.length === 0) return null;
    usedVolunteers.add(available[0]);
    return available[0];
  }

  function makeTeam(excessId, volunteerId) {
    return excessGender === 'W' ? [excessId, volunteerId] : [volunteerId, excessId];
  }

  const matches = [];
  const remaining = [...excessIds];

  while (remaining.length >= 2) {
    const p1 = remaining[0];
    const p2 = remaining[1];
    const v1 = takeVolunteer(opponentPool);
    const v2 = takeVolunteer(opponentPool);
    if (!v1 || !v2) break; // keine Freiwilligen mehr -> Rest pausiert

    matches.push({ teamA: makeTeam(p1, v1), teamB: makeTeam(p2, v2), isFillMatch: true, fillParticipantIds: [v1, v2] });
    remaining.splice(0, 2);
  }

  if (remaining.length === 1) {
    const p1 = remaining[0];
    const v1 = takeVolunteer(opponentPool);
    const v2 = takeVolunteer(samePool);
    const v3 = takeVolunteer(opponentPool);
    if (v1 && v2 && v3) {
      matches.push({ teamA: makeTeam(p1, v1), teamB: makeTeam(v2, v3), isFillMatch: true, fillParticipantIds: [v1, v2, v3] });
      remaining.pop();
    }
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

  const currentRoundTeamPairs = new Set(teamPairs.map(([a, b]) => pairKey(a, b)));
  const grouped = groupTeamsIntoMatches(teamPairs, history.opponentPairs);
  const matches = grouped
    ? grouped.pairs.map(({ teamA, teamB }) => ({ teamA, teamB, isFillMatch: false, fillParticipantIds: [] }))
    : [];

  const forbiddenForFill = new Set([...history.partnerPairs, ...currentRoundTeamPairs]);

  // Übrig gebliebenes Team bei ungerader Team-Anzahl: mit einem geliehenen
  // Mix-Team auffüllen.
  if (grouped?.leftover) {
    const auffuell = buildMixAuffuellMatch(grouped.leftover, womenPlaying, menPlaying, forbiddenForFill);
    if (auffuell) {
      matches.push({ teamA: auffuell.teamA, teamB: auffuell.teamB, isFillMatch: true, fillParticipantIds: auffuell.fillParticipantIds });
    }
  }

  // Geschlechter-Überschuss (mehr Damen als Herren oder umgekehrt) ebenfalls
  // über Auffüllspiele einbinden statt pausieren zu lassen.
  const excessIds = excessWomen.length > 0 ? excessWomen : excessMen;
  const excessGender = excessWomen.length > 0 ? 'W' : 'M';
  const { matches: excessMatches, pausingIds } = fillMixExcess(excessIds, excessGender, womenPlaying, menPlaying);
  matches.push(...excessMatches);

  return { matches, pausingIds };
}

function generateSameGenderGroup(ids, history) {
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
  const currentRoundTeamPairs = new Set(teams.map(([a, b]) => pairKey(a, b)));
  const grouped = groupTeamsIntoMatches(teams, history.opponentPairs);
  if (grouped) {
    matches.push(...grouped.pairs.map(({ teamA, teamB }) => ({ teamA, teamB, isFillMatch: false, fillParticipantIds: [] })));
  }

  // Restpersonen für EIN gemeinsames Auffüllspiel sammeln: das evtl. übrig
  // gebliebene Team (bei ungerader Team-Anzahl) UND die evtl. einzelne
  // Person ohne Team (bei ungerader Gesamtzahl) - beides zusammen ergibt
  // maximal 3 Personen, die mit Freiwilligen aus den regulären Spielen zu
  // einem vollen Spiel ergänzt werden.
  const restIds = [...(grouped?.leftover || []), ...oddOneOut];
  let pausingIds = [];

  if (restIds.length > 0) {
    const forbiddenForFill = new Set([...history.partnerPairs, ...currentRoundTeamPairs]);
    const auffuell = buildAuffuellMatch(restIds, playing, forbiddenForFill);
    if (auffuell) {
      matches.push({ teamA: auffuell.teamA, teamB: auffuell.teamB, isFillMatch: true, fillParticipantIds: auffuell.fillParticipantIds });
    } else {
      // Zu wenige Teilnehmer insgesamt, um noch Freiwillige zu finden.
      pausingIds = restIds;
    }
  }

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
