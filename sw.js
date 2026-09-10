// 운동 일지 — 서비스 워커
// 앱 셸(정적 파일)만 캐싱함. Firebase(Auth/Firestore) 요청은 네트워크로 직접 전달되며
// 오프라인 시 Firestore 자체 오프라인 캐시(enablePersistence)가 처리함.
//
// v2: index.html(앱 페이지)은 네트워크 우선(network-first)으로 전환함 — 이전 버전(v1)은
// 캐시 우선이라 배포 후 새 기능이 기기에 바로 반영되지 않는 문제가 있었음. 아이콘/manifest
// 등 거의 안 바뀌는 정적 파일만 캐시 우선을 유지함.

const CACHE_NAME = 'workout-log-shell-v2';
const APP_SHELL = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Firebase / Google API 요청은 서비스 워커가 개입하지 않음(네트워크 그대로 통과)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('google.com')) {
    return;
  }

  if (req.method !== 'GET') return;

  // 앱 페이지(HTML) 자체는 네트워크 우선 — 배포한 새 버전이 바로 반영되도록 함.
  // 오프라인일 때만 마지막으로 캐시된 페이지로 대체함.
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (isPage) {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 그 외 정적 자산(아이콘, manifest 등)은 캐시 우선 + 백그라운드 갱신
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
