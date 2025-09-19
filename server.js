import express from "express";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));

// POST endpoint
app.post("/receive", (req, res) => {
  const data = req.body;
  const fileName = data.fileName || "unknown.txt";
  const savePath = path.join("/tmp", `${fileName}.json`);
  fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf8");
  res.json({ status: "ok", saved: savePath });
});

// Listeleme endpoint
app.get("/list", (req, res) => {
  try {
    const uploadDir = "/tmp";
    const files = fs.readdirSync(uploadDir);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dosya indirme endpoint
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

app.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));
