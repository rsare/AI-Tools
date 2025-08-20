// frontend/js/apis/imageGenerator.js
// Google Imagen (via backend) – Prompt -> Çoklu görsel üret – Önizleme & indirme

export async function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
  <div class="ifix-shell">
    <div class="ifix-card">
      <h1 style="font-size:1.6rem; margin:0 0 8px 0;">🎨 Image Generator</h1>
      <div class="ifix-meta">Google Imagen ile prompt'tan görsel üretir. Anahtarın backend'te saklanır.</div>

      <div class="ifix-sep"></div>

      <div class="ifix-grid">
        <div>
          <label class="ifix-meta" for="prompt">Prompt</label>
          <textarea id="prompt" rows="4" placeholder="Örn: A cozy cafe interior with warm lights, cinematic look"
            style="width:100%; padding:12px; border-radius:12px; background:#0f0f0f; color:#fff; border:1px solid rgba(255,255,255,.16);"></textarea>

          <div class="ifix-row" style="margin-top:10px">
            <div style="flex:1">
              <label class="ifix-meta" for="modelSel">Model</label>
              <select id="modelSel" style="width:100%; padding:10px; border-radius:10px; background:#0f0f0f; color:#fff; border:1px solid rgba(255,255,255,.16);">
                <option value="imagen-4.0-generate-001" selected>Imagen 4.0</option>
                <option value="imagen-3.0-generate-001">Imagen 3.0</option>
              </select>
            </div>
            <div>
              <label class="ifix-meta" for="countSel">Adet</label>
              <select id="countSel" style="padding:10px; border-radius:10px; background:#0f0f0f; color:#fff; border:1px solid rgba(255,255,255,.16);">
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
          <div id="grid" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:10px;"></div>
        </div>
      </div>
    </div>
  </div>`;

  const promptEl = document.getElementById("prompt");
  const modelSel = document.getElementById("modelSel");
  const countSel = document.getElementById("countSel");
  const genBtn = document.getElementById("genBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const grid = document.getElementById("grid");

  const setStatus = (t) => (statusEl.textContent = t || "");
  const card = (src, i) => `
    <div style="border:1px solid rgba(255,255,255,.12); border-radius:14px; overflow:hidden;">
      <img src="${src}" class="ifix-img" alt="generated-${i}" />
      <div style="display:flex; gap:8px; padding:8px;">
        <a class="ifix-btn" href="${src}" download="gen-${i+1}.png">İndir</a>
        <button class="ifix-btn" data-copy="${i}">Kopyala</button>
      </div>
    </div>`;

  clearBtn.addEventListener("click", () => {
    grid.innerHTML = "";
    setStatus("");
  });

  grid.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-copy]");
    if (!btn) return;
    const idx = parseInt(btn.getAttribute("data-copy"), 10);
    const img = grid.querySelectorAll("img")[idx];
    if (!img) return;
    try {
      const blob = await (await fetch(img.src)).blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      setStatus("Panoya kopyalandı ✅");
    } catch (err) {
      console.error(err);
      setStatus("Kopyalama desteklenmiyor (HTTPS + izin gerekebilir).");
    }
  });

  genBtn.addEventListener("click", async () => {
    const prompt = (promptEl.value || "").trim();
    if (!prompt) { setStatus("Prompt gerekli."); return; }

    setStatus("Üretiliyor… (ilk çağrılarda model ısınması nedeniyle biraz sürebilir)");
    genBtn.disabled = true;

    try {
      const resp = await fetch(`${backendBaseUrl}/api/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          n: parseInt(countSel.value, 10) || 1,
          model: modelSel.value
        }),
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

  async function safeJson(r) { try { return await r.json(); } catch { return null; } }
}
