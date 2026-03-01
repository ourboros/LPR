# 🚀 教案輔助評論系統 - 啟動說明

## 📋 快速開始

### 方法 1：使用啟動腳本（推薦）

```powershell
# 在專案根目錄執行
.\start.ps1
```

系統會自動：

- ✅ 檢查 Node.js 環境
- ✅ 安裝必要依賴
- ✅ 檢查 Port 狀態
- ✅ 啟動後端服務（Port 5000）
- ✅ 啟動前端服務（Port 3000）
- ✅ 開啟瀏覽器

### 方法 2：手動啟動

#### 視窗 1 - 後端

```powershell
cd backend
node server.js
```

#### 視窗 2 - 前端

```powershell
npx http-server -p 3000
```

#### 瀏覽器

訪問：http://localhost:3000

---

## 🛑 停止服務

### 使用停止腳本

```powershell
.\stop.ps1
```

### 手動停止

在各個 PowerShell 視窗按 `Ctrl + C`

---

## ⚙️ 系統架構

```
前端 (Port 3000)  →  後端 (Port 5000)  →  Gemini AI API
     ↓                      ↓
  index.html            server.js
  app.js                routes/
  styles.css            services/
```

---

## 📝 使用流程

1. **上傳教案**
   - 點擊「新增教案」
   - 支援 PDF、DOC、DOCX、TXT
   - 檔案大小上限 10MB

2. **選擇教案**
   - 點擊教案項目進行選擇
   - 可多選進行比較

3. **AI 對話**
   - 輸入問題或使用建議操作
   - 分析、評分、建議、比較

4. **評分記錄**
   - 切換到「評分」標籤
   - 五星評分系統
   - 自動計算總分

5. **生成內容**
   - 教案摘要
   - 評分量表
   - 概念圖
   - 評論報告

---

## ❓ 常見問題排查

### 問題 1️⃣：執行腳本時出現「禁止執行指令碼」

**錯誤訊息：**

```
無法載入檔案 start.ps1，因為這個系統已停用指令碼執行...
```

**解決方案：**

```powershell
# 以管理員身分開啟 PowerShell，執行：
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# 或單次執行：
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

---

### 問題 2️⃣：Port 被佔用

**錯誤訊息：**

```
Port 5000 或 3000 已被佔用
```

**解決方案：**

```powershell
# 1. 查看佔用的進程
netstat -ano | findstr :5000
netstat -ano | findstr :3000

# 2. 結束進程（使用找到的 PID）
taskkill /PID <PID> /F

# 或使用停止腳本
.\stop.ps1
```

---

### 問題 3️⃣：後端啟動失敗 - Cannot find module

**錯誤訊息：**

```
Error: Cannot find module 'express'
```

**解決方案：**

```powershell
# 重新安裝後端依賴
cd backend
npm install
cd ..
.\start.ps1
```

---

### 問題 4️⃣：前端無法連接後端（CORS 錯誤）

**瀏覽器 Console 錯誤：**

```
Access to fetch at 'http://localhost:5000/api/...' has been blocked by CORS policy
```

**解決方案：**

1. 確認後端正在運行：訪問 http://localhost:5000/health
2. 檢查 `app.js` 第 7 行：
   ```javascript
   const API_BASE_URL = "http://localhost:5000/api";
   ```
3. 清除瀏覽器快取：`Ctrl + Shift + R`
4. 重啟後端服務

---

### 問題 5️⃣：檔案上傳失敗

**錯誤訊息：**

```
上傳失敗 / 無法提取文本內容
```

**解決方案：**

1. 確認檔案格式：PDF、DOC、DOCX、TXT
2. 確認檔案大小 < 10MB
3. 檢查 `backend\uploads` 資料夾是否存在
   ```powershell
   # 手動建立
   mkdir backend\uploads
   ```
4. 檢查檔案權限

---

### 問題 6️⃣：AI 回應失敗或超時

**錯誤訊息：**

```
❌ 連接後端失敗 / API 請求失敗
```

**解決方案：**

1. 檢查 `backend\.env` 中的 API 金鑰：
   ```
   GEMINI_API_KEY=你的金鑰
   ```
2. 確認網路連線正常
3. 檢查 Gemini API 配額：https://makersuite.google.com/
4. 查看後端視窗的錯誤訊息
5. 測試 API 連線：
   ```powershell
   curl http://localhost:5000/health
   ```

---

### 問題 7️⃣：AI 回應內容為固定文字

**症狀：**
AI 總是回應「我已經分析了您的問題...」等固定內容

**原因：**
前端沒有正確連接到後端 API

**解決方案：**

1. 確認後端運行正常
2. 開啟瀏覽器 DevTools (F12)
3. 查看 Network 標籤，確認有發送 API 請求
4. 檢查 Console 是否有錯誤訊息
5. 確認 `app.js` 已更新為使用 API 版本

---

## 🔄 完整重置（重新安裝）

如果遇到無法解決的問題：

```powershell
# 1. 停止所有服務
.\stop.ps1

# 2. 刪除依賴
Remove-Item -Recurse -Force backend\node_modules
Remove-Item -Recurse -Force backend\uploads

# 3. 重新安裝
cd backend
npm install
cd ..

# 4. 重新啟動
.\start.ps1
```

---

## 📊 系統檢查清單

啟動前請確認：

- [ ] 已安裝 Node.js (v16+)
- [ ] 已設定 Gemini API 金鑰
- [ ] Port 5000 和 3000 未被佔用
- [ ] 後端依賴已安裝
- [ ] 網路連線正常

---

## 🔗 相關連結

- **後端健康檢查：** http://localhost:5000/health
- **前端頁面：** http://localhost:3000
- **教案評論新版頁面：** http://localhost:3000/lesson-review-ui/index.html
- **Gemini API：** https://ai.google.dev/
- **專案文檔：** README.md

---

## 📞 技術支援

如遇其他問題，請：

1. 查看後端 Terminal 的錯誤訊息
2. 查看瀏覽器 Console 的錯誤訊息
3. 參考 `start.ps1` 檔案底部的詳細說明
4. 檢查 `backend\server.js` 的啟動日誌

---

**版本：** v1.0.0  
**最後更新：** 2026年2月3日
