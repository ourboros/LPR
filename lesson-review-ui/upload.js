const fileInput = document.getElementById("fileInput");
const uploadForm = document.getElementById("uploadForm");
const fileName = document.getElementById("fileName");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");

let selectedFile = null;

function setStatus(message, type = "") {
  uploadStatus.textContent = message;
  uploadStatus.classList.remove("error", "success");

  if (type) {
    uploadStatus.classList.add(type);
  }
}

// 檔案選擇觸發
fileInput.addEventListener("change", (e) => {
  handleFileSelect(e.target.files[0]);
});

// 拖放上傳
uploadForm.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadForm.classList.add("drag-over");
});

uploadForm.addEventListener("dragleave", () => {
  uploadForm.classList.remove("drag-over");
});

uploadForm.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadForm.classList.remove("drag-over");
  handleFileSelect(e.dataTransfer.files[0]);
});

// 處理檔案選擇
function handleFileSelect(file) {
  if (!file) return;

  const allowedTypes = [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/pdf",
    "text/plain",
  ];

  if (!allowedTypes.includes(file.type)) {
    setStatus(
      "❌ 檔案格式不支持，請上傳 .doc, .docx, .pdf, .txt 格式",
      "error",
    );
    return;
  }

  selectedFile = file;
  fileName.textContent = `✓ 已選擇：${file.name}`;
  fileName.classList.add("show");
  uploadBtn.disabled = false;
  setStatus("");
}

// 上傳按鈕
uploadBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append("file", selectedFile);

  uploadBtn.disabled = true;
  setStatus("上傳中...");

  try {
    const result = await window.LPR.request("/upload", {
      method: "POST",
      body: formData,
    });

    window.LPR.setCurrentLesson({
      id: result.id,
      name: result.name,
    });
    sessionStorage.removeItem("chatSessionId");
    sessionStorage.removeItem("reviewSessionId");

    setStatus("✓ 上傳成功！正在跳轉...", "success");

    setTimeout(() => {
      window.location.href = "./index.html";
    }, 900);
  } catch (error) {
    uploadBtn.disabled = false;
    setStatus(`❌ 上傳失敗：${error.message}`, "error");
  }
});
