import { dbGetAll } from './db.js';
import { renderParticipantsView } from './ui/participantsView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { renderVorrundeView } from './ui/vorrundeView.js';
import { renderKoView } from './ui/koView.js';
import { renderResultView } from './ui/resultView.js';

const statusEl = document.getElementById('db-status');
const viewContainer = document.getElementById('view-container');
const navButtons = document.querySelectorAll('.nav-btn');

const VIEW_LABELS = {
  teilnehmer: 'Teilnehmer',
  einstellungen: 'Einstellungen',
  vorrunde: 'Vorrunde',
  ko: 'KO-Runde',
  ergebnis: 'Ergebnis',
};

function showView(viewName) {
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });
  checkDatabase();

  if (viewName === 'teilnehmer') {
    renderParticipantsView(viewContainer);
    return;
  }

  if (viewName === 'einstellungen') {
    renderSettingsView(viewContainer);
    return;
  }

  if (viewName === 'vorrunde') {
    renderVorrundeView(viewContainer);
    return;
  }

  if (viewName === 'ko') {
    renderKoView(viewContainer);
    return;
  }

  if (viewName === 'ergebnis') {
    renderResultView(viewContainer);
    return;
  }

  viewContainer.innerHTML = `<p class="placeholder">Bereich "${VIEW_LABELS[viewName]}" folgt in einer der nächsten Phasen.</p>`;
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

async function checkDatabase() {
  try {
    const participants = await dbGetAll('participants');
    statusEl.textContent = `Datenbank bereit (${participants.length} Teilnehmer gespeichert).`;
  } catch (error) {
    statusEl.textContent = 'Fehler beim Öffnen der Datenbank.';
    console.error(error);
  }
}

checkDatabase();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('Service Worker konnte nicht registriert werden:', error);
  });
}
