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
  renderPlaces();
  renderMissYouButton();
  bindEnvelopeReveal();
  bindScrollReveal();
  bindTiltEffect(".timeline-card, .note-card");
  bindConfettiTriggers();
  renderMilestones();
  checkMilestone();
  pingVisitCounter();
  initLightbox();

  // 双时区时钟（信封仪式后显示）
  renderInfoBar();
  setInterval(renderInfoBar, 1000);

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

// 算出某个里程碑距离今天还有几天
// 返回 { daysLeft, actualValue, actualLabel } 或 null
// daysLeft: 0=今天, 负数=已过, 正数=还有几天
// actualValue: 对于可重复的，是当前实际目标值（比如200天、2027年生日）
// actualLabel: 动态标签（比如"在一起200天"会自动替换数字）
function daysUntilMilestone(m) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (m.type === "days") {
    if (!m.value) return null;
    const start = parseAnniversaryDateTime(SITE_DATA.anniversaryDate);
    if (!start) return null;

    let targetValue = m.value;
    let target = new Date(start.getTime() + targetValue * 24 * 60 * 60 * 1000);
    target.setHours(0, 0, 0, 0);

    // 可重复的天数里程碑：达成后自动跳到下一个（value += step）
    if (m.repeat) {
      const step = m.step || m.value;
      while (target <= today) {
        targetValue += step;
        target = new Date(start.getTime() + targetValue * 24 * 60 * 60 * 1000);
        target.setHours(0, 0, 0, 0);
      }
    }

    const daysLeft = Math.round((target - today) / (24 * 60 * 60 * 1000));

    // 动态标签：把 label 里的数字替换成实际目标值
    // 比如 "在一起100天" → "在一起200天"
    let actualLabel = m.label || "";
    if (m.repeat && actualLabel) {
      actualLabel = actualLabel.replace(/\d+/, targetValue);
    }

    return { daysLeft, actualValue: targetValue, actualLabel };
  }

  if (m.type === "date") {
    if (!m.value || !m.value.trim()) return null;
    const datePart = m.value.trim().split(/[ T]/)[0];
    const parts = datePart.split("-");
    let target;
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      target = new Date(y, mo - 1, d);
    } else {
      target = new Date(datePart + "T00:00:00");
    }
    if (isNaN(target.getTime())) return null;
    target.setHours(0, 0, 0, 0);

    // 每年重复：过了就自动+1年
    if (m.repeat === "yearly") {
      while (target <= today) {
        target.setFullYear(target.getFullYear() + 1);
      }
    }

    const daysLeft = Math.round((target - today) / (24 * 60 * 60 * 1000));
    return { daysLeft, actualValue: target.getFullYear(), actualLabel: m.label || "" };
  }

  return null;
}

