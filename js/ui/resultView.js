import { dbGetAll } from '../db.js';
import { listParticipants } from '../participants.js';
import { getSettings } from '../settings.js';
import { getStatus } from '../status.js';
import { getAllVorrundenMatches } from '../vorrunde.js';
import { computeStandings } from '../ranking.js';
import { renderRankingTable, renderPlacementsList } from './rankingView.js';
import { getBracketView, getFinalPlacements } from '../ko.js';
import { exportResultsToPdf } from '../pdfExport.js';
import { exportResultsToExcel } from '../excelExport.js';

const BRACKET_TITLES = {
  mix: 'KO-Ergebnis (Mix)',
  damen: 'KO-Ergebnis Damen',
  herren: 'KO-Ergebnis Herren',
};

const SHEET_NAMES = { mix: 'KO Mix', damen: 'KO Damen', herren: 'KO Herren' };

function formatSets(sets) {
  return sets
    .filter((s) => s && Number.isFinite(s.a) && Number.isFinite(s.b))
    .map((s) => `${s.a}:${s.b}`)
    .join(', ');
}

function getCompletedRounds(vorrundenMatches) {
  const byRound = new Map();
  for (const m of vorrundenMatches) {
    if (!byRound.has(m.roundNumber)) byRound.set(m.roundNumber, []);
    byRound.get(m.roundNumber).push(m);
  }
  return [...byRound.entries()]
    .filter(([, matches]) => matches.length > 0 && matches.every((m) => m.status === 'abgeschlossen'))
    .map(([round]) => round)
    .sort((a, b) => a - b);
}

function previousRanksMap(participants, vorrundenMatches, round) {
  if (round <= 1) return null;
  const prevStandings = computeStandings(participants, vorrundenMatches.filter((m) => m.roundNumber <= round - 1));
  return new Map(prevStandings.map((s, i) => [s.id, i + 1]));
}

function matchRoundLabel(match) {
  if (match.phase === 'vorrunde') return `Vorrunde ${match.roundNumber}`;
  if (match.isPlatz3) return 'Spiel um Platz 3';
  return match.koLevel || `KO-Runde ${match.roundNumber}`;
}

async function buildSpielplan(participantById) {
  const nameify = (ids) => ids.map((id) => participantById.get(id)?.name || `#${id}`).join(' & ');
  const allMatches = await dbGetAll('matches');

  return allMatches
    .slice()
    .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0))
    .map((m) => ({
      matchNumber: m.matchNumber ?? '',
      runde: matchRoundLabel(m),
      teamA: nameify(m.teamA),
      teamB: nameify(m.teamB),
      ergebnis: formatSets(m.sets),
      feld: m.feldNummer ?? '',
      status: m.status === 'abgeschlossen' ? 'abgeschlossen' : 'offen',
    }));
}

async function gatherExportData() {
  const participants = await listParticipants();
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const settings = await getSettings();
  const vorrundenMatches = await getAllVorrundenMatches();
  const standings = computeStandings(participants, vorrundenMatches);
  const status = await getStatus();
  const spielplan = await buildSpielplan(participantById);

  const nameify = (ids) => ids.map((id) => participantById.get(id)?.name || `#${id}`);
  const koResults = [];

  for (const bracket of Object.keys(status.koBrackets)) {
    const view = await getBracketView(bracket);
    if (!view || !view.bracketDone) continue;
    const placements = await getFinalPlacements(bracket);
    koResults.push({
      bracket,
      title: BRACKET_TITLES[bracket],
      sheetName: SHEET_NAMES[bracket],
      placements: {
        platz1: nameify(placements.platz1),
        platz2: nameify(placements.platz2),
        platz3: nameify(placements.platz3),
        platz4: nameify(placements.platz4),
      },
    });
  }

  return { settings, standings, koResults, status, spielplan, vorrundenMatches, participants };
}

export async function renderResultView(container) {
  const { settings, standings, koResults, status, spielplan, vorrundenMatches, participants } = await gatherExportData();

  if (!settings) {
    container.innerHTML = '<p class="warning-box">Noch keine Einstellungen festgelegt.</p>';
    return;
  }

  const koHtml = koResults.length === 0
    ? '<p class="status-line">Noch keine abgeschlossene KO-Runde.</p>'
    : koResults
        .map((r) => `<h3>${r.title}</h3>${renderPlacementsList(r.placements)}`)
        .join('');

  const completedRounds = getCompletedRounds(vorrundenMatches);
  const defaultRound = completedRounds.length > 0 ? completedRounds[completedRounds.length - 1] : null;
  const initialStandings = defaultRound
    ? computeStandings(participants, vorrundenMatches.filter((m) => m.roundNumber <= defaultRound))
    : standings;
  const initialPreviousRanks = defaultRound ? previousRanksMap(participants, vorrundenMatches, defaultRound) : null;

  const rundenAuswahlHtml = completedRounds.length > 0
    ? `
      <label>
        Rangliste nach Runde:
        <select id="rangliste-runde-select">
          ${completedRounds.map((r) => `<option value="${r}" ${r === defaultRound ? 'selected' : ''}>Runde ${r}</option>`).join('')}
        </select>
      </label>
    `
    : '';

  container.innerHTML = `
    <section class="card">
      <h2>Vorrunden-Rangliste</h2>
      ${rundenAuswahlHtml}
      <div id="rangliste-container">${renderRankingTable(initialStandings, { previousRanks: initialPreviousRanks })}</div>
    </section>
    <section class="card">
      <h2>KO-Ergebnisse</h2>
      ${koHtml}
    </section>
    <section class="card">
      <h2>Export</h2>
      <p>${status.phase === 'fertig' ? 'Das Turnier ist abgeschlossen.' : 'Hinweis: Das Turnier ist noch nicht komplett abgeschlossen - der Export enthält den aktuellen Zwischenstand.'}</p>
      <button id="export-pdf-btn">Als PDF exportieren</button>
      <button id="export-excel-btn">Als Excel exportieren</button>
    </section>
  `;

  const rundenSelect = container.querySelector('#rangliste-runde-select');
  if (rundenSelect) {
    rundenSelect.addEventListener('change', () => {
      const selectedRound = Number(rundenSelect.value);
      const filteredMatches = vorrundenMatches.filter((m) => m.roundNumber <= selectedRound);
      const filteredStandings = computeStandings(participants, filteredMatches);
      const previousRanks = previousRanksMap(participants, vorrundenMatches, selectedRound);
      container.querySelector('#rangliste-container').innerHTML = renderRankingTable(filteredStandings, { previousRanks });
    });
  }

  container.querySelector('#export-pdf-btn').addEventListener('click', () => {
    exportResultsToPdf({ settings, standings, koResults, spielplan });
  });

  container.querySelector('#export-excel-btn').addEventListener('click', () => {
    exportResultsToExcel({ settings, standings, koResults, spielplan });
  });
}
