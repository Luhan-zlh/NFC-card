// ============================================================
// 同步模块 —— 位置共享 / 在线状态 / 打卡 / 报备
// 依赖：data.js (SITE_DATA.sync)、script.js (haversineKm/formatDistance)
// 需要 Cloudflare Worker 后端，见 backend/DEPLOY.md
// ============================================================

(function () {
  "use strict";

  const SYNC_ENABLED =
    SITE_DATA.sync &&
    SITE_DATA.sync.workerUrl &&
    SITE_DATA.sync.workerUrl.trim() &&
    SITE_DATA.sync.user1Secret &&
    SITE_DATA.sync.user2Secret;

  if (!SYNC_ENABLED) {
    return; // 没配置 Worker，整个同步功能静默退出
  }

  const WORKER_URL = SITE_DATA.sync.workerUrl.replace(/\/$/, "");
  const IDENT_KEY = "nfc_card_identity";
  const CHECKIN_KEY = "nfc_card_my_checkin";

  const REPORT_LABELS = {
    wakeup: "起床了",
    sleep: "睡觉了",
    miss: "想你了",
    arrive: "到达",
    custom: "报备",
  };

  let myId = localStorage.getItem(IDENT_KEY); // "1" or "2"
  let mySecret = "";
  let partnerId = "";
  let syncInitialized = false;
  let partnerLocation = null; // 缓存对方位置，供地图渲染用
  let syncMap = null;          // Leaflet 地图实例

  // ---------- 工具函数 ----------

  function relativeTime(timestamp) {
    if (!timestamp) return "很久以前";
    const diff = Date.now() - timestamp;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return min + " 分钟前";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + " 小时前";
    const day = Math.floor(hr / 24);
    if (day < 30) return day + " 天前";
    return "很久以前";
  }

  function todayStr() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function isYesterday(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(0, 0, 0, 0);
    return d.getTime() === y.getTime();
  }

  // ---------- 身份选择 ----------

  function needsIdentity() {
    return !myId;
  }

  function showIdentityPicker() {
    const overlay = document.createElement("div");
    overlay.className = "identity-overlay";
    overlay.innerHTML =
      '<div class="identity-card">' +
      '<div class="identity-title">第一次来，你是？</div>' +
      '<div class="identity-buttons">' +
      '<button class="identity-btn" data-id="1">凯玟</button>' +
      '<button class="identity-btn" data-id="2">路涵</button>' +
      "</div>" +
      '<div class="identity-hint">选错没关系，清浏览器缓存可以重选</div>' +
      "</div>";
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".identity-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        myId = btn.getAttribute("data-id");
        localStorage.setItem(IDENT_KEY, myId);
        overlay.classList.add("identity-overlay-fade");
        setTimeout(() => overlay.remove(), 500);
        initSyncData();
      });
    });
  }

  // ---------- 后端通信 ----------

  function reportData(type, data) {
    if (!myId || !mySecret) return Promise.resolve();
    return fetch(WORKER_URL + "/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: myId, secret: mySecret, type, data }),
    })
      .then((r) => r.json())
      .catch(() => null);
  }

  function fetchPartnerStatus() {
    if (!myId || !mySecret) return Promise.resolve(null);
    const url =
      WORKER_URL +
      "/status?userId=" +
      encodeURIComponent(myId) +
      "&secret=" +
      encodeURIComponent(mySecret);
    return fetch(url)
      .then((r) => r.json())
      .catch(() => null);
  }

  // 读取自己的状态（用于刷新后从云端恢复显示）
  function fetchMyStatus() {
    if (!myId || !mySecret) return Promise.resolve(null);
    const url =
      WORKER_URL +
      "/mystatus?userId=" +
      encodeURIComponent(myId) +
      "&secret=" +
      encodeURIComponent(mySecret);
    return fetch(url)
      .then((r) => r.json())
      .catch(() => null);
  }

  // 反向地理编码（复用 script.js 里的逻辑，如果有的话）
  function reverseGeocode(lat, lng) {
    // 用英文请求，避免某些地区中文翻译出现乱码
    // 英文城市名全球通用，且 Nominatim 对英文支持最稳定
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=json&lat=" +
      lat +
      "&lon=" +
      lng +
      "&zoom=10&accept-language=en";
    return fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.address) return null;
        const a = data.address;
        return a.city || a.town || a.county || a.municipality || a.state_district || a.state || null;
      })
      .catch(() => null);
  }

  // ---------- 初始化同步 ----------

  function initSyncData() {
    if (syncInitialized) return;
    syncInitialized = true;

    const section = document.getElementById("sync-section");
    if (section) section.style.display = "";

    // 设置密钥
    mySecret = myId === "1" ? SITE_DATA.sync.user1Secret : SITE_DATA.sync.user2Secret;
    partnerId = myId === "1" ? "2" : "1";

    // 绑定按钮
    bindCheckinButton();
    bindReportButtons();
    bindLocateButton();

    // 上报在线状态
    reportData("online", {});

    // 记录本次访问（用于活动记录板块）
    reportData("visit", {});

    // 读取对方状态
    refreshPartnerStatus();

    // 显示自己的打卡统计
    renderMyCheckinStats();

    // 显示自己的报备记录（先从本地恢复）
    renderMyReports();

    // 显示自己的位置分享状态（先从本地恢复）
    renderMyLocationStatus();

    // 从云端恢复自己的数据（本地没有但云端有的情况，比如旧版本做的操作）
    restoreMyDataFromCloud();

    // 每 60 秒刷新一次对方状态（低频，省电）
    setInterval(refreshPartnerStatus, 60000);
  }

  // 从云端恢复自己的报备和位置到本地（刷新后/换设备后）
  function restoreMyDataFromCloud() {
    fetchMyStatus().then((result) => {
      if (!result || !result.me) return;
      const me = result.me;

      // 恢复报备记录
      if (me.reports && me.reports.length > 0) {
        const localReports = loadMyReports();
        if (localReports.length === 0) {
          // 本地没有但云端有，从云端恢复
          saveMyReports(me.reports);
          renderMyReports();
        }
      }

      // 恢复位置状态
      if (me.location && me.location.lat) {
        const localLoc = localStorage.getItem(MY_LOCATION_KEY);
        if (!localLoc) {
          // 本地没有但云端有，从云端恢复
          localStorage.setItem(MY_LOCATION_KEY, JSON.stringify(me.location));
          renderMyLocationStatus();
        }
      }
    });
  }

  // ---------- 对方状态渲染 ----------

  function refreshPartnerStatus() {
    fetchPartnerStatus().then((result) => {
      if (!result || !result.partner) return;
      const p = result.partner;
      renderPartnerOnline(p.status);
      renderPartnerLocation(p.location);
      renderPartnerCheckin(p.checkin);
      renderPartnerReports(p.reports);
      renderPartnerActivity(p.visits);
    });
  }

  function renderPartnerOnline(status) {
    const dot = document.getElementById("sync-online-dot");
    const text = document.getElementById("sync-online-text");
    const nameEl = document.getElementById("sync-partner-name");
    if (!dot || !text) return;

    const partnerName = partnerId === "1" ? "凯玟" : "路涵";
    if (nameEl) nameEl.textContent = partnerName;

    if (!status || !status.lastSeen) {
      dot.className = "sync-online-dot offline";
      text.textContent = "还没来过";
      return;
    }

    const diff = Date.now() - status.lastSeen;
    if (diff < 5 * 60 * 1000) {
      // 5分钟内
      dot.className = "sync-online-dot online";
      text.textContent = "在线";
    } else {
      dot.className = "sync-online-dot offline";
      text.textContent = "最后在线 " + relativeTime(status.lastSeen);
    }
  }

  function renderPartnerLocation(location) {
    const el = document.getElementById("sync-partner-location");
    if (!el) return;

    // 缓存对方位置供地图使用
    partnerLocation = location;

    if (!location || !location.lat) {
      el.textContent = "";
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.innerHTML =
      '<span class="sync-loc-icon">📍</span>' +
      "在 " +
      (location.city || "未知城市") +
      ' <span class="sync-loc-time">' +
      relativeTime(location.timestamp) +
      "</span>";

    // 如果有自己的位置，显示距离 + 更新顶部信息栏距离
    const myLoc = localStorage.getItem(MY_LOCATION_KEY);
    if (myLoc) {
      try {
        const mine = JSON.parse(myLoc);
        const dist = haversineKm(mine.lat, mine.lng, location.lat, location.lng);
        el.innerHTML +=
          ' <span class="sync-loc-dist">距你 ' + formatDistance(dist) + "</span>";
        // 更新顶部信息栏
        if (typeof window.updateInfoBarDistance === "function") {
          window.updateInfoBarDistance(dist);
        }
      } catch (e) {}
    }

    // 获取对方城市天气
    fetchPartnerWeather(location);

    // 尝试渲染地图（需要双方都有位置）
    renderSyncMap();
  }

  // ---------- 对方城市天气 ----------
  // 用 Open-Meteo 免费 API（不需要 API key）
  // 只在拿到对方位置时请求一次，不轮询，省电
  let weatherFetchedFor = null; // 记录已请求过天气的坐标，避免重复请求

  function fetchPartnerWeather(location) {
    if (!location || !location.lat) return;
    // 同一个位置只请求一次天气（避免每次刷新对方状态都请求）
    const locKey = location.lat.toFixed(2) + "," + location.lng.toFixed(2);
    if (weatherFetchedFor === locKey) return;
    weatherFetchedFor = locKey;

    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      location.lat + "&longitude=" + location.lng +
      "&current_weather=true&timezone=auto";

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.current_weather) return;
        const cw = data.current_weather;
        const temp = Math.round(cw.temperature);
        const code = cw.weathercode;

        // WMO 天气码转中文描述
        const weatherDesc = wmoToChinese(code);

        const city = location.city || "她那边";
        const text = city + " " + temp + "°C " + weatherDesc;

        if (typeof window.updateInfoBarWeather === "function") {
          window.updateInfoBarWeather(text);
        }
      })
      .catch(() => {});
  }

  // WMO 天气码 → 中文
  function wmoToChinese(code) {
    if (code === 0) return "晴 ☀";
    if (code <= 3) return "多云 ⛅";
    if (code <= 48) return "有雾 🌫";
    if (code <= 67) return "小雨 🌧";
    if (code <= 77) return "雪 ❄";
    if (code <= 82) return "阵雨 🌦";
    if (code <= 99) return "雷雨 ⛈";
    return "—";
  }

  // ---------- 内嵌地图 ----------
  function renderSyncMap() {
    const wrap = document.getElementById("sync-map-wrap");
    const mapDiv = document.getElementById("sync-map");
    if (!wrap || !mapDiv) return;

    const myLocStr = localStorage.getItem(MY_LOCATION_KEY);
    if (!myLocStr || !partnerLocation || !partnerLocation.lat) {
      wrap.style.display = "none";
      return;
    }

    let myLoc;
    try {
      myLoc = JSON.parse(myLocStr);
    } catch (e) {
      return;
    }
    if (!myLoc.lat) return;

    // 双方都有位置，显示地图容器
    wrap.style.display = "";

    // 如果 Leaflet 还没加载完，等一下再试（最多重试 20 次 = 10秒）
    if (typeof L === "undefined") {
      if (!wrap._mapRetryCount) wrap._mapRetryCount = 0;
      if (wrap._mapRetryCount < 20) {
        wrap._mapRetryCount++;
        setTimeout(renderSyncMap, 500);
      }
      return;
    }

    const myName = myId === "1" ? "凯玟" : "路涵";
    const partnerName = partnerId === "1" ? "凯玟" : "路涵";

    const dist = haversineKm(myLoc.lat, myLoc.lng, partnerLocation.lat, partnerLocation.lng);

    // 如果地图还没创建，初始化
    if (!syncMap) {
      try {
        syncMap = L.map("sync-map", { zoomControl: true, attributionControl: true });

        // CartoDB 暗色 tiles，匹配网站深色风格
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; OpenStreetMap & CartoDB',
          maxZoom: 18,
        }).addTo(syncMap);
      } catch (e) {
        console.error("Leaflet init error:", e);
        return;
      }
    }

    if (!syncMap) return;

    // 确保地图容器尺寸正确（从 display:none 切换过来时必须调）
    setTimeout(() => {
      if (syncMap) {
        syncMap.invalidateSize();
        syncMap.fitBounds(
          L.latLngBounds([
            [myLoc.lat, myLoc.lng],
            [partnerLocation.lat, partnerLocation.lng],
          ]),
          { padding: [40, 40] }
        );
      }
    }, 200);

    // 清掉旧标记和连线
    syncMap.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.Icon) {
        syncMap.removeLayer(layer);
      }
    });

    // 自定义标记图标（SVG 水滴 pin，颜色区分）
    function makeIcon(color, label) {
      var svg =
        '<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 26 16 26s16-14 16-26C32 7.2 24.8 0 16 0z" ' +
        'fill="' + color + '" ' +
        'stroke="rgba(255,255,255,0.3)" stroke-width="1" ' +
        'filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"/>' +
        '<circle cx="16" cy="16" r="6" fill="rgba(18,8,38,0.9)"/>' +
        '<text x="16" y="20" text-anchor="middle" font-size="9" fill="' + color + '" ' +
        'font-family="sans-serif" font-weight="bold">' + label + '</text>' +
        '</svg>';
      return L.divIcon({
        className: "sync-map-marker",
        html: svg,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -38],
      });
    }

    // 我的标记（粉色 K = 凯玟 / L = 路涵）
    var myLabel = myId === "1" ? "K" : "L";
    var partnerLabel = partnerId === "1" ? "K" : "L";
    const myMarker = L.marker([myLoc.lat, myLoc.lng], {
      icon: makeIcon("#ff8fc7", myLabel),
    }).addTo(syncMap);
    myMarker.bindPopup(
      '<div class="sync-popup">' +
      '<div class="sync-popup-name" style="color: #ff8fc7;">' + myName + '</div>' +
      '<div class="sync-popup-city">📍 ' + (myLoc.city || "未知城市") + '</div>' +
      '<div class="sync-popup-time">' + relativeTime(myLoc.timestamp) + '</div>' +
      '</div>'
    );

    // 对方标记（金色）
    const partnerMarker = L.marker([partnerLocation.lat, partnerLocation.lng], {
      icon: makeIcon("#ffd68a", partnerLabel),
    }).addTo(syncMap);
    partnerMarker.bindPopup(
      '<div class="sync-popup">' +
      '<div class="sync-popup-name" style="color: #ffd68a;">' + partnerName + '</div>' +
      '<div class="sync-popup-city">📍 ' + (partnerLocation.city || "未知城市") + '</div>' +
      '<div class="sync-popup-time">' + relativeTime(partnerLocation.timestamp) + '</div>' +
      '</div>'
    );

    // 连线（粉色渐变虚线，更粗更醒目）
    const line = L.polyline(
      [[myLoc.lat, myLoc.lng], [partnerLocation.lat, partnerLocation.lng]],
      {
        color: "#ff8fc7",
        weight: 3,
        opacity: 0.7,
        dashArray: "8 10",
      }
    ).addTo(syncMap);

    // 在连线中点显示距离标签
    const midLat = (myLoc.lat + partnerLocation.lat) / 2;
    const midLng = (myLoc.lng + partnerLocation.lng) / 2;
    const distLabel = L.marker([midLat, midLng], {
      icon: L.divIcon({
        className: "sync-map-dist-label",
        html: '<div class="sync-dist-badge">❤ ' + formatDistance(dist) + '</div>',
        iconSize: [80, 24],
        iconAnchor: [40, 12],
      }),
      interactive: false,
    }).addTo(syncMap);

    // 自动缩放到能看到两个标记
    const bounds = L.latLngBounds([
      [myLoc.lat, myLoc.lng],
      [partnerLocation.lat, partnerLocation.lng],
    ]);
    syncMap.fitBounds(bounds, { padding: [40, 40] });

    // 显示距离
    const distEl = document.getElementById("sync-map-distance");
    if (distEl) {
      distEl.innerHTML =
        '<span class="sync-map-dist-icon">❤</span> 我们相距 <b>' +
        formatDistance(dist) + "</b>";
    }
  }

  function renderPartnerCheckin(checkin) {
    const el = document.getElementById("sync-partner-checkin");
    if (!el) return;

    if (!checkin || !checkin.lastDate) {
      el.textContent = "";
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    const today = todayStr();
    const checkedToday = checkin.lastDate === today;
    el.innerHTML =
      '<span class="sync-checkin-icon">' + (checkedToday ? "✓" : "○") + "</span>" +
      "已打卡 " + (checkin.total || 0) + " 天" +
      (checkin.streak ? ' · 连续 ' + checkin.streak + ' 天' : "");
  }

  function renderPartnerReports(reports) {
    const el = document.getElementById("sync-partner-reports");
    if (!el) return;

    if (!reports || reports.length === 0) {
      el.textContent = "";
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    // 只显示最近 3 条
    const recent = reports.slice(-3).reverse();
    el.innerHTML = '<div class="sync-reports-label">最近的报备</div>';
    recent.forEach((r) => {
      const item = document.createElement("div");
      item.className = "sync-report-item";
      item.innerHTML =
        '<span class="sync-report-type">' +
        (REPORT_LABELS[r.type] || r.type || "报备") +
        "</span>" +
        '<span class="sync-report-time">' +
        relativeTime(r.timestamp) +
        "</span>";
      el.appendChild(item);
    });
  }

  // ---------- 对方活动记录 ----------
  // 从对方的 visits 数组生成最近7天的活动热力图
  function renderPartnerActivity(visits) {
    const el = document.getElementById("sync-partner-activity");
    if (!el) return;

    if (!visits || visits.length === 0) {
      el.textContent = "";
      el.style.display = "none";
      return;
    }
    el.style.display = "";

    // 生成最近7天的日期
    const days = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        date: d,
        dateStr: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"),
        count: 0,
        visits: [],
      });
    }

    // 把 visits 归类到对应日期
    visits.forEach((v) => {
      const d = new Date(v.timestamp);
      const ds = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const day = days.find((day) => day.dateStr === ds);
      if (day) {
        day.count++;
        day.visits.push(v.timestamp);
      }
    });

    // 找最大访问次数用于颜色深浅
    const maxCount = Math.max(...days.map((d) => d.count), 1);

    // 星期标签
    const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

    el.innerHTML = '<div class="sync-activity-label">最近7天活动</div>';
    el.innerHTML += '<div class="sync-activity-grid"></div>';
    const grid = el.querySelector(".sync-activity-grid");

    days.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = "sync-activity-cell";
      const intensity = day.count / maxCount;
      if (day.count === 0) {
        cell.classList.add("activity-none");
      } else if (intensity < 0.34) {
        cell.classList.add("activity-low");
      } else if (intensity < 0.67) {
        cell.classList.add("activity-mid");
      } else {
        cell.classList.add("activity-high");
      }

      // 日期 + 星期
      const dayLabel = String(day.date.getDate()) + "日";
      const weekLabel = weekDays[day.date.getDay()];

      cell.innerHTML =
        '<div class="sync-activity-day">' + dayLabel + "</div>" +
        '<div class="sync-activity-week">周' + weekLabel + "</div>" +
        '<div class="sync-activity-count">' +
        (day.count > 0 ? day.count + "次" : "—") +
        "</div>";

      // 如果有访问，显示最早和最晚一次的时间
      if (day.visits.length > 0) {
        const times = day.visits.sort((a, b) => a - b);
        const first = new Date(times[0]);
        const last = new Date(times[times.length - 1]);
        const fmt = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
        cell.innerHTML +=
          '<div class="sync-activity-times">' +
          fmt(first) + " ~ " + fmt(last) +
          "</div>";
      }

      grid.appendChild(cell);
    });
  }

  // ---------- 打卡 ----------

  function loadMyCheckin() {
    try {
      return JSON.parse(localStorage.getItem(CHECKIN_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveMyCheckin(data) {
    try {
      localStorage.setItem(CHECKIN_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function handleCheckin() {
    const my = loadMyCheckin();
    const today = todayStr();

    if (my.lastDate === today) {
      return; // 今天已打卡
    }

    // 计算连续天数
    let streak = 1;
    if (my.lastDate && isYesterday(my.lastDate)) {
      streak = (my.streak || 0) + 1;
    }
    const total = (my.total || 0) + 1;

    const newCheckin = {
      lastDate: today,
      streak: streak,
      total: total,
    };
    saveMyCheckin(newCheckin);

    // 上报到后端
    reportData("checkin", newCheckin);

    renderMyCheckinStats();

    // 打卡成功的彩带
    const btn = document.getElementById("sync-checkin-btn");
    if (btn) {
      const rect = btn.getBoundingClientRect();
      if (typeof spawnConfetti === "function") {
        spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
      }
      btn.textContent = "✓ 已打卡";
      btn.disabled = true;
    }
  }

  function renderMyCheckinStats() {
    const el = document.getElementById("sync-checkin-stats");
    const btn = document.getElementById("sync-checkin-btn");
    if (!el) return;

    const my = loadMyCheckin();
    const today = todayStr();
    const checkedToday = my.lastDate === today;

    if (btn) {
      if (checkedToday) {
        btn.textContent = "✓ 今天已打卡";
        btn.disabled = true;
      } else {
        btn.textContent = "打卡";
        btn.disabled = false;
      }
    }

    if (my.total) {
      el.innerHTML =
        "已打卡 " + my.total + " 天" +
        (my.streak ? ' · 连续 ' + my.streak + ' 天' : "");
    } else {
      el.textContent = "还没开始打卡";
    }
  }

  function bindCheckinButton() {
    const btn = document.getElementById("sync-checkin-btn");
    if (btn) btn.addEventListener("click", handleCheckin);
  }

  // ---------- 报备 ----------

  const MY_REPORTS_KEY = "nfc_card_my_reports";

  function loadMyReports() {
    try {
      return JSON.parse(localStorage.getItem(MY_REPORTS_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveMyReports(reports) {
    try {
      // 只保留最近 10 条到本地
      const recent = reports.slice(-10);
      localStorage.setItem(MY_REPORTS_KEY, JSON.stringify(recent));
    } catch (e) {}
  }

  function renderMyReports() {
    const el = document.getElementById("sync-my-reports");
    if (!el) return;
    const reports = loadMyReports();
    if (reports.length === 0) {
      el.style.display = "none";
      return;
    }
    el.style.display = "";
    el.innerHTML = "";
    // 最近 3 条，倒序显示
    reports.slice(-3).reverse().forEach((r) => {
      const item = document.createElement("div");
      item.className = "sync-report-item sync-report-mine";
      item.innerHTML =
        '<span class="sync-report-type">' + (REPORT_LABELS[r.type] || r.type) + "</span>" +
        '<span class="sync-report-time">' + relativeTime(r.timestamp) + "</span>";
      el.appendChild(item);
    });
  }

  function handleReport(type) {
    const now = Date.now();
    const reports = loadMyReports();
    reports.push({ type: type, timestamp: now });
    saveMyReports(reports);

    reportData("report", { type: type }).then(() => {
      // 刷新对方状态（让对方能尽快看到）
      setTimeout(refreshPartnerStatus, 1000);
    });

    // 立即刷新自己的报备显示
    renderMyReports();

    // 如果是"想你了"，触发爱心动画
    if (type === "miss" && typeof spawnHearts === "function") {
      spawnHearts(window.innerWidth / 2, window.innerHeight / 2, 20);
    }
  }

  function bindReportButtons() {
    document.querySelectorAll(".sync-report-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        handleReport(btn.getAttribute("data-report"));
      });
    });
  }

  // ---------- 位置分享 ----------

  const MY_LOCATION_KEY = "nfc_card_my_location";

  function renderMyLocationStatus() {
    const btn = document.getElementById("sync-locate-btn");
    if (!btn) return;
    const saved = localStorage.getItem(MY_LOCATION_KEY);
    if (saved) {
      try {
        const loc = JSON.parse(saved);
        if (loc.city && loc.timestamp) {
          btn.textContent = "✓ 已分享位置（" + loc.city + " · " + relativeTime(loc.timestamp) + "）";
        } else {
          btn.textContent = "✓ 位置已分享 · 重新分享";
        }
      } catch (e) {
        btn.textContent = "分享我的位置";
      }
    }
  }

  function handleLocate() {
    const btn = document.getElementById("sync-locate-btn");
    if (!btn) return;

    if (!("geolocation" in navigator)) {
      btn.textContent = "设备不支持定位";
      return;
    }

    btn.textContent = "正在定位…";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        // 反向地理编码 + 上报
        reverseGeocode(latitude, longitude).then((cityName) => {
          // 存到本地（含城市名和时间，用于刷新后显示"已分享"状态）
          const locData = {
            lat: latitude,
            lng: longitude,
            city: cityName,
            timestamp: Date.now(),
          };
          localStorage.setItem(MY_LOCATION_KEY, JSON.stringify(locData));

          reportData("location", {
            lat: latitude,
            lng: longitude,
            city: cityName,
          });
          btn.disabled = false;
          renderMyLocationStatus();
          // 刷新对方状态（可能对方有位置了，可以算距离）
          refreshPartnerStatus();
          // 尝试渲染地图（自己的位置刚更新了）
          renderSyncMap();
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          btn.textContent = "未授权定位，点此重试";
        } else {
          btn.textContent = "定位失败，点此重试";
        }
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function bindLocateButton() {
    const btn = document.getElementById("sync-locate-btn");
    if (btn) btn.addEventListener("click", handleLocate);
  }

  // ---------- 启动 ----------

  // 等信封仪式完成后初始化同步
  function waitForReveal() {
    if (document.body.classList.contains("content-revealed")) {
      onRevealed();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.body.classList.contains("content-revealed")) {
        observer.disconnect();
        onRevealed();
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    // Fallback：15秒后强制初始化（防止 observer 没触发）
    setTimeout(() => {
      if (!syncInitialized) onRevealed();
    }, 15000);
  }

  function onRevealed() {
    if (needsIdentity()) {
      showIdentityPicker();
      // 身份选择完成后（在 showIdentityPicker 的回调里）会调 initSyncData
    } else {
      initSyncData();
    }
  }

  // defer 脚本在 DOMContentLoaded 之后执行，直接等 reveal
  waitForReveal();
})();
