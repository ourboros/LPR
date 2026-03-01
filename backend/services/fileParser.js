// ============================================
// 檔案解析服務 - 提取教案文本
// ============================================

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

class FileParser {
  /**
   * 解析檔案並提取文本
   * @param {string} filePath - 檔案路徑
   * @param {string} mimeType - MIME 類型
   * @returns {Promise<string>} 提取的文本內容
   */
  async parseFile(filePath, mimeType) {
    try {
      const ext = path.extname(filePath).toLowerCase();

      switch (ext) {
        case ".pdf":
          return await this.parsePDF(filePath);

        case ".docx":
          return await this.parseDOCX(filePath);

        case ".doc":
          // .doc 格式較舊，可能需要額外處理
          return await this.parseDOC(filePath);

        case ".txt":
          return await this.parseTXT(filePath);

        default:
          throw new Error(`不支援的檔案類型: ${ext}`);
      }
    } catch (error) {
      console.error("檔案解析錯誤:", error);
      throw new Error(`解析檔案失敗: ${error.message}`);
    }
  }

  /**
   * 解析 PDF 檔案
   * @param {string} filePath - PDF 檔案路徑
   * @returns {Promise<string>} 提取的文本
   */
  async parsePDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return this.cleanText(data.text);
    } catch (error) {
      throw new Error(`PDF 解析失敗: ${error.message}`);
    }
  }

  /**
   * 解析 DOCX 檔案
   * @param {string} filePath - DOCX 檔案路徑
   * @returns {Promise<string>} 提取的文本
   */
  async parseDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return this.cleanText(result.value);
    } catch (error) {
      throw new Error(`DOCX 解析失敗: ${error.message}`);
    }
  }

  /**
   * 解析 DOC 檔案（舊格式）
   * @param {string} filePath - DOC 檔案路徑
   * @returns {Promise<string>} 提取的文本
   */
  async parseDOC(filePath) {
    try {
      // mammoth 也可以處理某些 .doc 檔案
      const result = await mammoth.extractRawText({ path: filePath });
      return this.cleanText(result.value);
    } catch (error) {
      throw new Error(`DOC 解析失敗（建議轉換為 DOCX 格式）: ${error.message}`);
    }
  }

  /**
   * 解析 TXT 檔案
   * @param {string} filePath - TXT 檔案路徑
   * @returns {Promise<string>} 提取的文本
   */
  async parseTXT(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return this.cleanText(content);
    } catch (error) {
      throw new Error(`TXT 解析失敗: ${error.message}`);
    }
  }

  /**
   * 清理文本內容
   * @param {string} text - 原始文本
   * @returns {string} 清理後的文本
   */
  cleanText(text) {
    if (!text) return "";

    return (
      text
        // 移除多餘空白行
        .replace(/\n\s*\n\s*\n/g, "\n\n")
        // 移除行首行尾空白
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        // 移除多餘空格
        .replace(/ +/g, " ")
        .trim()
    );
  }

  /**
   * 驗證檔案類型
   * @param {string} filename - 檔案名稱
   * @returns {boolean} 是否為支援的類型
   */
  isSupported(filename) {
    const ext = path.extname(filename).toLowerCase();
    return [".pdf", ".doc", ".docx", ".txt"].includes(ext);
  }

  /**
   * 取得檔案資訊
   * @param {string} filePath - 檔案路徑
   * @returns {Object} 檔案資訊
   */
  getFileInfo(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const ext = path.extname(filePath);
      const name = path.basename(filePath);

      return {
        name,
        size: stats.size,
        extension: ext,
        created: stats.birthtime,
        modified: stats.mtime,
      };
    } catch (error) {
      throw new Error(`取得檔案資訊失敗: ${error.message}`);
    }
  }

  /**
   * 格式化檔案大小
   * @param {number} bytes - 位元組數
   * @returns {string} 格式化的大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
}

module.exports = new FileParser();
