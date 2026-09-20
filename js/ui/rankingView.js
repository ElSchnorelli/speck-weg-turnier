export function renderPlacementsList(placementNames) {
  const rows = [
    ['1', placementNames.platz1],
    ['2', placementNames.platz2],
    ['3', placementNames.platz3],
    ['4', placementNames.platz4],
  ];

  return `
    <div class="placements-list">
      ${rows
        .map(
          ([place, names]) => `
        <div class="place-row">
          <span class="place-badge place-${place}">${place}</span>
          <span>${names.join(' &amp; ')}</span>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function movementHtml(participantId, currentRank, previousRanks) {
  const prevRank = previousRanks.get(participantId);
  if (prevRank == null) return '–';

  const diff = prevRank - currentRank;
  if (diff > 0) return `<span class="rank-move rank-up">▲ ${diff}</span>`;
  if (diff < 0) return `<span class="rank-move rank-down">▼ ${Math.abs(diff)}</span>`;
  return `<span class="rank-move rank-same">▶ 0</span>`;
}

export function renderRankingTable(standings, { previousRanks } = {}) {
  if (standings.length === 0) {
    return '<p class="placeholder">Noch keine Ergebnisse vorhanden.</p>';
  }

  const showMovement = Boolean(previousRanks);

  const rows = standings
    .map(
      (s, index) => `
      <tr class="${index === 0 ? 'rank-first' : ''}">
        <td>${index + 1}</td>
        <td>${s.id}</td>
        <td>${s.name}</td>
        <td>${s.setsWon}:${s.setsLost}</td>
        <td>${s.pointsWon}:${s.pointsLost} (${s.pointsDiff >= 0 ? '+' : ''}${s.pointsDiff})</td>
        <td>${s.roundsPlayed}</td>
        ${showMovement ? `<td>${movementHtml(s.id, index + 1, previousRanks)}</td>` : ''}
      </tr>`
    )
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr><th>Platz</th><th>Nr.</th><th>Name</th><th>Sätze</th><th>Punkte (Diff.)</th><th>Runden</th>${showMovement ? '<th>Bewegung</th>' : ''}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
