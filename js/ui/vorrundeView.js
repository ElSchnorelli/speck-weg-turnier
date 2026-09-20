import { listParticipants } from '../participants.js';
import { getSettings } from '../settings.js';
import {
  getStatus,
  getAllVorrundenMatches,
  startVorrunde,
  recordMatchResult,
  isCurrentRoundComplete,
  completeRoundAndAdvance,
  addExtraMatch,
  assignFillParticipant,
  swapFillParticipant,
} from '../vorrunde.js';
import { computeStandings } from '../ranking.js';
import { renderRankingTable } from './rankingView.js';
import { startMatchOnField } from '../felder.js';

function teamLabel(teamIds, participantById) {
  return teamIds
    .map((id) => {
      if (id == null) return '– offen –';
      const p = participantById.get(id);
      return p ? `${p.name} (${p.id})` : `#${id}`;
    })
    .join(' & ');
}

function genderLabel(gender) {
  if (gender === 'W') return 'Dame';
  if (gender === 'M') return 'Herr';
  return 'Person';
}

function feldHtml(match) {
  if (match.status === 'abgeschlossen') return '';
  if (match.feldNummer) return `<span class="badge">Feld ${match.feldNummer}</span>`;
  return `<button class="start-field-btn" data-match="${match.id}">Spiel starten</button>`;
}

function fillAssignHtml(match, participantById) {
  if (!match.isFillMatch || match.status === 'abgeschlossen') return '';
  if (!match.fillSlots || match.fillSlots.length === 0) return '';

  const inMatchIds = new Set([...match.teamA, ...match.teamB].filter((id) => id != null));
  const activeParticipants = [...participantById.values()].filter((p) => p.active);

  const rows = match.fillSlots
    .map((slot) => {
      const options = activeParticipants
        .filter((p) => !inMatchIds.has(p.id) && p.gender === slot.gender)
        .map((p) => `<option value="${p.id}">${p.name} (${p.id})</option>`)
        .join('');
      return `
        <label>
          Auffüller/in wählen (${genderLabel(slot.gender)}):
          <select class="fill-assign-select" data-match="${match.id}" data-team="${slot.team}" data-index="${slot.index}">
            <option value="">-- bitte wählen --</option>
            ${options}
          </select>
        </label>
        <button class="fill-assign-btn" data-match="${match.id}" data-team="${slot.team}" data-index="${slot.index}" type="button">Zuweisen</button>
      `;
    })
    .join('');

  return `<form class="inline-form fill-swap">${rows}</form>`;
}

