const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4001;

const REPLICATE_BASE = "https://api.replicate.com/v1";  // <<--- BUNU EKLEYİN (handleFixImage'den önce)


// Multer (video generator için)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // image fixer base64 <~1–2MB için yeterli
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
    const useModel = model || "imagen-4.0-generate-001"; // erişimin yoksa 3.0'ı deneyebilirsin

    // CJS projesinde ESM paketi dinamik import ile kullanıyoruz
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

    const response = await ai.models.generateImages({
      model: useModel,
      prompt,
      config: {
        numberOfImages: count,
        // isteğe bağlı: size/quality seçenekleri eklenebilir
        // aspectRatio: "1:1",
      },
    });

    // SDK "response.generatedImages" döndürüyor
    const images = (response.generatedImages || []).map((g, i) => {
      // imageBytes (base64) içerir
      const b64 = g.image?.imageBytes || null;
      return {
        index: i,
        mime: "image/png",
        dataUrl: b64 ? `data:image/png;base64,${b64}` : null,
      };
    });

    if (!images.length) {
      return res.status(502).json({ error: "No images returned from Google GenAI" });
    }

    return res.json({ images, model: useModel, count });
  } catch (err) {
    console.error("IMAGE-GEN ERROR:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: "ImageGenerationFailed",
      message: err?.message || "Unexpected server error",
    });
  }
});




// ---------------------------------------------
// Image Fixer handler (Replicate)
// ---------------------------------------------


