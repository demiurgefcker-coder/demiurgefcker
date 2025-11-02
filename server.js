// server.js (stabil sürüm + admin->agent file forward)

const http = require("http");
const express = require("express");
const morgan = require("morgan");
const WebSocket = require("ws");

const app = express();
app.use(morgan("dev"));
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));

// server.js - app tanımının hemen altına
app.post('/receive', express.json({limit: '10mb'}), (req, res) => {
  // Basit 200 cevabı: agent'ın HTTP POST'larını reddetmemek için.
  // İstersen burada gelen veriyi loglayabilir veya özel işleyebilirsin.
  console.log('[http receive] body-size=', JSON.stringify(req.body).length);
  res.status(200).json({ ok: true });
});

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

// ❗ önemli: perMessageDeflate kapalı
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
  for (const a of admins) if (a.readyState === WebSocket.OPEN) { try { a.send(s); } catch {} }
}
function parseQS(url) { const q = url.split("?")[1] || ""; return new URLSearchParams(q); }

function countOpen(setOrMap) {
  if (setOrMap instanceof Set) return [...setOrMap].filter(ws => ws.readyState === WebSocket.OPEN).length;
  return [...setOrMap.values()].filter(x => x.ws && x.ws.readyState === WebSocket.OPEN).length;
}

// Sunucu-tarafı “yumuşak ping”: her 5 sn ufak paket
setInterval(() => {
  const payload = JSON.stringify({ type: "srv_ping", ts: Date.now() });
  for (const [aid, entry] of agents) {
    const ws = entry.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    try { ws.send(payload); } catch {}
  }
  for (const ws of admins) {
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    try { ws.send(payload); } catch {}
  }
}, 5000);

wss.on("connection", (ws, req) => {
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
      agents.delete(ws.agentId);
      broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
    }
    if (ws.kind === "admin") admins.delete(ws);
  });

  ws.on("message", (buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

    // Uygulama-level ping/pong
    if (msg.type === "heartbeat" || msg.type === "ping" || msg.type === "srv_pong") return;

    if (ws.kind === "agent") {
      if (msg.type === "hello") {
        ws.agentId = msg.agentId || ("agent-" + Math.random().toString(36).slice(2, 8));
        agents.set(ws.agentId, { ws, info: msg });
        console.log(`[agent:hello] ${connId} => agentId=${ws.agentId} openAgents=${countOpen(agents)}`);
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
      } else if (msg.type === "resp" || msg.type === "file" || msg.type === "console_chunk" || msg.type === "console_end") {
        // Agent'tan gelen yanıtları adminlere aktar
        broadcastAdmins({ type: msg.type, agentId: ws.agentId, payload: msg, ...msg });
      }
      return;
    }

    if (ws.kind === "admin") {
      // 1) Komutları forward et (cmd)
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

      // 2) Dosya transfer iletilerini forward et (file: start/chunk/end)
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

      // Diğer admin mesaj tipleri için buraya case ekleyebilirsin
      return;
    }
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