function fillSwapHtml(match, participantById) {
  if (!match.isFillMatch || match.status === 'abgeschlossen') return '';
  if (!match.fillParticipantIds || match.fillParticipantIds.length === 0) return '';
  if (match.fillSlots && match.fillSlots.length > 0) return '';

  const inMatchIds = new Set([...match.teamA, ...match.teamB]);
  const activeParticipants = [...participantById.values()].filter((p) => p.active);

  const rows = match.fillParticipantIds
    .map((currentId) => {
      const options = activeParticipants
        .filter((p) => p.id === currentId || !inMatchIds.has(p.id))
        .map((p) => `<option value="${p.id}" ${p.id === currentId ? 'selected' : ''}>${p.name} (${p.id})</option>`)
        .join('');
      return `
        <label>
          Freiwillige/r statt ${participantById.get(currentId)?.name || `#${currentId}`}:
          <select class="fill-swap-select" data-match="${match.id}" data-old="${currentId}">${options}</select>
        </label>
        <button class="fill-swap-btn" data-match="${match.id}" data-old="${currentId}" type="button">Ändern</button>
      `;
    })
    .join('');

  return `<form class="inline-form fill-swap">${rows}</form>`;
}

function matchCardHtml(match, participantById) {
  const hasOpenSlots = Boolean(match.isFillMatch && match.fillSlots && match.fillSlots.length > 0);

  const setInput = (setIndex, side, value) =>
    `<input type="number" min="0" class="set-input" data-match="${match.id}" data-set="${setIndex}" data-side="${side}" value="${value ?? ''}" />`;

  const resultSectionHtml = hasOpenSlots
    ? '<p class="status-line">Bitte zuerst alle Auffüller-Plätze auswählen.</p>'
    : `
      <div class="match-sets">
        <label>Satz 1: ${setInput(0, 'a', match.sets[0].a)} : ${setInput(0, 'b', match.sets[0].b)}</label>
        <label>Satz 2: ${setInput(1, 'a', match.sets[1].a)} : ${setInput(1, 'b', match.sets[1].b)}</label>
      </div>
      <button class="save-match-btn" data-match="${match.id}" ${match.feldNummer ? '' : 'disabled'}>Ergebnis speichern</button>
      ${match.feldNummer ? '' : '<span class="status-line">Bitte zuerst "Spiel starten" klicken.</span>'}
    `;

  return `
    <div class="match-card ${match.isFillMatch ? 'fill-match' : ''}">
      <div class="match-card-header">
        <span class="match-number">Spiel Nr. ${match.matchNumber ?? '-'}</span>
        ${hasOpenSlots ? '' : feldHtml(match)}
      </div>
      ${match.isFillMatch ? '<span class="badge">Auffüll-Spiel</span>' : ''}
      <div class="match-teams">
        <strong>${teamLabel(match.teamA, participantById)}</strong>
        <span>vs.</span>
        <strong>${teamLabel(match.teamB, participantById)}</strong>
      </div>
      ${fillAssignHtml(match, participantById)}
      ${fillSwapHtml(match, participantById)}
      ${resultSectionHtml}
      ${match.status === 'abgeschlossen' ? '<span class="status-ok">✓ erfasst</span>' : ''}
    </div>
  `;
}

function extraMatchSectionHtml(pausingParticipants, activeParticipants) {
  if (pausingParticipants.length === 0) return '';

  const pausingIds = new Set(pausingParticipants.map((p) => p.id));
  const defaults = [0, 1, 2, 3].map((i) => pausingParticipants[i]?.id ?? '');

  const optionsHtml = (selectedId) => {
    const blank = `<option value="" ${selectedId ? '' : 'selected'}>-- bitte wählen --</option>`;
    const items = activeParticipants
      .map(
        (p) =>
          `<option value="${p.id}" ${String(p.id) === String(selectedId) ? 'selected' : ''}>${p.name} (${p.id})${pausingIds.has(p.id) ? ' (pausiert)' : ''}</option>`
      )
      .join('');
    return blank + items;
  };

  return `
    <section class="card">
      <h2>Pausierende Spieler</h2>
      <p>Diese Runde pausieren: <strong>${pausingParticipants.map((p) => p.name).join(', ')}</strong></p>
      <p class="status-line">Du kannst für sie ein zusätzliches Auffüllspiel ansetzen. Freie Plätze kannst du manuell mit anderen Teilnehmern auffüllen - für die zählt dann nur ihr besseres Ergebnis dieser Runde.</p>
      <form id="extra-match-form" class="inline-form extra-match-form">
        <div class="team-row">
          <span class="team-row-label">Team A:</span>
          <select data-slot="0">${optionsHtml(defaults[0])}</select>
          <select data-slot="1">${optionsHtml(defaults[1])}</select>
        </div>
        <div class="team-row">
          <span class="team-row-label">Team B:</span>
          <select data-slot="2">${optionsHtml(defaults[2])}</select>
          <select data-slot="3">${optionsHtml(defaults[3])}</select>
        </div>
        <button type="submit">Auffüllspiel ansetzen</button>
      </form>
      <p id="extra-match-error" class="warning-box" style="display:none;"></p>
    </section>
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

    const roundPlayingIds = new Set();
    roundMatches.forEach((m) => {
      m.teamA.forEach((id) => roundPlayingIds.add(id));
      m.teamB.forEach((id) => roundPlayingIds.add(id));
    });
    const pausingParticipants = participants.filter((p) => p.active && !roundPlayingIds.has(p.id));
    const activeSorted = participants.filter((p) => p.active).slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));

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
      ${extraMatchSectionHtml(pausingParticipants, activeSorted)}
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

  container.querySelectorAll('.start-field-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = Number(btn.dataset.match);
      try {
        await startMatchOnField(matchId);
      } catch (error) {
        alert(error.message);
      }
      renderVorrundeView(container);
    });
  });

  container.querySelectorAll('.fill-assign-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = Number(btn.dataset.match);
      const team = btn.dataset.team;
      const index = Number(btn.dataset.index);
      const select = container.querySelector(
        `.fill-assign-select[data-match="${matchId}"][data-team="${team}"][data-index="${index}"]`
      );
      if (!select.value) {
        alert('Bitte zuerst eine Person auswählen.');
        return;
      }
      try {
        await assignFillParticipant(matchId, team, index, Number(select.value));
        renderVorrundeView(container);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  container.querySelectorAll('.fill-swap-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const matchId = Number(btn.dataset.match);
      const oldId = Number(btn.dataset.old);
      const select = container.querySelector(`.fill-swap-select[data-match="${matchId}"][data-old="${oldId}"]`);
      const newId = Number(select.value);
      if (newId === oldId) return;
      try {
        await swapFillParticipant(matchId, oldId, newId);
        renderVorrundeView(container);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  const extraForm = container.querySelector('#extra-match-form');
  if (extraForm) {
    extraForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorEl = container.querySelector('#extra-match-error');
      errorEl.style.display = 'none';

      const values = Array.from(extraForm.querySelectorAll('select[data-slot]')).map((s) => s.value);
      if (values.some((v) => v === '')) {
        errorEl.textContent = 'Bitte alle vier Plätze auswählen.';
        errorEl.style.display = 'block';
        return;
      }

      const ids = values.map(Number);
      if (new Set(ids).size !== 4) {
        errorEl.textContent = 'Jeder Spieler darf nur einmal ausgewählt werden.';
        errorEl.style.display = 'block';
        return;
      }

      try {
        await addExtraMatch([ids[0], ids[1]], [ids[2], ids[3]]);
        renderVorrundeView(container);
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }
    });
  }

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
