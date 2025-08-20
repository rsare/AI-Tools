export function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <style>
      /* ---- scoped (ifix-*) styles: çakışma yapmaz ---- */
      .ifix-shell{display:grid; place-items:center; padding:24px 16px;}
      .ifix-card{
        width:min(760px,100%); border-radius:22px;
        background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.03));
        border:1px solid rgba(255,255,255,.10);
        box-shadow:0 18px 50px rgba(0,0,0,.35);
        padding:32px 20px; color:#e9eefc;
        backdrop-filter:blur(8px);
      }
      .ifix-title{font-size:clamp(26px,4vw,38px); text-align:center; margin:0 0 6px; font-weight:800;}
      .ifix-sub{color:#aab3cf; text-align:center; margin:0 0 22px;}
      .ifix-drop{border:2px dashed rgba(255,255,255,.18); border-radius:16px; padding:12px; transition:.2s;}
      .ifix-drop.drag{border-color:#22d3ee; background:rgba(34,211,238,.06)}
      .ifix-row{
        display:flex; align-items:center; gap:12px;
        background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.1);
        border-radius:12px; padding:10px 12px;
      }
      .ifix-fake{display:inline-block; padding:8px 12px; border-radius:10px;
        background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.18); cursor:pointer; white-space:nowrap;}
      .ifix-name{color:#aab3cf; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
      .ifix-hint{margin:12px 0 20px; color:#aab3cf; text-align:center; font-size:14px}
      .ifix-btn{
        width:100%; border:1px solid rgba(255,255,255,.1);
        background-image:linear-gradient(135deg,#3b82f6,#7c3aed);
        color:#fff; font-weight:800; letter-spacing:.3px;
        padding:14px 20px; border-radius:14px; cursor:pointer;
        box-shadow:0 10px 24px rgba(59,130,246,.35);
        transition:transform .08s, box-shadow .2s;
      }
      .ifix-btn:hover{transform:translateY(-1px); box-shadow:0 14px 34px rgba(59,130,246,.45)}
      .ifix-out{
        margin-top:20px; min-height:160px; display:grid; place-items:center;
        background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.1);
        border-radius:14px; color:#aab3cf; overflow:auto; padding:12px;
      }
      .ifix-out img{max-width:100%; height:auto; border-radius:12px; display:block}
      /* file input'u gizli ama erişilebilir bırak */
      #imageInput{position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0);}

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

          background: #010f23ff;
          box-shadow: 2px 0 5px rgba(0,0,0,0.5);
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
          border-bottom: 1px solid #011028ff;
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
    </div>

    <div class="ifix-shell">
      <section class="ifix-card" aria-labelledby="ifix-title">
        <h2 id="ifix-title" class="ifix-title">Image Fixer</h2>
        <p class="ifix-sub">PNG/JPEG ve <strong>maksimum 500 KB</strong> yükleyin.</p>

        <div class="ifix-drop" id="ifixDrop">
          <label class="ifix-row" for="imageInput">
            <span class="ifix-fake">Dosya Seç</span>
            <span class="ifix-name" id="ifixName">Dosya seçilmedi</span>
            <input type="file" id="imageInput" accept="image/png,image/jpeg">
          </label>
        </div>

        <p class="ifix-hint">İpucu: Çok büyük dosyaları yüklemekte zorlanırsanız görseli sıkıştırmayı deneyin.</p>

        <button id="go" class="ifix-btn">Görseli Gönder</button>
        <div id="out" class="ifix-out">Çıktı burada görünecek.</div>
      </section>
    </div>
  `;

  // Hamburger menü JavaScript'i
  const menuButton = app.querySelector('#menuButton');
  const sidebar = app.querySelector('#sidebar');
  menuButton.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Diğer kodlar aşağıda devam ediyor
  const dz  = app.querySelector('#ifixDrop');
  const inp = app.querySelector('#imageInput');
  const nm  = app.querySelector('#ifixName');

  // dosya adı yansıt
  inp.addEventListener('change', () => {
    nm.textContent = inp.files?.[0]?.name || 'Dosya seçilmedi';
  });

  // drag & drop
  ['dragenter','dragover'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag'); })
  );
  ['dragleave','drop'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag'); })
  );
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (!['image/png','image/jpeg'].includes(f.type)) { alert('Sadece PNG/JPEG kabul edilir.'); return; }
    const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files;
    nm.textContent = f.name;
  });

  document.getElementById("go").onclick = async () => {
    const f = document.getElementById("imageInput").files[0];
    const out = document.getElementById("out");
    if (!f) return alert("Görsel seçin.");
    if (!["image/png", "image/jpeg"].includes(f.type)) return alert("Sadece PNG/JPEG.");
    if (f.size > 512000) return alert("En fazla 500 KB.");
    out.textContent = "Yükleniyor...";
    const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    try {
      console.log("POST /api/fix-image", backendBaseUrl);
      const r = await fetch(`${backendBaseUrl}/api/fix-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: base64 })
      });

      if (!r.ok) {
        const errorText = await r.text();
        throw new Error(`Sunucu hatası: ${r.status} ${r.statusText || ''} - ${errorText}`);
      }

      const data = await r.json();
      out.innerHTML = data.output ? `<img src="${data.output}" width="320">` : "Çıktı yok.";
    }  catch (e) {
      out.textContent = "Hata: " + e.message;
    }
  };
}