function milestoneKey(m, resolved) {
  // 可重复的里程碑用实际目标值做 key，这样每个周期都能单独庆祝
  const val = resolved ? resolved.actualValue : m.value;
  return `${m.type}_${val}_${m.label}`;
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
    .map((m) => {
      const resolved = daysUntilMilestone(m);
      if (!resolved) return null;
      return { ...m, daysLeft: resolved.daysLeft, actualLabel: resolved.actualLabel, resolved };
    })
    .filter((m) => m !== null);

  const upcoming = withDays
    .filter((m) => m.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const achieved = withDays
    .filter((m) => m.daysLeft < 0)
    .sort((a, b) => b.daysLeft - a.daysLeft);

  if (upcoming.length === 0 && achieved.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";

  // ---- 即将到来（最多显示5个） ----
  upcomingEl.innerHTML = "";
  upcoming.slice(0, 5).forEach((m) => {
    const chip = document.createElement("div");
    chip.className = "milestone-chip";
    const label = m.actualLabel || m.label;
    if (m.daysLeft === 0) {
      chip.innerHTML = `<span class="milestone-today">今天就是「${label}」🎉</span>`;
    } else {
      chip.innerHTML =
        `<span class="milestone-dot"></span>距离「${label}」还有 ` +
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
      // 可重复的只显示原始 label（不显示动态数字，因为已经过了）
      const label = m.repeat ? m.label : (m.actualLabel || m.label);
      badge.textContent = `✓ ${label}`;
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

  const pending = [];
  SITE_DATA.milestones.forEach((m) => {
    const resolved = daysUntilMilestone(m);
    if (!resolved) return;
    const key = milestoneKey(m, resolved);
    if (celebrated.includes(key)) return;
    if (resolved.daysLeft <= 0) {
      pending.push({ ...m, actualLabel: resolved.actualLabel, resolved });
    }
  });

  if (pending.length === 0) return;

  setTimeout(() => {
    // 全屏爱心迸发
    if (typeof spawnHearts === "function") {
      spawnHearts(window.innerWidth / 2, window.innerHeight / 2, 40);
    }
    // 多波彩带
    const counterEl = document.getElementById("counter-value");
    if (counterEl) {
      const rect = counterEl.getBoundingClientRect();
      spawnConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, 36);
      // 第二波，延迟0.5秒
      setTimeout(() => {
        spawnConfetti(window.innerWidth / 2, window.innerHeight / 3, 50);
      }, 500);
      // 第三波
      setTimeout(() => {
        spawnConfetti(window.innerWidth * 0.3, window.innerHeight / 2, 30);
        spawnConfetti(window.innerWidth * 0.7, window.innerHeight / 2, 30);
      }, 1000);
    }
    // 星空闪烁（复用开信封的星空提亮）
    if (typeof window.triggerStarfieldFlash === "function") {
      window.triggerStarfieldFlash();
      setTimeout(() => window.triggerStarfieldFlash(), 800);
    }
    // 显示里程碑庆祝文字
    showMilestoneCelebration(pending);
  }, 1200);

  pending.forEach((m) => celebrated.push(milestoneKey(m, m.resolved)));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(celebrated));
  } catch (e) {}
}

function showMilestoneCelebration(milestones) {
  if (!milestones || milestones.length === 0) return;
  const overlay = document.createElement("div");
  overlay.className = "milestone-celebration-overlay";

  let html = '<div class="milestone-celebration-content">';
  html += '<div class="milestone-celebration-icon">🎉</div>';
  milestones.forEach((m) => {
    html += '<div class="milestone-celebration-text">' + (m.actualLabel || m.label || "") + "</div>";
  });
  html += '<div class="milestone-celebration-subtitle">我们做到了 ❤</div>';
  html += '<div class="milestone-celebration-hint">点击任意处关闭</div>';
  html += "</div>";
  overlay.innerHTML = html;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", () => {
    overlay.classList.add("milestone-celebration-fade");
    setTimeout(() => overlay.remove(), 600);
  });

  // 10秒后自动关闭
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.classList.add("milestone-celebration-fade");
      setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 600);
    }
  }, 10000);
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

  const CIRCUMFERENCE = 2 * Math.PI * 34; // 对应 svg 里 r=34
  let rafId = null;
  let startTime = null;
  let completed = false;
  const hintDefaultText = hint ? hint.textContent : "";

  function updateProgress() {
    if (completed) return;
    const elapsed = performance.now() - startTime;
    const pct = Math.min(elapsed / config.holdDuration, 1);
    ringFg.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - pct));
    // 手指会挡住蜡封上的进度环，所以整个信封也跟着一起"发光提亮"，
    // 作为不会被手指遮挡的备用进度反馈
    envelopeWrap.style.filter = `brightness(${(1 + pct * 0.5).toFixed(2)}) drop-shadow(0 0 ${(
      pct * 22
    ).toFixed(0)}px rgba(255, 214, 138, ${(pct * 0.7).toFixed(2)}))`;
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
    seal.classList.add("seal-fade-out");
    envelopeWrap.style.filter = "";
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
    if (hint) hint.textContent = "别松手，马上就好…";
    rafId = requestAnimationFrame(updateProgress);
  }

  function cancelHold() {
    if (completed) return;
    cancelAnimationFrame(rafId);
    startTime = null;
    seal.classList.remove("seal-holding");
    envelopeWrap.style.filter = "";
    if (hint) hint.textContent = hintDefaultText;
    ringFg.style.transition = "stroke-dashoffset 0.4s ease";
    ringFg.style.strokeDashoffset = String(CIRCUMFERENCE);
    setTimeout(() => {
      ringFg.style.transition = "";
    }, 400);
  }

  seal.addEventListener("pointerdown", startHold);
  // 注意：故意不监听 pointerleave 来取消长按——
  // 手指按压时天然会有微小抖动/位移，如果因为触点暂时超出这个小范围就判定"松手"，
  // 体验会很差。只有真正抬起手指（pointerup）或系统打断（pointercancel，比如来电/下拉通知栏）才算取消。
  seal.addEventListener("pointerup", cancelHold);
  seal.addEventListener("pointercancel", cancelHold);
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

