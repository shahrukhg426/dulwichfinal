(function () {
  const loginScreen = document.getElementById("loginScreen");
  const dashboard = document.getElementById("dashboard");
  const loginForm = document.getElementById("loginForm");
  const passwordInput = document.getElementById("passwordInput");
  const loginError = document.getElementById("loginError");
  const logoutBtn = document.getElementById("logoutBtn");

  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const messageInput = document.getElementById("messageInput");
  const sendBtn = document.getElementById("sendBtn");
  const imageInput = document.getElementById("imageInput");
  const imagePreview = document.getElementById("imagePreview");
  const imagePreviewThumb = document.getElementById("imagePreviewThumb");
  const imagePreviewName = document.getElementById("imagePreviewName");
  const removeImageBtn = document.getElementById("removeImageBtn");
  const pageChips = document.getElementById("pageChips");

  let history = []; // [{role:'user'|'assistant', content:string}]
  let pendingImage = null; // { data: base64NoPrefix, mimeType, filename }

  function showDashboard() {
    loginScreen.style.display = "none";
    dashboard.style.display = "grid";
  }
  function showLogin() {
    loginScreen.style.display = "flex";
    dashboard.style.display = "none";
  }

  async function checkSession() {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.authenticated) showDashboard();
      else showLogin();
    } catch (e) {
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const password = passwordInput.value;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        passwordInput.value = "";
        showDashboard();
      } else {
        loginError.textContent = data.error || "Login fail ho gaya.";
      }
    } catch (e) {
      loginError.textContent = "Server se connect nahi ho saka.";
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    history = [];
    showLogin();
  });

  pageChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    messageInput.value = btn.dataset.text + messageInput.value;
    messageInput.focus();
    autoGrow();
  });

  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // data:<mime>;base64,<data>
      const commaIdx = result.indexOf(",");
      pendingImage = {
        data: result.slice(commaIdx + 1),
        mimeType: file.type,
        filename: file.name,
      };
      imagePreviewThumb.src = result;
      imagePreviewName.textContent = file.name;
      imagePreview.style.display = "flex";
    };
    reader.readAsDataURL(file);
  });

  removeImageBtn.addEventListener("click", () => {
    pendingImage = null;
    imageInput.value = "";
    imagePreview.style.display = "none";
  });

  function addMessage(role, text, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "msg msg-" + role + (opts.error ? " msg-error" : "") + (opts.typing ? " msg-typing" : "");
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
    if (opts.thumb) {
      const img = document.createElement("img");
      img.className = "msg-thumb";
      img.src = opts.thumb;
      bubble.appendChild(document.createElement("br"));
      bubble.appendChild(img);
    }
    chatMessages.appendChild(wrap);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return wrap;
  }

  function autoGrow() {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + "px";
  }
  messageInput.addEventListener("input", autoGrow);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.requestSubmit();
    }
  });

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text && !pendingImage) return;

    addMessage("user", text || "(image attached)", pendingImage ? { thumb: imagePreviewThumb.src } : {});
    history.push({ role: "user", content: text || "(image attached)" });

    const imageToSend = pendingImage;
    messageInput.value = "";
    autoGrow();
    removeImageBtn.click();
    sendBtn.disabled = true;

    const typingEl = addMessage("bot", "Soch raha hoon...", { typing: true });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, image: imageToSend }),
      });
      const data = await res.json();
      typingEl.remove();
      if (res.status === 401) {
        addMessage("bot", "Session khatam ho gaya, dobara login karein.", { error: true });
        showLogin();
        return;
      }
      const replyText = data.reply || data.error || "Kuch ghalat ho gaya.";
      addMessage("bot", replyText, { error: !!data.error });
      history.push({ role: "assistant", content: replyText });
    } catch (e) {
      typingEl.remove();
      addMessage("bot", "Server se connect nahi ho saka. Dobara try karein.", { error: true });
    } finally {
      sendBtn.disabled = false;
    }
  });

  checkSession();
})();
