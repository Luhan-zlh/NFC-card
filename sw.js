// 离线缓存 + 加速刷新：
// 这样即使她在没有网络的地方点开桌面图标，也能看到上一次加载的内容，
// 而且日常刷新时不用等网络返回，先用缓存秒开，同时在背后偷偷更新缓存。
const CACHE_NAME = "nfc-card-v6";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/script.js",
  "./js/sync.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// data.js 和 images/ 里的内容会被经常更新（时间线、照片、小纸条），
// 这类文件"内容新鲜度"比"秒开速度"更重要，所以单独区分出来，
// 走"优先联网获取最新"策略，而不是"缓存优先"，
// 避免出现"改完内容刷新一次还是看到旧版本"的情况。
function isFrequentlyUpdatedAsset(url) {
  return (
    url.pathname.endsWith("/js/data.js") ||
    url.pathname.endsWith("/js/sync.js") ||
    url.pathname.includes("/images/")
  );
}

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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // 第三方资源（比如访问计数器）不经过这层

  if (isFrequentlyUpdatedAsset(url)) {
    // 内容类文件（data.js、图片）：优先联网拿最新的，只有断网时才退回缓存
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 核心代码文件（HTML/CSS/JS逻辑）：缓存优先（stale-while-revalidate），
  // 有缓存就立刻秒开，同时在背后重新拉取最新版本存起来，下次打开生效
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
