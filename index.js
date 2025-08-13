const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data");
require("dotenv").config();

const app = express();
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_TOKEN,
});

// Replicate'tan bir modelin en son version id'sini çek
async function getLatestVersion(modelName) {
  const url = `https://api.replicate.com/v1/models/${modelName}/versions`;
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
  });
  const versions = r.data?.results || [];
  if (!versions.length) throw new Error(`Model versiyonu bulunamadı: ${modelName}`);
  return versions[0].id;
}

// middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // base64 rahat sığsın

// statik frontend
const STATIC_DIR = path.join(__dirname, "frontend");
app.use(express.static(STATIC_DIR));

// sağlık
app.get("/health", (_, res) => res.json({ ok: true }));

// token test (Bearer)
app.get("/token-test", async (req, res) => {
  try {
    const r = await axios.get("https://api.replicate.com/v1/collections", {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    res.json({ ok: true, count: (r.data?.results || []).length });
  } catch (e) {
    res.status(500).json({ ok: false, status: e.response?.status, detail: e.response?.data || e.message });
  }
});

// base64 -> Files(content as FILE) -> GFPGAN
app.post("/api/fix-image", async (req, res) => {
  console.log("HIT /api/fix-image");
  try {
    const { base64Image } = req.body;

    // 1) Girdi doğrulama + base64 ayrıştırma
    if (!base64Image || !base64Image.startsWith("data:image/")) {
      return res.status(400).json({ error: "Geçersiz base64", detail: "data:image/... ile başlamıyor" });
    }
    const m = base64Image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: "Geçersiz data URL" });

    const mime = m[1];
    const raw = m[2];
    const ext = (mime.split("/")[1] || "png").toLowerCase();

    // 2) Buffer’a çevir ve DEBUG log
    const buffer = Buffer.from(raw, "base64");
    console.log("DEBUG mime:", mime, "rawLen:", raw.length, "bufferLen:", buffer.length);
    console.log("DEBUG first bytes:", buffer.subarray(0, 16));

    if (buffer.length === 0) {
      return res.status(400).json({ error: "Boş içerik", detail: "Base64 decode sonucu 0 byte" });
    }

    // 3) Replicate Files — multipart/form-data (ALAN ADI: `content`)
    const form = new FormData();
    form.append("content", buffer, {
      filename: `upload.${ext}`,
      contentType: mime,
      knownLength: buffer.length,
    });

    console.log("Uploading to Replicate Files (multipart:content) size:", buffer.length);

    const upload = await axios.post("https://api.replicate.com/v1/files", form, {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`, // Files: Token
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
    });

    const imageUrl = upload?.data?.urls?.download || upload?.data?.urls?.get;
    console.log("Files API response urls:", upload?.data?.urls);
    if (!imageUrl) {
      return res.status(500).json({ error: "Yükleme URL'i alınamadı", detail: upload?.data || null });
    }

    // 4) En son versiyonu çek
    const modelName = process.env.REPLICATE_MODEL || "tencentarc/gfpgan";
    console.log("Fetching latest version for", modelName);
    const versionId = await getLatestVersion(modelName);
    console.log("Using version:", versionId);

    // 5) Prediction (GFPGAN) — önce 'image' ile dener, 400 olursa 'img' ile tekrar dener
    let start;
    let inputField = 'image'; // Varsayılan olarak 'image' kullan
    try {
      start = await axios.post(
        "https://api.replicate.com/v1/predictions",
        { version: versionId, input: { [inputField]: imageUrl } },
        { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, "Content-Type": "application/json" } }
      );
    } catch (e) {
      if (e.response?.status === 422 && e.response?.data?.detail?.includes("img is required")) {
        console.warn("Retrying prediction with 'img' field due to 422 error...");
        inputField = 'img'; // Input alanını 'img' olarak değiştir
        start = await axios.post(
          "https://api.replicate.com/v1/predictions",
          { version: versionId, input: { [inputField]: imageUrl } },
          { headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, "Content-Type": "application/json" } }
        );
      } else {
        // Başka bir 422 hatası veya farklı bir hata türüyse, fırlat
        console.error("Prediction API error:", {
          status: e.response?.status,
          resp: e.response?.data,
          message: e.message,
        });
        throw e;
      }
    }


    // 6) Poll (Bearer)
    let status = start.data.status;
    let final = start.data;
    const getUrl = start.data.urls.get;

    while (status === "starting" || status === "processing") {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await axios.get(getUrl, {
        headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      });
      status = poll.data.status;
      final = poll.data;
      console.log("Poll status:", status);
    }

    if (status !== "succeeded") {
      return res.status(500).json({ error: "Model failed", status, detail: final?.logs || final });
    }

    const output = Array.isArray(final.output) ? final.output[0] : final.output;
    res.json({ output, status: final.status });
  } catch (e) {
    console.error("BACKEND ERROR =>", {
      status: e.response?.status,
      resp: e.response?.data,
      message: e.message,
    });
    res.status(500).json({ error: "API çağrısı başarısız", status: e.response?.status, detail: e.response?.data || e.message });
  }
});


// Yeni araç: OpenAI ile Metin Üretme
app.post("/api/text-generator", async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: "Prompt gerekli." });
        }

        // Replicate veya OpenAI API çağrı mantığı buraya gelecek
        // Örn: Replicate'deki bir metin üretme modelini kullanın
        const modelName = "meta/llama-2-70b-chat";
        const versionId = "db21e45d3f7023abc2a46ee38a23973f6dce16bb08812a9a4b3d7d8e438c5357";
        
        const start = await axios.post(
            "https://api.replicate.com/v1/predictions",
            { version: versionId, input: { prompt: prompt } },
            { headers: { Authorization: `Bearer ${process.env.OPENAI_API_TOKEN}`, "Content-Type": "application/json" } }
        );

        // ... (Poll ve çıktıyı bekleme mantığı aynı kalacak) ...
        let status = start.data.status;
        let final = start.data;
        const getUrl = start.data.urls.get;

        while (status === "starting" || status === "processing") {
            await new Promise((r) => setTimeout(r, 2000));
            const poll = await axios.get(getUrl, {
                headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
            });
            status = poll.data.status;
            final = poll.data;
        }

        if (status !== "succeeded") {
            return res.status(500).json({ error: "Model failed", status, detail: final?.logs || final });
        }

        const output = Array.isArray(final.output) ? final.output.join('') : final.output;
        res.json({ output, status: final.status });

    } catch (e) {
        console.error("BACKEND ERROR =>", {
            status: e.response?.status,
            resp: e.response?.data,
            message: e.message,
        });
        res.status(500).json({ error: "API çağrısı başarısız", status: e.response?.status, detail: e.response?.data || e.message });
    }
});

app.post("\api\video-generator", async(req, res) => {

});


const PORT = process.env.PORT || 4001;

app.get("/debug/model", async (req, res) => {
  try {
    const model = req.query.model || process.env.REPLICATE_MODEL || "tencentarc/gfpgan";
    const url = `https://api.replicate.com/v1/models/${model}/versions`;
    const r = await axios.get(url, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    });
    const results = r.data?.results || [];
    console.log("DEBUG_MODEL ok:", model, "count:", results.length);
    res.json({
      ok: true,
      model,
      count: results.length,
      sample: results.slice(0, 2).map(v => ({ id: v.id, created_at: v.created_at })),
    });
  } catch (e) {
    console.error("DEBUG_MODEL_ERROR", e.response?.status, e.response?.data || e.message);
    res.status(e.response?.status || 500).json({
      ok: false,
      status: e.response?.status,
      detail: e.response?.data || e.message,
    });
  }
});

app.listen(PORT, () => console.log(`✅ Sunucu hazır: http://localhost:${PORT}`));