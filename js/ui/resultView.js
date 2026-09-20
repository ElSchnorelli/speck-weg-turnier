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

async function gatherExportData() {
  const participants = await listParticipants();
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const settings = await getSettings();
  const vorrundenMatches = await getAllVorrundenMatches();
  const standings = computeStandings(participants, vorrundenMatches);
  const status = await getStatus();

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

  return { settings, standings, koResults, status };
}

export async function renderResultView(container) {
  const { settings, standings, koResults, status } = await gatherExportData();

  if (!settings) {
    container.innerHTML = '<p class="warning-box">Noch keine Einstellungen festgelegt.</p>';
    return;
  }

  const koHtml = koResults.length === 0
    ? '<p class="status-line">Noch keine abgeschlossene KO-Runde.</p>'
    : koResults
        .map((r) => `<h3>${r.title}</h3>${renderPlacementsList(r.placements)}`)
        .join('');

  container.innerHTML = `
    <section class="card">
      <h2>Vorrunden-Rangliste</h2>
      ${renderRankingTable(standings)}
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

  container.querySelector('#export-pdf-btn').addEventListener('click', () => {
    exportResultsToPdf({ settings, standings, koResults });
  });

  container.querySelector('#export-excel-btn').addEventListener('click', () => {
    exportResultsToExcel({ settings, standings, koResults });
  });
}
