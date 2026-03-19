# LPR(Lesson plan review) - AI 教案評論系統（New UI）

本專案已切換為多頁式新介面，正式前端位於 `lesson-review-ui/`，並由後端同源提供。

## 正式入口

- App 入口：`http://localhost:5000/app/upload.html`
- 健康檢查：`http://localhost:5000/health`

## 新介面流程

1. `upload.html`：上傳教案並建立 `currentLessonId`
2. `index.html`（chat）：自由對話、摘要/分析/建議
3. `lesson-review.html`：正式評論與局部修改
4. `lesson-score.html`：五維度評分與儲存
5. `lesson-view.html`：查看教案原文與上傳資訊

所有頁面以同一個 lessonId 串接，並透過 `lesson-review-ui/api.js` 統一 API 呼叫與 localStorage 相容讀寫。

## 目前 API 對接狀態

- 已接上
  - `POST /api/upload`
  - `GET /api/upload/lesson/:id`
  - `POST /api/chat`
  - `POST /api/chat/analyze`
  - `POST /api/chat/suggest`
  - `POST /api/chat/score`
  - `POST /api/chat/modify-comment`
  - `POST /api/scores`
  - `GET /api/scores/lesson/:lessonId`

## 快速啟動

### 1) 一鍵啟動（推薦）

```powershell
.\start.ps1
```

此模式只啟動後端，後端會直接提供 `/app` 靜態頁。

### 2) 停止服務

```powershell
.\stop.ps1
```

### 3) Legacy 開發模式（可選）

```powershell
.\start.ps1 -LegacyFrontend
```

會額外啟動 Port 3000 的靜態伺服器，供比對或除錯舊流程。

## 資料庫設定

後端已改為使用 MongoDB 持久化儲存：

- `MONGODB_URI`：預設 `mongodb://127.0.0.1:27017/`
- `MONGODB_DB_NAME`：預設 `lpr`
- `SEARCH_ENGINE`：預設 `simple`（已預留向量搜尋抽象層）

若未設定環境變數，系統會使用上述預設值。

## 對話模式分流

對話 API 已採模式分流：

- `summary`：首頁自動摘要，嚴格限制在 500 字內
- `quick-action`：快速按鈕（summary/analyze/suggest），嚴格限制在 300 字內
- `chat-free`：自由對話，不套固定評論模板
- `review-formal`：教案評論頁的正式評論模式

## 目錄重點

- `backend/`：API 與 AI 服務
- `lesson-review-ui/`：正式前端（New UI）
- `start.ps1` / `stop.ps1`：啟停腳本

## 替換策略（重要）

舊 UI（根目錄 `index.html`、`app.js`、`styles.css`）必須在「五頁流程驗證完成」後再刪除：

1. 先跑啟動驗證與 API 驗證
2. 再跑 upload -> chat -> review -> score -> view 人工流程
3. 全部通過後再移除舊 UI 檔案

## 驗證清單

- 啟動後可打開 `http://localhost:5000/app/upload.html`
- 上傳成功後會保存 `currentLessonId` 與 `currentLessonName`
- chat/review/score/view 都使用同一份 lessonId
- 評論可重新生成且局部修改可成功
- 評分可儲存並讀回
- 查看教案頁可讀取真實內容（非示例）
