// server.js - verbose logs, no auto-terminate

const http = require("http");
const express = require("express");
const morgan = require("morgan");
const WebSocket = require("ws");

const app = express();
app.use(morgan("dev"));

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/healthz", (req, res) => res.status(200).json({ ok: true }));

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

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

wss.on("connection", (ws, req) => {
  const connId = Math.random().toString(36).slice(2, 8);
  ws.connId = connId;

  const url = req.url || "/";
  const ua = req.headers["user-agent"] || "-";
  const isAgent = url.startsWith("/agent");
  const isAdmin = url.startsWith("/admin");
  const params = parseQS(url);
  const token = params.get("token") || "";

  console.log(`[open] ${connId} path=${url} ua="${ua}"`);

  ws.on("error", (err) => {
    console.error(`[error] ${connId}`, err && err.message ? err.message : err);
  });

  ws.on("close", (code, reasonBuf) => {
    const reason = reasonBuf ? reasonBuf.toString() : "";
    console.log(`[close] ${connId} code=${code} reason="${reason}" kind=${ws.kind || "-"} agentId=${ws.agentId || "-"}`);

    if (ws.kind === "agent" && ws.agentId && agents.has(ws.agentId)) {
      agents.delete(ws.agentId);
      broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
    }
    if (ws.kind === "admin") admins.delete(ws);
  });

  ws.on("message", (buf) => {
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

    // uygulama-level ping/heartbeat
    if (msg.type === "heartbeat" || msg.type === "ping") {
      // istersen yanıt:
      // sendJson(ws, { type: "pong", ts: Date.now() });
      return;
    }

    if (ws.kind === "agent") {
      if (msg.type === "hello") {
        ws.agentId = msg.agentId || ("agent-" + Math.random().toString(36).slice(2, 8));
        agents.set(ws.agentId, { ws, info: msg });
        console.log(`[agent:hello] ${connId} => agentId=${ws.agentId}`);
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
      } else if (msg.type === "resp" || msg.type === "file" || msg.type === "console_chunk" || msg.type === "console_end") {
        // adminlere aynen aktar
        broadcastAdmins({ type: msg.type, agentId: ws.agentId, payload: msg, ...msg });
      } else {
        console.log(`[agent:msg] ${connId}`, msg.type);
      }
      return;
    }

    if (ws.kind === "admin") {
      if (msg.type === "cmd" && msg.target && msg.cmd) {
        const entry = agents.get(msg.target);
        if (entry && entry.ws.readyState === WebSocket.OPEN) {
          sendJson(entry.ws, msg);
        } else {
          sendJson(ws, { type: "error", message: "agent not available" });
        }
      } else {
        console.log(`[admin:msg] ${connId}`, msg.type);
      }
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
    // bağlanır bağlanmaz adminlere mevcut listeyi yollamak gerekmiyor (hello sonrası gönderiyoruz)
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

// accept /agent and /admin
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

server.listen(PORT, () => console.log("WS broker listening on", PORT));