async function handleFixImage(req, res) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN tanımlı değil." });
    }

    const { base64Image, modelSlug = "tencentarc/gfpgan" } = req.body || {};
    if (!base64Image || !/^data:image\/(png|jpeg);base64,/.test(base64Image)) {
      return res.status(400).json({ error: "Geçerli base64 PNG/JPEG gerekli." });
    }

    // 1) Modelin en güncel sürümünü çek
    const versionResp = await axios.get(`${REPLICATE_BASE}/models/${modelSlug}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT_MS,
    });
    const version = versionResp.data?.latest_version?.id;
    if (!version) return res.status(500).json({ error: "Model sürümü bulunamadı." });

    // 2) Önce DATA-URL ile prediction dene
    try {
      const start = await axios.post(
        `${REPLICATE_BASE}/predictions`,
        { version, input: { image: base64Image, img: base64Image } },
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: TIMEOUT_MS,
        }
      );
      const id = start.data?.id;

      // poll
      let status = start.data?.status, output = null, tries = 0;
      while (!["succeeded", "failed", "canceled"].includes(status) && tries < 90) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await axios.get(`${REPLICATE_BASE}/predictions/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: TIMEOUT_MS,
        });
        status = poll.data?.status;
        output = poll.data?.output;
        tries++;
      }
      if (status !== "succeeded") {
        // Özel: yetersiz kredi ise kullanıcıya aynen yansıt
        if (status === 402 || status === "failed") {
          return res.status(402).json({ error: "Replicate krediniz yetersiz." });
        }
        throw new Error(`Prediction failed: ${status}`);
      }

      const outputUrl = Array.isArray(output) ? output[0] : output;
      if (!outputUrl) return res.status(500).json({ error: "Replicate çıktı URL'i alınamadı." });
      return res.json({ output: outputUrl, status: "succeeded", via: "data-url" });

    } catch (e1) {
      // Eğer doğrudan deneme 402 ise, hemen kullanıcıya anlayacağı bir cevap dön.
      const s = e1?.response?.status;
      const detail = e1?.response?.data;
      if (s === 402) {
        return res.status(402).json({
          error: "Replicate krediniz yetersiz.",
          detail,
        });
      }
      console.warn("Direct data-url prediction failed, trying Files API…", detail || e1.message);
    }

    // 3) FALLBACK: Files API (raw bytes)
    const m = base64Image.match(/^data:(image\/(?:png|jpeg));base64,(.*)$/);
    const mime = m[1];
    const b64 = m[2];
    const buffer = Buffer.from(b64, "base64");

    const upload = await axios.post(`${REPLICATE_BASE}/files`, buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        // Octet-stream, bazı ortamlarda "Missing content" hatasını çözer.
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.length,
        "Accept": "application/json",
        "Content-Disposition": `attachment; filename=upload.${mime.endsWith("png") ? "png" : "jpg"}`,
      },
      timeout: TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true, // 402'yi yakalayıp anlamlı döndürmek için
    });

    if (upload.status === 402) {
      return res.status(402).json({
        error: "Replicate krediniz yetersiz (file upload).",
        detail: upload.data,
      });
    }
    if (upload.status >= 400) {
      return res.status(500).json({
        error: "Dosya yüklenemedi.",
        detail: upload.data || upload.statusText,
      });
    }

    const fileUrl = upload.data?.urls?.get;
    if (!fileUrl) {
      return res.status(500).json({ error: "Dosya URL'si alınamadı.", detail: upload.data });
    }

    // Files API URL'i ile prediction
    const start2 = await axios.post(
      `${REPLICATE_BASE}/predictions`,
      { version, input: { image: fileUrl, img: fileUrl } },
      {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: TIMEOUT_MS,
      }
    );
    const id2 = start2.data?.id;

    // poll
    let status2 = start2.data?.status, output2 = null, tries2 = 0;
    while (!["succeeded", "failed", "canceled"].includes(status2) && tries2 < 90) {
      await new Promise(r => setTimeout(r, 2000));
      const poll2 = await axios.get(`${REPLICATE_BASE}/predictions/${id2}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: TIMEOUT_MS,
      });
      status2 = poll2.data?.status;
      output2 = poll2.data?.output;
      tries2++;
    }
    if (status2 !== "succeeded") {
      if (status2 === 402 || status2 === "failed") {
        return res.status(402).json({ error: "Replicate krediniz yetersiz." });
      }
      throw new Error(`Prediction failed: ${status2}`);
    }

    const outputUrl2 = Array.isArray(output2) ? output2[0] : output2;
    if (!outputUrl2) return res.status(500).json({ error: "Replicate çıktı URL'i alınamadı." });
    return res.json({ output: outputUrl2, status: "succeeded", via: "files-api" });

  } catch (e) {
    console.error("FIX-IMAGE ERROR:", {
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
    });
    // 402'yi yukarıda yakalayamadıysak burada da iletelim
    if (e?.response?.status === 402) {
      return res.status(402).json({
        error: "Replicate krediniz yetersiz.",
        detail: e.response.data,
      });
    }
    return res.status(500).json({
      error: "Image Fixer hata",
      status: e.response?.status,
      detail: e.response?.data || e.message,
    });
  }
}


// latest version id çek
async function getReplicateVersionId(modelSlug, token) {
  const r = await axios.get(`${REPLICATE_BASE}/models/${modelSlug}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: TIMEOUT_MS,
  });
  return r.data?.latest_version?.id;
}

// prediction başlat
async function startPrediction(version, input, token) {
  const r = await axios.post(
    `${REPLICATE_BASE}/predictions`,
    { version, input },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    }
  );
  return r.data?.id;
}

