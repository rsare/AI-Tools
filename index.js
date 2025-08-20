const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4001;

// Multer ile bellek içi dosya yükleme yapılandırması
// 10MB dosya boyutu sınırı eklendi
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/health", (_, res) => res.json({ ok: true }));

// İstek için zamanaşımı (timeout) ayarı
const TIMEOUT_MS = 300000; // 5 dakika

// Stability AI'den video oluşturmak için backend rotası
// Hem metin hem de görsel kabul ediyor
app.post("/api/stability-ai-video-generator", upload.single('image'), async (req, res) => {
    console.log("HIT /api/stability-ai-video-generator (Stability AI API)");
    try {
        const { prompt } = req.body;
        const imageFile = req.file;

        if (!prompt || !imageFile) {
            return res.status(400).json({ error: "Metin ve bir görüntü gerekli." });
        }

        const stabilityApiKey = process.env.STABILITY_AI_API_KEY;
        if (!stabilityApiKey) {
            console.error("HATA: STABILITY_AI_API_KEY .env dosyasında tanımlı değil!");
            return res.status(500).json({ error: "API anahtarı eksik. Lütfen .env dosyanızı kontrol edin." });
        }
        
        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('image', imageFile.buffer, {
            filename: imageFile.originalname,
            contentType: imageFile.mimetype,
        });
        
        // Stability AI API'sine ilk isteği gönderme
        const startResponse = await axios.post(
            `https://api.stability.ai/v2beta/stable-image/generate/video`,
            formData,
            {
                headers: {
                    Authorization: `Bearer ${stabilityApiKey}`,
                    ...formData.getHeaders(),
                    Accept: 'application/json',
                },
                timeout: TIMEOUT_MS // İstek zamanaşımı
            }
        );
        
        const jobId = startResponse.data.id;
        
        let status = startResponse.data.status;
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 120; // 4 dakikaya kadar bekle (2 saniye * 120 deneme)

        // Video hazır olana kadar API'yi sorgulama
        while (status !== "succeeded" && status !== "failed" && attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 2000));
            const pollResponse = await axios.get(
                `https://api.stability.ai/v2beta/stable-image/generate/video/result/${jobId}`,
                {
                    headers: { Authorization: `Bearer ${stabilityApiKey}` },
                    timeout: TIMEOUT_MS // İstek zamanaşımı
                }
            );
            
            status = pollResponse.data.status;
            
            if (status === "succeeded") {
                videoUrl = pollResponse.data.video;
            }
            
            attempts++;
            console.log("Video oluşturma durumu:", status, "Deneme:", attempts);
        }

        if (status !== "succeeded") {
            const errorDetail = `Video oluşturma ${status} durumuyla sonuçlandı.`;
            return res.status(500).json({ error: "Video oluşturma başarısız", status, detail: errorDetail });
        }

        if (!videoUrl) {
            return res.status(500).json({ error: "API'den geçerli bir video URL'si gelmedi." });
        }

        res.json({ videoUrl, status: "succeeded" });

    } catch (e) {
        console.error("BACKEND ERROR (Stability AI API) =>", {
            status: e.response?.status,
            resp: e.response?.data,
            message: e.message,
        });
        res.status(500).json({ error: "API çağrısı başarısız", status: e.response?.status, detail: e.response?.data?.error || e.message });
    }
});

// Eski API rotasını yeni Stability AI rotasına yönlendiren vekil rota
app.post("/api/video-generator", upload.single('image'), async (req, res) => {
    try {
        const formData = new FormData();
        formData.append('prompt', req.body.prompt);
        if (req.file) {
            formData.append('image', req.file.buffer, {
                filename: req.file.originalname,
                contentType: req.file.mimetype,
            });
        }
        
        const response = await axios.post("http://localhost:4001/api/stability-ai-video-generator", formData, {
            headers: {
                ...formData.getHeaders(),
                ...req.headers
            },
            timeout: TIMEOUT_MS // Vekil çağrısı için zamanaşımı
        });
        res.json(response.data);
    } catch (e) {
        console.error("PROXY ERROR:", e.message);
        res.status(e.response?.status || 500).json({
            error: "Vekil çağrı başarısız.",
            detail: e.response?.data?.detail || e.message,
        });
    }
});


// Metin üretimi için Writer API'sine çağrı yapacak olan endpoint
app.post("/api/text-generator", async (req, res) => {
    console.log("HIT /api/text-generator (Writer API)");
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt gerekli." });
        }
        const writerApiUrl = "https://api.writer.com/v1/completions";

        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.TEXT_GENERATION}`,
        };

        const body = {
            model: "palmyra-x-003-instruct",
            prompt: prompt,
            max_tokens: 150,
            temperature: 0.7,
            top_p: 0.9,
            stop: ["."],
            best_of: 1,
            random_seed: 42,
            stream: false
        };
        const response = await axios.post(writerApiUrl, body, { headers });
        const output = response.data.choices[0].text;

        res.json({ output, status: "succeeded" });
    } catch (e) {
        console.error("BACKEND ERROR (Writer API) =>", {
            status: e.response?.status,
            resp: e.response?.data,
            message: e.message,
        });
        res.status(500).json({ error: "API çağrısı başarısız", status: e.response?.status, detail: e.response?.data || e.message });
    }
});

// Sunucuyu başlat
app.listen(PORT, () => console.log(`✅ Sunucu hazır: http://localhost:${PORT}`));
