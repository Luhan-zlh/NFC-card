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
  bindEnvelopeReveal();
  bindScrollReveal();
  bindTiltEffect(".timeline-card, .note-card");
  bindConfettiTriggers();
  renderMilestones();
  checkMilestone();
  pingVisitCounter();

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

// ---------- 揭晓瞬间的暖光迸发 ----------
function spawnLightBurst(x, y) {
  if (REDUCE_MOTION) return;
  const burst = document.createElement("div");
  burst.className = "light-burst";
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  document.body.appendChild(burst);
  burst.addEventListener("animationend", () => burst.remove());
  setTimeout(() => burst.remove(), 1600); // 保险清理
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

// ---------- 里程碑 / 重要日子 ----------

// 算出某个里程碑距离今天还有几天（0=就是今天，负数=已经过了，null=算不出来/没配置）
function daysUntilMilestone(m) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (m.type === "days") {
    if (!SITE_DATA.anniversaryDate || !m.value) return null;
    const start = new Date(SITE_DATA.anniversaryDate + "T00:00:00");
    const target = new Date(start.getTime() + m.value * 24 * 60 * 60 * 1000);
    return Math.round((target - today) / (24 * 60 * 60 * 1000));
  }

  if (m.type === "date") {
    if (!m.value || !m.value.trim()) return null; // 还没定日期，跳过
    // 宽容解析：就算手写日期忘了补零（比如 "2026-7-30"），也能正确识别，
    // 不需要严格写成 "2026-07-30"
    const parts = m.value.trim().split("-");
    let target;
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      target = new Date(y, mo - 1, d);
    } else {
      target = new Date(m.value + "T00:00:00");
    }
    if (isNaN(target.getTime())) return null; // 实在解析不了，安全跳过不报错
    target.setHours(0, 0, 0, 0);
    return Math.round((target - today) / (24 * 60 * 60 * 1000));
  }

  return null;
}

function milestoneKey(m) {
  return `${m.type}_${m.value}_${m.label}`;
}

