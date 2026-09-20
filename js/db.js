// Ganz einfacher IndexedDB-Wrapper.
// IndexedDB ist die Datenbank, die direkt im Browser läuft (kein Internet nötig,
// Daten bleiben auf dem iPad gespeichert). Die rohe IndexedDB-API ist umständlich,
// deshalb bieten wir hier einfache Funktionen an: dbGetAll, dbGet, dbPut, dbDelete.

const DB_NAME = 'speckWegTurnier';
const DB_VERSION = 1;

const STORES = {
  participants: { keyPath: 'id', autoIncrement: true },
  matches: { keyPath: 'id', autoIncrement: true },
  meta: { keyPath: 'id', autoIncrement: false },
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, options] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, options);
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export function dbGetAll(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function dbGet(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function dbPut(storeName, value) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).put(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export function dbDelete(storeName, id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export function dbClear(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}