// 解析交往纪念日，支持两种写法：
//   "2025-08-04"          -> 按当天 00:00:00 算
//   "2025-08-04 14:30"    -> 按精确时刻算（也支持 "2025-08-04T14:30"）
function parseAnniversaryDateTime(str) {
  if (!str) return null;
  let normalized = str.trim().replace(" ", "T");
  if (!normalized.includes("T")) {
    normalized += "T00:00:00";
  } else {
    const timePart = normalized.split("T")[1];
    if (timePart && timePart.split(":").length === 2) {
      normalized += ":00"; // 补上秒数
    }
  }
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

// ---------- 在一起天数计数器 ----------
function renderCounter() {
  const el = document.getElementById("counter-value");
  const start = parseAnniversaryDateTime(SITE_DATA.anniversaryDate);
  if (!el || !start) return;

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

    // 照片字段支持两种写法（向后兼容）：
    //   单张：  img: "images/xxx.jpg"
    //   多张：  img: ["images/a.jpg", "images/b.jpg", "images/c.jpg"]
    // 多张时会渲染成可左右滑动 + 自动轮播的轮播图
    let imgs = [];
    if (Array.isArray(item.img)) {
      imgs = item.img.filter((s) => s && s.trim());
    } else if (item.img && item.img.trim()) {
      imgs = [item.img.trim()];
    }

    if (imgs.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "timeline-img timeline-img-placeholder";
      placeholder.textContent = "♥";
      card.appendChild(placeholder);
    } else if (imgs.length === 1) {
      const img = document.createElement("img");
      img.src = imgs[0];
      img.alt = item.title || "";
      img.className = "timeline-img timeline-img-clickable";
      img.loading = "lazy";
      img.onerror = function () {
        const placeholder = document.createElement("div");
        placeholder.className = "timeline-img timeline-img-placeholder";
        placeholder.textContent = "♥";
        this.replaceWith(placeholder);
      };
      img.addEventListener("click", () => {
        if (typeof openLightbox === "function") openLightbox(imgs, 0);
      });
      card.appendChild(img);
    } else {
      // 多张照片 → 轮播图
      const carousel = document.createElement("div");
      carousel.className = "timeline-carousel";

      const track = document.createElement("div");
      track.className = "carousel-track";

      imgs.forEach((src, imgIdx) => {
        const cell = document.createElement("div");
        cell.className = "carousel-cell";
        const img = document.createElement("img");
        img.src = src;
        img.alt = item.title || "";
        img.loading = "lazy";
        img.className = "timeline-img-clickable";
        img.onerror = function () {
          const ph = document.createElement("div");
          ph.className = "timeline-img-placeholder";
          ph.textContent = "♥";
          ph.style.height = "200px";
          this.replaceWith(ph);
        };
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof openLightbox === "function") openLightbox(imgs, imgIdx);
        });
        cell.appendChild(img);
        track.appendChild(cell);
      });

      carousel.appendChild(track);

      // 导航箭头
      const prev = document.createElement("button");
      prev.className = "carousel-nav carousel-prev";
      prev.innerHTML = "‹";
      prev.setAttribute("aria-label", "上一张");

      const next = document.createElement("button");
      next.className = "carousel-nav carousel-next";
      next.innerHTML = "›";
      next.setAttribute("aria-label", "下一张");

      carousel.appendChild(prev);
      carousel.appendChild(next);

      // 指示点
      const dotsWrap = document.createElement("div");
      dotsWrap.className = "carousel-dots";
      for (let d = 0; d < imgs.length; d++) {
        const dotBtn = document.createElement("button");
        dotBtn.className = "carousel-dot";
        if (d === 0) dotBtn.classList.add("carousel-dot-active");
        dotBtn.setAttribute("aria-label", "第 " + (d + 1) + " 张");
        dotsWrap.appendChild(dotBtn);
      }
      carousel.appendChild(dotsWrap);

      // 轮播逻辑
      let currentIdx = 0;
      let autoTimer = null;
      const AUTO_INTERVAL = 4000;

      function goTo(i) {
        currentIdx = (i + imgs.length) % imgs.length;
        track.style.transform = "translateX(-" + currentIdx * 100 + "%)";
        dotsWrap.querySelectorAll(".carousel-dot").forEach((d, di) => {
          d.classList.toggle("carousel-dot-active", di === currentIdx);
        });
      }

      function startAuto() {
        stopAuto();
        if (!REDUCE_MOTION) {
          autoTimer = setInterval(() => goTo(currentIdx + 1), AUTO_INTERVAL);
        }
      }

      function stopAuto() {
        if (autoTimer) {
          clearInterval(autoTimer);
          autoTimer = null;
        }
      }

      prev.addEventListener("click", (e) => {
        e.stopPropagation();
        goTo(currentIdx - 1);
        startAuto(); // 用户操作后重置自动计时
      });
      next.addEventListener("click", (e) => {
        e.stopPropagation();
        goTo(currentIdx + 1);
        startAuto();
      });
      dotsWrap.querySelectorAll(".carousel-dot").forEach((d, di) => {
        d.addEventListener("click", (e) => {
          e.stopPropagation();
          goTo(di);
          startAuto();
        });
      });

      // 触摸滑动支持
      let touchStartX = null;
      track.addEventListener("pointerdown", (e) => {
        touchStartX = e.clientX;
        stopAuto();
      });
      track.addEventListener("pointerup", (e) => {
        if (touchStartX === null) return;
        const dx = e.clientX - touchStartX;
        if (Math.abs(dx) > 40) {
          goTo(currentIdx + (dx < 0 ? 1 : -1));
        }
        touchStartX = null;
        startAuto();
      });

      startAuto();
      card.appendChild(carousel);
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

