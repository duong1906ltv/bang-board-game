// Custom Next.js server that also hosts the Socket.IO game transport.
// SCOPE: room layer only — create/join/rejoin/start/turn/restart. Card-play
// events are added with the card layer.
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "./lib/types";
import * as game from "./lib/game";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });

  // Send every connected player their OWN personalized (hidden-info-filtered) view.
  function broadcast(code: string) {
    const room = game.getRoom(code);
    if (!room) return;
    ensureDraftTimer(room, code);
    for (const p of room.players) {
      if (p.socketId && p.connected) {
        io.to(p.socketId).emit("view", game.buildView(room, p.id));
      }
    }
  }

  // Schedule the 30s draft deadline once, when the draft phase begins. When it
  // fires, unpicked players are auto-resolved by rank and the game starts.
  function ensureDraftTimer(room: game.Room, code: string) {
    if (room.phase === "drafting" && room.draftEndsAt && !room.draftTimer) {
      const ms = Math.max(0, room.draftEndsAt - Date.now());
      room.draftTimer = setTimeout(() => {
        room.draftTimer = null;
        if (game.draftTimeout(code)) broadcast(code);
      }, ms);
    }
  }

  // Resolve which player a socket belongs to within a room.
  function playerIdOf(code: string, socketId: string): string | null {
    const room = game.getRoom(code);
    if (!room) return null;
    return room.players.find((p) => p.socketId === socketId)?.id ?? null;
  }

  io.on("connection", (socket) => {
    socket.on("createRoom", ({ name }, cb) => {
      const { room, player } = game.createRoom(name, socket.id);
      socket.join(room.code);
      cb({ code: room.code, playerId: player.id });
      broadcast(room.code);
    });

    socket.on("joinRoom", ({ code, name }, cb) => {
      code = (code || "").toUpperCase().trim();
      const res = game.addPlayer(code, name, socket.id);
      if (!res.ok || !res.player) return cb({ ok: false, error: res.error });
      socket.join(code);
      cb({ ok: true, playerId: res.player.id });
      broadcast(code);
    });

    socket.on("rejoin", ({ code, playerId }, cb) => {
      code = (code || "").toUpperCase().trim();
      const res = game.rejoin(code, playerId, socket.id);
      if (!res.ok) return cb({ ok: false, error: res.error });
      socket.join(code);
      cb({ ok: true });
      broadcast(code);
    });

    socket.on("startGame", ({ code }) => {
      const res = game.startGame(code);
      if (!res.ok) return socket.emit("errorMsg", res.error || "Không thể bắt đầu");
      broadcast(code);
    });

    socket.on("pickCharacter", ({ code, characterId }) => {
      const pid = playerIdOf(code, socket.id);
      if (pid && game.pickCharacter(code, pid, characterId)) broadcast(code);
    });

    socket.on("drawCards", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      if (pid && game.drawCards(code, pid)) broadcast(code);
    });

    socket.on("discardCard", ({ code, cardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (pid && game.discardCard(code, pid, cardId)) broadcast(code);
    });

    socket.on("endTurn", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      const res = game.endTurn(code, pid);
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
    });

    socket.on("restart", ({ code }) => {
      if (game.restart(code)) broadcast(code);
    });

    socket.on("disconnect", () => {
      const room = game.disconnect(socket.id);
      if (room) broadcast(room.code);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Bang server ready on http://${hostname}:${port}`);
  });
});
