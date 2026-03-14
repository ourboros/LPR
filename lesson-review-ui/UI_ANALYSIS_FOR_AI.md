# Lesson Review UI 介面設計與功能說明

## 文件用途

- 本文件提供 AI 快速理解 lesson-review-ui 各頁面的設計目的、互動流程、資料流與後端整合方式。
- 文件寫法刻意採用條列、欄位化、可映射 API 的方式，方便後續 AI 做需求分析、畫面重構、功能擴充與資料結構設計。

## 系統定位

- 系統名稱：AI 教案評論系統
- 核心任務：讓使用者上傳教案後，透過 AI 完成教案檢視、自由提問、評論生成、評論修改、量化評分與資料保存。
- 使用情境：教師、實習教師、教育研究者，用於教案品質檢視與教學設計優化。

## 整體介面設計理念

- 採多頁式流程，而非單頁儀表板。
- 左側側邊欄作為全站主導覽，降低使用者在不同功能頁之間切換的成本。
- 每個頁面聚焦一個主要任務，避免同頁過多複雜操作。
- 手機與桌機採不同排版策略：桌機偏向並列資訊，手機偏向垂直流式閱讀與操作。
- 整體 UI 強調「先看內容，再做 AI 操作」，因此教案本體、評論結果、評分結果都是主視覺核心。

## 主要資料實體

- lesson
  - 用途：代表一份已上傳教案。
  - 主要欄位：id、name、filename、type、size、uploadDate、content。
- chatSession
  - 用途：代表一段使用者與 AI 的對話上下文。
  - 主要欄位：sessionId、chatHistory、selectedSources。
- reviewComment
  - 用途：代表 AI 生成的教案評論內容。
  - 主要欄位：lessonId、content、createdAt、sourcePrompt、version。
- scoreRecord
  - 用途：代表某次教案評分結果。
  - 主要欄位：scoreId、lessonId、scores、total、comment、createdAt、updatedAt。
- generatedArtifact
  - 用途：代表 AI 額外生成的內容，例如摘要、量表、報告、概念圖。
  - 主要欄位：lessonId、type、title、content、timestamp。

## 使用者主流程

1. 上傳教案。
2. 進入 AI 自由對話頁，快速取得摘要、結構分析或改進建議。
3. 進入 AI 教案評論頁，取得較完整的評論內容。
4. 若評論某段語氣或內容不理想，可選取文字後使用評論修改器重新生成。
5. 進入評分頁，對教案進行五個面向的星級評分並儲存。
6. 進入查看教案頁，確認原始教案內容與上傳資訊。

## 全站共用介面元件

- 側邊欄 sidebar
  - 功用：切換 AI 自由對話、AI 教案評論、紀錄教案評分、查看教案。
  - 功能：支援折疊狀態，並用 localStorage 記住展開/收合。
  - 後端整合：不需後端資料，但若要支援使用者偏好同步，可新增 userPreferences API 儲存 sidebarCollapsed。
- 主內容區 main-panel
  - 功用：承載每頁主要功能畫面。
  - 功能：隨頁面切換內容，不改變整體導航骨架。
  - 後端整合：無直接需求，主要依賴各功能頁 API。

## 介面一：上傳頁面 upload.html

### 頁面定位

- 系統入口頁。
- 任務是讓使用者選擇教案檔案並建立 lesson 資料。

### 主要介面區塊

- upload-card
  - 功用：集中呈現上傳任務、檔案狀態與操作按鈕。
- upload-zone
  - 功用：拖放或點擊選檔。
  - 功能：接收 doc、docx、pdf、txt。
- file-name
  - 功用：顯示目前已選取檔名。
- upload-btn
  - 功用：送出上傳。
- upload-status
  - 功用：回饋上傳進度、成功或失敗狀態。

### 使用者操作

- 點選檔案或拖放檔案。
- 前端驗證 MIME type。
- 成功後按下上傳，完成後跳轉到 AI 自由對話頁。

