// main.js

// Tüm araçların modüllerini tutan bir obje
// Modülleri dinamik olarak import edeceğimiz için bu objeyi kullanmıyoruz.
// import { run as runImageFixer } from "./imageFixer.js";
// import { run as runTextGenerator } from "./textGenerator.js";

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