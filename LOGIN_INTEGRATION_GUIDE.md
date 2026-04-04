# LPR 登入系統集成指南

## 📋 剩餘任務列表

### Phase 2: 完成後端數據隔離 (Critical)

這些任務需要確保用戶數據隔離。優先級最高。

#### 2.1 修改 `backend/routes/upload.js`

**需要修改的部分：**

**1. GET /lessons 路由** (約第 332 行)

- **修改前**: 返回所有教案列表
- **修改後**: 添加認證中間件，只返回當前用戶或 session 的教案

```javascript
// 修改為：
router.get(
  "/lessons",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const query = {};

      // 用戶隔離邏輯
      if (req.user) {
        query.userId = req.user.id;
      } else if (req.sessionId) {
        query.sessionId = req.sessionId;
      } else {
        // 未登入且無 session，返回空
        return res.json([]);
      }

      const lessons = await Lesson.find(query /* projection */).sort({
        uploadDate: -1,
      });
      res.json(lessons);
    } catch (error) {
      // ... error handling
    }
  },
);
```

**2. GET /lesson/:id 路由** (約第 361 行)

- **修改前**: 返回任何教案詳情
- **修改後**: 驗證教案屬於當前用戶

```javascript
// 修改為：
router.get(
  "/lesson/:id",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    try {
      const lessonId = normalizeLessonId(req.params.id);

      const query = { lessonId };

      // 用戶隔離檢查
      if (req.user) {
        query.userId = req.user.id;
      } else if (req.sessionId) {
        query.sessionId = req.sessionId;
      } else {
        return res.status(403).json({ error: "無權限" });
      }

      const lesson = await Lesson.findOne(query);
      if (!lesson) {
        return res.status(404).json({ error: "教案不存在或無權限" });
      }

      res.json(lesson);
    } catch (error) {
      // ... error handling
    }
  },
);
```

#### 2.2 修改 `backend/routes/chat.js`

**需要修改的所有 POST 路由** (analyze, score, suggest, summary, modify-comment 等)：

```javascript
// 在每個 router.post() 前添加認證中間件
router.post(
  "/analyze",
  verifyTokenMiddleware({ allowGuest: true }),
  async (req, res) => {
    const userId = req.user?.id || null;
    const sessionId = req.user
      ? null
      : req.sessionId || generateGuestSessionId();

    // ...rest of logic

    // 保存 ReviewRecord 時添加
    const review = await ReviewRecord.create({
      // ...existing fields...
      userId: userId,
      sessionId: sessionId,
    });
  },
);
```

#### 2.3 修改 `backend/routes/scores.js`

同樣修改所有 POST 和 GET 路由添加認證中間件和用戶隔離。

#### 2.4 修改 `backend/routes/reviews.js`

修改查詢邏輯支持用戶隔離。

---

### Phase 3: 臨時數據清理 Job (Important)

#### 3.1 創建 `backend/jobs/cleanup-guest-data.js`

```javascript
const cron = require("node-cron");
const Lesson = require("../models/Lesson");
const ReviewRecord = require("../models/ReviewRecord");
const Score = require("../models/Score");

function initCleanupJob() {
  // 每 6 小時執行一次
  cron.schedule("0 */6 * * *", async () => {
    try {
      console.log("[Cleanup Job] 開始清理過期未登入數據");

      const now = new Date();

      // 找出 sessionExpiry 已過期的未登入數據
      const expiredLessons = await Lesson.find({
        userId: null,
        sessionExpiry: { $lt: now },
      });

      const sessionIds = expiredLessons.map((l) => l.sessionId);

      if (sessionIds.length === 0) {
        console.log("[Cleanup Job] 沒有過期數據");
        return;
      }

      // 刪除相關評論和評分
      const reviewsDeleted = await ReviewRecord.deleteMany({
        sessionId: { $in: sessionIds },
      });

      const scoresDeleted = await Score.deleteMany({
        sessionId: { $in: sessionIds },
      });

      // 刪除教案本身
      const lessonsDeleted = await Lesson.deleteMany({
        userId: null,
        sessionExpiry: { $lt: now },
      });

      console.log(`[Cleanup Job] 清理完成:
        - 教案: ${lessonsDeleted.deletedCount}
        - 評論: ${reviewsDeleted.deletedCount}
        - 評分: ${scoresDeleted.deletedCount}
      `);
    } catch (error) {
      console.error("[Cleanup Job] 執行失敗:", error);
    }
  });
}

module.exports = { initCleanupJob };
```

#### 3.2 修改 `backend/app.js`

在 app 初始化時啟動 cleanup job：

