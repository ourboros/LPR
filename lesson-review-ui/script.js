const chatList = document.getElementById("chatList");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const quickButtons = document.querySelectorAll(".quick-btn");
const menuBtn = document.querySelector(".menu-btn");
const pageShell = document.querySelector(".page-shell");

const aiResponses = {
  請生成教案摘要:
    "本教案以學生參與為核心，流程完整，建議補上每段活動的時間配置與產出證據。",
  請分析教案結構:
    "結構包含導入、發展、總結三段，建議在發展活動中再強化提問層次與回饋節點。",
  請提供改進建議:
    "可優先新增形成性評量表與差異化任務，並在課末加入學生自評欄位。",
};

// 折疊側邊欄功能
menuBtn.addEventListener("click", () => {
  pageShell.classList.toggle("sidebar-collapsed");
});

function appendBubble(text, role, isShort = false) {
  const bubble = document.createElement("article");
  bubble.className =
    role === "user" ? "bubble bubble-user" : "bubble bubble-ai";
  if (isShort && role === "user") {
    bubble.classList.add("short");
  }
  bubble.textContent = text;
  chatList.appendChild(bubble);
  chatList.scrollTop = chatList.scrollHeight;
}

function sendMessage(text) {
  const message = text.trim();
  if (!message) {
    return;
  }

  appendBubble(message, "user", message.length <= 20);

  window.setTimeout(() => {
    const matchedQuickReply = aiResponses[message];
    const reply =
      matchedQuickReply ||
      "收到你的需求，我會從教學目標、活動流程與評量方式三個面向，提供可執行的修正建議。";
    appendBubble(reply, "assistant");
  }, 350);
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(chatInput.value);
  chatInput.value = "";
  chatInput.focus();
});

quickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.prompt || "";
    chatInput.value = prompt;
    sendMessage(prompt);
    chatInput.value = "";
    chatInput.focus();
  });
});
