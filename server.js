// server.js (stabil + admin->agent file forward + geçici HTTP endpoint'ler)

const http = require("http");
const express = require("express");
const morgan = require("morgan");
const WebSocket = require("ws");

const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "25mb" })); // JSON body parse

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));

// Geçici HTTP endpoint'ler (uzun vadede agent'tan HTTP çağrılarını kaldıracağız)
app.post("/receive", (req, res) => {
  const sz = JSON.stringify(req.body || {}).length;
  console.log("[http receive] body-size=", sz);
  res.status(200).json({ ok: true });
});

app.post("/upload", (req, res) => {
  const sz = JSON.stringify(req.body || {}).length;
  console.log("[http upload] body-size=", sz);
  res.status(200).json({ ok: true });
});

app.get("/online", (req, res) => {
  res.status(200).json({
    ok: true,
    openAgents: [...agents.values()].filter(
      (x) => x.ws && x.ws.readyState === WebSocket.OPEN
    ).length,
  });
});

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// perMessageDeflate kapalı: ikili/payloadlarda daha kararlı
const wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });

const AGENT_TOKENS = (process.env.AGENT_TOKENS || "agent1token").split(",");
const ADMIN_TOKENS = (process.env.ADMIN_TOKENS || "admintoken").split(",");

const agents = new Map(); // agentId -> { ws, info }
const admins = new Set();

const BOOT_ID = Math.random().toString(36).slice(2, 8);
console.log("[boot] broker started, BOOT_ID=", BOOT_ID);

function sendJson(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }
function broadcastAdmins(obj) {
  const s = JSON.stringify(obj);
  for (const a of admins) {
    if (a.readyState === WebSocket.OPEN) {
      try { a.send(s); } catch {}
    }
  }
}
function parseQS(url) { const q = url.split("?")[1] || ""; return new URLSearchParams(q); }
function countOpen(setOrMap) {
  if (setOrMap instanceof Set) return [...setOrMap].filter(ws => ws.readyState === WebSocket.OPEN).length;
  return [...setOrMap.values()].filter(x => x.ws && x.ws.readyState === WebSocket.OPEN).length;
}

// Sunucu-tarafı uygulama ping’i: 5 sn
setInterval(() => {
  const payload = JSON.stringify({ type: "srv_ping", ts: Date.now() });
  for (const [, entry] of agents) {
    const ws = entry.ws;
    if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(payload); } catch {} }
  }
  for (const ws of admins) {
    if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(payload); } catch {} }
  }
}, 5000);

// TCP seviyesinde ping/pong liveness (opsiyonel ama faydalı)
function installPong(ws) {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
}
setInterval(() => {
  for (const ws of [...admins, ...[...agents.values()].map(x => x.ws)]) {
    if (!ws) continue;
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);

wss.on("connection", (ws, req) => {
  installPong(ws);

  const connId = Math.random().toString(36).slice(2, 8);
  ws.connId = connId;

  const url = req.url || "/";
  const ua = req.headers["user-agent"] || "-";
  const isAgent = url.startsWith("/agent");
  const isAdmin = url.startsWith("/admin");
  const params = parseQS(url);
  const token = params.get("token") || "";

  console.log(`[open] ${connId} path=${url} ua="${ua}" openAgents=${countOpen(agents)} openAdmins=${countOpen(admins)}`);

  ws.on("error", err => console.error(`[error] ${connId}`, err?.message || err));

  ws.on("close", (code, reasonBuf) => {
    const reason = reasonBuf ? reasonBuf.toString() : "";
    console.log(
      `[close] ${connId} code=${code} reason="${reason}" kind=${ws.kind || "-"} agentId=${ws.agentId || "-"} ` +
      `openAgents=${countOpen(agents)} openAdmins=${countOpen(admins)}`
    );
    if (ws.kind === "agent" && ws.agentId && agents.has(ws.agentId)) {
      const cur = agents.get(ws.agentId);
      if (cur && cur.ws === ws) {
        agents.delete(ws.agentId);
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
      }
    }
    if (ws.kind === "admin") admins.delete(ws);
  });

  ws.on("message", (buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

    // Uygulama seviyesi ping/pong
    if (msg.type === "heartbeat" || msg.type === "ping" || msg.type === "srv_pong") return;

    // ---------- AGENT DAL ---------- //
    if (ws.kind === "agent") {
      if (msg.type === "hello") {
        const incomingId = msg.agentId || ("agent-" + Math.random().toString(36).slice(2, 8));
        const existing = agents.get(incomingId);

        // Eskiyi kapatmak yerine yeniyi reddet (stabilite için)
        if (existing && existing.ws && existing.ws.readyState === WebSocket.OPEN && existing.ws !== ws) {
          sendJson(ws, { type: "error", message: "duplicate agentId; already connected" });
          try { ws.close(4002, "duplicate agentId"); } catch {}
          return;
        }

        ws.agentId = incomingId;
        agents.set(ws.agentId, { ws, info: msg });
        console.log(`[agent:hello] ${connId} => agentId=${ws.agentId} openAgents=${countOpen(agents)}`);
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
        return;
      }

      // Agent'tan gelen streaming/yanıt paketlerini adminlere aktar
      if (
        msg.type === "resp" ||
        msg.type === "file" ||
        msg.type === "console_chunk" ||
        msg.type === "console_end"
      ) {
        broadcastAdmins({ type: msg.type, agentId: ws.agentId, payload: msg, ...msg });
        return;
      }

      // Bilinmeyen agent mesajlarını şimdilik yok say
      return;
    }
    // ---------- /AGENT DAL ---------- //

    // ---------- ADMIN DAL ---------- //
    if (ws.kind === "admin") {
      // 1) Komutları agent'a ilet
      if (msg.type === "cmd") {
        if (!msg.target || !msg.cmd) { sendJson(ws, { type: "error", message: "bad cmd payload" }); return; }
        const entry = agents.get(msg.target);
        if (entry && entry.ws.readyState === WebSocket.OPEN) {
          try { entry.ws.send(JSON.stringify(msg)); } catch {}
        } else {
          sendJson(ws, { type: "error", message: "agent not available" });
        }
        return;
      }

      // 2) Dosya transfer iletileri (start/chunk/end) forward
      if (msg.type === "file") {
        if (!msg.target || !msg.mode) { sendJson(ws, { type: "error", message: "bad file payload" }); return; }
        const entry = agents.get(msg.target);
        if (entry && entry.ws.readyState === WebSocket.OPEN) {
          try { entry.ws.send(JSON.stringify(msg)); } catch {}
        } else {
          sendJson(ws, { type: "error", message: "agent not available" });
        }
        return;
      }

      // Diğer admin tipleri için case eklenebilir
      return;
    }
    // ---------- /ADMIN DAL ---------- //
  });

  if (isAgent) {
    if (!AGENT_TOKENS.includes(token)) {
      sendJson(ws, { type: "error", message: "unauthorized agent" });
      ws.close();
      return;
    }
    ws.kind = "agent";
    ws.agentId = null;
    return;
  }

  if (isAdmin) {
    if (!ADMIN_TOKENS.includes(token)) {
      sendJson(ws, { type: "error", message: "unauthorized admin" });
      ws.close();
      return;
    }
    ws.kind = "admin";
    admins.add(ws);
    sendJson(ws, { type: "hello", bootId: BOOT_ID });
    sendJson(ws, { type: "agent_list", agents: [...agents.keys()] });
    return;
  }

  sendJson(ws, { type: "error", message: "unknown path" });
  ws.close();
});

// Upgrade
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

server.listen(PORT, () => console.log("WS broker listening on", PORT));