// ---------- 我们的足迹 / 距离 ----------
// Haversine 公式：算地球表面两点之间的球面距离
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球平均半径，公里
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km) {
  if (km < 1) {
    return Math.round(km * 1000) + " 米";
  }
  return km.toFixed(1) + " 公里";
}

const VISITED_CITIES_KEY = "nfc_card_visited_cities";

function loadVisitedCities() {
  try {
    return JSON.parse(localStorage.getItem(VISITED_CITIES_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function addVisitedCity(cityName) {
  if (!cityName) return;
  const cities = loadVisitedCities();
  // 同名城市不重复记录，只更新最近访问时间
  const existing = cities.find((c) => c.name === cityName);
  if (existing) {
    existing.lastVisit = new Date().toISOString();
  } else {
    cities.push({ name: cityName, lastVisit: new Date().toISOString() });
  }
  try {
    localStorage.setItem(VISITED_CITIES_KEY, JSON.stringify(cities));
  } catch (e) {}
}

function renderVisitedCities() {
  const wrap = document.getElementById("visited-cities-wrap");
  const list = document.getElementById("visited-cities-list");
  if (!wrap || !list) return;
  const cities = loadVisitedCities();
  if (cities.length === 0) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "";
  list.innerHTML = "";
  cities.forEach((c) => {
    const chip = document.createElement("span");
    chip.className = "city-chip";
    chip.textContent = c.name;
    list.appendChild(chip);
  });
}

function renderPlaces() {
  const section = document.getElementById("places-section");
  const list = document.getElementById("places-list");
  const locateBtn = document.getElementById("locate-btn");
  if (!section || !list) return;

  const places = Array.isArray(SITE_DATA.places) ? SITE_DATA.places : [];
  if (places.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";

  // 渲染地点列表（不显示距离，等用户授权后才显示）
  list.innerHTML = "";
  places.forEach((p, idx) => {
    const item = document.createElement("div");
    item.className = "place-item";
    item.id = "place-item-" + idx;
    item.innerHTML =
      '<span class="place-dot"></span>' +
      '<span class="place-name">' + (p.name || "") + '</span>' +
      (p.date ? '<span class="place-date">' + p.date + '</span>' : "") +
      '<span class="place-distance" id="place-distance-' + idx + '"></span>';
    list.appendChild(item);
  });

  if (locateBtn) {
    locateBtn.addEventListener("click", handleLocate);
  }

  renderVisitedCities();
}

function handleLocate() {
  const btn = document.getElementById("locate-btn");
  if (!btn) return;

  if (!("geolocation" in navigator)) {
    btn.textContent = "你的设备不支持定位";
    return;
  }

  btn.textContent = "正在定位…";
  btn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const places = SITE_DATA.places || [];

      // 显示距离每个地点的距离
      places.forEach((p, idx) => {
        const el = document.getElementById("place-distance-" + idx);
        if (!el) return;
        const dist = haversineKm(latitude, longitude, p.lat, p.lng);
        el.textContent = "距此 " + formatDistance(dist);
        el.classList.add("distance-visible");
      });

      btn.textContent = "✓ 已显示距离";
      btn.disabled = false;

      // 反向地理编码获取城市名（用 OpenStreetMap Nominatim 免费服务）
      // 记录访问城市到 localStorage
      reverseGeocodeCity(latitude, longitude).then((cityName) => {
        if (cityName) {
          addVisitedCity(cityName);
          renderVisitedCities();
        }
      }).catch(() => {
        // 反向地理编码失败不影响距离显示
      });
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        btn.textContent = "没有授权定位，点这里再试";
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        btn.textContent = "定位暂时不可用，点这里再试";
      } else if (err.code === err.TIMEOUT) {
        btn.textContent = "定位超时，点这里再试";
      } else {
        btn.textContent = "定位失败，点这里再试";
      }
      btn.disabled = false;
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

// 反向地理编码：从经纬度查城市名
// 用 OpenStreetMap Nominatim 免费服务，不需要 API key
// 返回 Promise<string> 城市名，失败返回 null
function reverseGeocodeCity(lat, lng) {
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=json&lat=" +
    lat + "&lon=" + lng + "&zoom=10&accept-language=zh-CN";
  return fetch(url, { headers: { "Accept": "application/json" } })
    .then((r) => r.json())
    .then((data) => {
      if (!data || !data.address) return null;
      const a = data.address;
      // Nominatim 返回的地址结构不稳定，需要尝试多个字段
      return (
        a.city ||
        a.town ||
        a.county ||
        a.municipality ||
        a.state_district ||
        a.state ||
        null
      );
    })
    .catch(() => null);
}

// ---------- 想你了按钮 ----------
function renderMissYouButton() {
  const section = document.getElementById("miss-you-section");
  const btn = document.getElementById("miss-you-btn");
  if (!section || !btn) return;

  const reply = SITE_DATA.missYouReply;
  if (!reply || !reply.trim()) {
    section.style.display = "none";
    return;
  }

  btn.addEventListener("click", handleMissYou);
}

function handleMissYou() {
  const btn = document.getElementById("miss-you-btn");
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = "0.5";
  }

  // 满屏爱心迸发：从屏幕中心向四面八方扩散
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  spawnHearts(cx, cy, 30);

  // 稍微等一下，爱心迸发开始后再揭晓回复文字
  setTimeout(() => {
    showMissYouReply(SITE_DATA.missYouReply);
  }, 400);

  // 3秒后恢复按钮可点
  setTimeout(() => {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "";
    }
  }, 3500);
}

function spawnHearts(x, y, count) {
  if (REDUCE_MOTION) {
    spawnConfetti(x, y, count);
    return;
  }
  count = count || 30;
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "heart-piece";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 80 + Math.random() * 180;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 50; // 稍微往上飘一点
    const size = 14 + Math.random() * 18;

    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.fontSize = size + "px";
    p.style.setProperty("--dx", dx + "px");
    p.style.setProperty("--dy", dy + "px");
    p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";

    document.body.appendChild(p);
    p.addEventListener("animationend", () => p.remove());
    setTimeout(() => p.remove(), 2400); // 保险清理
  }
}

function showMissYouReply(text) {
  const overlay = document.createElement("div");
  overlay.className = "miss-you-overlay";
  overlay.innerHTML =
    '<div class="miss-you-reply" id="miss-you-reply-text"></div>' +
    '<div class="miss-you-close-hint">点击任意处关闭</div>';
  document.body.appendChild(overlay);

  const replyEl = document.getElementById("miss-you-reply-text");
  typewriterReveal(replyEl, text);

  overlay.addEventListener("click", () => {
    overlay.classList.add("miss-you-overlay-fade");
    setTimeout(() => overlay.remove(), 500);
  });

  // 8秒后自动关闭
  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.classList.add("miss-you-overlay-fade");
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, 500);
    }
  }, 8000);
}