// 显示"即将到来的里程碑"（最多同时显示3个，太多了会显乱）+ "已经达成的记录"；
// 完全没有配置任何里程碑，就把整个板块隐藏（不留空白违和感）
function renderMilestones() {
  const section = document.getElementById("milestone-section");
  const upcomingEl = document.getElementById("milestone-upcoming");
  const achievedWrap = document.getElementById("milestone-achieved-wrap");
  const achievedEl = document.getElementById("milestone-achieved");
  if (
    !section ||
    !upcomingEl ||
    !achievedWrap ||
    !achievedEl ||
    !Array.isArray(SITE_DATA.milestones)
  ) {
    if (section) section.style.display = "none";
    return;
  }

  const withDays = SITE_DATA.milestones
    .map((m) => ({ ...m, daysLeft: daysUntilMilestone(m) }))
    .filter((m) => m.daysLeft !== null);

  const upcoming = withDays
    .filter((m) => m.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const achieved = withDays
    .filter((m) => m.daysLeft < 0)
    .sort((a, b) => b.daysLeft - a.daysLeft); // 越晚达成的排越前面

  if (upcoming.length === 0 && achieved.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";

  // ---- 即将到来（最多显示3个） ----
  upcomingEl.innerHTML = "";
  upcoming.slice(0, 3).forEach((m) => {
    const chip = document.createElement("div");
    chip.className = "milestone-chip";
    if (m.daysLeft === 0) {
      chip.innerHTML = `<span class="milestone-today">今天就是「${m.label}」🎉</span>`;
    } else {
      chip.innerHTML =
        `<span class="milestone-dot"></span>距离「${m.label}」还有 ` +
        `<span class="milestone-num">${m.daysLeft}</span> 天`;
    }
    upcomingEl.appendChild(chip);
  });

  // ---- 已经达成的记录 ----
  achievedEl.innerHTML = "";
  if (achieved.length === 0) {
    achievedWrap.style.display = "none";
  } else {
    achievedWrap.style.display = "";
    achieved.forEach((m) => {
      const badge = document.createElement("span");
      badge.className = "milestone-badge";
      badge.textContent = `✓ ${m.label}`;
      achievedEl.appendChild(badge);
    });
  }
}

// 里程碑彩蛋：不要求"正好那天打开"——只要到达/跨过了这个节点、且还没庆祝过，
// 下次打开（不管隔了多久）都会补上这次庆祝，然后记住"已庆祝"不再重复。
function checkMilestone() {
  if (!Array.isArray(SITE_DATA.milestones)) return;

  const STORAGE_KEY = "nfc_card_celebrated_milestones";
  let celebrated = [];
  try {
    celebrated = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (e) {
    celebrated = [];
  }

  const pending = SITE_DATA.milestones.filter((m) => {
    const key = milestoneKey(m);
    if (celebrated.includes(key)) return false;
    const daysLeft = daysUntilMilestone(m);
    return daysLeft !== null && daysLeft <= 0; // 已到达或已经过了
  });

  if (pending.length === 0) return;

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

  pending.forEach((m) => celebrated.push(milestoneKey(m)));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(celebrated));
  } catch (e) {}
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

// 根据访问次数决定"仪式感"的浓淡：
// 第1次最完整，2~5次简化一些，6次以后就很快，避免长期使用变成负担
function getRevealTier() {
  const KEY = "nfc_card_visit_count";
  let count = 0;
  try {
    count = parseInt(localStorage.getItem(KEY) || "0", 10) || 0;
  } catch (e) {}
  count += 1;
  try {
    localStorage.setItem(KEY, String(count));
  } catch (e) {}

  if (count <= 1) {
    return { holdDuration: 2500, showGreeting: true, unfoldLetter: true };
  }
  if (count <= 5) {
    return { holdDuration: 1000, showGreeting: false, unfoldLetter: false };
  }
  return { holdDuration: 450, showGreeting: false, unfoldLetter: false };
}

// 简单的一次性打字机效果（跟小纸条那个是独立的，逻辑更单纯，不需要处理"换一条"）
function typewriterOnce(el, text, onDone) {
  if (!el) {
    if (onDone) onDone();
    return;
  }
  if (REDUCE_MOTION) {
    el.textContent = text;
    if (onDone) onDone();
    return;
  }
  let i = 0;
  el.textContent = "";
  const timer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(timer);
      if (onDone) onDone();
    }
  }, 55);
}

