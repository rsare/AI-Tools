// frontend/js/apis/textGenerator.js
export async function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="menu-button" id="menuButton" aria-label="Menüyü aç/kapat">&#9776;</div>
    <nav class="sidebar" id="sidebar">
      <a href="/">Main Page</a>
      <a href="/api.html?tool=imageFixer">Image Fixer</a>
      <a href="/api.html?tool=textGenerator">Text Generator</a>
      <a href="/api.html?tool=voiceGenerator">Voice Generator</a>
      <a href="/api.html?tool=imageGenerator">Image Generator</a>
      <a href="api.html?tool=textSummarizer">Text Summarizer</a>
      <a href="/api.html?tool=imagePixelizer">Image Pixelizer</a>

    </nav>
     <style>
      .menu-button{position:fixed;top:20px;left:20px;color:#fff;font-size:30px;cursor:pointer;z-index:1000}
      .sidebar{position:fixed;top:0;left:-250px;width:250px;height:100%;background:#4c4e50ff;
               box-shadow:2px 0 5px rgba(68,65,65,.5);transition:left .3s;z-index:999;padding-top:60px}
      .sidebar.open{left:0}
      .sidebar a{display:block;padding:15px 20px;color:#fff;text-decoration:none;font-size:18px;
                 border-bottom:1px solid #010f23ff}
      .sidebar a:hover{background:#010f26ff}
    </style>

    <section class="panel" aria-labelledby="tg-title">
      <h2 id="tg-title" class="h2 title">Metin Oluşturucu</h2>

      <label for="prompt" class="muted" style="display:block;margin:10px 0 6px">
        Metin üretmek istediğiniz konuyu giriniz:
      </label>
      <textarea id="prompt" class="textarea" rows="6"
        placeholder="Örn: Yapay zekâ ile ilgili bir bilgilendirme yazısı..."></textarea>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
        <button id="generateBtn" class="btn">Metin Oluştur</button>
        <button id="jumpToOutput" class="btn secondary hidden" type="button">↓ Çıktıya in</button>
      </div>

      <div id="loading" class="muted hidden" style="margin-top:10px">Yükleniyor...</div>

      <div id="output" class="output" style="display:none"></div>

      <div id="toPromptInlineWrap" class="hidden" style="display:flex;justify-content:flex-end;margin-top:10px">
        <button id="toPromptInline" class="btn sm secondary" type="button">↑ Prompt’a dön</button>
      </div>
    </section>

    <button id="toTop" class="btn sm backtop hidden" aria-label="Prompt’a dön">▲ Başa Dön</button>
  `;

  // Sidebar
  const menuButton = app.querySelector('#menuButton');
  const sidebar = app.querySelector('#sidebar');
  menuButton?.addEventListener('click', () => sidebar?.classList.toggle('open'));

  // Elemanlar
  const promptInput = document.getElementById("prompt");
  const generateBtn = document.getElementById("generateBtn");
  const loadingDiv = document.getElementById("loading");
  const outputDiv = document.getElementById("output");
  const toTop = document.getElementById("toTop");
  const toPromptInlineWrap = document.getElementById("toPromptInlineWrap");
  const toPromptInline = document.getElementById("toPromptInline");
  const jumpToOutput = document.getElementById("jumpToOutput");

  // --------- ROBUST KAYDIRMA YARDIMCISI ----------
  function scrollToElement(el, offset = 24){
    if (!el) return;
    // elemana göre sayfa üstünden mesafe
    const top = el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop) - offset;
    // hem body hem documentElement için dene (tarayıcı uyumu)
    window.scrollTo({ top, behavior: "smooth" });
    (document.scrollingElement || document.documentElement)
      .scrollTo({ top, behavior: "smooth" });
  }

  // Sabit buton görünürlüğü
  window.addEventListener("scroll", () => {
    if (window.scrollY > 400) toTop.classList.remove("hidden");
    else toTop.classList.add("hidden");
  });

  // Prompt’a dön – SABİT ve YEREL butonlar
  const goToPrompt = () => {
    scrollToElement(promptInput, 24);
    setTimeout(() => promptInput?.focus({ preventScroll: true }), 450);
  };
  toTop.addEventListener("click", goToPrompt);
  toPromptInline.addEventListener("click", goToPrompt);

  // Çıktıya in
  jumpToOutput.addEventListener("click", () => {
    scrollToElement(outputDiv, 16);
  });

  // Basit markdown-lite -> HTML
  function escapeHtml(s){ return s.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
  function inlineMd(s){
    let t = escapeHtml(s);
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
    return t;
  }
  function mdLiteToHtml(text){
    const lines = (text || "").split(/\r?\n/);
    let html = "", inUl = false, inOl = false;
    const closeLists = () => { if(inUl){html+="</ul>"; inUl=false;} if(inOl){html+="</ol>"; inOl=false;} };

    for (const raw of lines){
      const l = raw.trim();
      if (!l){ closeLists(); continue; }

      const h = l.match(/^(#{1,6})\s+(.*)$/);
      if (h){ closeLists(); const level=h[1].length; html += `<h${level}>${inlineMd(h[2])}</h${level}>`; continue; }

      const ol = l.match(/^\d+\.\s+(.*)$/);
      if (ol){ if(!inOl){ closeLists(); html+="<ol>"; inOl=true; } html += `<li>${inlineMd(ol[1])}</li>`; continue; }

      const ul = l.match(/^[-*]\s+(.*)$/);
      if (ul){ if(!inUl){ closeLists(); html+="<ul>"; inUl=true; } html += `<li>${inlineMd(ul[1])}</li>`; continue; }

      closeLists(); html += `<p>${inlineMd(l)}</p>`;
    }
    closeLists(); return html;
  }

  // Üret
  generateBtn.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) { alert("Lütfen bir istek girin."); return; }

    loadingDiv.classList.remove("hidden");
    outputDiv.style.display = "none";
    outputDiv.innerHTML = "";
    toPromptInlineWrap.classList.add("hidden");
    jumpToOutput.classList.add("hidden");

    try {
      const response = await fetch(`${backendBaseUrl}/api/text-generator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        let msg = "API çağrısı başarısız oldu.";
        try { const err = await response.json(); msg = err.detail || err.error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await response.json();
      outputDiv.innerHTML = mdLiteToHtml(data.output || "");
      outputDiv.style.display = "block";

      // kısayolları aç
      toPromptInlineWrap.classList.remove("hidden");
      jumpToOutput.classList.remove("hidden");

      // otomatik kaydırma YOK (artık tamamen kullanıcı kontrolünde)
    } catch (error) {
      console.error("Hata:", error);
      outputDiv.innerHTML = `<p style="color:#ef4444">Hata: ${error.message}</p>`;
      outputDiv.style.display = "block";
      toPromptInlineWrap.classList.remove("hidden");
    } finally {
      loadingDiv.classList.add("hidden");
    }
  });

  // Klavye kısayolu: Alt+U -> Prompt’a dön
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      goToPrompt();
    }
  });
}
