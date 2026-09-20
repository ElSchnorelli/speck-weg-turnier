// Erstellt eine Excel-Datei mit dem Endergebnis, mit Hilfe der lokal
// eingebundenen SheetJS-Bibliothek (libs/xlsx.full.min.js).

export function exportResultsToExcel({ standings, koResults }) {
  const XLSX = window.XLSX;
  const workbook = XLSX.utils.book_new();

  const standingsData = standings.map((s, i) => ({
    Platz: i + 1,
    Nr: s.id,
    Name: s.name,
    Verein: s.club || '',
    Sätze: `${s.setsWon}:${s.setsLost}`,
    Punkte: `${s.pointsWon}:${s.pointsLost}`,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(standingsData), 'Vorrunde');

  for (const result of koResults) {
    const data = [
      { Platz: 1, Team: result.placements.platz1.join(' & ') },
      { Platz: 2, Team: result.placements.platz2.join(' & ') },
      { Platz: 3, Team: result.placements.platz3.join(' & ') },
      { Platz: 4, Team: result.placements.platz4.join(' & ') },
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), result.sheetName);
  }

  XLSX.writeFile(workbook, 'speck-weg-turnier-ergebnis.xlsx');
}
