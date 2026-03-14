const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// JSON verilerini okuyabilmek için middleware
app.use(express.json());

// Bellekte verileri tutacağımız basit bir obje
let database = {
    fileList: [],
    lastUpdate: null,
    pendingCommand: "IDLE" // IDLE, REFRESH, DOWNLOAD:dosya_adi
};

// 1. AGENT KAPISI: Client (C# Programı) buraya veri gönderir ve komut alır
app.post('/agent', (req, res) => {
    console.log("Client'tan veri geldi...");
    
    // Client'tan gelen dosya listesini kaydet
    if (req.body.files) {
        database.fileList = req.body.files;
        database.lastUpdate = new Date().toLocaleString();
    }

    // Client'a bekleyen bir komut varsa onu gönder
    res.json({
        status: "OK",
        command: database.pendingCommand
    });

    // Komut gönderildikten sonra tekrar bekleme moduna al (isteğe bağlı)
    // database.pendingCommand = "IDLE"; 
});

// 2. PANEL KAPISI: Sen (C# Arayüzü) burayı izlersin
app.get('/panel', (req, res) => {
    res.json(database);
});

// 3. KOMUT GÖNDERME: Panel üzerinden komut değiştirmek için
app.post('/panel/command', (req, res) => {
    database.pendingCommand = req.body.command;
    res.json({ message: "Komut güncellendi: " + database.pendingCommand });
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor.`);
});
