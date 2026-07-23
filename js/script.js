// ============================================================
// 逻辑代码 —— 一般不需要改这个文件
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  renderGreeting();
  renderStarfield();
  renderCounter();
  renderTimeline();
  renderLoveNote();
  renderNotebookLink();
  bindEnterOverlay();
  bindScrollReveal();

  // 计数器每秒刷新一次，制造"实时在增长"的感觉
  setInterval(renderCounter, 1000);
});

// ---------- 滚动渐入 ----------
function bindScrollReveal() {
  // hero 开场区块一揭晓就应该立刻可见，不参与滚动渐入
  const targets = document.querySelectorAll(
    "main > section:not(.hero), main > .divider"
  );
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    // 不支持的老浏览器，直接全部显示，不影响基础体验
    targets.forEach((t) => t.classList.add("reveal-in"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("reveal-in");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  targets.forEach((t) => {
    t.classList.add("reveal-pending");
    observer.observe(t);
  });
}

// ---------- 开场 ----------
function renderGreeting() {
  const nameEl = document.getElementById("her-name");
  const greetEl = document.getElementById("greeting-text");
  if (nameEl) nameEl.textContent = SITE_DATA.herName || "";
  if (greetEl) greetEl.textContent = SITE_DATA.greeting || "";
}

function bindEnterOverlay() {
  const overlay = document.getElementById("enter-overlay");
  const btn = document.getElementById("enter-btn");
  if (!overlay || !btn) return;
  btn.addEventListener("click", () => {
    overlay.classList.add("overlay-hidden");
    setTimeout(() => overlay.remove(), 900);
    document.body.classList.add("content-revealed");
  });
}

// ---------- 星空背景 ----------
function renderStarfield() {
  const field = document.getElementById("starfield");
  if (!field) return;
  const STAR_COUNT = 90;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = document.createElement("span");
    star.className = "star";
    const size = (Math.random() * 2 + 1).toFixed(2);
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.left = `${Math.random() * 100}%`;
    star.style.animationDelay = `${(Math.random() * 6).toFixed(2)}s`;
    star.style.animationDuration = `${(Math.random() * 3 + 2).toFixed(2)}s`;
    frag.appendChild(star);
  }
  field.appendChild(frag);
}

// ---------- 在一起天数计数器 ----------
function renderCounter() {
  const el = document.getElementById("counter-value");
  if (!el || !SITE_DATA.anniversaryDate) return;

  const start = new Date(SITE_DATA.anniversaryDate + "T00:00:00");
  const now = new Date();
  let diff = now - start;
  if (diff < 0) diff = 0;

  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  const minute = 60 * 1000;

  const days = Math.floor(diff / day);
  const hours = Math.floor((diff % day) / hour);
  const minutes = Math.floor((diff % hour) / minute);
  const seconds = Math.floor((diff % minute) / 1000);

  el.innerHTML =
    `<span class="num">${days}</span><span class="unit">天</span>` +
    `<span class="num">${pad(hours)}</span><span class="unit">时</span>` +
    `<span class="num">${pad(minutes)}</span><span class="unit">分</span>` +
    `<span class="num">${pad(seconds)}</span><span class="unit">秒</span>`;
}

function pad(n) {
  return n.toString().padStart(2, "0");
}

// ---------- 时间线 ----------
function renderTimeline() {
  const container = document.getElementById("timeline-list");
  if (!container || !Array.isArray(SITE_DATA.timeline)) return;

  container.innerHTML = "";
  SITE_DATA.timeline.forEach((item, idx) => {
    const li = document.createElement("li");
    li.className = "timeline-item";
    li.style.animationDelay = `${idx * 0.12}s`;

    const dot = document.createElement("div");
    dot.className = "timeline-dot";

    const card = document.createElement("div");
    card.className = "timeline-card";

    if (item.img) {
      const img = document.createElement("img");
      img.src = item.img;
      img.alt = item.title || "";
      img.className = "timeline-img";
      img.loading = "lazy";
      img.onerror = function () {
        // 照片加载失败时，自动退回占位爱心，不显示"裂图"图标
        const placeholder = document.createElement("div");
        placeholder.className = "timeline-img timeline-img-placeholder";
        placeholder.textContent = "♥";
        this.replaceWith(placeholder);
      };
      card.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "timeline-img timeline-img-placeholder";
      placeholder.textContent = "♥";
      card.appendChild(placeholder);
    }

    const dateEl = document.createElement("div");
    dateEl.className = "timeline-date";
    dateEl.textContent = item.date || "";

    const titleEl = document.createElement("div");
    titleEl.className = "timeline-title";
    titleEl.textContent = item.title || "";

    const descEl = document.createElement("div");
    descEl.className = "timeline-desc";
    descEl.textContent = item.desc || "";

    card.appendChild(dateEl);
    card.appendChild(titleEl);
    card.appendChild(descEl);

    li.appendChild(dot);
    li.appendChild(card);
    container.appendChild(li);
  });
}

// ---------- 爱意小纸条 ----------
function dayOfYearIndex(len) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 24 * 60 * 60 * 1000;
  const dayIdx = Math.floor(diff / oneDay);
  return dayIdx % len;
}

let currentNoteIndex = -1;

function renderLoveNote(forceRandom) {
  const el = document.getElementById("love-note-text");
  const notes = SITE_DATA.loveNotes;
  if (!el || !Array.isArray(notes) || notes.length === 0) return;

  let idx;
  if (forceRandom) {
    if (notes.length === 1) {
      idx = 0;
    } else {
      // 排除当前这条，避免"随机到同一句"看起来像没反应
      do {
        idx = Math.floor(Math.random() * notes.length);
      } while (idx === currentNoteIndex);
    }
  } else {
    idx = dayOfYearIndex(notes.length);
  }
  currentNoteIndex = idx;

  // 淡出 -> 换字 -> 淡入
  el.classList.add("note-fade");
  setTimeout(() => {
    el.textContent = notes[idx];
    el.classList.remove("note-fade");
  }, 220);
}

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "shuffle-note-btn") {
    renderLoveNote(true);
  }
});

// ---------- 共享留言本 ----------
function renderNotebookLink() {
  const btn = document.getElementById("notebook-btn");
  if (!btn) return;
  const url = SITE_DATA.sharedNotebookUrl;
  if (url && url.trim()) {
    btn.href = url;
    btn.textContent = "打开我们的留言本 →";
    btn.classList.remove("btn-disabled");
  } else {
    btn.href = "javascript:void(0)";
    btn.textContent = "留言本即将上线 …";
    btn.classList.add("btn-disabled");
  }
}
