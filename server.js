import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20mb" }));

// POST endpoint
app.post("/receive", (req, res) => {
  try {
    const data = req.body;
    const fileName = data.fileName || "unknown.txt";
    const savePath = path.join("/tmp", fileName); // artık .json eklemiyoruz

    // içeriği kontrol et (base64 mü, text mi)
    let content = data.content;
    if (content && /^[A-Za-z0-9+/=]+$/.test(content) && content.length > 100) {
      // büyük ihtimalle base64 resim veya binary
      const buffer = Buffer.from(content, "base64");
      fs.writeFileSync(savePath, buffer);
    } else {
      // normal text
      fs.writeFileSync(savePath, content ?? "", "utf8");
    }

    res.json({ status: "ok", saved: savePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tüm dosyaları listele (text + resim)
app.get("/list", (req, res) => {
  try {
    const uploadDir = "/tmp";
    const files = fs.readdirSync(uploadDir);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dosya indir
app.get("/download/:fileName", (req, res) => {
  try {
    const uploadDir = "/tmp";
    const filePath = path.join(uploadDir, req.params.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Dosya bulunamadı");
    }
    res.download(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// 🔹 Sadece resimleri listele
app.get("/listImages", (req, res) => {
  try {
    const uploadDir = "/tmp";
    const files = fs.readdirSync(uploadDir);

    const imageFiles = files.filter(f =>
      f.endsWith(".jpg") ||
      f.endsWith(".jpeg") ||
      f.endsWith(".png") ||
      f.endsWith(".bmp") ||
      f.endsWith(".gif")
    );

    res.json(imageFiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Seçili resmi indir
app.get("/downloadImage/:fileName", (req, res) => {
  try {
    const filePath = path.join("/tmp", req.params.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Resim bulunamadı");
    }
    res.download(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));
