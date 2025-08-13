export function run({ backendBaseUrl }) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <h2>Image Fixer</h2>
    <p>PNG/JPEG ve max 500 KB yükleyin.</p>
    <input type="file" id="imageInput" accept="image/png,image/jpeg">
    <button id="go">Görseli Gönder</button>
    <div id="out" style="margin-top:1rem"></div>
  `;
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
      const r = await fetch(`${backendBaseUrl}/api/fix-image`, { // backendBaseUrl kullanılıyor
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image: base64 })
      });

      if (!r.ok) {
        // Hata durumunda sadece durumu veya hata mesajını yakalayın
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