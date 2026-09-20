import { listParticipants } from '../participants.js';
import { getSettings } from '../settings.js';
import {
  getStatus,
  getAllVorrundenMatches,
  startVorrunde,
  recordMatchResult,
  isCurrentRoundComplete,
  completeRoundAndAdvance,
} from '../vorrunde.js';
import { computeStandings } from '../ranking.js';
import { renderRankingTable } from './rankingView.js';

function teamLabel(teamIds, participantById) {
  return teamIds.map((id) => participantById.get(id)?.name || `#${id}`).join(' & ');
}

function matchCardHtml(match, participantById) {
  const setInput = (setIndex, side, value) =>
    `<input type="number" min="0" class="set-input" data-match="${match.id}" data-set="${setIndex}" data-side="${side}" value="${value ?? ''}" />`;

  return `
    <div class="match-card ${match.isFillMatch ? 'fill-match' : ''}">
      ${match.isFillMatch ? '<span class="badge">Auffüll-Spiel</span>' : ''}
      <div class="match-teams">
        <strong>${teamLabel(match.teamA, participantById)}</strong>
        <span>vs.</span>
        <strong>${teamLabel(match.teamB, participantById)}</strong>
      </div>
      <div class="match-sets">
        <label>Satz 1: ${setInput(0, 'a', match.sets[0].a)} : ${setInput(0, 'b', match.sets[0].b)}</label>
        <label>Satz 2: ${setInput(1, 'a', match.sets[1].a)} : ${setInput(1, 'b', match.sets[1].b)}</label>
      </div>
      <button class="save-match-btn" data-match="${match.id}">Ergebnis speichern</button>
      ${match.status === 'abgeschlossen' ? '<span class="status-ok">✓ erfasst</span>' : ''}
    </div>
  `;
}

export async function renderVorrundeView(container) {
  const settings = await getSettings();

  if (!settings) {
    container.innerHTML = '<p class="warning-box">Bitte zuerst im Bereich "Einstellungen" den Modus und die Anzahl Vorrunden festlegen.</p>';
    return;
  }

  const status = await getStatus();

  if (status.phase === 'setup') {
    container.innerHTML = `
      <section class="card">
        <h2>Vorrunde</h2>
        <p>Modus: <strong>${settings.mode === 'mix' ? 'Mix' : 'Doppel'}</strong>, geplante Vorrunden: <strong>${settings.vorrundenAnzahl}</strong></p>
        <button id="start-btn">Vorrunde starten (1. Auslosung)</button>
        <p id="start-error" class="warning-box" style="display:none;"></p>
      </section>
    `;
    container.querySelector('#start-btn').addEventListener('click', async () => {
      try {
        await startVorrunde(settings);
        renderVorrundeView(container);
      } catch (error) {
        const errorEl = container.querySelector('#start-error');
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    });
    return;
  }

  const participants = await listParticipants();
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const allMatches = await getAllVorrundenMatches();
  const standings = computeStandings(participants, allMatches);

  let roundSectionHtml = '';

  if (status.phase === 'vorrunde') {
    const roundMatches = allMatches.filter((m) => m.roundNumber === status.aktuelleRunde);
    const roundComplete = await isCurrentRoundComplete();

    roundSectionHtml = `
      <section class="card">
        <h2>Runde ${status.aktuelleRunde} von ${settings.vorrundenAnzahl}</h2>
        ${roundMatches.map((m) => matchCardHtml(m, participantById)).join('')}
        <button id="advance-btn" ${roundComplete ? '' : 'disabled'}>
          Runde abschließen &amp; nächste Runde auslosen
        </button>
        ${roundComplete ? '' : '<p class="status-line">Bitte zuerst alle Ergebnisse dieser Runde eintragen.</p>'}
        <p id="advance-error" class="warning-box" style="display:none;"></p>
      </section>
    `;
  } else if (status.phase === 'vorrunde_fertig') {
    roundSectionHtml = `
      <section class="card">
        <h2>Vorrunde abgeschlossen</h2>
        <p>Alle ${settings.vorrundenAnzahl} Vorrunden sind gespielt. Weiter geht es im Bereich "KO-Runde".</p>
      </section>
    `;
  }

  container.innerHTML = `
    ${roundSectionHtml}
    <section class="card">
      <h2>Aktuelle Rangliste</h2>
      ${renderRankingTable(standings)}
    </section>
  `;

  container.querySelectorAll('.save-match-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = Number(btn.dataset.match);
      const inputs = container.querySelectorAll(`.set-input[data-match="${matchId}"]`);
      const sets = [
        { a: null, b: null },
        { a: null, b: null },
      ];
      inputs.forEach((input) => {
        const setIndex = Number(input.dataset.set);
        const side = input.dataset.side;
        sets[setIndex][side] = input.value === '' ? null : Number(input.value);
      });
      await recordMatchResult(matchId, sets);
      renderVorrundeView(container);
    });
  });

  const advanceBtn = container.querySelector('#advance-btn');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', async () => {
      try {
        await completeRoundAndAdvance(settings);
        renderVorrundeView(container);
      } catch (error) {
        const errorEl = container.querySelector('#advance-error');
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    });
  }
}
