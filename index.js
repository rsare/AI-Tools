const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const FormData = require("form-data");
const multer = require("multer");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4001;

// ---------------------- Sessions ----------------------
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // prod'da true + HTTPS
      maxAge: 1000 * 60 * 60 * 8, // 8 saat
    },
  })
);

// ---------------------- Body / Static -----------------
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "frontend")));
app.get("/health", (_, res) => res.json({ ok: true }));

// ---------------------- File Upload -------------------
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---------------------- Simple user store -------------
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]", "utf-8");

function readUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

// ---------------------- Auth helpers ------------------
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: "UNAUTHENTICATED" });
}

// ---------------------- Auth routes -------------------
app.post("/auth/register", async (req, res) => {
  try {
    let { name, email, password } = req.body || {};
    name = (name || "").trim();
    email = (email || "").trim().toLowerCase();
    password = password || "";

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Eksik alan" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Şifre en az 6 karakter olmalı" });
    }

    const users = readUsers();
    if (users.find((u) => u.email === email)) {
      return res.status(409).json({ error: "Bu e-posta zaten kayıtlı" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = {
      id: Date.now().toString(),
      name,
      email,
      passwordHash: hash,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeUsers(users);

    // Oturum açtır
    req.session.user = { id: user.id, name: user.name, email: user.email };
    return res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error("REGISTER ERROR:", e);
    res.status(500).json({ error: "RegisterFailed" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = (email || "").trim().toLowerCase();
    password = password || "";

    const users = readUsers();
    const user = users.find((u) => u.email === email);
    if (!user) return res.status(401).json({ error: "Geçersiz bilgiler" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Geçersiz bilgiler" });

    req.session.user = { id: user.id, name: user.name, email: user.email };
    return res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ error: "LoginFailed" });
  }
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/auth/me", (req, res) => {
  if (req.session?.user) return res.json({ user: req.session.user });
  return res.status(401).json({ error: "UNAUTHENTICATED" });
});

// ---- Buradan sonrası /api altındaki TÜM uçlar giriş ister ----
app.use("/api", requireAuth);

// Global timeout
const TIMEOUT_MS = 300000; // 5 dk

// ==== Image Generator (Google Imagen via @google/genai) ====
// npm i @google/genai
app.post("/api/generate-image", async (req, res) => {
  try {
    const { prompt, n, model } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const count = Math.min(Math.max(parseInt(n || 1, 10), 1), 4);
    // Erişimin varsa 4.0, yoksa 3.0. 404 alırsan 4.0'ı kullan:
    const useModel = model || "imagen-4.0-generate-001";

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

    const response = await ai.models.generateImages({
      model: useModel,
      prompt,
      config: {
        numberOfImages: count,
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
// Image Fixer
// ---------------------------------------------
app.post("/api/imageFixer", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ detail: "Missing content", error: "Görsel dosyası eksik." });
    }
    const base64Image = `data:${file.mimetype};base64,` + file.buffer.toString("base64");
    // Placeholder: şimdilik orijinali dönüyoruz
    res.status(200).json({ output: base64Image });
  } catch (error) {
    console.error("Sunucu hatası:", error);
    res.status(500).json({ detail: "Vekil çağrı başarısız.", error: error.message });
  }
});

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

// Eski rota → yeni rotaya vekil
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