// ---------- 双时区信息栏 ----------
function renderInfoBar() {
  const bar = document.getElementById("info-bar");
  if (!bar) return;

  // 信封仪式完成后才显示
  if (!document.body.classList.contains("content-revealed")) return;
  bar.style.display = "";

  const tzs = SITE_DATA.timezones || {};
  const myTz = tzs.user2 || "Europe/London";   // 默认路涵
  const partnerTz = tzs.user1 || "Asia/Shanghai"; // 默认凯玟

  const now = new Date();
  const fmtOpts = { hour: "2-digit", minute: "2-digit", hour12: false };

  try {
    const myTime = now.toLocaleString("zh-CN", { ...fmtOpts, timeZone: myTz });
    const partnerTime = now.toLocaleString("zh-CN", { ...fmtOpts, timeZone: partnerTz });

    const myEl = document.getElementById("info-time-my");
    const partnerEl = document.getElementById("info-time-partner");
    if (myEl) myEl.textContent = myTime;
    if (partnerEl) partnerEl.textContent = partnerTime;

    // 判断对方是白天还是晚上
    const partnerHour = parseInt(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: partnerTz }), 10);
    const partnerLabel = document.getElementById("info-clock-partner");
    if (partnerLabel) {
      const period = partnerHour >= 6 && partnerHour < 18 ? "白天" : "夜晚";
      partnerLabel.querySelector(".info-label").textContent = "她·" + period;
    }
  } catch (e) {}
}