function bindEnvelopeReveal() {
  const overlay = document.getElementById("enter-overlay");
  const envelopeWrap = document.getElementById("envelope-wrap");
  const seal = document.getElementById("envelope-seal");
  const ringFg = document.getElementById("seal-ring-fg");
  const flap = document.getElementById("envelope-flap");
  const letter = document.getElementById("envelope-letter");
  const hint = document.getElementById("overlay-hint");
  const preGreeting = document.getElementById("pre-greeting");

  if (!overlay || !envelopeWrap || !seal || !flap || !letter) return;

  // 无障碍：直接跳过整个仪式，淡出遮罩
  if (REDUCE_MOTION) {
    getRevealTier(); // 仍然计数，保持数据一致
    overlay.classList.add("overlay-hidden");
    setTimeout(() => overlay.remove(), 300);
    document.body.classList.add("content-revealed");
    return;
  }

  const config = getRevealTier();

  function showEnvelope() {
    envelopeWrap.classList.add("envelope-visible");
    hint.classList.add("hint-visible");
  }

  if (config.showGreeting && preGreeting) {
    typewriterOnce(preGreeting, "有一封信，是写给你的", showEnvelope);
  } else {
    showEnvelope();
  }

  const CIRCUMFERENCE = 2 * Math.PI * 17; // 对应 svg 里 r=17
  let rafId = null;
  let startTime = null;
  let completed = false;

  function updateProgress() {
    if (completed) return;
    const elapsed = performance.now() - startTime;
    const pct = Math.min(elapsed / config.holdDuration, 1);
    ringFg.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - pct));
    if (pct >= 1) {
      completed = true;
      completeOpen();
      return;
    }
    rafId = requestAnimationFrame(updateProgress);
  }

  function completeOpen() {
    cancelAnimationFrame(rafId);
    seal.classList.remove("seal-holding");
    flap.classList.add("flap-open");

    // 信封盖转过大约一半角度后，层级降到信纸下面，制造"翻到背后"的视觉
    setTimeout(() => {
      flap.classList.add("flap-behind");
    }, 300);

    setTimeout(() => {
      letter.classList.add("letter-rise");
      if (config.unfoldLetter) {
        setTimeout(() => letter.classList.add("letter-unfold"), 300);
      }
      // 揭晓瞬间：一圈暖光从信纸位置扩散开，背后星空也同步亮一下
      const rect = letter.getBoundingClientRect();
      spawnLightBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (typeof window.triggerStarfieldFlash === "function") {
        window.triggerStarfieldFlash();
      }
    }, 350);

    const totalDelay = config.unfoldLetter ? 1500 : 950;
    setTimeout(() => {
      overlay.classList.add("overlay-hidden");
      setTimeout(() => overlay.remove(), 900);
      document.body.classList.add("content-revealed");
    }, totalDelay);
  }

  function startHold(e) {
    if (completed) return;
    e.preventDefault();
    try {
      seal.setPointerCapture(e.pointerId);
    } catch (err) {}
    startTime = performance.now();
    seal.classList.add("seal-holding");
    rafId = requestAnimationFrame(updateProgress);
  }

  function cancelHold() {
    if (completed) return;
    cancelAnimationFrame(rafId);
    startTime = null;
    seal.classList.remove("seal-holding");
    ringFg.style.transition = "stroke-dashoffset 0.4s ease";
    ringFg.style.strokeDashoffset = String(CIRCUMFERENCE);
    setTimeout(() => {
      ringFg.style.transition = "";
    }, 400);
  }

  seal.addEventListener("pointerdown", startHold);
  seal.addEventListener("pointerup", cancelHold);
  seal.addEventListener("pointercancel", cancelHold);
  seal.addEventListener("pointerleave", cancelHold);
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

  // 供开信封仪式调用："揭晓瞬间"让星空亮一下，制造被点亮的感觉
  let flashIntensity = 0;
  window.triggerStarfieldFlash = function () {
    flashIntensity = 1;
  };

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

    if (flashIntensity > 0) {
      flashIntensity = Math.max(0, flashIntensity - 0.012); // 大约1.3秒衰减完
    }

    // 星星：带深度视差的缓慢漂移 + 呼吸闪烁（揭晓瞬间会额外叠加一次亮度提升）
    stars.forEach((s) => {
      s.x += s.driftSpeed * 0.01;
      if (s.x > 1.05) s.x = -0.05;
      if (s.x < -0.05) s.x = 1.05;
      const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.phase);
      const alpha = 0.15 + s.depth * 0.55 * twinkle + 0.15 + flashIntensity * 0.5;
      const boostedRadius = s.radius * (1 + flashIntensity * 0.6);
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, boostedRadius, 0, Math.PI * 2);
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

// ---------- 访问计数（延迟触发，不占用首屏加载时间） ----------
function pingVisitCounter() {
  setTimeout(() => {
    const img = new Image();
    img.src =
      "https://hits.seeyoufarm.com/api/count/incr/badge.svg?url=kaiwen-nfc-card-2026-private&count_bg=%23120826&title_bg=%23120826&title=&edge_flat=false";
    // 不插入 DOM，只是触发这一次请求；加载失败也无所谓，不影响页面任何功能
  }, 2500);
}

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
