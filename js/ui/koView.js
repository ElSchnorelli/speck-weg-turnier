import { listParticipants } from '../participants.js';
import { getSettings } from '../settings.js';
import { getStatus } from '../status.js';
import { renderPlacementsList } from './rankingView.js';
import {
  validKoSizes,
  getEligibleCounts,
  startBracket,
  getBracketView,
  advanceBracket,
  recordKoMatchResult,
  getFinalPlacements,
} from '../ko.js';

const BRACKET_TITLES = {
  mix: 'KO-Runde (Mix)',
  damen: 'KO-Runde Damen',
  herren: 'KO-Runde Herren',
};

function teamLabel(teamIds, participantById) {
  return teamIds.map((id) => participantById.get(id)?.name || `#${id}`).join(' & ');
}

function matchCardHtml(match, participantById) {
  const setInput = (setIndex, side, value) =>
    `<input type="number" min="0" class="set-input" data-match="${match.id}" data-set="${setIndex}" data-side="${side}" value="${value ?? ''}" />`;

  return `
    <div class="match-card ${match.isPlatz3 ? 'fill-match' : ''}">
      ${match.isPlatz3 ? '<span class="badge">Spiel um Platz 3</span>' : ''}
      <div class="match-teams">
        <strong>${teamLabel(match.teamA, participantById)}</strong>
        <span>vs.</span>
        <strong>${teamLabel(match.teamB, participantById)}</strong>
      </div>
      <div class="match-sets">
        <label>Satz 1: ${setInput(0, 'a', match.sets[0].a)} : ${setInput(0, 'b', match.sets[0].b)}</label>
        <label>Satz 2: ${setInput(1, 'a', match.sets[1].a)} : ${setInput(1, 'b', match.sets[1].b)}</label>
        <label>Satz 3 (nur bei 1:1 nötig): ${setInput(2, 'a', match.sets[2].a)} : ${setInput(2, 'b', match.sets[2].b)}</label>
      </div>
      <button class="save-ko-match-btn" data-match="${match.id}">Ergebnis speichern</button>
      ${match.status === 'abgeschlossen' ? `<span class="status-ok">✓ Sieger: Team ${match.winner}</span>` : ''}
    </div>
  `;
}

function placementsHtml(placements, participantById) {
  return renderPlacementsList({
    platz1: placements.platz1.map((id) => participantById.get(id)?.name || `#${id}`),
    platz2: placements.platz2.map((id) => participantById.get(id)?.name || `#${id}`),
    platz3: placements.platz3.map((id) => participantById.get(id)?.name || `#${id}`),
    platz4: placements.platz4.map((id) => participantById.get(id)?.name || `#${id}`),
  });
}

async function renderBracketSection(container, bracket, settings) {
  const status = await getStatus();
  const started = Boolean(status.koBrackets[bracket]);

  if (!started) {
    const { women, men } = await getEligibleCounts();
    const count = bracket === 'mix' ? Math.min(women, men) * 2 : bracket === 'damen' ? women : men;
    const sizes = validKoSizes(count);

    if (sizes.length === 0) {
      return `
        <section class="card">
          <h2>${BRACKET_TITLES[bracket]}</h2>
          <p class="warning-box">Nicht genügend Teilnehmer für eine KO-Runde (mindestens 8 nötig, verfügbar: ${count}).</p>
        </section>
      `;
    }

    return `
      <section class="card">
        <h2>${BRACKET_TITLES[bracket]}</h2>
        <label>
          Anzahl KO-Teilnehmer:
          <select class="ko-size-select" data-bracket="${bracket}">
            ${sizes.map((s) => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </label>
        <button class="start-ko-btn" data-bracket="${bracket}">KO-Runde starten</button>
      </section>
    `;
  }

  const participants = await listParticipants();
  const participantById = new Map(participants.map((p) => [p.id, p]));
  const view = await getBracketView(bracket);

  let body = `<h3>${view.currentLevel.label}</h3>`;
  body += view.currentMatches.map((m) => matchCardHtml(m, participantById)).join('');
  if (view.platz3Match) {
    body += matchCardHtml(view.platz3Match, participantById);
  }

  if (!view.bracketDone) {
    body += `
      <button class="advance-ko-btn" data-bracket="${bracket}" ${view.levelComplete ? '' : 'disabled'}>
        Nächste KO-Runde auslosen
      </button>
      ${view.levelComplete ? '' : '<p class="status-line">Bitte zuerst alle Ergebnisse dieser Runde eintragen.</p>'}
      <p class="ko-error warning-box" data-bracket="${bracket}" style="display:none;"></p>
    `;
  } else {
    const placements = await getFinalPlacements(bracket);
    body += `<h3>Endstand</h3>${placementsHtml(placements, participantById)}`;
  }

  return `<section class="card"><h2>${BRACKET_TITLES[bracket]}</h2>${body}</section>`;
}

export async function renderKoView(container) {
  const settings = await getSettings();
  if (!settings) {
    container.innerHTML = '<p class="warning-box">Bitte zuerst im Bereich "Einstellungen" den Modus festlegen.</p>';
    return;
  }

  const status = await getStatus();
  if (status.phase === 'setup' || status.phase === 'vorrunde') {
    container.innerHTML = '<p class="warning-box">Die Vorrunde muss zuerst vollständig abgeschlossen werden (siehe Bereich "Vorrunde").</p>';
    return;
  }

  const brackets = settings.mode === 'mix' ? ['mix'] : ['damen', 'herren'];
  const sections = await Promise.all(brackets.map((b) => renderBracketSection(container, b, settings)));
  container.innerHTML = sections.join('');

  container.querySelectorAll('.start-ko-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bracket = btn.dataset.bracket;
      const select = container.querySelector(`.ko-size-select[data-bracket="${bracket}"]`);
      const size = Number(select.value);
      await startBracket(bracket, size);
      renderKoView(container);
    });
  });

  container.querySelectorAll('.save-ko-match-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = Number(btn.dataset.match);
      const inputs = container.querySelectorAll(`.set-input[data-match="${matchId}"]`);
      const sets = [
        { a: null, b: null },
        { a: null, b: null },
        { a: null, b: null },
      ];
      inputs.forEach((input) => {
        const setIndex = Number(input.dataset.set);
        const side = input.dataset.side;
        sets[setIndex][side] = input.value === '' ? null : Number(input.value);
      });
      try {
        await recordKoMatchResult(matchId, sets);
      } catch (error) {
        alert(error.message);
      }
      renderKoView(container);
    });
  });

  container.querySelectorAll('.advance-ko-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bracket = btn.dataset.bracket;
      try {
        await advanceBracket(bracket);
        renderKoView(container);
      } catch (error) {
        const errorEl = container.querySelector(`.ko-error[data-bracket="${bracket}"]`);
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    });
  });
}
