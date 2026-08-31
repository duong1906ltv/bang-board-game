// Custom Next.js server that also hosts the Socket.IO game transport: it wires
// every client event (create/join/rejoin, draft, card play, reactions, turn
// flow, restart) to the in-memory game engine and broadcasts filtered views.
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, RtcPeer, Look } from "./lib/types";
import * as game from "./lib/game";
import * as bot from "./lib/bot";

// How long between successive bot actions, so a human can follow along.
const BOT_TICK_MS = 850;
// The socket.io room every home-page listener sits in, so the room browser can be
// pushed to exactly the people looking at it and nobody else.
const HOME = "home";
// How long a "somebody is taking your card" dialog waits before waving itself through.
// Long enough to read a one-line sentence twice; short enough that an absent player is
// an eight-second pause rather than a dead table.
const ACK_MS = 8000;

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

  // Which body each player picked for their figure, by room and player id.
  //
  // Beside the engine rather than inside it: this is a costume, and the rules must not
  // be able to see it. It is also the only per-player state the server owns, so it is
  // the one thing here that has to answer for its own lifetime — see the sweep in
  // `disconnect`, which is where reaped rooms get collected.
  const looks = new Map<string, Map<string, Look>>();

  function remember(code: string, playerId: string, look?: Look) {
    if (!look) return;
    let m = looks.get(code);
    if (!m) looks.set(code, (m = new Map()));
    m.set(playerId, look);
  }

  // Push the room browser to whoever is on the home page.
  //
  // Both guards exist because this hangs off broadcast(), which runs after every
  // card played: without them a table mid-game would re-send an identical room
  // list on every action, to an audience that is usually nobody.
  let lastList = "";
  function emitLobbies() {
    if (!io.sockets.adapter.rooms.get(HOME)?.size) return;
    const lobbies = game.listLobbies();
    const json = JSON.stringify(lobbies);
    if (json === lastList) return;
    lastList = json;
    io.to(HOME).emit("roomList", lobbies);
  }

  // Send every connected player their OWN personalized (hidden-info-filtered) view.
  function broadcast(code: string) {
    const room = game.getRoom(code);
    if (!room) return;
    game.refillEmptyHands(room); // Suzy Lafayette
    const chosen = looks.get(code);
    // No draft/reaction countdowns: players take as long as they need. Only bots are
    // auto-paced (below), and the one acknowledgement that carries no decision (see
    // scheduleAck); every real human choice waits indefinitely.
    for (const p of room.players) {
      if (p.socketId && p.connected) {
        const view = game.buildView(room, p.id);
        // Painted on afterwards, so buildView never learns the field exists.
        if (chosen) for (const q of view.players) q.look = chosen.get(q.id);
        io.to(p.socketId).emit("view", view);
      }
    }
    scheduleBots(room, code);
    scheduleAck(room, code);
    emitLobbies();
  }

  // "Somebody is taking your card" waves itself through if nobody answers.
  //
  // The ONLY pending with a timer, and only because it is the only one with nothing to
  // decide: the victim cannot refuse, so the dialog exists to be read, and a read has a
  // natural length. Every other pending is a real choice and blocks forever by design.
  // Without this, the most common interruption in the game — a Panic! — would hand any
  // player who walked away the power to freeze the table.
  //
  // Cleared and restarted on every broadcast rather than tracked: while this pending is
  // open nothing else can act, so there is at most one spare broadcast to restart it.
  function scheduleAck(room: game.Room, code: string) {
    if (room.ackTimer) {
      clearTimeout(room.ackTimer);
      room.ackTimer = null;
    }
    const p = room.pending;
    if (p?.kind !== "taken") return;
    const victimId = p.victimId;
    room.ackTimer = setTimeout(() => {
      room.ackTimer = null;
      // Re-check: they may have acknowledged it in the meantime, and a different
      // pending may have opened since.
      const now = game.getRoom(code)?.pending;
      if (now?.kind !== "taken" || now.victimId !== victimId) return;
      if (game.respond(code, victimId, "pass").ok) broadcast(code);
    }, ACK_MS);
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

  // Room codes travel as user input (typed, pasted, from a URL), so every handler
  // normalises before touching the room map.
  function normCode(code: string | undefined): string {
    return (code || "").toUpperCase().trim();
  }

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

  // Host, or any seated human in a matchmade room (see game.mayStart).
  function canStart(code: string, socketId: string): boolean {
    const room = game.getRoom(code);
    const pid = playerIdOf(code, socketId);
    const player = room?.players.find((p) => p.id === pid);
    return !!room && !!player && game.mayStart(room, player);
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

  // Falls back to "Player": a peer can still be in the call after its seat is gone.
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
    const applyResult = (code: string, res: game.Result) => {
      if (res.ok) broadcast(code);
      else if (res.error) socket.emit("errorMsg", res.error);
    };

    // A room is listed in the browser unless the creator asked for a private one —
    // "private" meaning they have people to invite by code and a stranger walking
    // in would be a surprise, not a game.
    socket.on("createRoom", ({ name, look, private: isPrivate }, cb) => {
      const { room, player } = game.createRoom(name, socket.id, isPrivate === true);
      remember(room.code, player.id, look);
      socket.join(room.code);
      cb({ code: room.code, playerId: player.id });
      broadcast(room.code);
    });

    socket.on("joinRoom", ({ code, name, look }, cb) => {
      code = normCode(code);
      const res = game.addPlayer(code, name, socket.id);
      if (!res.ok || !res.player) return cb({ ok: false, error: res.error });
      remember(code, res.player.id, look);
      socket.join(code);
      cb({ ok: true, playerId: res.player.id });
      broadcast(code);
    });

    // The home page opens the room browser. The seat list is answered once here and
    // not pushed afterwards: a seat only stops being yours when somebody takes it,
    // and joinRoom/rejoin refuse that loudly enough on their own.
    socket.on("enterHome", ({ seats }, cb) => {
      socket.join(HOME);
      cb({ lobbies: game.listLobbies(), seats: game.mySeats((seats || []).slice(0, 8)) });
    });

    socket.on("leaveHome", () => {
      socket.leave(HOME);
    });

    socket.on("rejoin", ({ code, playerId, look }, cb) => {
      code = normCode(code);
      const res = game.rejoin(code, playerId, socket.id);
      if (!res.ok) return cb({ ok: false, error: res.error });
      remember(code, playerId, look);
      socket.join(code);
      cb({ ok: true });
      broadcast(code);
    });

    socket.on("startGame", ({ code }) => {
      if (!canStart(code, socket.id)) return;
      const res = game.startGame(code);
      if (!res.ok) return socket.emit("errorMsg", res.error ?? { code: "cannot-start" });
      broadcast(code);
    });

    // Random-event frequency. Host only, and only between games: changing the
    // density mid-game would rewrite the odds a live board was built around.
    socket.on("setEventLevel", ({ code, level }) => {
      if (!isHost(code, socket.id)) return;
      const room = game.getRoom(code);
      if (!room || room.phase === "playing") return;
      if (game.setEventLevel(code, level)) broadcast(code);
    });

    socket.on("addBot", ({ code }) => {
      if (!isHost(code, socket.id)) return; // host only
      const res = game.addBot(code);
      if (!res.ok) return socket.emit("errorMsg", res.error ?? { code: "cannot-add-bot" });
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

    // Same rule as startGame: at game over an AFK host must not block the rematch.
    socket.on("playAgain", ({ code }) => {
      if (!canStart(code, socket.id)) return;
      applyResult(code, game.playAgain(code));
    });

    // Enable camera/mic: register this socket and reply with ICE config + the
    // peers already in the call. The newcomer is the offerer to each of them,
    // which avoids offer/answer "glare" without any extra coordination.
    socket.on("rtcJoin", ({ code }) => {
      code = normCode(code);
      const myPlayerId = playerIdOf(code, socket.id);
      if (!myPlayerId) return; // only seated players may join the call
      let set = mediaRooms.get(code);
      if (!set) mediaRooms.set(code, (set = new Set()));
      // `playerId` travels with each peer so the client can pin a feed to a seat.
      // Matching by name would misplace feeds whenever two players share a name.
      const existing: RtcPeer[] = [...set]
        .filter((id) => id !== socket.id)
        .map((id) => ({ id, playerId: playerIdOf(code, id) ?? "", name: nameOf(code, id) }));
      set.add(socket.id);
      socket.emit("rtcReady", { selfId: socket.id, iceServers: iceServers(), peers: existing });
      const me: RtcPeer = { id: socket.id, playerId: myPlayerId, name: nameOf(code, socket.id) };
      for (const peer of existing) io.to(peer.id).emit("rtcPeerJoin", me);
    });

    // Disable camera/mic without leaving the game.
    socket.on("rtcLeave", ({ code }) => {
      leaveMedia(normCode(code), socket.id);
    });

        socket.on("rtcSignal", ({ to, data }) => {
      io.to(to).emit("rtcSignal", { from: socket.id, data });
    });

    socket.on("disconnect", () => {
      for (const code of mediaRooms.keys()) leaveMedia(code, socket.id);
      // The engine reaps empty rooms, and nothing tells us when. A socket closing is
      // the closest thing to a signal there is, and it is rare enough to afford a sweep.
      for (const code of looks.keys()) if (!game.getRoom(code)) looks.delete(code);
      const room = game.disconnect(socket.id);
      if (room) broadcast(room.code);
      // Unconditional: the room this socket was the last one in has just been
      // reaped, and a reaped room has no broadcast left to ride out on.
      else emitLobbies();
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Bang server ready on http://${hostname}:${port}`);
  });
});
