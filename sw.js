// Service Worker: sorgt dafür, dass die App komplett offline funktioniert.
// Beim ersten (einmaligen) Online-Aufruf werden alle Dateien hier unten in
// einen lokalen Cache auf dem iPad gespeichert. Danach kommt alles aus
// diesem Cache, ein Netzwerkzugriff wird nicht mehr benötigt.
//
// WICHTIG bei einer Code-Änderung nach dem Turnier: CACHE_NAME hochzählen
// (z.B. "v2"), sonst bekommt das iPad die neue Version beim nächsten
// Online-Moment nicht mit.
const CACHE_NAME = 'speck-weg-cache-v3';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/participants.js',
  './js/excelImport.js',
  './js/settings.js',
  './js/draw.js',
  './js/vorrunde.js',
  './js/ranking.js',
  './js/status.js',
  './js/ko.js',
  './js/felder.js',
  './js/reset.js',
  './js/ui/participantsView.js',
  './js/ui/settingsView.js',
  './js/ui/vorrundeView.js',
  './js/ui/rankingView.js',
  './js/ui/koView.js',
  './js/pdfExport.js',
  './js/excelExport.js',
  './js/ui/resultView.js',
  './libs/xlsx.full.min.js',
  './libs/jspdf.umd.min.js',
  './libs/jspdf.plugin.autotable.min.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
