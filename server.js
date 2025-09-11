const express = require("express");
const app = express();

app.use(express.json({ limit: '50mb' })); 
app.use(express.text({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.text()); // basit text POST için

// POST isteğiyle veri al
app.post("/data", (req, res) => {
  console.log("Gelen veri:", req.body);
  res.send("Veri alındı: " + req.body);
});

// Render'ın kullanacağı port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server çalışıyor, port: ${PORT}`);

});
