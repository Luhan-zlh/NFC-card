// 离线缓存 + 加速刷新：
// 这样即使她在没有网络的地方点开桌面图标，也能看到上一次加载的内容，
// 而且日常刷新时不用等网络返回，先用缓存秒开，同时在背后偷偷更新缓存。
const CACHE_NAME = "nfc-card-v2";
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

// 策略：缓存优先（stale-while-revalidate）——
// 有缓存就立刻用缓存秒开页面，同时在背后重新拉取最新版本存起来，
// 下次打开就是新内容。只有完全没缓存过（第一次访问）才会等网络。
// 只处理"同源"请求，第三方资源（比如访问计数器）不经过这层，避免被拖慢。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => cached); // 网络失败就退回缓存（离线场景）

        return cached || networkFetch;
      })
    )
  );
});
