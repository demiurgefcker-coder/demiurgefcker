// server.js — soft idle heartbeat (no ws ping/pong)

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

// state
const agents = new Map(); // agentId -> { ws, info }
const admins = new Set(); // Set<ws>

const IDLE_TIMEOUT_MS = 120000; // 2 dakika

// helpers
function sendJson(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}
function broadcastAdmins(obj) {
  const s = JSON.stringify(obj);
  for (const a of admins) {
    if (a.readyState === WebSocket.OPEN) { try { a.send(s); } catch {} }
  }
}
function parseQS(url) {
  const q = url.split("?")[1] || "";
  return new URLSearchParams(q);
}
function markSeen(ws) {
  ws.lastSeen = Date.now();
}

// idle reaper (no ws.ping/pong)
setInterval(() => {
  const now = Date.now();

  // agents
  for (const [aid, entry] of agents) {
    const ws = entry.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (ws.lastSeen && (now - ws.lastSeen) > IDLE_TIMEOUT_MS) {
      try { ws.terminate(); } catch {}
    }
  }

  // admins
  for (const ws of admins) {
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (ws.lastSeen && (now - ws.lastSeen) > IDLE_TIMEOUT_MS) {
      try { ws.terminate(); } catch {}
    }
  }
}, 15000); // 15 sn’de bir kontrol

wss.on("connection", (ws, req) => {
  const url = req.url || "/";
  const isAgent = url.startsWith("/agent");
  const isAdmin = url.startsWith("/admin");
  const params = parseQS(url);
  const token = params.get("token") || "";

  markSeen(ws);

  ws.on("message", (buf) => {
    markSeen(ws);
    let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

    // Uygulama-level ping/heartbeat
    if (msg.type === "heartbeat" || msg.type === "ping") {
      // istersen anlık yanıt da ver:
      // sendJson(ws, { type: "pong", ts: Date.now() });
      return;
    }

    if (ws.kind === "agent") {
      if (msg.type === "hello") {
        ws.agentId = msg.agentId || ("agent-" + Math.random().toString(36).slice(2, 8));
        agents.set(ws.agentId, { ws, info: msg });
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
      } else if (msg.type === "resp" || msg.type === "file" || msg.type === "console_chunk" || msg.type === "console_end") {
        broadcastAdmins({ type: msg.type, agentId: ws.agentId, payload: msg, ...msg });
      }
      return;
    }

    if (ws.kind === "admin") {
      // {type:'cmd', id:'uuid', cmd:'...', target:'agentId', ...}
      if (msg.type === "cmd" && msg.target && msg.cmd) {
        const entry = agents.get(msg.target);
        if (entry && entry.ws.readyState === WebSocket.OPEN) {
          sendJson(entry.ws, msg);
        } else {
          sendJson(ws, { type: "error", message: "agent not available" });
        }
      }
      return;
    }
  });

  ws.on("close", () => {
    // agent disconnect cleanup
    if (ws.kind === "agent" && ws.agentId && agents.has(ws.agentId)) {
      agents.delete(ws.agentId);
      broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
    }
    // admin cleanup
    if (ws.kind === "admin") {
      admins.delete(ws);
    }
  });

  if (isAgent) {
    if (!AGENT_TOKENS.includes(token)) {
      sendJson(ws, { type: "error", message: "unauthorized agent" });
      return ws.close();
    }
    ws.kind = "agent";
    ws.agentId = null;
    return;
  }

  if (isAdmin) {
    if (!ADMIN_TOKENS.includes(token)) {
      sendJson(ws, { type: "error", message: "unauthorized admin" });
      return ws.close();
    }
    ws.kind = "admin";
    admins.add(ws);
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
