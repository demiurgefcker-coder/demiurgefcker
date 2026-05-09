const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || "change-this-token";

const wss = new WebSocket.Server({ port: PORT });

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

wss.on("connection", (ws) => {
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
        const target = clients.get(msg.targetId);

        if (!target) {
          return send(ws, {
            type: "error",
            message: "Client not found"
          });
        }

        return send(target, {
          type: "ping",
          from: "admin"
        });
      }

      if (msg.type === "send_message") {
        const target = clients.get(msg.targetId);

        if (!target) {
          return send(ws, {
            type: "error",
            message: "Client not found"
          });
        }

        return send(target, {
          type: "message",
          text: String(msg.text || "")
        });
      }
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
    }
  });

  ws.on("close", () => {
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
});

console.log(`WebSocket relay running on port ${PORT}`);