// prediction poll
async function pollPrediction(id, token) {
  let status = "starting";
  let output = null;
  let tries = 0;
  while (!["succeeded", "failed", "canceled"].includes(status) && tries < 90) {
    await new Promise((r) => setTimeout(r, 2000));
    const p = await axios.get(`${REPLICATE_BASE}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: TIMEOUT_MS,
    });
    status = p.data?.status;
    output = p.data?.output;
    tries++;
  }
  if (status !== "succeeded") {
    const err = new Error("Prediction failed");
    err.status = status;
    throw err;
  }
  return Array.isArray(output) ? output[0] : output;
}

// Ortak Image Fixer handler
async function handleFixImage(req, res) {
  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "REPLICATE_API_TOKEN tanımlı değil." });
    }

    const { base64Image, modelSlug = "tencentarc/gfpgan" } = req.body || {};
    if (!base64Image || !/^data:image\/(png|jpeg);base64,/.test(base64Image)) {
      return res.status(400).json({ error: "Geçerli base64 PNG/JPEG gerekli." });
    }

    // 1) model sürümü
    const version = await getReplicateVersionId(modelSlug, token);
    if (!version) return res.status(500).json({ error: "Model sürümü bulunamadı." });

    // 2) ÖNCE Data-URL ile doğrudan prediction dene
    try {
      const id = await startPrediction(
        version,
        { image: base64Image, img: base64Image }, // bazı sürümler img anahtarını ister
        token
      );
      const outputUrl = await pollPrediction(id, token);
      return res.json({ output: outputUrl, status: "succeeded", via: "data-url" });
    } catch (e1) {
      console.warn("Direct data-url prediction failed, falling back to Files API…", e1?.response?.data || e1.message);
    }

    // 3) FALLBACK: base64'ü RAW BYTES olarak Files API'ye yükle → URL al
    const m = base64Image.match(/^data:(image\/(?:png|jpeg));base64,(.*)$/);
    if (!m) return res.status(400).json({ error: "Geçersiz base64 data URL" });
    const mime = m[1];
    const b64 = m[2];
    const buffer = Buffer.from(b64, "base64");

    const up = await axios.post(`${REPLICATE_BASE}/files`, buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mime,
        "Content-Length": buffer.length,
        "Content-Disposition": `attachment; filename=upload.${mime.endsWith("png") ? "png" : "jpg"}`,
      },
      timeout: TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const fileUrl = up.data?.urls?.get;
    if (!fileUrl) return res.status(500).json({ error: "Dosya yüklenemedi.", detail: up.data });

    const id2 = await startPrediction(version, { image: fileUrl, img: fileUrl }, token);
    const outputUrl2 = await pollPrediction(id2, token);
    return res.json({ output: outputUrl2, status: "succeeded", via: "files-api" });
  } catch (e) {
    console.error("FIX-IMAGE ERROR:", {
      status: e.response?.status,
      data: e.response?.data,
      message: e.message,
    });
    return res.status(500).json({
      error: "Image Fixer hata",
      status: e.response?.status,
      detail: e.response?.data || e.message,
    });
  }
}

// İki path’i de aynı handler’a bağla (cache/isim farkı için emniyet)
app.post("/api/fix-image", handleFixImage);
app.post("/api/image-fixer", handleFixImage);

// ---------------------------------------------
// STABILITY AI – Video Generator
// ---------------------------------------------
app.post("/api/stability-ai-video-generator", upload.single("image"), async (req, res) => {
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
    formData.append("prompt", prompt);
    formData.append("image", imageFile.buffer, {
      filename: imageFile.originalname,
      contentType: imageFile.mimetype,
    });

    const startResponse = await axios.post(
      `https://api.stability.ai/v2beta/stable-image/generate/video`,
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

    while (status !== "succeeded" && status !== "failed" && attempts < maxAttempts) {
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
      return res.status(500).json({ error: "Video oluşturma başarısız", status });
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
    res.status(500).json({
      error: "API çağrısı başarısız",
      status: e.response?.status,
      detail: e.response?.data?.error || e.message,
    });
  }
});

// Eski rota → yeni rotaya vekil (prompt + opsiyonel image)
app.post("/api/video-generator", upload.single("image"), async (req, res) => {
  try {
    const formData = new FormData();
    formData.append("prompt", req.body.prompt);
    if (req.file) {
      formData.append("image", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
    }

    const response = await axios.post("http://localhost:4001/api/stability-ai-video-generator", formData, {
      headers: {
        ...formData.getHeaders(),
        ...req.headers,
      },
      timeout: TIMEOUT_MS,
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
    const output = response.data.choices[0].text;

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
app.listen(PORT, () => console.log(`✅ Sunucu hazır: http://localhost:${PORT}`));