### 現況

- 前端目前有格式驗證與假上傳流程。
- 後端實際已有 upload 路由可接。

### 後端整合方式

- 既有可用 API
  - POST /api/upload
  - POST /api/upload/multiple
  - GET /api/upload/lessons
  - GET /api/upload/lesson/:id
  - DELETE /api/upload/lesson/:id
- 建議前端送出資料
  - FormData: file
- 建議前端成功後儲存
  - localStorage.currentLessonId
  - localStorage.currentLessonName
- AI 可自動生成的後續資料
  - 上傳成功後可自動呼叫摘要生成 API。
  - 上傳成功後可自動建立預設評論草稿。
- 儲存策略
  - lesson 內容應持久化到資料庫，不應只放記憶體 Map。
  - 建議資料表：lessons
  - 建議欄位：id、original_name、stored_filename、mime_type、size、content、created_at、updated_at。

## 介面二：AI 自由對話頁 index.html

### 頁面定位

- 提供使用者與 AI 進行開放式對話。
- 是快速分析與探索教案的主要入口。

### 主要介面區塊

- chat-list
  - 功用：顯示使用者與 AI 對話紀錄。
- quick-actions
  - 功用：提供快速提示詞按鈕。
  - 目前按鈕：生成教案摘要、分析教案結構、提供改進建議。
- composer
  - 功用：讓使用者自由輸入問題。
- send-btn
  - 功用：送出訊息給 AI。

### 設計理念

- 降低 prompt 撰寫門檻。
- 先用快速指令建立分析方向，再用自由提問追問細節。
- 對話區保留彈性，適合作為多輪互動入口。

### 使用者操作

- 點快速按鈕送出預設問題。
- 輸入自訂問題。
- 觀看 AI 回答並持續追問。

### 現況

- 目前 script.js 使用前端假資料模擬 AI 回應。
- 尚未接到真實 /api/chat。

### 後端整合方式

- 建議串接 API
  - POST /api/chat
  - POST /api/chat/analyze
  - POST /api/chat/suggest
  - POST /api/chat/score
- 建議請求欄位
  - message
  - sessionId
  - selectedSources: [lessonId]
  - chatHistory
- 建議回傳欄位
  - role
  - content
  - sessionId
  - references 或 criteriaUsed
- AI 自動生成方式
  - 快速按鈕可直接映射固定 action 或 prompt 模板。
  - 上傳成功後可自動帶入當前 lessonId 作為 selectedSources。
  - 使用者第一次進入頁面時，可自動請 AI 產出「教案 200 字摘要」。
- 儲存策略
  - 對話紀錄可先存 session store，再寫入資料庫。
  - 建議資料表：chat_sessions、chat_messages。

## 介面三：AI 教案評論頁 lesson-review.html

### 頁面定位

- 用來呈現較完整、較正式的 AI 教案評論內容。
- 適合從自由對話模式過渡到「文件級」評論模式。

### 主要介面區塊

- review-result
  - 功用：顯示 AI 生成的長篇評論。
- regenerate-section / regenerate-btn
  - 功用：重新生成整份評論。
- composer
  - 功用：補充條件，例如指定評論角度、口吻、年級、學習目標。
- comment-editor
  - 功用：針對已生成評論中的某一段文字進行局部修改。
- comment-editor\_\_original
  - 功用：顯示被選取的原始評論文字。
- comment-editor\_\_input
  - 功用：輸入修改指示，例如「更具體」「語氣更鼓勵」「加入可操作建議」。

### 設計理念

- 先生成整體評論，再進行局部精修。
- 把 AI 當作「可反覆編輯的教育評論助手」，而不是一次性輸出工具。
- 支援選取文字後修改，代表評論內容被視為可持續打磨的稿件。

### 使用者操作

