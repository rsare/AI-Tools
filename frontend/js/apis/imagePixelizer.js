// frontend/js/apis/facePixelizer.js
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
      <a href="/api.html?tool=videoGenerator">Video Generator</a>
      <a href="/api.html?tool=imageGenerator">Image Generator</a>
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

    <section class="panel" aria-labelledby="fp-title">
      <h2 id="fp-title" class="h2 title">Image Pixelizer</h2>
      <p class="muted">Yüzleri bulanıklaştırın veya pikselleyin. PNG/JPEG yükleyin.</p>

      <div id="dropArea" class="ifix-drop fp-drop">
        <label class="muted" for="imageInput" style="display:block;margin-bottom:8px">
          Görsel seçin ya da sürükleyip bırakın (PNG/JPEG)
        </label>
        <input type="file" id="imageInput" accept="image/png,image/jpeg" />
      </div>

      <div class="fp-controls">
        <div class="fp-inline">
          <label class="muted" for="modeSel">Mod</label>
          <select id="modeSel" class="select">
            <option value="blur" selected>Blur</option>
            <option value="pixelate">Pixelate</option>
          </select>
        </div>

        <div class="fp-inline">
          <label class="muted" for="levelRange">Seviye</label>
          <input id="levelRange" type="range" min="4" max="60" value="16" />
          <span id="levelVal" class="muted">16</span>
        </div>
      </div>

      <div class="fp-actions">
        <button id="goBtn" class="btn">Uygula</button>
        <button id="clearBtn" class="btn secondary">Temizle</button>
        <button id="jumpPreview" class="btn secondary hidden" type="button">↓ Önizlemeye in</button>
      </div>

      <div id="status" class="muted" style="margin-top:8px"></div>

      <div id="previewWrap" class="output hidden" style="margin-top:14px">
        <h3 class="h2" style="margin:0 0 10px">Önizleme</h3>
        <div class="fp-grid">
          <div>
            <div class="muted" style="margin-bottom:6px">Orijinal</div>
            <img id="origImg" alt="original" class="fp-img" />
          </div>
          <div>
            <div class="muted" style="margin-bottom:6px">Sonuç</div>
            <img id="outImg" alt="result" class="fp-img" />
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap">
              <a id="dlBtn" class="btn" download="pixelized.png">İndir</a>
            </div>
          </div>
        </div>
      </div>
    </section>

    <button id="toTop" class="btn sm backtop hidden" aria-label="Başa dön">▲ Başa Dön</button>

    <style>
      /* Drop area */
      .fp-drop{margin:10px 0 12px; padding:12px; border:1px dashed #cbd5e1; border-radius:12px;}
      .fp-drop.drag{border-color:#2563eb; background:rgba(37,99,235,.05);}
      /* Controls */
      .fp-controls{display:flex; gap:14px; flex-wrap:wrap; align-items:center}
      .fp-inline{display:flex; gap:8px; align-items:center}
      .fp-actions{display:flex; gap:10px; flex-wrap:wrap; margin-top:12px}
      /* Preview grid */
      .fp-grid{display:grid; gap:12px; grid-template-columns:1fr}
      @media(min-width:900px){ .fp-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
      .fp-img{max-width:100%; height:auto; border-radius:12px; display:block}
    </style>
  `;

  // ----------------- Sidebar toggle -----------------
  const menuButton = app.querySelector('#menuButton');
  const sidebar = app.querySelector('#sidebar');
  menuButton?.addEventListener('click', () => sidebar?.classList.toggle('open'));

  // ----------------- Helpers (scroll) ----------------
  const scrollRoot = () => document.scrollingElement || document.documentElement || document.body;
  const scrollToTop = () => scrollRoot().scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToEl = (el, offset = 0) => {
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
    scrollRoot().scrollTo({ top, behavior: 'smooth' });
  };
  const nextTick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Floating "Başa Dön" görünürlüğü
  const toTopBtn = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) toTopBtn.classList.remove('hidden');
    else toTopBtn.classList.add('hidden');
  });
  toTopBtn.addEventListener('click', scrollToTop);

  // ----------------- DOM refs -----------------------
  const dropArea = document.getElementById("dropArea");
  const input = document.getElementById("imageInput");
  const modeSel = document.getElementById("modeSel");
  const levelRange = document.getElementById("levelRange");
  const levelVal = document.getElementById("levelVal");
  const goBtn = document.getElementById("goBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusEl = document.getElementById("status");
  const previewWrap = document.getElementById("previewWrap");
  const origImg = document.getElementById("origImg");
  const outImg = document.getElementById("outImg");
  const dlBtn = document.getElementById("dlBtn");
  const jumpPreview = document.getElementById("jumpPreview");

  levelRange.addEventListener("input", () => (levelVal.textContent = levelRange.value));

  // ----------------- Drag & Drop --------------------
  ["dragenter","dragover"].forEach(ev =>
    dropArea.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      dropArea.classList.add("drag");
    })
  );
  ["dragleave","drop"].forEach(ev =>
    dropArea.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      dropArea.classList.remove("drag");
    })
  );
  dropArea.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    // Güvenli input.files set
    try {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.files = dt.files;
    } catch {
      // bazı tarayıcılar izin veriyor:
      try { input.files = e.dataTransfer.files; } catch {}
    }
  });

  const setStatus = (t = "") => (statusEl.textContent = t);

  clearBtn.addEventListener("click", () => {
    input.value = "";
    previewWrap.classList.add("hidden");
    origImg.src = ""; outImg.src = ""; dlBtn.removeAttribute('href');
    setStatus("");
    jumpPreview.classList.add('hidden');
    scrollToTop();
  });

  jumpPreview.addEventListener('click', () => scrollToEl(previewWrap, 10));

  // ----------------- Process ------------------------
  goBtn.addEventListener("click", async () => {
    const f = input.files?.[0];
    if (!f) { alert("Lütfen bir görsel seçin."); return; }
    if (!["image/png","image/jpeg"].includes(f.type)) { alert("Sadece PNG/JPEG kabul edilir."); return; }

    setStatus("İşleniyor…");
    goBtn.disabled = true;

    try {
      const fd = new FormData();
      fd.append("image", f);
      fd.append("mode", modeSel.value);       
      fd.append("level", levelRange.value);   // 4–60

      const resp = await fetch(`${backendBaseUrl}/api/image-pixelize`, { method: "POST", body: fd });

      if (!resp.ok) {
        let msg = "İşlem başarısız.";
        try { const j = await resp.json(); msg = j.message || j.error || msg; } catch {}
        throw new Error(msg);
      }

      const data = await resp.json();
      const out = data.output;
      const origUrl = URL.createObjectURL(f);

      origImg.src = origUrl;
      outImg.src = out;
      dlBtn.href = out;

      previewWrap.classList.remove("hidden");
      setStatus(data.via === "proxy" ? "Tamam ✓ (proxy)" : "Tamam ✓ (yerel işlem)");
      jumpPreview.classList.remove('hidden');

      // Önizlemeye pürüzsüz in
      await nextTick();
      scrollToEl(previewWrap, 10);
    } catch (e) {
      setStatus("Hata: " + e.message);
    } finally {
      goBtn.disabled = false;
    }
  });
}
