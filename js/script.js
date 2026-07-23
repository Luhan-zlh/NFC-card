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
  bindTiltEffect(".timeline-card, .note-card");
  bindConfettiTriggers();
  checkMilestone();

  // 计数器每秒刷新一次，制造"实时在增长"的感觉
  setInterval(renderCounter, 1000);
});

const REDUCE_MOTION =
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 3D 触摸倾斜卡片 ----------
function bindTiltEffect(selector) {
  if (REDUCE_MOTION) return;
  const cards = document.querySelectorAll(selector);
  if (!cards.length) return;

  cards.forEach((card) => {
    card.style.transformStyle = "preserve-3d";
    card.style.willChange = "transform";

    const handleMove = (clientX, clientY) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (clientX - cx) / (rect.width / 2);
      const dy = (clientY - cy) / (rect.height / 2);
      const maxTilt = 7; // 度数，克制一点更高级
      const rotateY = Math.max(-1, Math.min(1, dx)) * maxTilt;
      const rotateX = Math.max(-1, Math.min(1, -dy)) * maxTilt;
      card.style.transform = `perspective(600px) rotateX(${rotateX.toFixed(
        2
      )}deg) rotateY(${rotateY.toFixed(2)}deg)`;
    };

    const reset = () => {
      card.style.transition = "transform 0.5s ease";
      card.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg)";
      setTimeout(() => {
        card.style.transition = "";
      }, 500);
    };

    card.addEventListener("pointermove", (e) => {
      card.style.transition = "";
      handleMove(e.clientX, e.clientY);
    });
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointerup", reset);
    card.addEventListener("pointercancel", reset);
  });
}

// ---------- 点击彩带迸发 ----------
function spawnConfetti(x, y, count) {
  if (REDUCE_MOTION) return;
  count = count || 18;
  const colors = ["#ff8fc7", "#ffd68a", "#c9a7ff", "#f3eefb"];

  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "confetti-piece";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const distance = 60 + Math.random() * 70;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const size = 5 + Math.random() * 5;

    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);
    p.style.animationDelay = `${(Math.random() * 0.08).toFixed(2)}s`;

    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
    // 保险清理，避免个别浏览器不触发 animationend
    setTimeout(() => p.remove(), 1400);
  }
}

function bindConfettiTriggers() {
  const btn = document.getElementById("shuffle-note-btn");
  if (btn) {
    btn.addEventListener("click", (e) => {
      const rect = btn.getBoundingClientRect();
      spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
    });
  }
}

// ---------- 里程碑彩蛋 ----------
function checkMilestone() {
  if (!SITE_DATA.anniversaryDate) return;
  const start = new Date(SITE_DATA.anniversaryDate + "T00:00:00");
  const days = Math.floor((new Date() - start) / (24 * 60 * 60 * 1000));
  const milestones = [100, 200, 300, 365, 500, 730, 1000, 1314, 1500, 2000];
  if (milestones.includes(days)) {
    setTimeout(() => {
      const counterEl = document.getElementById("counter-value");
      if (counterEl) {
        const rect = counterEl.getBoundingClientRect();
        spawnConfetti(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          36
        );
      }
    }, 1200); // 等开场遮罩淡出、内容可见后再触发
  }
}

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

// ---------- 星空背景（canvas 视差 + 偶尔的流星） ----------
function renderStarfield() {
  const canvas = document.getElementById("starfield");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let w, h;
  function resize() {
    w = canvas.width = window.innerWidth * window.devicePixelRatio;
    h = canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }
  resize();
  window.addEventListener("resize", resize);

  const STAR_COUNT = 140;
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const depth = Math.random(); // 0=远(小/暗/慢) 1=近(大/亮/快)
    stars.push({
      x: Math.random(),
      y: Math.random(),
      depth,
      radius: (0.4 + depth * 1.6) * window.devicePixelRatio,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.6 + Math.random() * 1.2,
      driftSpeed: (0.002 + depth * 0.01) * (Math.random() < 0.5 ? 1 : -1),
    });
  }

  // 静态渲染一次（不支持动效偏好或降级场景）
  function drawStatic() {
    ctx.clearRect(0, 0, w, h);
    stars.forEach((s) => {
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.35 + s.depth * 0.45})`;
      ctx.fill();
    });
  }

  if (reduceMotion) {
    drawStatic();
    return; // 不启动动画循环、不生成流星，省电且遵循用户偏好
  }

  // 流星：偶尔从随机位置斜着划过
  let shootingStars = [];
  function maybeSpawnShootingStar() {
    if (Math.random() < 0.006 && shootingStars.length < 2) {
      shootingStars.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.4,
        len: (80 + Math.random() * 60) * window.devicePixelRatio,
        speed: (10 + Math.random() * 6) * window.devicePixelRatio,
        angle: (Math.PI / 4) + (Math.random() * 0.2 - 0.1),
        life: 1,
      });
    }
  }

  let t = 0;
  function frame() {
    t += 0.016;
    ctx.clearRect(0, 0, w, h);

    // 星星：带深度视差的缓慢漂移 + 呼吸闪烁
    stars.forEach((s) => {
      s.x += s.driftSpeed * 0.01;
      if (s.x > 1.05) s.x = -0.05;
      if (s.x < -0.05) s.x = 1.05;
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.phase);
      const alpha = 0.15 + s.depth * 0.55 * twinkle + 0.15;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(alpha, 1).toFixed(3)})`;
      ctx.fill();
    });

    // 流星
    maybeSpawnShootingStar();
    shootingStars.forEach((m) => {
      const dx = Math.cos(m.angle) * m.speed;
      const dy = Math.sin(m.angle) * m.speed;
      m.x += dx;
      m.y += dy;
      m.life -= 0.02;

      const tailX = m.x - Math.cos(m.angle) * m.len;
      const tailY = m.y - Math.sin(m.angle) * m.len;
      const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255,255,255,${Math.max(m.life, 0)})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5 * window.devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    });
    shootingStars = shootingStars.filter(
      (m) => m.life > 0 && m.y < h + m.len && m.x < w + m.len
    );

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
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
let typewriterTimer = null;

function typewriterReveal(el, text) {
  clearInterval(typewriterTimer);
  el.textContent = "";
  el.classList.add("typing-cursor");

  if (REDUCE_MOTION) {
    el.textContent = text;
    el.classList.remove("typing-cursor");
    return;
  }

  let i = 0;
  const speed = Math.max(18, Math.min(45, 900 / text.length)); // 长文字打快一点，短文字打慢一点
  typewriterTimer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(typewriterTimer);
      el.classList.remove("typing-cursor");
    }
  }, speed);
}

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

  if (forceRandom) {
    // 手动换一条：先淡出再打字揭晓
    el.classList.add("note-fade");
    setTimeout(() => {
      el.classList.remove("note-fade");
      typewriterReveal(el, notes[idx]);
    }, 220);
  } else {
    // 首次加载：直接打字揭晓
    typewriterReveal(el, notes[idx]);
  }
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