- 進入頁面後自動生成首版評論。
- 點選重新生成評論可刷新整份內容。
- 在評論文字中反白某段內容。
- 輸入修改指示後送出，局部替換該段內容。
- 可在底部輸入欄補充新的要求，再讓 AI 追加或重寫評論。

### 現況

- 首次評論與重新生成目前使用前端 mockReviews 模擬。
- 局部修改已串接 POST /api/chat/modify-comment。
- sendMessage 目前仍是假流程，尚未真正連到 AI 對話。

### 後端整合方式

- 已有可用 API
  - POST /api/chat/modify-comment
- 建議新增或改為正式使用 API
  - POST /api/chat 生成或追問評論
  - POST /api/generate/report 生成完整評論報告
  - POST /api/generate/rubric 生成量表版本評論
- 建議請求欄位
  - lessonId
  - instruction
  - originalComment
  - reviewMode: full | partial | regenerate
  - tone: professional | friendly | concise
- AI 自動生成方式
  - 頁面載入時自動根據 lessonId 生成首版評論。
  - 重新生成按鈕可附帶新的 prompt，例如「更強調評量設計」。
  - 選取段落修改時，後端只重寫局部內容，減少整篇重算成本。
- 儲存策略
  - 每次評論生成可存 review_versions。
  - 局部修改可存 review_edits，保留原文、修改指示、修改後內容。
  - 這樣 AI 後續可分析常見修改方向，優化提示詞模板。

## 介面四：評分頁 lesson-score.html

### 頁面定位

- 提供量化評估，將教案評論從文字判斷轉為可儲存、可比較的結構化數據。

### 五個評分維度

- structure：教案架構與設計理念
- objectives：目標設定與課綱符合度
- activities：教學活動與邏輯安排
- methods：教學方法、資源與創意
- assessment：評量策略與時間分配

### 主要介面區塊

- rating-section
  - 功用：承載所有星級評分項。
- rating-item
  - 功用：單一評分維度。
- star-rating
  - 功能：1 到 5 星互動評分。
- total-score-section
  - 功用：顯示平均總分。
- comment-section
  - 功用：填寫評分說明、補充建議。
- score-actions
  - 功用：重置評分、儲存評分。

### 設計理念

- 先做細項評分，再彙總總分。
- 評分與文字意見並存，避免只有數字沒有解釋。
- 桌機版強調左右並列同高，手機版強調上下排列與可讀性。

### 使用者操作

- 點選星星設定各維度分數。
- 系統即時計算總分。
- 可填寫評分說明。
- 可重置全部內容。
- 可儲存當前評分。

### 現況

- 前端已完整實作星級互動、總分計算、重置、儲存與讀取既有評分。
- 已串接 /api/scores 與 /api/scores/lesson/:lessonId。

### 後端整合方式

- 已有可用 API
  - POST /api/scores
  - GET /api/scores/lesson/:lessonId
  - GET /api/scores/:scoreId
  - PUT /api/scores/:scoreId
  - DELETE /api/scores/:scoreId
  - GET /api/scores
- 建議請求欄位
  - lessonId
  - scores
  - total
  - comment
- AI 自動生成方式
  - 可新增一個「AI 建議評分」按鈕，呼叫 POST /api/chat/score。
  - AI 可先根據教案內容預填各維度建議分數與評語，再由教師人工覆核。
  - 可再新增「根據評分自動生成總結報告」，呼叫 POST /api/generate/report。
- 儲存策略
  - 目前 scoreStore 為記憶體 Map，正式版需落地資料庫。
  - 建議資料表：scores。
  - 若同一教案需要多次評分，應加 evaluatorId、version、status。

## 介面五：查看教案頁 lesson-view.html

### 頁面定位

- 提供原始教案內容的閱讀視圖。
- 讓使用者在 AI 評論與評分前後，都能回到原文核對內容。

### 主要介面區塊

- lesson-view-header
  - 功用：顯示頁面標題與重新上傳按鈕。
- lesson-preview-content
  - 功用：顯示整份教案內容。
