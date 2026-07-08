// Custom Next.js server that also hosts the Socket.IO game transport.
// SCOPE: room layer only — create/join/rejoin/start/turn/restart. Card-play
// events are added with the card layer.
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "./lib/types";
import * as game from "./lib/game";
import * as bot from "./lib/bot";

// How long between successive bot actions, so a human can follow along.
const BOT_TICK_MS = 850;

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
    game.refillEmptyHands(room); // Suzy Lafayette
    // No draft/reaction countdowns: players take as long as they need. Only bots
    // are auto-paced (below); human picks/reactions never time out.
    for (const p of room.players) {
      if (p.socketId && p.connected) {
        io.to(p.socketId).emit("view", game.buildView(room, p.id));
      }
    }
    scheduleBots(room, code);
  }

  // If a bot is due to act, run one action after a short delay, then broadcast
  // again (which re-checks for the next bot action). One timer per room.
  function scheduleBots(room: game.Room, code: string) {
    if (room.botTimer || !bot.hasBotToAct(code)) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (bot.step(code)) broadcast(code);
    }, BOT_TICK_MS);
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

    socket.on("addBot", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      const room = game.getRoom(code);
      if (!room || pid !== room.hostId) return; // host only
      const res = game.addBot(code);
      if (!res.ok) return socket.emit("errorMsg", res.error || "Không thêm được bot");
      broadcast(code);
    });

    socket.on("removeBot", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      const room = game.getRoom(code);
      if (!room || pid !== room.hostId) return; // host only
      if (game.removeBot(code)) broadcast(code);
    });

    socket.on("pickCharacter", ({ code, characterId }) => {
      const pid = playerIdOf(code, socket.id);
      if (pid && game.pickCharacter(code, pid, characterId)) broadcast(code);
    });

    socket.on("drawCards", ({ code, source, targetId }) => {
      const pid = playerIdOf(code, socket.id);
      if (pid && game.drawCards(code, pid, source, targetId)) broadcast(code);
    });

    socket.on("sidHeal", ({ code, cardIds }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      const res = game.sidHeal(code, pid, cardIds);
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
    });

    socket.on("playCard", ({ code, cardId, targetId, targetCardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      const res = game.playCard(code, pid, cardId, targetId, targetCardId);
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
    });

    socket.on("respond", ({ code, type, cardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      const res = game.respond(code, pid, type, cardId);
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
    });

    socket.on("choose", ({ code, cardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      const res = game.choose(code, pid, cardId);
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
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

    socket.on("surrender", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      if (game.surrender(code, pid).ok) broadcast(code);
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
