# LPR (Lesson Plan Review) - AI 教案評論輔助系統

本文件提供「可供人與 AI 都能快速理解」的完整系統說明，涵蓋功能、架構、介面設計、資料流、設計理念與擴充方向。

執行環境需求：Node.js 20.19.0 以上版本。

---

## 1. 系統介紹

LPR 是一個以「教案上傳 -> AI 分析與評論 -> 人工補充評分 -> 教案查閱」為核心流程的教學輔助系統。

系統採用「後端同源提供前端頁面」的部署方式：

- 正式入口: http://localhost:5000/app/upload.html
- 健康檢查: http://localhost:5000/health

核心目標:

1. 降低教師撰寫與修正教案的時間成本。
2. 讓 AI 回覆可控（模式分流、字數限制、格式策略）。
3. 保留人工判斷空間（可手動評分、可局部改寫評論）。
4. 支援後續升級（預留搜尋引擎抽象層、可接向量檢索）。

---

## 2. 製作理念（為什麼這樣設計）

### 2.1 教學場景優先

本系統不是通用聊天機器人，而是以「教案工作流」為中心設計：

1. 先上傳教案，確保 AI 回覆始終有內容依據。
2. 再透過不同模式取得摘要、結構分析、改進建議或正式評論。
3. 最後用人工評分與備註補齊實務判斷。

### 2.2 前台簡潔、後台策略集中

前端只負責互動和必要參數傳遞，提示詞與模式規則集中到後端，避免：

1. 規則分散造成行為不一致。
2. 前端硬編碼提示詞難以維護。
3. 未來擴充新模式時需要大幅改前端。

### 2.3 可控輸出而非單次自由生成

透過 mode/action/maxChars 與後端策略，讓輸出具備「可預期邊界」：

1. 首頁摘要有固定上限。
2. 快速動作有更嚴格上限且主題分流。
3. 正式評論保留較完整結構。

---

## 3. 現有功能總覽

### 3.1 檔案上傳與內容解析

1. 支援格式: PDF、DOC、DOCX、TXT。
2. 透過 Multer 上傳，限制單檔 10MB。
3. 後端自動解析檔案文字並儲存到 MongoDB。
4. 上傳成功後前端保存 currentLessonId 與 currentLessonName。

對應檔案:

- backend/routes/upload.js
- backend/services/fileParser.js
- backend/models/Lesson.js
- lesson-review-ui/upload.html
- lesson-review-ui/upload.js

### 3.2 AI 對話與模式分流

1. 自動摘要模式 summary（首頁載入觸發，500 字上限）。
2. 快速動作模式 quick-action（summary / analyze / suggest，300 字上限）。
3. 自由對話模式 chat-free（不套固定評論模板）。
4. 正式評論模式 review-formal（評論頁使用，1200-1500 字，必須完整收尾）。
5. 評論局部修改（modify-comment）可針對選取段落下修改指令。

對應檔案:

- backend/routes/chat.js
- backend/services/rag-simple.js
- backend/services/promptService.js
- backend/prompts/base.md
- backend/prompts/modes/\*.md
- lesson-review-ui/chat.js
- lesson-review-ui/lesson-review.js

### 3.3 評分紀錄與回讀

1. 五個維度星等評分（0-5）。
2. 自動計算平均總分（四捨五入到小數第一位）。
3. 可保存評論文字與多次評分記錄。
4. 可按 lessonId 查詢歷史評分。

對應檔案:

- lesson-review-ui/lesson-score.html
- lesson-review-ui/lesson-score.js
- backend/routes/scores.js
- backend/models/Score.js

### 3.4 教案內容檢視

1. 顯示教案檔名、上傳時間、完整內容。
2. 以當前 lessonId 載入，確保與其他頁同一份資料。

對應檔案:

- lesson-review-ui/lesson-view.html
- lesson-review-ui/lesson-view.js
- backend/routes/upload.js (GET /api/upload/lesson/:id)

