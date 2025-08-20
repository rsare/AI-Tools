export async function run({ backendBaseUrl }) {
    const app = document.getElementById("app");
    if (!app) return;

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
    </div>
        <h1 class="text-4xl font-bold text-white mb-8 text-center">Video Oluşturucu</h1>
        <div class="space-y-6">
            <div>
                <label for="prompt" class="block text-2xl font-bold text-white mb-3">
                    Video senaryosunu giriniz:
                </label>
                <textarea id="prompt" rows="10" a
                    class="w-full h-full rounded-2xl border-purple-700 shadow-lg 
                            focus:border-purple-400 focus:ring-purple-400 p-6 text-lg bg-purple-800 
                            text-white placeholder-purple-300 resize-none"
                    placeholder="Örneğin: Uzayda geçen bir bilim kurgu sahnesi."></textarea>
            </div>

            <button id="generateBtn" 
                class="w-full bg-indigo-600 text-white text-xl font-bold py-4 px-8 rounded-2xl 
                        transition-all duration-300 hover:bg-indigo-500 hover:shadow-xl transform hover:-translate-y-1">
                Video Oluştur
            </button>

            <div id="loading" class="hidden text-center text-white text-xl font-medium mt-4">
                Video oluşturuluyor, lütfen bekleyin...
            </div>

            <div id="output" class="hidden mt-6 p-6 bg-gray-900 rounded-3xl shadow-2xl">
                <h2 class="text-3xl font-bold text-white mb-4">Oluşturulan Video</h2>
                <video id="videoPlayer" controls class="w-full rounded-xl"></video>
            </div>
        </div>
    `;

     // --- Başlangıç --- Hamburger Menü 
    const menuButton = app.querySelector('#menuButton');
    const sidebar = app.querySelector('#sidebar');
    menuButton.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    const promptInput = document.getElementById("prompt");
    const generateBtn = document.getElementById("generateBtn");
    const loadingDiv = document.getElementById("loading");
    const outputDiv = document.getElementById("output");
    const videoPlayer = document.getElementById("videoPlayer");

    generateBtn.addEventListener("click", async () => {
        const prompt = promptInput.value;
        if (!prompt) {
            alert("Lütfen bir senaryo girin.");
            return;
        }

        loadingDiv.classList.remove("hidden");
        outputDiv.classList.add("hidden");
        
        try {
            const response = await fetch(`${backendBaseUrl}/api/video-generator`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt })
            });

            if (!response.ok) {
                let errorMessage = "Bilinmeyen bir hata oluştu.";
                try {
                    const error = await response.json();
                    errorMessage = error.error || error.detail.message || errorMessage;
                } catch (e) {
                    errorMessage = await response.text();
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            const videoUrl = data.videoUrl;

            if (videoUrl) {
                videoPlayer.src = videoUrl;
                videoPlayer.load();
                outputDiv.classList.remove("hidden");
            } else {
                throw new Error("API'den geçerli bir video URL'si gelmedi.");
            }

        } catch (error) {
            console.error("Hata:", error);
            outputDiv.innerHTML = `
                <h2 class="text-3xl font-bold text-white mb-4">Hata</h2>
                <p class="text-red-500">Hata: ${error.message}</p>
            `;
            outputDiv.classList.remove("hidden");
        } finally {
            loadingDiv.classList.add("hidden");
        }
    });
}
