// Minimal Render-compatible WebSocket broker
// Paths:
//   /agent?token=...  -> Agent connections
//   /admin?token=...  -> Admin client (your VB.NET Admin app)
// Env:
//   PORT (Render sets automatically)
//   AGENT_TOKENS="token1,token2"
//   ADMIN_TOKENS="admintoken1,admintoken2"

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

// helpers
function sendJson(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch {}
}
function broadcastAdmins(obj) {
  const s = JSON.stringify(obj);
  for (const a of admins) {
    if (a.readyState === WebSocket.OPEN) {
      try { a.send(s); } catch {}
    }
  }
}
function parseQS(url) {
  const q = url.split("?")[1] || "";
  return new URLSearchParams(q);
}

// heartbeat (avoid idle timeouts)
function installHeartbeat(ws) {
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));
}
setInterval(() => {
  const all = [
    ...admins,
    ...Array.from(agents.values()).map(x => x.ws)
  ];
  for (const ws of all) {
    if (!ws) continue;
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);

wss.on("connection", (ws, req) => {
  installHeartbeat(ws);
  const url = req.url || "/";
  const isAgent = url.startsWith("/agent");
  const isAdmin = url.startsWith("/admin");
  const params = parseQS(url);
  const token = params.get("token") || "";

  if (isAgent) {
    if (!AGENT_TOKENS.includes(token)) {
      sendJson(ws, { type: "error", message: "unauthorized agent" });
      return ws.close();
    }
    ws.kind = "agent";
    ws.agentId = null;

    ws.on("message", (buf) => {
      let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }

      if (msg.type === "hello") {
        ws.agentId = msg.agentId || ("agent-" + Math.random().toString(36).slice(2, 8));
        agents.set(ws.agentId, { ws, info: msg });
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });

      } else if (msg.type === "resp") {
        // forward raw response to admins
        broadcastAdmins({ type: "resp", agentId: ws.agentId, payload: msg });

      } else if (msg.type === "file") {
        // NEW: forward file transfer packets as top-level fields (no payload wrapper)
        // Admin app expects: {type:"file", agentId, id, mode, name?, size?, seq?, data?, sha256?}
        broadcastAdmins({
          type: "file",
          agentId: ws.agentId,
          id: msg.id,
          mode: msg.mode,
          name: msg.name,
          size: msg.size,
          seq: msg.seq,
          data: msg.data,
          sha256: msg.sha256
        });

        } else if (msg.type === "console_chunk") {
  broadcastAdmins({
    type: "console_chunk",
    agentId: ws.agentId,
    id: msg.id,
    stream: msg.stream,   // "stdout" | "stderr"
    data: msg.data
  });

} else if (msg.type === "console_end") {
  broadcastAdmins({
    type: "console_end",
    agentId: ws.agentId,
    id: msg.id,
    exitCode: msg.exitCode
  });


      } else if (msg.type === "error") {
        // optional: surface agent-side errors to admins
        broadcastAdmins({ type: "error", agentId: ws.agentId, message: msg.message || "agent error" });
      }
    });

    ws.on("close", () => {
      if (ws.agentId && agents.has(ws.agentId)) {
        agents.delete(ws.agentId);
        broadcastAdmins({ type: "agent_list", agents: [...agents.keys()] });
      }
    });

  } else if (isAdmin) {
    if (!ADMIN_TOKENS.includes(token)) {
      sendJson(ws, { type: "error", message: "unauthorized admin" });
      return ws.close();
    }
    ws.kind = "admin";
    admins.add(ws);
    sendJson(ws, { type: "agent_list", agents: [...agents.keys()] });

    ws.on("message", (buf) => {
      let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
      // expected: {type:'cmd', id:'uuid', cmd:'screenshot'|'run'|'getinfo'|'getfile'|'putfile_*'|..., target:'agentId', ...}
      if (msg.type === "cmd" && msg.target && msg.cmd) {
        const entry = agents.get(msg.target);
        if (entry && entry.ws.readyState === WebSocket.OPEN) {
          sendJson(entry.ws, msg);
        } else {
          sendJson(ws, { type: "error", message: "agent not available" });
        }
      }
    });

    ws.on("close", () => { admins.delete(ws); });

  } else {
    sendJson(ws, { type: "error", message: "unknown path" });
    ws.close();
  }
});

server.on("upgrade", (req, socket, head) => {
  // accept WS for both /agent and /admin paths
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

server.listen(PORT, () => console.log("WS broker listening on", PORT));