### 3.5 啟停與營運工具

1. start.ps1 自動檢查 Node、依賴、環境變數、埠占用。
2. 啟動失敗時輸出後端最近 30 行 log。
3. stop.ps1 可停止 5000/3000 埠相關程序與背景工作。

對應檔案:

- start.ps1
- stop.ps1
- README-啟動說明.md

---

## 4. 介面設計（UI 設計說明）

### 4.1 視覺與互動一致性

1. 全站採多頁一致布局: 左側導覽 + 右側主工作區。
2. 主要頁面共用同一套樣式與狀態習慣（收合側欄、訊息氣泡、操作按鈕）。
3. 導航欄按鈕採 flex 等間距布局（space-evenly），高度最適化至 56px。
4. favicon 統一使用 logo：lesson-review-ui/assets/LPR.svg。

### 4.2 資訊操作就近原則

1. Upload 頁只做「檔案選擇與上傳結果」。
2. Chat 頁聚焦快速對話和三個快捷操作。
3. Review 頁聚焦正式評論結果與局部修訂。
4. Score 頁聚焦量化評分與備註記錄。
5. View 頁聚焦原始內容查閱與回流操作（回上傳/去評論）。

### 4.3 安全渲染與可讀性

1. AI 回覆支援 Markdown。
2. 先以 marked 轉譯，再用 DOMPurify 清理，降低 XSS 風險。
3. 若 Markdown 依賴不可用，降級為安全純文字段落顯示。

對應檔案:

- lesson-review-ui/helpers/markdown-renderer.js
- lesson-review-ui/index.html
- lesson-review-ui/lesson-review.html

---

## 5. 介面架構（IA 與頁面流程）

### 5.1 五頁流程

1. upload.html
2. index.html
3. lesson-review.html
4. lesson-score.html
5. lesson-view.html

### 5.2 跨頁共享狀態

前端使用 localStorage/sessionStorage 共享必要狀態：

1. currentLessonId
2. currentLessonName
3. sidebarCollapsed
4. chatSessionId（聊天頁 session）
5. reviewSessionId（評論頁 session）

狀態封裝在 lesson-review-ui/api.js 的 window.LPR 物件中，並維持舊 key 相容。

---

## 6. 系統架構（前後端）

### 6.1 部署架構

```text
Browser (lesson-review-ui/*)
      |
      v
Express backend (localhost:5000)
  |- /app      -> 靜態前端頁面
  |- /api/*    -> 業務 API
  |- /health   -> 健康檢查
      |
      v
MongoDB (lesson, score)
      |
      v
Gemini API (內容生成)
```

### 6.2 後端模組分層

1. server.js: 伺服器啟動、路由掛載、錯誤處理。
2. routes/\*.js: API 邊界層（驗證、組裝請求、錯誤映射）。
3. services/\*.js: 業務邏輯（RAG、Prompt、檔案解析、Gemini 客戶端）。
4. models/\*.js: MongoDB schema。
5. data/\*.json: 評分標準與教案評鑑參考資料。

---

## 7. 核心資料流

### 7.1 上傳與建立教案

1. 前端送出 FormData 到 POST /api/upload。
2. 後端解析檔案文字後寫入 Lesson 集合。
3. 回傳 lessonId，前端寫入 currentLessonId/currentLessonName。

### 7.2 AI 對話生成

1. 前端送 message + selectedSources + mode/action/maxChars。
2. chat route 讀取對應教案內容，傳給 rag-simple。
3. rag-simple 組 prompt -> 呼叫 Gemini -> 長度治理（完整結尾檢測與修復） -> 回傳內容。
4. 前端將結果以 Markdown 安全渲染。

### 7.3 評分儲存

1. 前端送五維 scores + total + comment。
2. 後端驗證範圍後寫入 Score 集合。
3. 需要回讀時，以 lessonId 取最新到最舊紀錄。

---

## 8. API 總覽

### 8.1 Upload

