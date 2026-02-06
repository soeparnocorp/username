// chat.mjs
// Cloudflare Workers + Durable Objects chat server

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Create private room
    if (request.method === "POST" && url.pathname === "/api/room") {
      const room = crypto.randomUUID().replace(/-/g, "");
      return new Response(room, { status: 200 });
    }

    // WebSocket endpoint
    const match = url.pathname.match(/^\/api\/room\/([^/]+)\/websocket$/);
    if (match) {
      const roomName = match[1];
      const id = env.CHAT_ROOM.idFromName(roomName);
      const room = env.CHAT_ROOM.get(id);
      return room.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  }
};

export class ChatRoom {
  constructor(state) {
    this.state = state;
    this.sessions = new Map(); // websocket -> { name }
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    this.sessions.set(server, { name: null });

    server.addEventListener("message", evt => {
      let data;
      try {
        data = JSON.parse(evt.data);
      } catch {
        return;
      }

      // First message = user identity
      if (data.name && !this.sessions.get(server).name) {
        this.sessions.get(server).name = data.name;

        // Notify others
        this.broadcast({ joined: data.name }, server);

        // Send ready
        server.send(JSON.stringify({ ready: true }));
        return;
      }

      // Chat message
      if (data.message) {
        const session = this.sessions.get(server);
        if (!session.name) return;

        const payload = {
          name: session.name,
          message: data.message,
          timestamp: Date.now()
        };

        this.broadcast(payload);
      }
    });

    server.addEventListener("close", () => {
      const session = this.sessions.get(server);
      this.sessions.delete(server);
      if (session?.name) {
        this.broadcast({ quit: session.name });
      }
    });

    server.addEventListener("error", () => {
      server.close();
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  broadcast(msg, except = null) {
    const encoded = JSON.stringify(msg);
    for (const ws of this.sessions.keys()) {
      if (ws !== except) {
        try {
          ws.send(encoded);
        } catch {}
      }
    }
  }
}