```javascript
// 在 createApp() function 中
const { initCleanupJob } = require("./jobs/cleanup-guest-data");

function createApp() {
  // ...existing code...

  // 初始化清理 job（確保只初始化一次）
  if (!global.cleanupJobInitialized) {
    initCleanupJob();
    global.cleanupJobInitialized = true;
  }

  return app;
}
```

---

### Phase 4: 前端集成 (Critical)

#### 4.1 修改 `lesson-review-ui/api.js`

**在 `window.LPR` 對象中添加以下方法：**

```javascript
  // Token 管理
  getAuthToken() {
    return window.LPRAuth?.getAuthToken?.() || null;
  },

  setAuthToken(token) {
    return window.LPRAuth?.setAuthToken?.(token);
  },

  isAuthenticated() {
    return window.LPRAuth?.isAuthenticated?.() || false;
  },

  getUserInfo() {
    return window.LPRAuth?.getUserInfo?.() || null;
  },

  logout() {
    return window.LPRAuth?.logout?.();
  }
```

**修改 `request()` 方法添加 Authorization header：**

```javascript
async request(path, options = {}) {
  const requestOptions = { ...options };
  const headers = new Headers(requestOptions.headers || {});

  // ← 添加以下代碼
  const token = this.getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // 其他現有代碼...
  const response = await fetch(`${API_BASE_URL}${path}`, requestOptions);
  return parseResponse(response);
}
```

#### 4.2 修改 `lesson-review-ui/upload.html`

**在 `<head>` 添加 auth.js 腳本：**

```html
<script src="auth.js"></script>
```

**在導覽列或頂部添加登入/登出按鈕：**

```html
<div
  id="authStatus"
  style="position: fixed; top: 10px; right: 10px; z-index: 1000;"
>
  <span id="userName" style="margin-right: 10px;"></span>
  <button id="authButton" onclick="handleAuthButton()">登入</button>
</div>
```

#### 4.3 修改 `lesson-review-ui/upload.js`

**在 DOMContentLoaded 中添加：**

```javascript
window.addEventListener("DOMContentLoaded", async () => {
  // 初始化 Google Auth
  await window.LPRAuth.initGoogleAuth();

  // 檢查登入狀態
  updateAuthUI();
});

function updateAuthUI() {
  const isLoggedIn = window.LPR.isAuthenticated();
  const userInfo = window.LPR.getUserInfo();
  const authButton = document.getElementById("authButton");
  const userName = document.getElementById("userName");

  if (isLoggedIn && userInfo) {
    userName.textContent = `歡迎, ${userInfo.name}`;
    authButton.textContent = "登出";
    authButton.onclick = () => window.LPR.logout();
  } else {
    userName.textContent = "";
    authButton.textContent = "登入";
    authButton.onclick = () => window.LPRAuth.startGoogleLogin();
  }
}

// 監聽認證事件
window.addEventListener("lpr:auth:success", updateAuthUI);
window.addEventListener("lpr:auth:logout", updateAuthUI);
```

---

### Phase 5: 後端安裝依賴

#### 需要安裝/確認的 npm 包

```bash
cd backend
npm install node-cron
```

---

## 🚀 實施優先級

**優先級 1（立即做）：**

- [ ] Phase 2.1: upload.js 用戶隔離
- [ ] Phase 2.2: chat.js 用戶隔離
- [ ] Phase 3: cleanup job
- [ ] Phase 4.1-4.3: 前端集成

**優先級 2（完成後測試）：**

- [ ] 本地測試所有功能
- [ ] git commit & push
- [ ] Vercel 自動部署

---

## ✅ 驗證檢查清單

- [ ] 新用戶通過 Google 登入
- [ ] JWT token 存儲到 localStorage
- [ ] 已登入用戶只看到自己的教案/評論
- [ ] 未登入用戶可正常上傳、評論、評分
- [ ] 瀏覽器關閉後未登入用戶數據被清理
- [ ] 上傳和評論頁都有登入/登出按鈕
- [ ] 登入狀態瀏覽器重啟後保持

---

## 🔧 常見問題

**Q: 未登入用戶的 sessionId 什麼時候設置 sessionExpiry？**
A: 在用戶瀏覽器完全關閉時（無法從前端直接偵測）。目前的方案是 cleanup job 掃描所有未登入記錄，設置 24 小時過期。未來可改進為前端發送「即將離開」信號。

**Q: 如何區分同一瀏覽器中的多個未登入用戶？**
A: 每個未登入會話生成唯一的 `sessionId`，但如果同一物理設備有多個用戶，他們會共享相同的 localStorage（無法區分）。解決方案：建議用戶登入以獲得完整功能。
