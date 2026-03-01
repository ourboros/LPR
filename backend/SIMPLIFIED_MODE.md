# 簡化版 RAG（不使用 Embedding）

由於 Gemini Embedding API 配額限制，此版本直接使用所有評論準則，不進行向量搜尋。

## 修改的檔案

- `routes/chat.js` - 引用 `rag-simple.js`
- `services/rag-simple.js` - 新的簡化服務

## 重啟指令

```bash
# 停止後端 (Ctrl+C)
# 重新啟動
node server.js
```
