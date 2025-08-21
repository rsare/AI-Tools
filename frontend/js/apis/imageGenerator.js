// Google Imagen (via backend) – Prompt -> Çoklu görsel üret – Önizleme, lightbox & indirme

export async function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
  <div class="ifix-shell">
    <div class="ifix-card">
      <h1 style="font-size:1.6rem; margin:0 0 8px 0;">Image Generator</h1>
      <div class="ifix-meta">Google Imagen ile prompt'tan görsel üretir. Anahtarın backend'te saklanır.</div>

      <div class="ifix-sep"></div>

      <div class="ifix-grid">
        <div>
          <label class="ifix-meta" for="prompt">Prompt</label>
          <textarea id="prompt" rows="4" placeholder="Örn: A cozy cafe interior with warm lights, cinematic look"
            style="width:90%; padding:12px; border-radius:12px; background:#383E42 ; color:#fff; border:1px solid rgba(255, 255, 255, 1);"></textarea>

          <!-- Model seçimi İSTEĞE BAĞLI. Bu blok yoksa kod varsayılan model kullanır. -->
          <div style="margin-top:10px; display:none" id="modelRow">
            <label class="ifix-meta" for="modelSel">Model</label>
            <select id="modelSel" style="width:100%; padding:10px; border-radius:10px; background:#0f0f0f; color:#fff; border:1px solid rgba(255, 255, 255, 1);">
              <option value="imagen-4.0-generate-001" selected>Imagen 4.0</option>
              <option value="imagen-3.0-generate-001">Imagen 3.0</option>
            </select>
          </div>

          <div class="ifix-row" style="margin-top:10px">
            <div>
              <label class="ifix-meta" for="countSel">Adet</label>
              <select id="countSel" style="padding:10px; border-radius:10px; background:#383E42 ; color:#fff; border:1px solid rgba(255, 255, 255, 1);">
                <option>1</option><option>2</option><option selected>3</option><option>4</option>
              </select>
            </div>
          </div>

          <div class="ifix-row" style="margin-top:12px">
            <button class="ifix-btn" id="genBtn">Üret</button>
            <button class="ifix-btn" id="clearBtn">Temizle</button>
          </div>

          <div id="status" class="ifix-meta" style="margin-top:8px"></div>
        </div>

        <div>
          <div class="ifix-meta" style="margin-bottom:6px">Sonuçlar</div>
          <div id="grid" style="display:grid; grid-template-columns: 1fr; gap:10px;"></div>
        </div>
      </div>
    </div>

    <style>
         /* ----- Hamburger Menü Stilleri ----- */
      .menu-button {
          position: fixed;
          top: 20px;
          left: 20px;
          color: white;
          font-size: 30px;
          cursor: pointer;
          z-index: 1000;
      }
      .sidebar {
          position: fixed;
          top: 0;
          left: -250px;
          width: 250px;
          height: 100%;

          background: #4c4e50ff;
          box-shadow: 2px 0 5px rgba(68, 65, 65, 0.5);
          transition: left 0.3s ease-in-out;
          z-index: 999;
          padding-top: 60px;
      }
      .sidebar.open {
          left: 0;
      }
      .sidebar a {
          display: block;
          padding: 15px 20px;
          color: white;
          text-decoration: none;
          font-size: 18px;
          border-bottom: 1px solid #4c4e50ff;
          transition: background-color 0.2s;
      }
      .sidebar a:hover {
          background-color: #010f26ff;
      }
    </style>

    <div class="menu-button" id="menuButton">&#9776;</div>
    <div class="sidebar" id="sidebar">
      <a href="/">Main Page</a>
      <a href="/api.html?tool=imageFixer">Image Fixer</a>
      <a href="/api.html?tool=textGenerator">Text Generator</a>
      <a href="/api.html?tool=voiceGenerator">Voice Generator</a>
      <a href="/api.html?tool=videoGenerator">Video Generator</a>
      <a href="api.html?tool=imageGenerator">Image Generator</a>
    </div>

    <!-- Lightbox -->
    <div id="lightbox" class="lb-backdrop">
      <div class="lb-inner"><img src="" alt="preview"/></div>
      <div class="lb-actions">
        <button id="lbDL" class="lb-btn">İndir</button>
        <button id="lbClose" class="lb-btn">Kapat (Esc)</button>
      </div>
    </div>
  </div>`;

  // Dinamik stiller (grid + lightbox)
  const style = document.createElement("style");
  style.textContent = `
    #grid{display:grid;gap:10px;grid-template-columns:1fr}
    @media (min-width: 900px){ #grid{grid-template-columns:repeat(2,minmax(0,1fr))} }
    .ifix-img{width:100%;height:auto;object-fit:contain;display:block;border-radius:12px}

    .lb-backdrop{position:fixed;inset:0;background:#000c;display:none;place-items:center;z-index:9999}
    .lb-backdrop.show{display:grid}
    .lb-inner{max-width:min(94vw,1400px);max-height:92vh}
    .lb-inner img{width:100%;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 10px 40px #0008}
    .lb-actions{position:fixed;right:16px;bottom:16px;display:flex;gap:8px}
    .lb-btn{padding:10px 14px;border-radius:10px;border:1px solid #fff3;background:#ffffff22;color:#fff;cursor:pointer}
  `;
  document.head.appendChild(style);

  // ---- DOM
  const promptEl = document.getElementById("prompt");
  const modelSel = document.getElementById("modelSel"); // olabilir de olmayabilir de
  const countSel = document.getElementById("countSel");
  const genBtn = document.getElementById("genBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const grid = document.getElementById("grid");

  const setStatus = (t) => (statusEl.textContent = t || "");
  const safeVal = (el, fallback="") => (el && typeof el.value !== "undefined" ? el.value : fallback);

  const card = (src, i) => `
    <div style="border:1px solid rgba(0,0,0,.08);border-radius:14px;overflow:hidden;background:#fff1">
      <img src="${src}" class="ifix-img" alt="generated-${i}" data-full="${src}" />
      <div style="display:flex;gap:8px;padding:8px;flex-wrap:wrap">
        <button class="ifix-btn" data-view="${i}">Tam Gör</button>
        <a class="ifix-btn" href="${src}" download="gen-${i+1}.png">İndir</a>
        <button class="ifix-btn" data-copy="${i}">Kopyala</button>
      </div>
    </div>`;

  clearBtn.addEventListener("click", () => { grid.innerHTML = ""; setStatus(""); });
   const menuButton = app.querySelector('#menuButton');
    const sidebar = app.querySelector('#sidebar');
    menuButton.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

  // Kopyalama / Lightbox / Yeni sekme
  grid.addEventListener("click", async (e) => {
    const newTabBtn = e.target.closest("button[data-newtab]");
    const copyBtn   = e.target.closest("button[data-copy]");
    const viewBtn   = e.target.closest("button[data-view]");
    const imgEl     = e.target.closest("img.ifix-img");

    if (newTabBtn) {
      const idx = +newTabBtn.getAttribute("data-newtab");
      const img = grid.querySelectorAll("img")[idx];
      if (img?.src) window.open(img.src, "_blank");
      return;
    }

    if (copyBtn) {
      const idx = +copyBtn.getAttribute("data-copy");
      const img = grid.querySelectorAll("img")[idx];
      if (!img) return;
      try {
        const blob = await (await fetch(img.src)).blob();
        await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
        setStatus("Panoya kopyalandı ✅");
      } catch { setStatus("Kopyalama desteklenmiyor (HTTPS + izin gerekebilir)."); }
      return;
    }

    if (viewBtn || imgEl) {
      const src = viewBtn
        ? grid.querySelectorAll("img")[+viewBtn.getAttribute("data-view")]?.dataset.full
        : imgEl?.dataset.full;
      if (!src) return;
      lbImg.src = src;
      lbDL.onclick = () => { const a=document.createElement("a"); a.href=src; a.download="generated.png"; a.click(); };
      lightbox.classList.add("show");
    }
  });

  // Görsel üret
  genBtn.addEventListener("click", async () => {
    const prompt = (promptEl?.value || "").trim();
    if (!prompt) { setStatus("Prompt gerekli."); return; }

    // MODEL GÜVENLİ: select yoksa varsayılan kullan
    const modelToUse = safeVal(modelSel, "imagen-3.0-generate-001");
    const count = parseInt(safeVal(countSel, "1"), 10) || 1;

    setStatus("Üretiliyor… (ilk çağrılarda model ısınması nedeniyle biraz sürebilir)");
    genBtn.disabled = true;

    try {
      const resp = await fetch(`${backendBaseUrl}/api/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, n: Math.min(Math.max(count,1),4), model: modelToUse }),
      });

      if (!resp.ok) {
        const e = await safeJson(resp);
        throw new Error(e?.message || e?.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const urls = (data.images || []).map(x => x.dataUrl).filter(Boolean);
      if (!urls.length) { setStatus("Görsel gelmedi."); return; }

      grid.innerHTML = urls.map((u, i) => card(u, i)).join("");
      setStatus(`Hazır 🎉 (${urls.length} görsel)`);
    } catch (err) {
      console.error(err);
      setStatus(`Hata: ${err.message}`);
    } finally {
      genBtn.disabled = false;
    }
  });

  // Lightbox kontrol
  const lightbox = document.getElementById("lightbox");
  const lbImg = lightbox.querySelector("img");
  const lbDL = document.getElementById("lbDL");
  const lbClose = document.getElementById("lbClose");

  lbClose.addEventListener("click", () => lightbox.classList.remove("show"));
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox) lightbox.classList.remove("show"); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") lightbox.classList.remove("show"); });

  async function safeJson(r){ try { return await r.json(); } catch { return null; } }
}
