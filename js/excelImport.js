// Liest eine Excel-Datei (Name, Geschlecht, Verein) mit Hilfe der lokal
// eingebundenen SheetJS-Bibliothek (libs/xlsx.full.min.js, siehe index.html).
// Es wird nichts aus dem Internet nachgeladen - wichtig, da beim Turnier
// kein Netzwerk verfügbar ist.

function normalizeGender(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (['w', 'weiblich', 'dame', 'damen', 'frau', 'f'].includes(value)) return 'W';
  if (['m', 'männlich', 'maennlich', 'herr', 'herren'].includes(value)) return 'M';
  return null;
}

function findKey(row, candidates) {
  const keys = Object.keys(row);
  return keys.find((key) => candidates.includes(key.trim().toLowerCase()));
}

export function parseExcelFile(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

    return rows.map((row) => {
      const nameKey = findKey(row, ['name']);
      const genderKey = findKey(row, ['geschlecht', 'gender', 'sex']);
      const clubKey = findKey(row, ['verein', 'club']);

      const name = nameKey ? String(row[nameKey]).trim() : '';
      const genderRaw = genderKey ? row[genderKey] : '';
      const club = clubKey ? String(row[clubKey]).trim() : '';
      const gender = normalizeGender(genderRaw);

      return {
        name,
        club,
        gender,
        genderRaw: String(genderRaw || ''),
        valid: Boolean(name) && Boolean(gender),
      };
    });
  });
}
