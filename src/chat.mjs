export default {
  fetch(request, env) {
    let url = new URL(request.url);

    // WebSocket endpoint
    if (url.pathname.startsWith("/api/room/")) {
      return handleRoomRequest(request, env);
    }

    return new Response("Not found", { status: 404 });
  }
};

async function handleRoomRequest(request, env) {
  let url = new URL(request.url);
  let parts = url.pathname.split("/");

  // /api/room/@username/websocket
  let room = parts[3];

  if (!room || !room.startsWith("@")) {
    return new Response("Invalid room", { status: 400 });
  }

  let id = env.CHATROOM.idFromName(room);
  let stub = env.CHATROOM.get(id);

  return stub.fetch(request);
}

/* ============================
   Durable Object: ChatRoom
   ============================ */

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    this.sessions = new Map(); // websocket -> username
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    let pair = new WebSocketPair();
    let [client, server] = Object.values(pair);

    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async handleSession(ws) {
    ws.accept();

    let username = null;

    ws.addEventListener("message", async event => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch {
        ws.send(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }

      // First message must contain name
      if (!username && data.name) {
        username = data.name.slice(0, 32);
        this.sessions.set(ws, username);

        this.broadcast({
          joined: username
        });

        return;
      }

      // Regular message
      if (username && data.message) {
        let payload = {
          name: username,
          message: data.message.slice(0, 256),
          timestamp: Date.now()
        };

        this.broadcast(payload);
      }
    });

    ws.addEventListener("close", () => {
      if (username) {
        this.sessions.delete(ws);
        this.broadcast({ quit: username });
      }
    });
  }

  broadcast(message) {
    let encoded = JSON.stringify(message);

    for (let ws of this.sessions.keys()) {
      try {
        ws.send(encoded);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
}
