// ============================================================
// 情侣卡片后端 —— Cloudflare Worker + KV
// 功能：位置共享、在线状态、打卡同步、报备同步
// 部署步骤见同目录 DEPLOY.md
// ============================================================

// 两个人的密钥 —— 从 Cloudflare Secret 环境变量读取（不硬编码在代码里）
// 在 Cloudflare 控制台 Worker → Settings → Variables → Add variable:
//   变量名 USER1_SECRET，值填凯玟的密钥，类型选 Secret
//   变量名 USER2_SECRET，值填路涵的密钥，类型选 Secret

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 从 env 构建密钥表
function getSecrets(env) {
  return {
    "1": env.USER1_SECRET,
    "2": env.USER2_SECRET,
  };
}

export default {
  async fetch(request, env) {
    const SECRETS = getSecrets(env);

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    // ---------- 健康检查 ----------
    if (url.pathname === "/" || url.pathname === "/ping") {
      return json({ ok: true, service: "couple-card-sync" });
    }

    // ---------- GET /status ----------
    // 参数: userId, secret
    // 返回: 对方的位置、在线状态、打卡、报备
    if (request.method === "GET" && url.pathname === "/status") {
      const userId = url.searchParams.get("userId");
      const secret = url.searchParams.get("secret");

      if (!userId || !SECRETS[userId] || SECRETS[userId] !== secret) {
        return json({ error: "unauthorized" }, 401);
      }

      const partnerId = userId === "1" ? "2" : "1";

      const [location, status, checkin, reports, visits] = await Promise.all([
        env.KAIWEN_KV.get(`user:${partnerId}:location`, "json"),
        env.KAIWEN_KV.get(`user:${partnerId}:status`, "json"),
        env.KAIWEN_KV.get(`user:${partnerId}:checkin`, "json"),
        env.KAIWEN_KV.get(`user:${partnerId}:reports`, "json"),
        env.KAIWEN_KV.get(`user:${partnerId}:visits`, "json"),
      ]);

      return json({
        partner: {
          id: partnerId,
          location,
          status,
          checkin,
          reports: reports || [],
          visits: visits || [],
        },
      });
    }

    // ---------- GET /mystatus ----------
    // 参数: userId, secret
    // 返回: 自己的位置、打卡、报备（用于刷新后恢复显示）
    if (request.method === "GET" && url.pathname === "/mystatus") {
      const userId = url.searchParams.get("userId");
      const secret = url.searchParams.get("secret");

      if (!userId || !SECRETS[userId] || SECRETS[userId] !== secret) {
        return json({ error: "unauthorized" }, 401);
      }

      const [location, checkin, reports] = await Promise.all([
        env.KAIWEN_KV.get(`user:${userId}:location`, "json"),
        env.KAIWEN_KV.get(`user:${userId}:checkin`, "json"),
        env.KAIWEN_KV.get(`user:${userId}:reports`, "json"),
      ]);

      return json({
        me: {
          location,
          checkin,
          reports: reports || [],
        },
      });
    }

    // ---------- POST /report ----------
    // body: { userId, secret, type, data }
    // type: "location" | "online" | "checkin" | "report"
    if (request.method === "POST" && url.pathname === "/report") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "invalid json" }, 400);
      }

      const { userId, secret, type, data } = body;

      if (!userId || !SECRETS[userId] || SECRETS[userId] !== secret) {
        return json({ error: "unauthorized" }, 401);
      }

      const now = Date.now();

      // 位置上报
      if (type === "location") {
        const locData = {
          lat: data.lat,
          lng: data.lng,
          city: data.city || null,
          timestamp: now,
        };
        await env.KAIWEN_KV.put(`user:${userId}:location`, JSON.stringify(locData));
        return json({ ok: true, type: "location" });
      }

      // 在线状态上报
      if (type === "online") {
        const statusData = { lastSeen: now };
        await env.KAIWEN_KV.put(`user:${userId}:status`, JSON.stringify(statusData));
        return json({ ok: true, type: "online" });
      }

      // 访问记录（每次打开网页自动记录，用于活动记录板块）
      if (type === "visit") {
        let visits = (await env.KAIWEN_KV.get(`user:${userId}:visits`, "json")) || [];
        visits.push({ timestamp: now });
        // 只保留最近 100 条（约够看1-2个月的活动）
        if (visits.length > 100) visits = visits.slice(-100);
        await env.KAIWEN_KV.put(`user:${userId}:visits`, JSON.stringify(visits));
        return json({ ok: true, type: "visit", total: visits.length });
      }

      // 打卡
      if (type === "checkin") {
        await env.KAIWEN_KV.put(`user:${userId}:checkin`, JSON.stringify(data));
        return json({ ok: true, type: "checkin" });
      }

      // 报备（起床/睡觉/到达等）
      if (type === "report") {
        let reports = (await env.KAIWEN_KV.get(`user:${userId}:reports`, "json")) || [];
        reports.push({ ...data, timestamp: now });
        // 只保留最近 30 条
        if (reports.length > 30) reports = reports.slice(-30);
        await env.KAIWEN_KV.put(`user:${userId}:reports`, JSON.stringify(reports));
        return json({ ok: true, type: "report", total: reports.length });
      }

      return json({ error: "unknown type" }, 400);
    }

    return json({ error: "not found" }, 404);
  },
};
