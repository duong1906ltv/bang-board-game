"use client";

// In-game voice/video chat, fully self-hosted (no Google Meet / third-party SDK).
//
// Topology is a MESH: every participant holds a direct WebRTC peer connection to
// every other participant, so audio/video never touches our server. The Socket.IO
// connection is used only for signaling (relaying SDP offers/answers and ICE
// candidates) and is reused from the game — the call lives in the same room code.
//
// Glare avoidance: the socket that just joined is always the offerer toward the
// peers already present (delivered in `rtcReady`); existing peers wait for that
// offer (triggered by `rtcPeerJoin`). No two peers ever offer each other at once.
//
// ICE servers (STUN + TURN) come from the server at join time (`rtcReady`), so
// TURN credentials are never baked into the client bundle and can rotate freely.

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socketClient";
import { RtcPeer, RtcSignalData } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";

// Per-peer bookkeeping kept in a ref (not state) so callbacks never go stale.
interface PeerRecord {
  pc: RTCPeerConnection;
  playerId: string;
  name: string;
  remoteSet: boolean; // has setRemoteDescription completed?
  pending: RTCIceCandidateInit[]; // ICE candidates that arrived before the answer/offer
}

// One entry per remote peer. Nothing renders them directly: audio goes to AudioSink,
// and the streams are still published upward via `onFeeds` for any caller that wants
// the picture — nothing in the 3D scene does since the WANTED posters were removed.
interface Tile {
  id: string; // socket id
  playerId: string; // seat identity — kept so a feed can be matched back to a seat
  name: string;
  stream: MediaStream | null;
}

