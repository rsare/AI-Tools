// Google Imagen (via backend) – Tek panel + model fallback

export async function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  if (!app) return;

  // ---- UI ---------------------------------------------------
  app.innerHTML = `
    <style>
      .menu-button{position:fixed;top:20px;left:20px;color:#fff;font-size:30px;cursor:pointer;z-index:1000}
      .sidebar{position:fixed;top:0;left:-250px;width:250px;height:100%;background:#4c4e50ff;
               box-shadow:2px 0 5px rgba(68,65,65,.5);transition:left .3s;z-index:999;padding-top:60px}
      .sidebar.open{left:0}
      .sidebar a{display:block;padding:15px 20px;color:#fff;text-decoration:none;font-size:18px;
                 border-bottom:1px solid #4c4e50ff}
      .sidebar a:hover{background:#010f26ff}
    </style>

    <div class="menu-button" id="menuButton">&#9776;</div>
    <nav class="sidebar" id="sidebar">
      <a href="/">Main Page</a>
      <a href="/api.html?tool=imageFixer">Image Fixer</a>
      <a href="/api.html?tool=textGenerator">Text Generator</a>
      <a href="/api.html?tool=voiceGenerator">Voice Generator</a>
      <a href="/api.html?tool=imageGenerator">Image Generator</a>
    </nav>

    <section class="panel" aria-labelledby="ig-title">
      <h2 id="ig-title" class="h2 title">Image Generator</h2>
      <p class="muted">Google Imagen ile prompt’tan görsel üretir. Anahtar backend’te saklanır.</p>

      <label class="muted" for="ig-prompt" style="display:block;margin:10px 0 6px">Prompt</label>
      <textarea id="ig-prompt" rows="5" class="textarea"
        placeholder="Örn: A cozy cafe interior with warm lights, cinematic look"></textarea>

      <div style="display:flex;gap:10px;align-items:center;margin:10px 0 2px">
        <label class="muted" for="ig-count">Adet</label>
        <select id="ig-count" class="select" style="max-width:90px">
          <option>1</option><option>2</option><option selected>3</option><option>4</option>
        </select>
      </div>

      <div style="display:flex;gap:10px;margin:8px 0 6px">
        <button class="btn" id="ig-generate">Üret</button>
        <button class="btn secondary" id="ig-clear">Temizle</button>
      </div>

      <div id="ig-status" class="muted" style="min-height:22px"></div>

      <div class="muted" style="margin-top:12px">Sonuçlar</div>
      <div id="ig-grid"></div>
    </section>

    <!-- Lightbox -->
    <div id="ig-lightbox" class="lb-backdrop" aria-hidden="true">
      <div class="lb-inner"><img alt="preview"/></div>
      <div class="lb-actions">
        <button id="ig-lbDL" class="lb-btn">İndir</button>
        <button id="ig-lbClose" class="lb-btn">Kapat (Esc)</button>
      </div>
    </div>
  `;

  // ---- sayfa içi stiller ----------------------------------------------------
  const style = document.createElement("style");
  style.textContent = `
    #ig-grid{display:grid;gap:10px;grid-template-columns:1fr}
    @media (min-width:900px){#ig-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .ig-img{width:100%;height:auto;object-fit:contain;display:block;border-radius:12px}

    #ig-lightbox{position:fixed;inset:0;background:#000c;display:none;place-items:center;z-index:9999}
    #ig-lightbox.show{display:grid}
    #ig-lightbox .lb-inner{max-width:min(94vw,1400px);max-height:92vh}
    #ig-lightbox .lb-inner img{width:100%;height:auto;object-fit:contain;border-radius:12px;box-shadow:0 10px 40px #0008}
    #ig-lightbox .lb-actions{position:fixed;right:16px;bottom:16px;display:flex;gap:8px}
    #ig-lightbox .lb-btn{padding:10px 14px;border-radius:10px;border:1px solid #fff3;background:#ffffff22;color:#fff;cursor:pointer}
  `;
  document.head.appendChild(style);

  // ---- Menu toggle ----------------------------------------------------------
  const menuButton = document.getElementById("menuButton");
  const sidebar = document.getElementById("sidebar");
  menuButton.addEventListener("click", () => sidebar.classList.toggle("open"));

  // ---- DOM refs -------------------------------------------------------------
  const promptEl = document.getElementById("ig-prompt");
  const countSel = document.getElementById("ig-count");
  const genBtn   = document.getElementById("ig-generate");
  const clearBtn = document.getElementById("ig-clear");
  const statusEl = document.getElementById("ig-status");
  const grid     = document.getElementById("ig-grid");

  // Lightbox refs
  const lightbox = document.getElementById("ig-lightbox");
  const lbImg    = lightbox.querySelector("img");
  const lbDL     = document.getElementById("ig-lbDL");
  const lbClose  = document.getElementById("ig-lbClose");

  const setStatus = (t="") => { statusEl.textContent = t; };
  const safeJson  = async (r) => { try { return await r.json(); } catch { return null; } };

  const card = (src, i) => `
    <div style="border:1px solid rgba(0,0,0,.08);border-radius:14px;overflow:hidden;background:#fff1">
      <img src="${src}" class="ig-img" alt="generated-${i}" data-full="${src}" />
      <div style="display:flex;gap:8px;padding:8px;flex-wrap:wrap">
        <button class="btn sm" data-view="${i}">Tam Gör</button>
        <a class="btn sm secondary" href="${src}" download="gen-${i+1}.png">İndir</a>
        <button class="btn sm secondary" data-copy="${i}">Kopyala</button>
      </div>
    </div>`;

  clearBtn.addEventListener("click", () => {
    promptEl.value = "";
    grid.innerHTML = "";
    setStatus("");
  });

  grid.addEventListener("click", async (e) => {
    const copyBtn = e.target.closest("button[data-copy]");
    const viewBtn = e.target.closest("button[data-view]");
    const imgEl   = e.target.closest("img.ig-img");

    if (copyBtn) {
      const idx = +copyBtn.getAttribute("data-copy");
      const img = grid.querySelectorAll("img.ig-img")[idx];
      if (!img) return;
      try {
        const blob = await (await fetch(img.src)).blob();
        if (window.ClipboardItem) {
          await navigator.clipboard.write([ new ClipboardItem({ [blob.type]: blob }) ]);
          setStatus("Panoya kopyalandı ✅");
        } else {
          const a = document.createElement("a");
          a.href = img.src; a.download = "image.png"; a.click();
          setStatus("Kopyalama desteklenmiyor, indirme başlatıldı.");
        }
      } catch { setStatus("Kopyalama desteklenmiyor (HTTPS + izin gerekebilir)."); }
      return;
    }

    const src = viewBtn
      ? grid.querySelectorAll("img.ig-img")[+viewBtn.getAttribute("data-view")]?.dataset.full
      : imgEl?.dataset.full;
    if (!src) return;

    lbImg.src = src;
    lbDL.onclick = () => { const a = document.createElement("a"); a.href = src; a.download = "generated.png"; a.click(); };
    lightbox.classList.add("show");
  });

  // ---- Görsel üret (4.0 -> 3.0 fallback) -----------------------------------
  genBtn.addEventListener("click", async () => {
    const prompt = (promptEl.value || "").trim();
    if (!prompt) { setStatus("Prompt gerekli."); return; }

    const count = Math.min(Math.max(parseInt(countSel.value || "1", 10) || 1, 1), 4);

    setStatus("Üretiliyor… (ilk çağrılarda model ısınması nedeniyle biraz sürebilir)");
    genBtn.disabled = true;

    const callGen = async (model) => {
      const body = model ? { prompt, n: count, model } : { prompt, n: count };
      const resp = await fetch(`${backendBaseUrl}/api/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const e = await safeJson(resp);
        const err = new Error(e?.message || e?.error || `HTTP ${resp.status}`);
        err.code = e?.error?.code || e?.code || resp.status;
        err.raw = e;
        throw err;
      }
      return resp.json();
    };

    try {
      // 1) 4.0 (backend zaten default 4.0, ama açıkça gönderiyoruz)
      let data;
      try {
        data = await callGen("imagen-4.0-generate-001");
      } catch (err) {
        // 2) Model bulunamadıysa/uygun değilse 3.0'a düş
        const msg = (err.message || "").toLowerCase();
        if (String(err.code).includes("404") || msg.includes("not_found") || msg.includes("not found") || msg.includes("not supported")) {
          setStatus("4.0 desteklenmiyor gibi görünüyor, 3.0 ile tekrar deneniyor…");
          data = await callGen("imagen-3.0-generate-001");
        } else {
          throw err;
        }
      }

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

  // ---- Lightbox kapama ------------------------------------------------------
  lbClose.addEventListener("click", () => lightbox.classList.remove("show"));
  lightbox.addEventListener("click", (e) => { if (e.target === lightbox) lightbox.classList.remove("show"); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") lightbox.classList.remove("show"); });
}
