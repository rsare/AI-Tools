// frontend/js/apis/textSummarizer.js
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
      <a href="/api.html?tool=textSummarizer">Text Summarizer</a>
      <a href="/api.html?tool=imagePixelizer">Image Pixelizer</a>
      
    </nav>

    <section class="panel" aria-labelledby="ts-title">
      <h2 id="ts-title" class="h2 title">Metin Özetleyici</h2>

      <label for="source" class="muted" style="display:block;margin:10px 0 6px">
        Özetlemek istediğiniz metni buraya yapıştırın:
      </label>
      <textarea id="source" class="textarea" rows="10"
        placeholder="Uzun metni buraya yapıştırın..."></textarea>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
        <div style="display:flex;gap:8px;align-items:center">
          <label class="muted" for="lenSel">Uzunluk</label>
          <select id="lenSel" class="select">
            <option value="short">Kısa</option>
            <option value="medium" selected>Orta</option>
            <option value="long">Uzun</option>
          </select>
        </div>
         <style>
      .menu-button{position:fixed;top:20px;left:20px;color:#fff;font-size:30px;cursor:pointer;z-index:1000}
      .sidebar{position:fixed;top:0;left:-250px;width:250px;height:100%;background:#4c4e50ff;
               box-shadow:2px 0 5px rgba(68,65,65,.5);transition:left .3s;z-index:999;padding-top:60px}
      .sidebar.open{left:0}
      .sidebar a{display:block;padding:15px 20px;color:#fff;text-decoration:none;font-size:18px;
                 border-bottom:1px solid #010f23ff}
      .sidebar a:hover{background:#010f26ff}

      /* Paragraflar ve liste maddeleri iki yana yaslı */
.output p,
.output li,
.tg-output.justified p,
.tg-output.justified li {
  text-align: justify;
  text-justify: inter-word;
  hyphens: auto;               /* uzun kelimeleri bölerek taşmayı önler */
  -webkit-hyphens: auto;
  -ms-hyphens: auto;
}

/* Liste görünümünü toparla */
.output ul,
.output ol,
.tg-output.justified ul,
.tg-output.justified ol {
  padding-left: 1.2rem;        /* madde işaretine mesafe */
  list-style-position: outside; /* işaretler solda kalsın */
}

/* Son satırın aşırı gerilmesini istemezsen: */
.output li,
.tg-output.justified li {
  text-align-last: left;        /* istersen 'justify' da yapabilirsin */
}

    </style>

        <div style="display:flex;gap:8px;align-items:center">
          <label class="muted" for="fmtSel">Biçim</label>
          <select id="fmtSel" class="select">
            <option value="paragraphs" selected>Paragraf</option>
            <option value="bullets">Madde Madde</option>
          </select>
        </div>
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
        <button id="summarizeBtn" class="btn">Özetle</button>
        <button id="clearBtn" class="btn secondary" type="button">Temizle</button>
        <button id="jumpToOutput" class="btn secondary hidden" type="button">↓ Çıktıya in</button>
      </div>

      <div id="loading" class="muted hidden" style="margin-top:10px">Yükleniyor...</div>

      <div id="output" class="output" style="display:none"></div>

      <div id="toPromptInlineWrap" class="hidden" style="display:flex;justify-content:flex-end;margin-top:10px">
        <button id="toPromptInline" class="btn sm secondary" type="button">↑ Metne dön</button>
      </div>
    </section>

    <button id="toTop" class="btn sm backtop hidden" aria-label="Metne dön">▲ Başa Dön</button>
  `;

  // Sidebar
  const menuButton = app.querySelector('#menuButton');
  const sidebar = app.querySelector('#sidebar');
  menuButton?.addEventListener('click', () => sidebar?.classList.toggle('open'));

  // Elemanlar
  const sourceInput = document.getElementById("source");
  const lenSel = document.getElementById("lenSel");
  const fmtSel = document.getElementById("fmtSel");
  const summarizeBtn = document.getElementById("summarizeBtn");
  const clearBtn = document.getElementById("clearBtn");
  const loadingDiv = document.getElementById("loading");
  const outputDiv = document.getElementById("output");
  const toTop = document.getElementById("toTop");
  const toPromptInlineWrap = document.getElementById("toPromptInlineWrap");
  const toPromptInline = document.getElementById("toPromptInline");
  const jumpToOutput = document.getElementById("jumpToOutput");

  // --------- Kaydırma yardımcıları ----------
  function scrollToElement(el, offset = 24) {
    if (!el) return;
    const top = el.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop) - offset;
    window.scrollTo({ top, behavior: "smooth" });
    (document.scrollingElement || document.documentElement).scrollTo({ top, behavior: "smooth" });
  }

  window.addEventListener("scroll", () => {
    if (window.scrollY > 400) toTop.classList.remove("hidden");
    else toTop.classList.add("hidden");
  });

  const goToSource = () => {
    scrollToElement(sourceInput, 24);
    setTimeout(() => sourceInput?.focus({ preventScroll: true }), 450);
  };
  toTop.addEventListener("click", goToSource);
  toPromptInline.addEventListener("click", goToSource);

  jumpToOutput.addEventListener("click", () => {
    scrollToElement(outputDiv, 16);
  });

  // Basit markdown-lite -> HTML
  function escapeHtml(s) { return s.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])); }
  function inlineMd(s) {
    let t = escapeHtml(s);
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
    return t;
  }
  function mdLiteToHtml(text) {
    const lines = (text || "").split(/\r?\n/);
    let html = "", inUl = false, inOl = false;
    const closeLists = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };

    for (const raw of lines) {
      const l = raw.trim();
      if (!l) { closeLists(); continue; }

      const h = l.match(/^(#{1,6})\s+(.*)$/);
      if (h) { closeLists(); const level = h[1].length; html += `<h${level}>${inlineMd(h[2])}</h${level}>`; continue; }

      const ol = l.match(/^\d+\.\s+(.*)$/);
      if (ol) { if (!inOl) { closeLists(); html += "<ol>"; inOl = true; } html += `<li>${inlineMd(ol[1])}</li>`; continue; }

      const ul = l.match(/^[-*]\s+(.*)$/);
      if (ul) { if (!inUl) { closeLists(); html += "<ul>"; inUl = true; } html += `<li>${inlineMd(ul[1])}</li>`; continue; }

      closeLists(); html += `<p>${inlineMd(l)}</p>`;
    }
    closeLists(); return html;
  }

  // Temizle
  clearBtn.addEventListener("click", () => {
    sourceInput.value = "";
    outputDiv.innerHTML = "";
    outputDiv.style.display = "none";
    toPromptInlineWrap.classList.add("hidden");
    jumpToOutput.classList.add("hidden");
    goToSource();
  });

  // Özetle
  summarizeBtn.addEventListener("click", async () => {
    const text = sourceInput.value.trim();
    if (!text) { alert("Lütfen özetlenecek metni girin."); return; }

    loadingDiv.classList.remove("hidden");
    outputDiv.style.display = "none";
    outputDiv.innerHTML = "";
    toPromptInlineWrap.classList.add("hidden");
    jumpToOutput.classList.add("hidden");

    try {
      const response = await fetch(`${backendBaseUrl}/api/text-summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          length: lenSel.value,
          format: fmtSel.value,
          language: "tr"
        })
      });

      if (!response.ok) {
        let msg = "API çağrısı başarısız oldu.";
        try { const err = await response.json(); msg = err.detail || err.error || msg; } catch { }
        throw new Error(msg);
      }

      const data = await response.json();
      const out = data.summary || data.output || "";
      outputDiv.innerHTML = mdLiteToHtml(out);
      outputDiv.style.display = "block";

      toPromptInlineWrap.classList.remove("hidden");
      jumpToOutput.classList.remove("hidden");
    } catch (error) {
      console.error("Hata:", error);
      outputDiv.innerHTML = `<p style="color:#ef4444">Hata: ${error.message}</p>`;
      outputDiv.style.display = "block";
      toPromptInlineWrap.classList.remove("hidden");
    } finally {
      loadingDiv.classList.add("hidden");
    }
  });

  // Kısayol: Alt+U -> Metne dön
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      goToSource();
    }
  });
}
