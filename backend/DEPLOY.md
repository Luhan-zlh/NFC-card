# 部署指南 —— Cloudflare Worker + KV

## 你需要做什么（约15分钟）

### 第1步：注册 Cloudflare（免费）
1. 打开 https://dash.cloudflare.com/sign-up
2. 用邮箱注册（不需要绑定信用卡，免费版够用）

### 第2步：创建 KV 存储
1. 登录后，左侧菜单点 **Workers & Pages**
2. 点顶部 **KV** 标签页
3. 点 **Create a namespace**
4. 名称填 `COUPLE_KV`，点 Add

### 第3步：创建 Worker
1. 回到 **Workers & Pages** → **Overview**
2. 点 **Create application** → **Create Worker**
3. 名称填 `couple-card-sync`，点 Deploy
4. 创建完后点 **Edit code**（编辑代码）
5. **删除编辑器里所有默认代码**
6. 打开本目录的 `worker.js`，全部复制粘贴进去
7. 点右上角 **Deploy**

### 第4步：修改密钥
1. 在刚粘贴的代码顶部，找到 `SECRETS` 对象：
   ```js
   const SECRETS = {
     "1": "CHANGE_ME_USER1_SECRET",
     "2": "CHANGE_ME_USER2_SECRET",
   };
   ```
2. 把两个密钥改成你自己的随机字符串，比如：
   ```js
   const SECRETS = {
     "1": "kaiwen2026abc",
     "2": "luhan2026xyz",
   };
   ```
   （两个人各一个密钥，随便取，越随机越好）
3. 点 **Deploy** 保存

### 第5步：绑定 KV 到 Worker
1. 回到 Worker 概览页，点 **Settings**
2. 点 **Bindings** → **Add binding**
3. 选 **KV Namespace**
4. **Variable name 填 `COUPLE_KV`**（必须和代码里一致！）
5. KV namespace 选刚才创建的 `COUPLE_KV`
6. 点 Deploy 保存

### 第6步：获取 Worker URL
你的 Worker URL 类似：`https://couple-card-sync.你的账号.workers.dev`
在 Worker 概览页能看到这个地址。

### 第7步：验证
浏览器打开 `https://couple-card-sync.xxx.workers.dev/ping`
看到 `{"ok":true,"service":"couple-card-sync"}` 就成功了。

---

## 完成后告诉我

把以下信息告诉我，我来配置前端：
1. **Worker URL**（`https://couple-card-sync.xxx.workers.dev`）
2. **用户1的密钥**（比如 `kaiwen2026abc`）—— 这个给凯玟
3. **用户2的密钥**（比如 `luhan2026xyz`）—— 这个给陆涵

我会把这三个值填进 `data.js` 的 `sync` 配置里，推送上线后就能用了。

---

## 免费额度
- Cloudflare Workers 免费版：每天 10 万次请求
- 两个人用，每次打开网页发 2 次请求（1次上报 + 1次读取对方），绰绰有余
- KV 免费版：每天 10 万次读 + 1000 次写，足够

## 耗电说明
- 前端只在**网页打开时**发一次请求 + 获取一次位置，之后完全静默
- 不轮询、不后台运行、不持续定位
- 网页关闭后零耗电