// 更新信息栏里的距离（供 sync.js 调用）
function updateInfoBarDistance(distKm) {
  const el = document.getElementById("info-dist-value");
  if (!el) return;
  if (distKm !== null && distKm !== undefined) {
    el.textContent = formatDistance(distKm);
  }
}

// 更新信息栏里的天气（供 sync.js 调用）
function updateInfoBarWeather(text) {
  const row = document.getElementById("info-weather-row");
  const textEl = document.getElementById("info-weather-text");
  if (!row || !textEl) return;
  if (text) {
    textEl.textContent = text;
    row.style.display = "";
  } else {
    row.style.display = "none";
  }
}

// ---------- 照片灯箱 ----------
let lightboxImages = [];
let lightboxIndex = 0;

function initLightbox() {
  const lb = document.getElementById("lightbox");
  const closeBtn = document.getElementById("lightbox-close");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  const backdrop = lb ? lb.querySelector(".lightbox-backdrop") : null;
  if (!lb) return;

  function close() {
    lb.style.display = "none";
    document.body.style.overflow = "";
  }
  function show(idx) {
    lightboxIndex = (idx + lightboxImages.length) % lightboxImages.length;
    const img = document.getElementById("lightbox-img");
    if (img) img.src = lightboxImages[lightboxIndex];
    // 多张才显示导航箭头
    const showNav = lightboxImages.length > 1;
    if (prevBtn) prevBtn.style.display = showNav ? "" : "none";
    if (nextBtn) nextBtn.style.display = showNav ? "" : "none";
  }

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  if (prevBtn) prevBtn.addEventListener("click", (e) => { e.stopPropagation(); show(lightboxIndex - 1); });
  if (nextBtn) nextBtn.addEventListener("click", (e) => { e.stopPropagation(); show(lightboxIndex + 1); });

  // ESC 关闭
  document.addEventListener("keydown", (e) => {
    if (lb.style.display === "none") return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft" && lightboxImages.length > 1) show(lightboxIndex - 1);
    if (e.key === "ArrowRight" && lightboxImages.length > 1) show(lightboxIndex + 1);
  });

  // 触摸滑动
  let touchStartX = null;
  lb.addEventListener("pointerdown", (e) => {
    if (e.target === closeBtn || e.target === prevBtn || e.target === nextBtn) return;
    touchStartX = e.clientX;
  });
  lb.addEventListener("pointerup", (e) => {
    if (touchStartX === null) return;
    const dx = e.clientX - touchStartX;
    if (Math.abs(dx) > 50 && lightboxImages.length > 1) {
      show(lightboxIndex + (dx < 0 ? 1 : -1));
    }
    touchStartX = null;
  });
}

// 打开灯箱（供 renderTimeline 调用）
function openLightbox(images, startIndex) {
  const lb = document.getElementById("lightbox");
  if (!lb) return;
  lightboxImages = images;
  lightboxIndex = startIndex || 0;
  lb.style.display = "";
  document.body.style.overflow = "hidden";
  const img = document.getElementById("lightbox-img");
  if (img) img.src = lightboxImages[lightboxIndex];
  const showNav = lightboxImages.length > 1;
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  if (prevBtn) prevBtn.style.display = showNav ? "" : "none";
  if (nextBtn) nextBtn.style.display = showNav ? "" : "none";
}

// 暴露给外部调用
window.openLightbox = openLightbox;
window.updateInfoBarDistance = updateInfoBarDistance;
window.updateInfoBarWeather = updateInfoBarWeather;
