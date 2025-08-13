// js/textGenerator.js
export function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <h2>Metin Üretme</h2>
    <p>İstediğiniz konuda metin üretin.</p>
    <textarea id="promptInput" rows="4" placeholder="Bir prompt girin..."></textarea>
    <button id="go">Metin Üret</button>
    <div id="out"></div>
  `;

  document.getElementById("go").onclick = async () => {
    const prompt = document.getElementById("promptInput").value;
    const out = document.getElementById("out");
    if (!prompt) return alert("Lütfen bir metin girin.");

    out.textContent = "Metin üretiliyor...";
    out.classList.add('loading');

    try {
      // Relatif çağrı: sayfa 4001’den yüklendiği için otomatik 4001’e gider
      const r = await fetch(`/api/text-generator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const raw = await r.text();              // önce text olarak al
      let data;
      try { data = JSON.parse(raw); }          // sonra JSON’a çevir
      catch {
        throw new Error(`Sunucudan JSON yerine şunu aldım (status ${r.status}): ${raw.slice(0,200)}`);
      }

      if (!r.ok) {
        throw new Error(data.detail || data.error || `Sunucu hatası (${r.status})`);
      }

      out.classList.remove('loading');
      out.textContent = data.output || "Çıktı yok.";
    } catch (e) {
      out.classList.remove('loading');
      out.textContent = "Hata: " + e.message;
    }
  };
}
