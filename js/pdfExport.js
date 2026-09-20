// Erstellt ein PDF mit dem Endergebnis, mit Hilfe der lokal eingebundenen
// jsPDF-Bibliothek (libs/jspdf.umd.min.js + libs/jspdf.plugin.autotable.min.js).

export function exportResultsToPdf({ settings, standings, koResults, spielplan }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 15;

  doc.setFontSize(16);
  doc.text('Speck-weg-Turnier - Endergebnis', 14, y);
  y += 8;
  doc.setFontSize(10);
  doc.text(`Modus: ${settings.mode === 'mix' ? 'Mix' : 'Doppel'}`, 14, y);
  y += 8;

  doc.setFontSize(13);
  doc.text('Vorrunden-Rangliste', 14, y);
  y += 2;
  doc.autoTable({
    startY: y,
    head: [['Platz', 'Nr.', 'Name', 'Sätze', 'Punkte']],
    body: standings.map((s, i) => [i + 1, s.id, s.name, `${s.setsWon}:${s.setsLost}`, `${s.pointsWon}:${s.pointsLost}`]),
  });
  y = doc.lastAutoTable.finalY + 10;

  for (const result of koResults) {
    if (y > 250) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(13);
    doc.text(result.title, 14, y);
    y += 2;
    doc.autoTable({
      startY: y,
      head: [['Platz', 'Team']],
      body: [
        ['1', result.placements.platz1.join(' & ')],
        ['2', result.placements.platz2.join(' & ')],
        ['3', result.placements.platz3.join(' & ')],
        ['4', result.placements.platz4.join(' & ')],
      ],
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (spielplan && spielplan.length > 0) {
    if (y > 240) {
      doc.addPage();
      y = 15;
    }
    doc.setFontSize(13);
    doc.text('Spielplan (alle Spiele)', 14, y);
    y += 2;
    doc.autoTable({
      startY: y,
      head: [['Nr.', 'Runde', 'Team A', 'Team B', 'Ergebnis', 'Feld', 'Status']],
      body: spielplan.map((m) => [m.matchNumber, m.runde, m.teamA, m.teamB, m.ergebnis, m.feld, m.status]),
      styles: { fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  doc.save('speck-weg-turnier-ergebnis.pdf');
}
