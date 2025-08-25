// frontend/js/apis/voiceGenerator.js
export async function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  if (!app) return;

  // Helpers
  const base64ToArrayBuffer = (base64) => {
    const bin = atob(base64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  };

  const pcmToWav = (pcmData, sampleRate) => {
    const pcm16 = new Int16Array(pcmData);
    const numChannels = 1;
    const bitsPerSample = 16;

    const wavBuffer = new ArrayBuffer(44 + pcm16.length * 2);
    const view = new DataView(wavBuffer);
    let pos = 0;

    const writeString = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); };

    // RIFF header
    writeString("RIFF");
    view.setUint32(pos, 36 + pcm16.length * 2, true); pos += 4;
    writeString("WAVE");

    // fmt chunk
    writeString("fmt ");                   // subchunk1 id
    view.setUint32(pos, 16, true); pos += 4; // subchunk1 size
    view.setUint16(pos, 1, true); pos += 2;  // audio format (PCM)
    view.setUint16(pos, numChannels, true); pos += 2;
    view.setUint32(pos, sampleRate, true); pos += 4;
    view.setUint32(pos, sampleRate * numChannels * (bitsPerSample / 8), true); pos += 4; // byte rate
    view.setUint16(pos, numChannels * (bitsPerSample / 8), true); pos += 2; // block align
    view.setUint16(pos, bitsPerSample, true); pos += 2;

    // data chunk
    writeString("data");
    view.setUint32(pos, pcm16.length * 2, true); pos += 4;

    // samples
    for (let i = 0; i < pcm16.length; i++, pos += 2) view.setInt16(pos, pcm16[i], true);

    return new Blob([view], { type: "audio/wav" });
  };

  // UI
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

    <section class="panel" aria-labelledby="vg-title">
      <h2 id="vg-title" class="h2 title">Ses Oluşturucu</h2>

      <label for="vg-prompt" class="muted" style="display:block;margin:10px 0 6px">Metin giriniz:</label>
      <textarea id="vg-prompt" rows="6" class="textarea"
        placeholder="Lütfen seslendirmek istediğiniz metni yazın..."></textarea>

      <button id="vg-generate" class="btn" style="margin-top:12px">Ses Oluştur</button>

      <div id="vg-loading" class="muted hidden" style="margin-top:10px">Ses oluşturuluyor…</div>

      <div id="vg-output" class="output hidden">
        <h3 class="h2" style="margin:0 0 10px">Oluşturulan Ses</h3>
        <audio id="vg-audio" controls class="w-full"></audio>
      </div>

      <div id="vg-error" class="output hidden"
           style="background:#fff3f3;border-color:#fecaca;color:#7f1d1d">
        <strong>Hata:</strong> <span id="vg-error-text"></span>
      </div>
    </section>
  `;

  // Sidebar toggle
  const menuButton = app.querySelector("#menuButton");
  const sidebar = app.querySelector("#sidebar");
  menuButton?.addEventListener("click", () => sidebar?.classList.toggle("open"));

  // Elms
  const promptEl = document.getElementById("vg-prompt");
  const generateBtn = document.getElementById("vg-generate");
  const loadingEl = document.getElementById("vg-loading");
  const outputEl = document.getElementById("vg-output");
  const audioEl = document.getElementById("vg-audio");
  const errorBox = document.getElementById("vg-error");
  const errorText = document.getElementById("vg-error-text");

  // Actions
  generateBtn.addEventListener("click", async () => {
    const text = (promptEl.value || "").trim();
    if (!text) { alert("Lütfen seslendirmek için bir metin girin."); return; }

    // reset state
    loadingEl.classList.remove("hidden");
    outputEl.classList.add("hidden");
    errorBox.classList.add("hidden");
    audioEl.removeAttribute("src");

    try {
      // TODO: anahtarı frontende gömmek yerine backend/proxy kullanın
      const apiKey = "AIzaSyAh07oGj1xoBMGAn106Raqr1iAMPsHDZsU";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

      const payload = {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
          }
        },
        model: "gemini-2.5-flash-preview-tts"
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          (data && (data.error?.message || data.error)) ||
          `API hatası: ${resp.status} ${resp.statusText}`
        );
      }

      const inline = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const audioB64 = inline?.data;
      const mimeType = inline?.mimeType || "audio/pcm; rate=24000";
      const rateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;

      if (!audioB64) throw new Error("API'den geçerli bir ses verisi gelmedi.");

      const wavBlob = pcmToWav(base64ToArrayBuffer(audioB64), sampleRate);
      const objectUrl = URL.createObjectURL(wavBlob);
      audioEl.src = objectUrl;
      audioEl.load();

      outputEl.classList.remove("hidden");
    } catch (err) {
      errorText.textContent = err?.message || String(err);
      errorBox.classList.remove("hidden");
    } finally {
      loadingEl.classList.add("hidden");
    }
  });
}
