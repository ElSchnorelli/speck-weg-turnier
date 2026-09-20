import { dbGetAll, dbGet, dbPut, dbDelete } from './db.js';

const STORE = 'participants';

export function listParticipants() {
  return dbGetAll(STORE).then((list) => list.sort((a, b) => a.id - b.id));
}

export function getParticipant(id) {
  return dbGet(STORE, id);
}

export function addParticipant({ name, gender, club }) {
  return dbPut(STORE, {
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
