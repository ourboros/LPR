# LPR 啟動說明（New UI 正式模式）

## 0. 執行環境需求

- Node.js 20.19.0 以上版本

## 1. 正式啟動方式（推薦）

```powershell
.\start.ps1
```

若不想自動開啟瀏覽器：

```powershell
.\start.ps1 -NoBrowser
```

啟動後：

- 後端 API：`http://localhost:5000`
- New UI 入口：`http://localhost:5000/app/upload.html`
- 健康檢查：`http://localhost:5000/health`

> 正式模式使用同源架構：後端直接提供 `lesson-review-ui` 靜態檔案。

## 1.1 MongoDB 設定

後端會讀取 `backend/.env` 的以下設定：

- `MONGODB_URI`（預設：`mongodb://127.0.0.1:27017/`）
- `MONGODB_URI_DIRECT`（可選，Atlas `mongodb+srv` 在某些網路環境無法解析時使用）
- `MONGODB_DB_NAME`（預設：`lpr`）

可先用 `backend/.env.example` 建立你的 `.env`。

如果你看到 `querySrv ECONNREFUSED`，這通常不是帳號密碼錯誤，也不一定是 Node.js 版本問題，而是目前 DNS / 網路環境無法解析 Atlas 的 SRV 記錄。這時請改用 Atlas console 提供的 direct connection string，填入 `MONGODB_URI_DIRECT`。

若 `backend/.env` 缺少必要設定（例如 `GEMINI_API_KEY`），`start.ps1` 會在啟動前直接提示並停止。

## 2. 停止服務

```powershell
.\stop.ps1
```

## 3. Legacy 開發模式（可選）

```powershell
.\start.ps1 -LegacyFrontend
```

- 額外啟動 Port 3000 靜態伺服器
- 用於比對舊流程或前端開發除錯

## 4. 手動啟動（不使用腳本）

```powershell
cd backend
node server.js
```

然後在瀏覽器開啟：

- `http://localhost:5000/app/upload.html`

## 5. 五頁流程驗證（刪除舊 UI 前必做）

依序驗證：

1. `upload.html`：上傳教案成功
2. `index.html`：可取得 AI 回應（摘要/分析/建議）
3. `lesson-review.html`：可生成評論、可局部修改
4. `lesson-score.html`：可評分、儲存、讀回
5. `lesson-view.html`：可顯示同 lesson 真實內容

## 6. API 驗證項目

- `POST /api/upload`
- `GET /api/upload/lesson/:id`
- `POST /api/chat`
- `POST /api/chat/modify-comment`
- `POST /api/scores`
- `GET /api/scores/lesson/:lessonId`

## 6.1 對話模式說明

目前前端會在請求中傳送 `mode/action/maxChars`：

- 首頁自動摘要：`mode=summary`, `maxChars=500`
- 快速按鈕：`mode=quick-action`, `action=summary|analyze|suggest`, `maxChars=300`
- 自由輸入：`mode=chat-free`
- 教案評論頁：`mode=review-formal`

## 7. 常見問題

### 問題 A：腳本執行政策限制

```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

或單次執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

### 問題 B：Port 5000 被占用

```powershell
.\stop.ps1
```

若仍占用可手動查 PID 後結束。

### 問題 C：上傳成功但後續頁面提示無 lesson

檢查 localStorage 是否有：

- `currentLessonId`
- `currentLessonName`

若沒有，回到 upload 頁重新上傳。

### 問題 D：CORS 錯誤

正式模式應使用 `http://localhost:5000/app/upload.html`。

如果使用 3000 開發模式，請確認後端 CORS 白名單含對應來源。

## 8. 最終替換規則（重要）

舊 UI 檔案（根目錄 `index.html`、`app.js`、`styles.css`）只能在以下條件都通過後刪除：

1. 啟動驗證通過
2. 五頁流程通過
3. API 驗證通過
4. README 與啟動說明已同步更新
