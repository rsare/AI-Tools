// main.js

// Tüm araçların modüllerini tutan bir obje
// Modülleri dinamik olarak import edeceğimiz için bu objeyi kullanmıyoruz.
// import { run as runImageFixer } from "./imageFixer.js";
// import { run as runTextGenerator } from "./textGenerator.js";

try {
  const me = await fetch("/auth/me");
  if (!me.ok) location.href = "/auth.html";
} catch (_) {
  location.href = "/auth.html";
}

// URL parametrelerinden hangi aracın çağrılacağını al
const urlParams = new URLSearchParams(window.location.search);
const toolName = urlParams.get('tool');

// Backend'in temel URL'sini belirle (aynı domain)
const backendBaseUrl = window.location.origin;

// app elementini seç
const app = document.getElementById("app");

// Eğer bir araç adı varsa, ilgili modülü dinamik olarak yükle
if (toolName) {
  // Modül yolunu doğru şekilde belirtin (js/ klasöründe ise)
  import(`./apis/${toolName}.js`)
    .then(module => {
      // Modül yüklendiğinde, run fonksiyonunu çağır ve backendBaseUrl'yi geçir
      module.run({ backendBaseUrl });
    })
    .catch(error => {
      // Modül bulunamazsa veya yüklenirken hata olursa
      console.error("Araç modülü yüklenirken hata oluştu:", error);
      if (app) {
        app.innerHTML = `<h1>Hata: '${toolName}' aracı bulunamadı.</h1>`;
      }
    });
} else if (app) {
  // Eğer URL'de araç adı yoksa
  app.innerHTML = "<h1>Lütfen ana sayfadan bir araç seçin.</h1>";
}
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tool = urlParams.get("tool");

    const appContainer = document.getElementById("app");
    if (!appContainer) return;

    if (!tool) {
        appContainer.innerHTML = `
            <div class="text-center">
                <h1 class="text-4xl font-bold text-white mb-4">Lütfen bir araç seçin.</h1>
                <a href="/" class="text-blue-500 hover:underline">Ana Sayfaya Dön</a>
            </div>
        `;
        return;
    }

    try {
        const module = await import(`./apis/${tool}.js`);
        if (module && typeof module.run === "function") {
            await module.run({ backendBaseUrl });
        } else {
            throw new Error(`Araç modülü "${tool}" geçerli bir "run" fonksiyonu içermiyor.`);
        }
    } catch (e) {
        console.error("Araç modülü yüklenirken hata oluştu:", e);
        appContainer.innerHTML = `
            <div class="text-center p-8 bg-red-800 bg-opacity-70 rounded-2xl shadow-xl">
                <h1 class="text-3xl font-bold text-white mb-4">Hata: '${tool}' aracı bulunamadı.</h1>
                <p class="text-red-300 mb-6">Lütfen dosya adını ve yolunu kontrol edin.</p>
                <a href="/" class="text-blue-300 hover:underline">Ana Sayfaya Dön</a>
            </div>
        `;
    }
});

