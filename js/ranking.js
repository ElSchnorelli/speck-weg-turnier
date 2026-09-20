// Berechnet die Rangliste aus allen abgeschlossenen Vorrunden-Spielen.
// Sonderregel "Auffüller": Hat ein Spieler in einer Runde zwei Ergebnisse
// (sein reguläres Spiel + ein Auffüll-Spiel), zählt nur das bessere der
// beiden - das schlechtere wird verworfen.

function resultFromSets(sets, isTeamA) {
  let setsWon = 0;
  let setsLost = 0;
  let pointsWon = 0;
  let pointsLost = 0;

  for (const set of sets) {
    if (set.a == null || set.b == null) continue;
    const own = isTeamA ? set.a : set.b;
    const opp = isTeamA ? set.b : set.a;
    pointsWon += own;
    pointsLost += opp;
    if (own > opp) setsWon++;
    else if (opp > own) setsLost++;
  }

  return { setsWon, setsLost, pointsWon, pointsLost };
}

function isBetter(a, b) {
  if (a.setsWon !== b.setsWon) return a.setsWon > b.setsWon ? a : b;
  const diffA = a.pointsWon - a.pointsLost;
  const diffB = b.pointsWon - b.pointsLost;
  return diffA >= diffB ? a : b;
}

export function computeStandings(participants, vorrundenMatches) {
  const completed = vorrundenMatches.filter((m) => m.status === 'abgeschlossen');

  // participantId -> roundNumber -> Array von Ergebnissen dieser Runde
  const perPlayerRounds = new Map();

  function addResult(participantId, roundNumber, result) {
    if (!perPlayerRounds.has(participantId)) perPlayerRounds.set(participantId, new Map());
    const rounds = perPlayerRounds.get(participantId);
    if (!rounds.has(roundNumber)) rounds.set(roundNumber, []);
    rounds.get(roundNumber).push(result);
  }

  for (const match of completed) {
    const resultA = resultFromSets(match.sets, true);
    const resultB = resultFromSets(match.sets, false);
    for (const id of match.teamA) addResult(id, match.roundNumber, resultA);
    for (const id of match.teamB) addResult(id, match.roundNumber, resultB);
  }

  const standings = participants
    .filter((p) => p.active)
    .map((p) => {
      const rounds = perPlayerRounds.get(p.id) || new Map();
      let setsWon = 0;
      let setsLost = 0;
      let pointsWon = 0;
      let pointsLost = 0;
      let roundsPlayed = 0;

      for (const [, results] of rounds) {
        const best = results.reduce((a, b) => isBetter(a, b));
        setsWon += best.setsWon;
        setsLost += best.setsLost;
        pointsWon += best.pointsWon;
        pointsLost += best.pointsLost;
        roundsPlayed++;
      }

      return {
        id: p.id,
        name: p.name,
        gender: p.gender,
        club: p.club,
        roundsPlayed,
        setsWon,
        setsLost,
        pointsWon,
        pointsLost,
        pointsDiff: pointsWon - pointsLost,
      };
    });

  standings.sort((a, b) => b.setsWon - a.setsWon || b.pointsDiff - a.pointsDiff);
  return standings;
}
