// Custom Next.js server that also hosts the Socket.IO game transport: it wires
// every client event (create/join/rejoin, draft, card play, reactions, turn
// flow, restart) to the in-memory game engine and broadcasts filtered views.
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, RtcPeer } from "./lib/types";
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

  // True only if this socket is the room's host. Guards lifecycle actions
  // (start/restart/playAgain/addBot/removeBot) so any client that merely knows
  // the room code can't reset or start someone else's game.
  function isHost(code: string, socketId: string): boolean {
    const room = game.getRoom(code);
    return !!room && playerIdOf(code, socketId) === room.hostId;
  }

  // --- WebRTC voice/video signaling ---------------------------------------
  // Media is peer-to-peer (mesh); the server only relays offer/answer/ICE and
  // tracks who currently has their camera/mic on, per room. `code -> set of
  // media-enabled socket ids`.
  const mediaRooms = new Map<string, Set<string>>();

  // ICE servers handed to browsers at call-join time. Read from env at RUNTIME
  // (not baked into the client bundle) so TURN credentials can rotate without a
  // rebuild. STUN is enough on open networks; TURN is the relay fallback for
  // peers behind strict NAT/firewalls. Set TURN_URL/TURN_USERNAME/TURN_CREDENTIAL
  // (and optionally STUN_URL) in the app's environment.
  function iceServers(): RTCIceServer[] {
    const list: RTCIceServer[] = [{ urls: process.env.STUN_URL || "stun:stun.l.google.com:19302" }];
    if (process.env.TURN_URL) {
      list.push({
        urls: process.env.TURN_URL.split(",").map((u) => u.trim()),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
    return list;
  }

  // Display name for a media peer (falls back gracefully if the player is gone).
  function nameOf(code: string, socketId: string): string {
    const room = game.getRoom(code);
    return room?.players.find((p) => p.socketId === socketId)?.name || "Player";
  }

  // Remove a socket from a room's call and notify the remaining peers.
  function leaveMedia(code: string, socketId: string) {
    const set = mediaRooms.get(code);
    if (!set || !set.delete(socketId)) return;
    if (set.size === 0) mediaRooms.delete(code);
    for (const other of set) io.to(other).emit("rtcPeerLeave", { id: socketId });
  }

  io.on("connection", (socket) => {
    // Apply a game-mutation result: rebroadcast on success, otherwise relay the
    // error (if any) to just this player.
    const applyResult = (code: string, res: { ok: boolean; error?: string }) => {
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
    };

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
      if (!isHost(code, socket.id)) return; // host only
      const res = game.startGame(code);
      if (!res.ok) return socket.emit("errorMsg", res.error || "Không thể bắt đầu");
      broadcast(code);
    });

    socket.on("addBot", ({ code }) => {
      if (!isHost(code, socket.id)) return; // host only
      const res = game.addBot(code);
      if (!res.ok) return socket.emit("errorMsg", res.error || "Không thêm được bot");
      broadcast(code);
    });

    socket.on("removeBot", ({ code }) => {
      if (!isHost(code, socket.id)) return; // host only
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
      applyResult(code, game.sidHeal(code, pid, cardIds));
    });

    socket.on("playCard", ({ code, cardId, targetId, targetCardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      applyResult(code, game.playCard(code, pid, cardId, targetId, targetCardId));
    });

    socket.on("respond", ({ code, type, cardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      applyResult(code, game.respond(code, pid, type, cardId));
    });

    socket.on("choose", ({ code, cardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      applyResult(code, game.choose(code, pid, cardId));
    });

    socket.on("discardCard", ({ code, cardId }) => {
      const pid = playerIdOf(code, socket.id);
      if (pid && game.discardCard(code, pid, cardId)) broadcast(code);
    });

    socket.on("endTurn", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      applyResult(code, game.endTurn(code, pid));
    });

    socket.on("surrender", ({ code }) => {
      const pid = playerIdOf(code, socket.id);
      if (!pid) return;
      if (game.surrender(code, pid).ok) broadcast(code);
    });

    socket.on("restart", ({ code }) => {
      if (!isHost(code, socket.id)) return; // host only
      if (game.restart(code)) broadcast(code);
    });

    socket.on("playAgain", ({ code }) => {
      if (!isHost(code, socket.id)) return; // host only
      applyResult(code, game.playAgain(code));
    });

    // Enable camera/mic: register this socket and reply with ICE config + the
    // peers already in the call. The newcomer is the offerer to each of them,
    // which avoids offer/answer "glare" without any extra coordination.
    socket.on("rtcJoin", ({ code }) => {
      code = (code || "").toUpperCase().trim();
      if (!playerIdOf(code, socket.id)) return; // only seated players may join the call
      let set = mediaRooms.get(code);
      if (!set) mediaRooms.set(code, (set = new Set()));
      const existing: RtcPeer[] = [...set]
        .filter((id) => id !== socket.id)
        .map((id) => ({ id, name: nameOf(code, id) }));
      set.add(socket.id);
      socket.emit("rtcReady", { selfId: socket.id, iceServers: iceServers(), peers: existing });
      const me: RtcPeer = { id: socket.id, name: nameOf(code, socket.id) };
      for (const peer of existing) io.to(peer.id).emit("rtcPeerJoin", me);
    });

    // Disable camera/mic without leaving the game.
    socket.on("rtcLeave", ({ code }) => {
      leaveMedia((code || "").toUpperCase().trim(), socket.id);
    });

    // Relay one SDP/ICE payload to a single target peer, tagged with the sender.
    socket.on("rtcSignal", ({ to, data }) => {
      io.to(to).emit("rtcSignal", { from: socket.id, data });
    });

    socket.on("disconnect", () => {
      for (const code of mediaRooms.keys()) leaveMedia(code, socket.id);
      const room = game.disconnect(socket.id);
      if (room) broadcast(room.code);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Bang server ready on http://${hostname}:${port}`);
  });
});
