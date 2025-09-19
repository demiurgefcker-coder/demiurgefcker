// server.js
import express from "express";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" })); // JSON parse + limit

// VB.NET'ten POST gelecek endpoint
app.post("/receive", (req, res) => {
  try {
    const data = req.body; // JSON olarak gelen veri

    // Masaüstündeki txt dosyaları buradan geliyor
    const fileName = data.fileName || "unknown.txt";

    // Kaydetmek için path (Render’da disk sınırlı, ama tmp veya db kullanılabilir)
    const savePath = `/tmp/${fileName}.json`;

    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf8");

    console.log(`Dosya kaydedildi: ${savePath}`);
    res.json({ status: "ok", saved: savePath });

  } catch (err) {
    console.error("Hata:", err);
    res.status(500).json({ status: "error", message: err.message });
  }
});

// Sağlık kontrolü (test için)
app.get("/", (req, res) => {
  res.send("Server çalışıyor 🚀");
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
