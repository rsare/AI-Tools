// Bu dosya, `main.js` tarafından dinamik olarak yüklenecek
export async function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  if (!app) return;

  // Arayüzü oluştur
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
          background: #1f2937;
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
          border-bottom: 1px solid #374151;
          transition: background-color 0.2s;
      }
      .sidebar a:hover {
          background-color: #374151;
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
    <style>
      .tg-wrap { max-width: 720px; margin: 0 auto; }
      .tg-label { display:block; font-weight:600; color:#374151; margin-bottom:.75rem }
      .tg-output {
        display:none;
        margin-top:1.5rem; padding:1.25rem;
        background:#f5f7fb; border-radius:14px; color:#1f2937;
        line-height:1.8;
      }
      .tg-output.justified p {
        text-align: justify;
        text-justify: inter-word;
        hyphens: auto; -webkit-hyphens:auto; -ms-hyphens:auto;
        margin: 0 0 1rem;
        text-indent: 1.2em;
      }
      .tg-output.justified h3 { margin:1rem 0 .5rem; font-weight:700 }
      .tg-loading { display:none; text-align:center; color:#2563eb; margin-top:.75rem }
    </style>

    <h1 class="text-4xl font-bold text-gray-800 mb-8 text-center">Metin Oluşturucu</h1>

    <div class="tg-wrap space-y-6">
      <div>
        <label for="prompt" class="tg-label text-lg">
          Metin üretmek istediğiniz konuyu giriniz:
        </label>
        <textarea id="prompt" rows="5"
          class="mt-1 block w-full rounded-xl border-gray-300 shadow-sm
                focus:border-blue-500 focus:ring-blue-500 p-4 text-lg resize-none"
          placeholder="Örneğin: Yapay zekâ ile ilgili bir bilgilendirme yazısı..."></textarea>
      </div>

      <button id="generateBtn"
        class="w-full bg-blue-600 text-white text-xl font-bold py-4 px-8 rounded-xl
              transition-all duration-300 hover:bg-blue-700 hover:shadow-xl transform hover:-translate-y-1">
        Metin Oluştur
      </button>

      <div id="loading" class="tg-loading">Yükleniyor...</div>
      <div id="output" class="tg-output justified"></div>
    </div>
    
  `;

   // --- Başlangıç --- Hamburger Menü JavaScript'i buraya eklenecek
    const menuButton = app.querySelector('#menuButton');
    const sidebar = app.querySelector('#sidebar');
    menuButton.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

  

  const promptInput = document.getElementById("prompt");
  const generateBtn = document.getElementById("generateBtn");
  const loadingDiv = document.getElementById("loading");
  const outputDiv = document.getElementById("output");

  function formatOutput(text) {
    return text
      .split(/\n{2,}|\r\n\r\n/) // 2 veya daha fazla yeni satır
      .map(p => `<p>${p.trim()}</p>`)
      .join("");
  }

  generateBtn.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert("Lütfen bir istek girin.");
      return;
    }

    loadingDiv.style.display = "block";
    outputDiv.style.display = "none";
    outputDiv.innerHTML = "";

    try {
      const response = await fetch(`${backendBaseUrl}/api/text-generator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "API çağrısı başarısız oldu.");
      }

      const data = await response.json();
      outputDiv.innerHTML = formatOutput(data.output);
      outputDiv.style.display = "block";

    } catch (error) {
      console.error("Hata:", error);
      outputDiv.innerHTML = `<p style="color:red;">Hata: ${error.message}</p>`;
      outputDiv.style.display = "block";
    } finally {
      loadingDiv.style.display = "none";
    }
  });
}
