// server.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// __dirname tanımı (ESM ortamı için)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Uploads klasörünü oluştur
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// 🟩 TEXT VE GÖRSEL DOSYALARI YÜKLEME
app.post("/upload", async (req, res) => {
  try {
    const { fileName, fileData, fileType } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: "Eksik dosya verisi." });
    }

    // Eğer base64 gönderildiyse, base64'ten çıkar
    const buffer = Buffer.from(fileData, "base64");

    // Dosyayı kaydet
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    console.log(`✅ Dosya kaydedildi: ${fileName}`);
    res.json({ message: "Dosya başarıyla kaydedildi." });
  } catch (error) {
    console.error("❌ Upload hatası:", error);
    res.status(500).json({ error: "Dosya yükleme hatası." });
  }
});

// 🟩 SUNUCUDAKİ TÜM DOSYALARI LİSTELE
app.get("/list", (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    res.json(files);
  } catch (error) {
    console.error("❌ Listeleme hatası:", error);
    res.status(500).json({ error: "Dosyalar listelenemedi." });
  }
});

// 🟩 BELİRLİ BİR DOSYAYI İNDİR
app.get("/download/:fileName", (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = path.join(uploadDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Dosya bulunamadı." });
    }

    res.download(filePath);
  } catch (error) {
    console.error("❌ İndirme hatası:", error);
    res.status(500).json({ error: "Dosya indirilemedi." });
  }
});

// 🟩 SUNUCU BAŞLAT
app.listen(PORT, () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor.`);
});
