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

  // 反向地理编码（复用 script.js 里的逻辑，如果有的话）
  function reverseGeocode(lat, lng) {
    const url =
      "https://nominatim.openstreetmap.org/reverse?format=json&lat=" +
      lat +
      "&lon=" +
      lng +
      "&zoom=10&accept-language=zh-CN";
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

    // 读取对方状态
    refreshPartnerStatus();

    // 显示自己的打卡统计
    renderMyCheckinStats();

    // 每 60 秒刷新一次对方状态（低频，省电）
    setInterval(refreshPartnerStatus, 60000);
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

    // 如果有自己的位置，显示距离
    const myLoc = localStorage.getItem("nfc_card_my_location");
    if (myLoc) {
      try {
        const mine = JSON.parse(myLoc);
        const dist = haversineKm(mine.lat, mine.lng, location.lat, location.lng);
        el.innerHTML +=
          ' <span class="sync-loc-dist">距你 ' + formatDistance(dist) + "</span>";
      } catch (e) {}
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

  function handleReport(type) {
    reportData("report", { type: type }).then(() => {
      // 刷新对方状态（让对方能尽快看到）
      setTimeout(refreshPartnerStatus, 1000);
    });

    // 显示自己的报备反馈
    const myReportsEl = document.getElementById("sync-my-reports");
    if (myReportsEl) {
      myReportsEl.style.display = "";
      const item = document.createElement("div");
      item.className = "sync-report-item sync-report-mine";
      item.innerHTML =
        '<span class="sync-report-type">' + (REPORT_LABELS[type] || type) + "</span>" +
        '<span class="sync-report-time">刚刚</span>';
      myReportsEl.appendChild(item);
      // 只保留最近3条
      while (myReportsEl.children.length > 3) {
        myReportsEl.removeChild(myReportsEl.firstChild);
      }
    }

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

        // 存到本地（用于算距离）
        localStorage.setItem(
          "nfc_card_my_location",
          JSON.stringify({ lat: latitude, lng: longitude })
        );

        // 反向地理编码 + 上报
        reverseGeocode(latitude, longitude).then((cityName) => {
          reportData("location", {
            lat: latitude,
            lng: longitude,
            city: cityName,
          });
          btn.textContent = "✓ 位置已分享";
          btn.disabled = false;
          // 刷新对方状态（可能对方有位置了，可以算距离）
          refreshPartnerStatus();
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
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
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