1. POST /api/upload
2. POST /api/upload/multiple
3. GET /api/upload/lessons
4. GET /api/upload/lesson/:id
5. DELETE /api/upload/lesson/:id

### 8.2 Chat

1. POST /api/chat
2. POST /api/chat/analyze
3. POST /api/chat/suggest
4. POST /api/chat/score
5. POST /api/chat/compare
6. POST /api/chat/modify-comment
7. GET /api/chat/criteria
8. DELETE /api/chat/session/:sessionId

備註：Guest session 生命週期改為手動管理，可透過 DELETE 或 `window.LPR.closeGuestSession()` 主動關閉；不再依賴 beforeunload 事件自動清理。

### 8.3 Scores

1. POST /api/scores
2. GET /api/scores
3. GET /api/scores/lesson/:lessonId
4. GET /api/scores/:scoreId
5. PUT /api/scores/:scoreId
6. DELETE /api/scores/:scoreId

---

## 9. 對話模式與長度策略

模式規則由後端 promptService 統一管理，不放在前端硬編碼。

1. summary

- 常見入口: 首頁初始摘要
- 字數上限: 500
- 最大 token: 1024

2. quick-action

- 子動作: summary / analyze / suggest / score
- 字數上限: 300
- 最大 token: 700

3. chat-free

- 自由問答
- 字數上限: 不固定

4. review-formal

- 正式評論
- 字數上限: 1200-1500（必須完整收尾，不可中途截斷）
- 最大 token: 2600

超長處理策略:

1. 第一層：二次壓縮提示（動態 token 配置：max(800, min(3072, ⌈maxChars × 1.6⌉))）。
2. 第二層：自然句界截斷（檢測句號、感嘆號、問號等邊界，優先於硬切字數）。
3. 第三層：完整結尾檢測與修復。
   - 檢查結尾是否完整（regex: /[。！？.!?」』）)]\s\*$/）。
   - 若不完整，呼叫 Gemini 修復（température 0.2、"完整結尾"指令）。
   - 驗證修復結果是否同時滿足長度和完整性；否則降級到自然句界截斷。

---

## 10. 資料模型

### 10.1 Lesson

主要欄位:

1. lessonId (Number, unique)
2. name
3. filename
4. type
5. size
6. uploadDate
7. content

### 10.2 Score

主要欄位:

1. scoreId (Number, unique)
2. lessonId
3. scores.structure
4. scores.objectives
5. scores.activities
6. scores.methods
7. scores.assessment
8. total
9. comment
10. createdAt / updatedAt

---

## 11. 環境變數與啟動

以 backend/.env 為實際執行檔，backend/.env.example 為模板。

必要設定:

1. PORT=5000
2. MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/?retryWrites=true&w=majority
3. MONGODB_DB_NAME=lpr
4. MONGODB_URI_DIRECT=（可選，SRV DNS 無法解析時使用）
5. SEARCH_ENGINE=simple
6. GEMINI_API_KEY=你的有效金鑰
7. EMBEDDING_MODEL=models/embedding-001
8. LLM_MODEL=gemini-2.5-flash-lite

啟動方式:

1. .\start.ps1
2. .\start.ps1 -NoBrowser
3. .\start.ps1 -LegacyFrontend

停止方式:

1. .\stop.ps1

---

## 12. 已知限制與維運注意

1. 若 Gemini 配額耗盡，chat API 會回傳 HTTP 429。
2. 本專案目前搜尋引擎預設為 simple（關鍵字比對），尚未接入實際向量資料庫。
3. 對話 session 暫存於記憶體，重啟服務後會清空。
4. Guest 資料有效期 24 小時，透過 6 小時定時清理工作自動移除過期資料。
5. Guest session 可透過 `window.LPR.closeGuestSession()` 手動關閉（例如在登出時）；不依賴 beforeunload 自動清理，保護頁面導航時資料持久性。

---

## 13. 給其他 AI 的快速導航

