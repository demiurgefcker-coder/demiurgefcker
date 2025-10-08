import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

// --- online clients store (in-memory)
const clients = {}; // { machineName: { user, machine, lastSeen: epochMillis, ip } }

// --- heartbeat endpoint (client burada kendini bildirir)
app.post('/heartbeat', (req, res) => {
  try {
    const { machine, user } = req.body || {};

    if (!machine) return res.status(400).json({ error: "missing machine" });

    // IP tespiti: önce X-Forwarded-For başlığına bak, yoksa req.ip
    let ip = null;
    const xff = req.headers['x-forwarded-for'] || req.headers['x-forwarded-for'.toLowerCase()];
    if (xff) {
      // xff olabilir: "client, proxy1, proxy2" -> ilk eleman gerçek client IP
      ip = String(xff).split(',')[0].trim();
    } else if (req.ip) {
      ip = req.ip;
    } else if (req.connection && req.connection.remoteAddress) {
      ip = req.connection.remoteAddress;
    }

    clients[machine] = {
      machine,
      user: user || null,
      lastSeen: Date.now(),
      ip: ip
    };

    return res.json({ ok: true });
  } catch (err) {
    console.error('heartbeat err', err);
    return res.status(500).json({ error: err.message });
  }
});

// --- online listing endpoint
// query param `sinceSeconds` optional: consider clients seen within that many seconds (default 60)
app.get('/online', (req, res) => {
  try {
    const sinceSeconds = parseInt(req.query.sinceSeconds || '60', 10);
    const cutoff = Date.now() - (sinceSeconds * 1000);

    const list = Object.values(clients)
      .filter(c => c.lastSeen >= cutoff)
      .map(c => ({
        machine: c.machine,
        user: c.user,
        lastSeen: c.lastSeen,
        lastSeenIso: new Date(c.lastSeen).toISOString(),
        ip: c.ip || null
      }));

    return res.json(list);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// Tüm dosyalar /tmp içinde tutulur (Render yazılabilir tek dizin)
const baseDir = "/tmp";
const uploadDir = path.join(baseDir, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

/* -------------------------------------------
   📤 1️⃣ Text dosyalarını alma (JSON kaydı)
-------------------------------------------- */
app.post("/receive", (req, res) => {
  try {
    const data = req.body;
    const fileName = data.fileName || "unknown.txt";
    const savePath = path.join(baseDir, `${fileName}.json`);
    fs.writeFileSync(savePath, JSON.stringify(data, null, 2), "utf8");
    res.json({ status: "ok", saved: savePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------
   🧾 2️⃣ Text dosyalarını listeleme
-------------------------------------------- */
app.get("/list", (req, res) => {
  try {
    const files = fs.readdirSync(baseDir)
      .filter(f => f.endsWith(".json"));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------
   📥 3️⃣ Text dosyası indirme
-------------------------------------------- */
app.get("/download/:fileName", (req, res) => {
  try {
    const filePath = path.join(baseDir, req.params.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Dosya bulunamadı");
    }
    res.download(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* -------------------------------------------
   🖼️ 4️⃣ Fotoğraf yükleme (masaüstünden gelen)
-------------------------------------------- */
app.post("/upload", (req, res) => {
  try {
    const { fileName, fileData, fileType } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ error: "Eksik veri gönderildi." });
    }

    const savePath = path.join(uploadDir, fileName);
    const buffer = Buffer.from(fileData, "base64");
    fs.writeFileSync(savePath, buffer);

    res.json({ status: "ok", saved: savePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------
   🧾 5️⃣ Sunucudaki fotoğrafları listeleme
-------------------------------------------- */
app.get("/listImages", (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir)
      .filter(f =>
        f.endsWith(".jpg") ||
        f.endsWith(".jpeg") ||
        f.endsWith(".png") ||
        f.endsWith(".bmp") ||
        f.endsWith(".gif")
      );
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* -------------------------------------------
   📥 6️⃣ Fotoğraf indirme
-------------------------------------------- */
app.get("/downloadImage/:fileName", (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Fotoğraf bulunamadı");
    }
    res.download(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* -------------------------------------------
   🚀 Sunucuyu başlat
-------------------------------------------- */
app.listen(PORT, () => console.log(`✅ Server ${PORT} portunda çalışıyor`));


