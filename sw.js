// 简单的离线缓存：把核心文件缓存起来，
// 这样即使她在没有网络的地方点开桌面图标，也能看到上一次加载的内容。
const CACHE_NAME = "nfc-card-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/data.js",
  "./js/script.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// 策略：网络优先（保证内容尽量新），网络失败时退回缓存
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