### 13.1 你要改「模式規則 / 提示詞」

1. backend/services/promptService.js
2. backend/prompts/base.md
3. backend/prompts/modes/\*.md
4. backend/services/rag-simple.js

### 13.2 你要改「頁面互動流程」

1. lesson-review-ui/upload.js
2. lesson-review-ui/chat.js
3. lesson-review-ui/lesson-review.js
4. lesson-review-ui/lesson-score.js
5. lesson-review-ui/lesson-view.js

### 13.3 你要改「資料結構 / 儲存」

1. backend/models/Lesson.js
2. backend/models/Score.js
3. backend/routes/upload.js
4. backend/routes/scores.js

### 13.4 你要改「啟動與部署」

1. start.ps1
2. stop.ps1
3. backend/server.js
4. README-啟動說明.md

---

## 14. 近期改進記錄（最新）

### 正式評論品質增進

1. **字數上限提升** (2026/04): review-formal 從 1000 字提升至 1200-1500 字。
   - 對應文件：backend/prompts/modes/review-formal.md、backend/services/promptService.js
   - 效果：正式評論更完整、更專業。

2. **動態 Token 配置** (2026/04): 壓縮階段的 token 從固定 700 改為動態計算。
   - 公式：max(800, min(3072, ⌈maxChars × 1.6⌉))
   - 對應文件：backend/services/rag-simple.js
   - 效果：避免壓縮階段 token 饑餓，減少截斷風險。

3. **完整結尾檢測與修復** (2026/04): 加入三層長度治理。
   - 第一層：檢測結尾句式完整性（正規表達式）。
   - 第二層：若不完整，呼叫 Gemini 修復。
   - 第三層：驗證修復結果；若失敗則降級到自然句界截斷。
   - 對應文件：backend/services/rag-simple.js（isLikelyCompleteEnding、ensureCompleteEnding）
   - 效果：消除「中途截斷」現象，確保評論邏輯完整。

### Guest 會話管理改進

1. **手動生命週期管理** (2026/04): Guest session 不再依賴 beforeunload 自動清理。
   - 移除：lesson-review-ui/api.js 中的 beforeunload 事件監聽。
   - 新增：window.LPR.closeGuestSession() 手動 API。
   - 效果：修復「上傳教案後立即切換頁面導致資料丟失」的問題。

2. **CORS 頭暴露** (2026/04): 後端新增 exposedHeaders: ["x-session-id"]。
   - 對應文件：backend/app.js
   - 效果：前端能正確讀取並持久化 guest session ID。

### UI/UX 改進

1. **側欄按鈕最適化** (2026/04)：
   - 佈局：從 5 行等高 grid 改為 flex space-evenly。
   - 高度：min-height 從 ~110px 減至 56px。
   - 間距：padding 從 12px 20px 改為 8px 12px。
   - 對應文件：lesson-review-ui/styles.css
   - 效果：按鈕不再被切割，視覺更緊湊。

2. **課的內容元件對齊** (2026/04)：
   - .lesson-note 改為 inline-flex + gap 設定。
   - 對應文件：lesson-review-ui/styles.css
   - 效果：圖示與文字並排顯示，視覺協調。

---

## 15. 驗證清單（回歸測試）

1. 可開啟 /app/upload.html 並成功上傳教案。
2. 上傳後可在 chat 頁看到自動摘要。
3. 快捷按鈕可分別觸發 summary/analyze/suggest。
4. 正式評論頁可生成評論，且可選取片段做 AI 修改。
5. 評分頁可儲存與回讀五維評分。
6. 查看頁可正確顯示同一 lesson 的完整內容。
7. /health 回傳 ok。

---

## 16. 授權與使用提醒

1. 本 README 設計為開發與維護文件，優先清楚性與可追溯性。
2. 請勿將真實 GEMINI_API_KEY 提交到版本控制。
3. 若已外洩金鑰，請立即在供應商平台旋轉金鑰並更新 backend/.env。