// Nothing here is on screen — this call is voice-only now — but a peer's VOICE has
// to come out of somewhere. It used to come out of visible video tiles, so without
// this sink the call would go silent the moment they were removed.
//
// Audio-only sink: no width/height, never painted, just plays.
function AudioSink({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

export default function VideoChat({
  code,
  selfPlayerId,
  onFeeds,
}: {
  code: string;
  selfPlayerId?: string; // your seat id, so your own feed is published alongside the rest
  // Publishes `playerId -> stream` upward for anyone who wants to show the
  // picture. Currently nobody does — the 3D table stopped painting feeds when the
  // WANTED posters were removed, so this is voice-only in practice. This component
  // stays the sole owner of the peer connections; it only shares the streams.
  onFeeds?: (feeds: Map<string, MediaStream>) => void;
}) {
  const locale = useLocale();
  const [active, setActive] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);

  // Live values shared with signaling callbacks.
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerRecord>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);

  // Merge one peer's fields into the tile list. Partial on purpose: callers that
  // only learned the seat identity must not clobber a stream already attached.
  const upsertTile = useCallback((t: Partial<Tile> & { id: string }) => {
    setTiles((prev) => {
      const i = prev.findIndex((p) => p.id === t.id);
      if (i === -1) return [...prev, { playerId: "", name: "", stream: null, ...t }];
      const next = prev.slice();
      next[i] = { ...next[i], ...t };
      return next;
    });
  }, []);

  // Ask for the camera + mic. On success we flip `active`, which arms the
  // signaling effect below (which then announces us to the room).
  async function startMedia() {
    setError("");
    try {
      // Constrained on purpose. Bare `video: true` lets the browser pick, often
      // 720p, and in a mesh call every participant ENCODES that separately for each
      // of the other six — the single most expensive thing this page asks of a
      // laptop. Nothing displays the picture at all since the WANTED posters went,
      // so 480x360 at 20fps is already more than anyone will ever see of it.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 480 },
          height: { ideal: 360 },
          frameRate: { ideal: 20, max: 24 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(true);
      setCamOn(true);
      setActive(true);
    } catch (e) {
      setError(L(locale, "Không truy cập được camera/mic", "Could not access camera/mic"));
    }
  }

  // Turn everything off. Flipping `active` runs the effect cleanup, which closes
  // the peer connections and tells the room we left.
  function stopMedia() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setActive(false);
  }

  // Leaving the room unmounts this component without going through stopMedia, and
  // the [active] cleanup only tears down the peers — the local tracks keep the
  // camera light on for the rest of the tab's life.
  useEffect(
    () => () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    },
    []
  );

  function toggleMic() {
    const s = localStreamRef.current;
    if (!s) return;
    const on = !micOn;
    s.getAudioTracks().forEach((t) => (t.enabled = on));
    setMicOn(on);
  }

  function toggleCam() {
    const s = localStreamRef.current;
    if (!s) return;
    const on = !camOn;
    s.getVideoTracks().forEach((t) => (t.enabled = on));
    setCamOn(on);
  }

  // All signaling lives here; it runs only while media is active so the peer
  // connections and socket listeners share one lifecycle.
  useEffect(() => {
    if (!active) return;
    const socket = getSocket();

    const send = (to: string, data: RtcSignalData) => socket.emit("rtcSignal", { code, to, data });

    // `initiator` = the side that sends the offer; see the glare rule in the header.
    function ensurePeer(peerId: string, playerId: string, name: string, initiator: boolean): PeerRecord {
      const existing = peersRef.current.get(peerId);
      if (existing) {
        // An early `rtcSignal` can create the record before we know who it is.
        // Backfill the seat identity once rtcReady/rtcPeerJoin tells us, otherwise
        // this feed would stay unplaceable on the table forever.
        if (playerId && !existing.playerId) {
          existing.playerId = playerId;
          existing.name = name;
          upsertTile({ id: peerId, playerId, name });
        }
        return existing;
      }

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const rec: PeerRecord = { pc, playerId, name, remoteSet: false, pending: [] };
      peersRef.current.set(peerId, rec);

      localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) send(peerId, { candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => upsertTile({ id: peerId, playerId, name, stream: e.streams[0] ?? null });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(peerId);
      };

      upsertTile({ id: peerId, playerId, name, stream: null }); // register the peer now, so the audio wiring exists before the stream lands

      if (initiator) {
        (async () => {
          try {
            await pc.setLocalDescription(await pc.createOffer());
            send(peerId, { sdp: pc.localDescription! });
          } catch {}
        })();
      }
      return rec;
    }

    function dropPeer(peerId: string) {
      const rec = peersRef.current.get(peerId);
      if (!rec) return;
      try {
        rec.pc.close();
      } catch {}
      peersRef.current.delete(peerId);
      setTiles((prev) => prev.filter((t) => t.id !== peerId));
    }

    // Handshake: our ICE config + the peers already in the call (we offer to them).
    const onReady = (d: { selfId: string; iceServers: RTCIceServer[]; peers: RtcPeer[] }) => {
      iceServersRef.current = d.iceServers;
      d.peers.forEach((p) => ensurePeer(p.id, p.playerId, p.name, true));
    };
    // A newcomer appeared; we wait for their offer (they are the initiator).
    const onPeerJoin = (p: RtcPeer) => ensurePeer(p.id, p.playerId, p.name, false);
    const onPeerLeave = (d: { id: string }) => dropPeer(d.id);

    const onSignal = async ({ from, data }: { from: string; data: RtcSignalData }) => {
      // A signal can arrive before rtcReady/rtcPeerJoin named this peer; the seat
      // identity is filled in by whichever of those events lands afterwards.
      const rec = peersRef.current.get(from) ?? ensurePeer(from, "", "Player", false);
      const pc = rec.pc;
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          rec.remoteSet = true;
          for (const c of rec.pending) await pc.addIceCandidate(c).catch(() => {});
          rec.pending = [];
          if (data.sdp.type === "offer") {
            await pc.setLocalDescription(await pc.createAnswer());
            send(from, { sdp: pc.localDescription! });
          }
        } else if (data.candidate) {
          if (rec.remoteSet) await pc.addIceCandidate(data.candidate).catch(() => {});
          else rec.pending.push(data.candidate); // buffer until we have the remote description
        }
      } catch {}
    };

    socket.on("rtcReady", onReady);
    socket.on("rtcPeerJoin", onPeerJoin);
    socket.on("rtcPeerLeave", onPeerLeave);
    socket.on("rtcSignal", onSignal);
    socket.emit("rtcJoin", { code });

    return () => {
      socket.emit("rtcLeave", { code });
      socket.off("rtcReady", onReady);
      socket.off("rtcPeerJoin", onPeerJoin);
      socket.off("rtcPeerLeave", onPeerLeave);
      socket.off("rtcSignal", onSignal);
      peersRef.current.forEach((rec) => {
        try {
          rec.pc.close();
        } catch {}
      });
      peersRef.current.clear();
      setTiles([]);
    };
  }, [active, code, upsertTile]);

  // Hand the seat-keyed feeds to the parent whenever they change. Peers whose
  // identity hasn't arrived yet (playerId "") are skipped rather than guessed.
  // Your own stream goes in too, so a caller sees every seat, itself included.
  useEffect(() => {
    if (!onFeeds) return;
    const m = new Map<string, MediaStream>();
    if (selfPlayerId && localStream) m.set(selfPlayerId, localStream);
    for (const t of tiles) if (t.playerId && t.stream) m.set(t.playerId, t.stream);
    onFeeds(m);
  }, [tiles, onFeeds, selfPlayerId, localStream]);

  const btn: React.CSSProperties = { width: "auto", padding: "6px 10px", fontSize: "0.85rem" };

  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 45, display: "flex", flexDirection: "column", gap: 8, maxWidth: "min(72vw, 640px)" }}>
      {/* Voice only. Your own stream is never sunk here: hearing yourself back
          is a feedback loop. */}
      {tiles.map((t) => (
        <AudioSink key={t.id} stream={t.stream} />
      ))}

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {!active ? (
          <button className="ghost" style={btn} onClick={startMedia}>
            🎥 {L(locale, "Bật camera/mic", "Start camera/mic")}
          </button>
        ) : (
          <>
            <button className="ghost" style={btn} onClick={toggleMic} title={L(locale, "Bật/tắt mic", "Toggle mic")}>
              {micOn ? "🎙️" : "🔇"}
            </button>
            <button className="ghost" style={btn} onClick={toggleCam} title={L(locale, "Bật/tắt camera", "Toggle camera")}>
              {camOn ? "📷" : "🚫"}
            </button>
            <button className="ghost" style={{ ...btn, color: "#e77" }} onClick={stopMedia}>
              {L(locale, "Rời", "Leave")}
            </button>
          </>
        )}
      </div>
      {error && <p className="err" style={{ margin: 0, fontSize: "0.8rem" }}>{error}</p>}
    </div>
  );
}
