import { dbGetAll, dbGet, dbPut, dbDelete } from './db.js';

const STORE = 'participants';

export function listParticipants() {
  return dbGetAll(STORE).then((list) => list.sort((a, b) => a.id - b.id));
}

export function getParticipant(id) {
  return dbGet(STORE, id);
}

export async function addParticipant({ name, gender, club }) {
  // Die Nummer wird hier selbst vergeben (statt IndexedDB's eingebautem
  // Zähler zu vertrauen): der interne Zähler wird beim Leeren des Speichers
  // (z.B. "Alles zurücksetzen") NICHT mit zurückgesetzt. So beginnt die
  // Nummerierung nach einem Reset zuverlässig wieder bei 1.
  const all = await dbGetAll(STORE);
  const nextId = all.reduce((max, p) => Math.max(max, p.id || 0), 0) + 1;
  return dbPut(STORE, {
    id: nextId,
    name: name.trim(),
    gender,
    club: (club || '').trim(),
    active: true,
    createdAt: Date.now(),
  });
}

export function updateParticipant(id, { name, gender, club, active }) {
  return getParticipant(id).then((existing) => {
    if (!existing) throw new Error(`Teilnehmer ${id} nicht gefunden`);
    return dbPut(STORE, {
      ...existing,
      name: name.trim(),
      gender,
      club: (club || '').trim(),
      active: active !== undefined ? active : existing.active,
    });
  });
}

export function deleteParticipant(id) {
  return dbDelete(STORE, id);
}
