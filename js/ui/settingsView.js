import { listParticipants } from '../participants.js';
import { getSettings, saveSettings, computeRecommendation } from '../settings.js';
import { getStatus } from '../vorrunde.js';

const RECOMMENDATION_LABELS = {
  mix: 'Mix wird empfohlen',
  doppel: 'Doppel wird empfohlen',
  gleich: 'Beide Modi sind etwa gleich gut geeignet',
};

export async function renderSettingsView(container) {
  const participants = await listParticipants();
  const rec = computeRecommendation(participants);
  const existing = await getSettings();
  const status = await getStatus();
  const locked = status.phase !== 'setup';

  container.innerHTML = `
    <section class="card">
      <h2>Teilnehmer-Übersicht</h2>
      <p>Aktive Damen: <strong>${rec.women}</strong> &nbsp; Aktive Herren: <strong>${rec.men}</strong></p>
      <p>Bei <strong>Mix</strong> müssten pro Runde ca. <strong>${rec.mixPausing}</strong> Spieler pausieren.</p>
      <p>Bei <strong>Doppel</strong> müssten pro Runde ca. <strong>${rec.doppelPausing}</strong> Spieler pausieren.</p>
      <p><strong>${RECOMMENDATION_LABELS[rec.recommendation]}.</strong></p>
    </section>

    <section class="card">
      <h2>Turniereinstellungen</h2>
      ${locked ? '<p class="warning-box">Die Vorrunde läuft bereits. Einstellungen können jetzt nicht mehr geändert werden.</p>' : ''}
      <form id="settings-form" class="inline-form">
        <label>
          Modus:
          <select id="mode-select" ${locked ? 'disabled' : ''}>
            <option value="mix" ${existing?.mode === 'mix' ? 'selected' : ''}>Mix</option>
            <option value="doppel" ${existing?.mode === 'doppel' ? 'selected' : ''}>Doppel</option>
          </select>
        </label>
        <label>
          Anzahl Vorrunden:
          <input type="number" id="rounds-input" min="1" max="20" value="${existing?.vorrundenAnzahl || 5}" ${locked ? 'disabled' : ''} />
        </label>
        ${locked ? '' : '<button type="submit">Speichern</button>'}
      </form>
      <p id="settings-saved-msg" class="status-line"></p>
    </section>
  `;

  if (locked) return;

  const form = container.querySelector('#settings-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const mode = container.querySelector('#mode-select').value;
    const vorrundenAnzahl = Number(container.querySelector('#rounds-input').value);
    await saveSettings({ mode, vorrundenAnzahl });
    container.querySelector('#settings-saved-msg').textContent = 'Gespeichert. Weiter geht es im Bereich "Vorrunde".';
  });
}
