export async function run({ backendBaseUrl }) {
    const app = document.getElementById("app");
    if (!app) return;

    // Helper function to convert Base64 to ArrayBuffer
    function base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // Helper function to convert PCM audio data to WAV format
    function pcmToWav(pcmData, sampleRate) {
        const pcm16 = new Int16Array(pcmData);
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        
        const wavBuffer = new ArrayBuffer(44 + pcmData.byteLength);
        const view = new DataView(wavBuffer);
        let pos = 0;

        function writeString(str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(pos++, str.charCodeAt(i));
            }
        }
        
        // RIFF header
        writeString('RIFF');
        view.setUint32(pos, 36 + pcmData.byteLength, true); pos += 4;
        writeString('WAVE');
        
        // fmt chunk
        writeString('fmt ');
        view.setUint32(pos, 16, true); pos += 4;
        view.setUint16(pos, 1, true); pos += 2;
        view.setUint16(pos, numChannels, true); pos += 2;
        view.setUint32(pos, sampleRate, true); pos += 4;
        view.setUint32(pos, byteRate, true); pos += 4;
        view.setUint16(pos, blockAlign, true); pos += 2;
        view.setUint16(pos, bitsPerSample, true); pos += 2;
        
        // data chunk
        writeString('data');
        view.setUint32(pos, pcmData.byteLength, true); pos += 4;
        
        // Write PCM data
        for (let i = 0; i < pcm16.length; i++, pos += 2) {
            view.setInt16(pos, pcm16[i], true);
        }
        
        return new Blob([view], { type: 'audio/wav' });
    }

    app.innerHTML = `
        <style>
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
        
        <h1 class="text-4xl font-bold text-white mb-8 text-center">Ses Oluşturucu</h1>
        <div class="space-y-6">
            <div>
                <label for="prompt" class="block text-2xl font-bold text-white mb-3">
                    Metin giriniz:
                </label>
                <textarea id="prompt" rows="10" 
                    class="w-full h-full rounded-2xl border-purple-700 shadow-lg 
                            focus:border-purple-400 focus:ring-purple-400 p-6 text-lg bg-purple-800 
                            text-white placeholder-purple-300 resize-none"
                    placeholder="Lütfen seslendirmek istediğiniz metni buraya girin..."></textarea>
            </div>
            
            <button id="generateBtn" 
                class="w-full bg-indigo-600 text-white text-xl font-bold py-4 px-8 rounded-2xl 
                        transition-all duration-300 hover:bg-indigo-500 hover:shadow-xl transform hover:-translate-y-1">
                Ses Oluştur
            </button>
            
            <div id="loading" class="hidden text-center text-white text-xl font-medium mt-4">
                Ses oluşturuluyor, lütfen bekleyin...
            </div>
            
            <div id="output" class="hidden mt-6 p-6 bg-gray-900 rounded-3xl shadow-2xl">
                <h2 class="text-3xl font-bold text-white mb-4">Oluşturulan Ses</h2>
                <audio id="audioPlayer" controls class="w-full"></audio>
            </div>
        </div>
    `;

    const menuButton = app.querySelector('#menuButton');
    const sidebar = app.querySelector('#sidebar');
    menuButton.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    const promptInput = document.getElementById("prompt");
    const generateBtn = document.getElementById("generateBtn");
    const loadingDiv = document.getElementById("loading");
    const outputDiv = document.getElementById("output");
    const audioPlayer = document.getElementById("audioPlayer");

    generateBtn.addEventListener("click", async () => {
        const text = promptInput.value;
        if (!text) {
            alert("Lütfen seslendirmek için bir metin girin.");
            return;
        }

        loadingDiv.classList.remove("hidden");
        outputDiv.classList.add("hidden");
        
        try {
            const apiKey = "AIzaSyAh07oGj1xoBMGAn106Raqr1iAMPsHDZsU"; // Canvas ortamından otomatik olarak sağlanacak
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;

            const payload = {
                contents: [{
                    parts: [{ text: text }]
                }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: "Kore" }
                        }
                    }
                },
                model: "gemini-2.5-flash-preview-tts"
            };

            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            
            const responseData = await response.json();

            if (!response.ok) {
                 const errorMessage = responseData.error || `API'den hata alındı: ${response.status} ${response.statusText}`;
                 throw new Error(errorMessage);
            }

            const audioData = responseData.candidates[0].content.parts[0].inlineData.data;
            const mimeType = responseData.candidates[0].content.parts[0].inlineData.mimeType;
            const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
            
            if (audioData) {
                const pcmData = base64ToArrayBuffer(audioData);
                const wavBlob = pcmToWav(pcmData, sampleRate);
                const audioUrl = URL.createObjectURL(wavBlob);
                audioPlayer.src = audioUrl;
                audioPlayer.load();
                outputDiv.classList.remove("hidden");
            } else {
                throw new Error("API'den geçerli bir ses çıktısı gelmedi.");
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
