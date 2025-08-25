// index.js
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4001;

// Multer (resim/video için bellek içi)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // base64 görseller için yeterli
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/health", (_, res) => res.json({ ok: true }));

// Global timeout
const TIMEOUT_MS = 300000; // 5 dk

// ==== Image Generator (Google Imagen via @google/genai) ====
// GEREKLI: npm i @google/genai
app.post("/api/generate-image", async (req, res) => {
  try {
    // JSON body bekliyoruz: { prompt, n, model }
    const { prompt, n, model } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // makul sınırlar
    const count = Math.min(Math.max(parseInt(n || 1, 10), 1), 4);

    // Varsayılan model (frontend de 4.0 → 3.0 fallback yapıyor ama backend'de de sağlamlaştıralım)
    const primaryModel = model || "imagen-4.0-generate-001";
    const fallbackModel = "imagen-3.0-generate-001";

    // CJS projede ESM paketi dinamik import ile kullanıyoruz
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

    // Yardımcı: çağır ve images[] döndür
    const callImagen = async (useModel) => {
      const response = await ai.models.generateImages({
        model: useModel,
        prompt,
        config: {
          numberOfImages: count,
          // aspectRatio: "1:1", // isterseniz açabilirsiniz
        },
      });
      const images = (response.generatedImages || []).map((g, i) => {
        const b64 = g.image?.imageBytes || null;
        return {
          index: i,
          mime: "image/png",
          dataUrl: b64 ? `data:image/png;base64,${b64}` : null,
        };
      });
      return { images, model: useModel };
    };

    let result;
    try {
      // 4.0 ile dene
      result = await callImagen(primaryModel);
    } catch (e) {
      const msg = (e?.message || "").toLowerCase();
      const raw = e?.response?.data;
      const is404 =
        String(e?.response?.status || "").includes("404") ||
        msg.includes("not found") ||
        msg.includes("not_found") ||
        msg.includes("not supported") ||
        JSON.stringify(raw || {}).toLowerCase().includes("not found") ||
        JSON.stringify(raw || {}).toLowerCase().includes("not supported");

      if (is404) {
        // 3.0'a düş
        result = await callImagen(fallbackModel);
      } else {
        throw e;
      }
    }

    if (!result.images.length) {
      return res
        .status(502)
        .json({ error: "No images returned from Google GenAI" });
    }

    return res.json({
      images: result.images,
      model: result.model,
      count,
    });
  } catch (err) {
    console.error("IMAGE-GEN ERROR:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: "ImageGenerationFailed",
      message: err?.message || "Unexpected server error",
    });
  }
});

// ---------------------------------------------
// Image Fixer (örnek; şu an yükleneni aynen geri döner)
// ---------------------------------------------
app.post("/api/imageFixer", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ detail: "Missing content", error: "Görsel dosyası eksik." });
    }

    const base64Image =
      `data:${file.mimetype};base64,` + file.buffer.toString("base64");

    // Burada gerçek bir servis çağırabilirsiniz.
    // Şimdilik, orijinal görseli "düzeltilmiş" gibi geri gönderiyoruz.
    res.status(200).json({ output: base64Image });
  } catch (error) {
    console.error("Sunucu hatası:", error);
    res
      .status(500)
      .json({ detail: "Vekil çağrı başarısız.", error: error.message });
  }
});

// ---------------------------------------------
// STABILITY AI – Video Generator
// ---------------------------------------------
app.post(
  "/api/stability-ai-video-generator",
  upload.single("image"),
  async (req, res) => {
    console.log("HIT /api/stability-ai-video-generator (Stability AI API)");
    try {
      const { prompt } = req.body;
      const imageFile = req.file;

      if (!prompt || !imageFile) {
        return res
          .status(400)
          .json({ error: "Metin ve bir görüntü gerekli." });
      }

      const stabilityApiKey = process.env.STABILITY_AI_API_KEY;
      if (!stabilityApiKey) {
        console.error("HATA: STABILITY_AI_API_KEY .env dosyasında yok!");
        return res
          .status(500)
          .json({ error: "API anahtarı eksik. Lütfen .env dosyanızı kontrol edin." });
      }

      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("image", imageFile.buffer, {
        filename: imageFile.originalname,
        contentType: imageFile.mimetype,
      });

      const startResponse = await axios.post(
        "https://api.stability.ai/v2beta/stable-image/generate/video",
        formData,
        {
          headers: {
            Authorization: `Bearer ${stabilityApiKey}`,
            ...formData.getHeaders(),
            Accept: "application/json",
          },
          timeout: TIMEOUT_MS,
        }
      );

      const jobId = startResponse.data.id;
      let status = startResponse.data.status;
      let videoUrl = null;
      let attempts = 0;
      const maxAttempts = 120; // 2s * 120 = 4 dk

      while (
        status !== "succeeded" &&
        status !== "failed" &&
        attempts < maxAttempts
      ) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollResponse = await axios.get(
          `https://api.stability.ai/v2beta/stable-image/generate/video/result/${jobId}`,
          {
            headers: { Authorization: `Bearer ${stabilityApiKey}` },
            timeout: TIMEOUT_MS,
          }
        );

        status = pollResponse.data.status;
        if (status === "succeeded") videoUrl = pollResponse.data.video;
        attempts++;
        console.log("Video oluşturma durumu:", status, "Deneme:", attempts);
      }

      if (status !== "succeeded") {
        return res
          .status(500)
          .json({ error: "Video oluşturma başarısız", status });
      }
      if (!videoUrl) {
        return res
          .status(500)
          .json({ error: "API'den geçerli bir video URL'si gelmedi." });
      }

      res.json({ videoUrl, status: "succeeded" });
    } catch (e) {
      console.error("BACKEND ERROR (Stability AI API) =>", {
        status: e.response?.status,
        resp: e.response?.data,
        message: e.message,
      });
      res.status(500).json({
        error: "API çağrısı başarısız",
        status: e.response?.status,
        detail: e.response?.data?.error || e.message,
      });
    }
  }
);

// ---------------------------------------------
// Writer – Text Generator
// ---------------------------------------------
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
      Authorization: `Bearer ${process.env.TEXT_GENERATION}`,
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
      stream: false,
    };
    const response = await axios.post(writerApiUrl, body, { headers });
    const output = response.data.choices?.[0]?.text ?? "";

    res.json({ output, status: "succeeded" });
  } catch (e) {
    console.error("BACKEND ERROR (Writer API) =>", {
      status: e.response?.status,
      resp: e.response?.data,
      message: e.message,
    });
    res.status(500).json({
      error: "API çağrısı başarısız",
      status: e.response?.status,
      detail: e.response?.data || e.message,
    });
  }
});

// ---------------------------------------------
// Server
// ---------------------------------------------
app.listen(PORT, () =>
  console.log(`✅ Sunucu hazır: http://localhost:${PORT}`)
);