- lesson-meta
  - 功用：顯示檔名、上傳時間等中繼資料。
- lesson-text
  - 功用：顯示教案主體文字。
- lesson-view-actions
  - 功用：導向評論頁或返回上傳頁。

### 設計理念

- 強調原始內容可回看，避免 AI 分析與評分脫離原文。
- 這頁是內容核對中心，不是主要編輯頁。

### 使用者操作

- 檢視上傳後的教案內容。
- 確認檔名與上傳時間。
- 跳轉到評論頁面或重新上傳。

### 現況

- 目前頁面內容為示例資料。
- 尚未真正從後端抓 lesson 詳細內容。

### 後端整合方式

- 建議串接 API
  - GET /api/upload/lesson/:id
- 建議頁面載入流程
  - 從 localStorage.currentLessonId 取得 lessonId。
  - 呼叫 lesson 詳情 API。
  - 將 name、uploadDate、content 寫入 lesson-meta 與 lesson-text。
- AI 自動生成方式
  - 在此頁可加上「自動生成摘要」「自動擷取關鍵概念」「自動抽取教學目標」按鈕。
  - 這些功能可呼叫 /api/generate/summary、/api/generate/mindmap。
- 儲存策略
  - 此頁本身偏讀取，不需直接儲存。
  - 若加入標註或重點摘記功能，建議新增 lesson_annotations。

## 目前前後端對接狀態總覽

- 已有後端、前端也已接上的功能
  - 評分儲存與讀取
  - 局部評論修改
- 後端已有 API，但前端仍是模擬資料的功能
  - AI 自由對話
  - 首次評論生成
  - 重新生成評論
  - 查看教案詳細內容
  - 檔案真實上傳流程
- 後端已有能力可延伸的功能
  - 摘要生成
  - 量表生成
  - 概念圖生成
  - 評論報告生成

## 建議給 AI 分析時優先關注的設計重點

- 此專案不是一般聊天機器人，而是「以教案為核心資料來源」的任務型 AI 系統。
- 所有頁面都應圍繞同一份 current lesson 運作，因此 lessonId 是跨頁主鍵。
- UI 設計上分成五個任務面向：上傳、對話、正式評論、量化評分、原文檢視。
- 最重要的系統能力不是單次回答，而是「生成後可修改、可評分、可保存、可回看」。
- 如果 AI 要擴充功能，優先應沿著以下方向發展：
  - 把 mock data 全部替換成真實 API。
  - 把記憶體儲存改成資料庫持久化。
  - 建立 lessonId 為中心的完整資料流。
  - 建立 review versioning 與 score history。

## 建議的後端資料流架構

1. upload.html 上傳成功後建立 lesson。
2. 前端把 lessonId 存到 localStorage 或 session。
3. 其他頁面進入時都先讀取 currentLessonId。
4. index.html 與 lesson-review.html 以 lessonId 呼叫 AI 分析 API。
5. lesson-score.html 以 lessonId 儲存或讀取評分。
6. lesson-view.html 以 lessonId 顯示原文。
7. 若要提高 AI 品質，所有生成紀錄、使用者修改、評分歷史都應回存資料庫，作為後續分析依據。

## 建議新增的後端能力

- lesson summary cache
  - 避免同一教案重複生成摘要。
- review versions API
  - 用於保存每次完整評論與局部修改。
- generated artifacts API
  - 統一管理摘要、量表、報告、概念圖。
- user preferences API
  - 同步 sidebar 狀態、常用 prompt、偏好語氣。
- audit log API
  - 追蹤誰在何時上傳、修改評論、儲存評分。

## 建議 AI 之後可直接依本文件推導的任務

- 建立各頁面的功能規格書。
- 產生前端串接 API 的待辦清單。
- 產生資料庫 schema。
- 產生 prompt template 設計。
- 產生 UI 重構方向，例如把多頁流程整合成 lesson workspace。
