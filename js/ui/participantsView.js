import {
  listParticipants,
  addParticipant,
  updateParticipant,
  deleteParticipant,
} from '../participants.js';
import { parseExcelFile } from '../excelImport.js';

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

export async function renderParticipantsView(container) {
  container.innerHTML = `
    <section class="card">
      <h2>Excel-Import</h2>
      <p>Spalten in der Excel-Datei: <strong>Name</strong>, <strong>Geschlecht</strong>, <strong>Verein</strong></p>
      <input type="file" id="excel-input" accept=".xlsx,.xls" />
      <div id="import-preview"></div>
    </section>

    <section class="card">
      <h2>Neuen Teilnehmer anlegen</h2>
      <form id="add-form" class="inline-form">
        <input type="text" id="add-name" placeholder="Name" required />
        <select id="add-gender" required>
          <option value="">Geschlecht</option>
          <option value="W">Dame</option>
          <option value="M">Herr</option>
        </select>
        <input type="text" id="add-club" placeholder="Verein" />
        <button type="submit">Hinzufügen</button>
      </form>
    </section>

    <section class="card">
      <h2>Teilnehmer</h2>
      <p id="participants-summary" class="status-line"></p>
      <table class="data-table">
        <thead>
          <tr><th>Nr.</th><th>Name</th><th>Geschlecht</th><th>Verein</th><th></th></tr>
        </thead>
        <tbody id="participants-body"></tbody>
      </table>
    </section>
  `;

  const tableBody = container.querySelector('#participants-body');
  const summaryEl = container.querySelector('#participants-summary');
  const addForm = container.querySelector('#add-form');
  const excelInput = container.querySelector('#excel-input');
  const importPreview = container.querySelector('#import-preview');

  async function refreshTable() {
    const participants = await listParticipants();

    const women = participants.filter((p) => p.gender === 'W').length;
    const men = participants.filter((p) => p.gender === 'M').length;
    summaryEl.textContent = `Damen: ${women} · Herren: ${men} · Gesamt: ${participants.length}`;

    tableBody.innerHTML = participants
      .map(
        (p) => `
        <tr data-id="${p.id}">
          <td>${p.id}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${p.gender === 'W' ? 'Dame' : 'Herr'}</td>
          <td>${escapeHtml(p.club || '')}</td>
          <td>
            <button class="edit-btn" data-id="${p.id}">Bearbeiten</button>
            <button class="delete-btn" data-id="${p.id}">Löschen</button>
          </td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5" class="placeholder">Noch keine Teilnehmer angelegt.</td></tr>';
  }

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = container.querySelector('#add-name').value;
    const gender = container.querySelector('#add-gender').value;
    const club = container.querySelector('#add-club').value;
    if (!name.trim() || !gender) return;
    await addParticipant({ name, gender, club });
    addForm.reset();
    refreshTable();
  });

  tableBody.addEventListener('click', async (event) => {
    const id = Number(event.target.dataset.id);
    if (!id) return;

    if (event.target.classList.contains('delete-btn')) {
      if (confirm('Diesen Teilnehmer wirklich löschen?')) {
        await deleteParticipant(id);
        refreshTable();
      }
      return;
    }

    if (event.target.classList.contains('edit-btn')) {
      const row = event.target.closest('tr');
      const cells = row.children;
      const currentName = cells[1].textContent;
      const currentGender = cells[2].textContent === 'Dame' ? 'W' : 'M';
      const currentClub = cells[3].textContent;

      row.innerHTML = `
        <td>${id}</td>
        <td><input type="text" class="edit-name" value="${escapeHtml(currentName)}" /></td>
        <td>
          <select class="edit-gender">
            <option value="W" ${currentGender === 'W' ? 'selected' : ''}>Dame</option>
            <option value="M" ${currentGender === 'M' ? 'selected' : ''}>Herr</option>
          </select>
        </td>
        <td><input type="text" class="edit-club" value="${escapeHtml(currentClub)}" /></td>
        <td>
          <button class="save-btn" data-id="${id}">Speichern</button>
          <button class="cancel-btn" data-id="${id}">Abbrechen</button>
        </td>
      `;
      return;
    }

    if (event.target.classList.contains('save-btn')) {
      const row = event.target.closest('tr');
      const name = row.querySelector('.edit-name').value;
      const gender = row.querySelector('.edit-gender').value;
      const club = row.querySelector('.edit-club').value;
      if (!name.trim()) return;
      await updateParticipant(id, { name, gender, club });
      refreshTable();
      return;
    }

    if (event.target.classList.contains('cancel-btn')) {
      refreshTable();
    }
  });

  let pendingRows = [];

  excelInput.addEventListener('change', async () => {
    const file = excelInput.files[0];
    if (!file) return;
    pendingRows = await parseExcelFile(file);
    renderPreview();
  });

  function renderPreview() {
    if (pendingRows.length === 0) {
      importPreview.innerHTML = '';
      return;
    }

    importPreview.innerHTML = `
      <p>${pendingRows.length} Zeile(n) gefunden. Bitte prüfen, unklares Geschlecht korrigieren:</p>
      <table class="data-table">
        <thead><tr><th>Name</th><th>Geschlecht</th><th>Verein</th></tr></thead>
        <tbody>
          ${pendingRows
            .map(
              (row, index) => `
            <tr class="${row.valid ? '' : 'row-invalid'}">
              <td>${escapeHtml(row.name) || '<em>fehlt</em>'}</td>
              <td>
                <select class="preview-gender" data-index="${index}">
                  <option value="">- wählen -</option>
                  <option value="W" ${row.gender === 'W' ? 'selected' : ''}>Dame</option>
                  <option value="M" ${row.gender === 'M' ? 'selected' : ''}>Herr</option>
                </select>
                ${row.gender ? '' : `<br /><small>Original: "${escapeHtml(row.genderRaw)}"</small>`}
              </td>
              <td>${escapeHtml(row.club)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>
      <button id="confirm-import-btn">Import bestätigen</button>
      <button id="cancel-import-btn">Abbrechen</button>
    `;

    importPreview.querySelectorAll('.preview-gender').forEach((select) => {
      select.addEventListener('change', () => {
        pendingRows[Number(select.dataset.index)].gender = select.value || null;
      });
    });

    importPreview.querySelector('#cancel-import-btn').addEventListener('click', () => {
      pendingRows = [];
      excelInput.value = '';
      renderPreview();
    });

    importPreview.querySelector('#confirm-import-btn').addEventListener('click', async () => {
      const rowsToImport = pendingRows.filter((row) => row.name && row.gender);
      for (const row of rowsToImport) {
        await addParticipant({ name: row.name, gender: row.gender, club: row.club });
      }
      pendingRows = [];
      excelInput.value = '';
      renderPreview();
      refreshTable();
    });
  }

  refreshTable();
}
