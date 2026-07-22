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
import { RtcSignalData } from "@/lib/types";
import { L, useLocale } from "@/lib/i18n";

// Per-peer bookkeeping kept in a ref (not state) so callbacks never go stale.
interface PeerRecord {
  pc: RTCPeerConnection;
  name: string;
  remoteSet: boolean; // has setRemoteDescription completed?
  pending: RTCIceCandidateInit[]; // ICE candidates that arrived before the answer/offer
}

// What the UI renders: one tile per remote peer.
interface Tile {
  id: string;
  name: string;
  stream: MediaStream | null;
}

// Small <video> wrapper that binds a MediaStream via ref (srcObject can't be set
// declaratively as an attribute).
function VideoTile({ stream, name, muted, mirror }: { stream: MediaStream | null; name: string; muted?: boolean; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div style={{ position: "relative", width: 132, height: 99, borderRadius: 10, overflow: "hidden", background: "#1a1410", border: "1px solid #3a2f22", flex: "0 0 auto" }}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: mirror ? "scaleX(-1)" : undefined }}
      />
      <span style={{ position: "absolute", left: 4, bottom: 3, right: 4, fontSize: "0.7rem", color: "#f4e9d6", textShadow: "0 1px 3px #000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </span>
    </div>
  );
}

export default function VideoChat({ code }: { code: string }) {
  const locale = useLocale();
  const [active, setActive] = useState(false); // is media on?
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);

  // Live values shared with signaling callbacks.
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerRecord>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([]);

  const upsertTile = useCallback((t: Tile) => {
    setTiles((prev) => {
      const i = prev.findIndex((p) => p.id === t.id);
      if (i === -1) return [...prev, t];
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

    // Build (or fetch) the connection to one peer. `initiator` sends the offer.
    function ensurePeer(peerId: string, name: string, initiator: boolean): PeerRecord {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      const rec: PeerRecord = { pc, name, remoteSet: false, pending: [] };
      peersRef.current.set(peerId, rec);

      localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current!));

      pc.onicecandidate = (e) => {
        if (e.candidate) send(peerId, { candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => upsertTile({ id: peerId, name, stream: e.streams[0] ?? null });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(peerId);
      };

      upsertTile({ id: peerId, name, stream: null }); // show a placeholder tile immediately

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
    const onReady = (d: { selfId: string; iceServers: RTCIceServer[]; peers: { id: string; name: string }[] }) => {
      iceServersRef.current = d.iceServers;
      d.peers.forEach((p) => ensurePeer(p.id, p.name, true));
    };
    // A newcomer appeared; we wait for their offer (they are the initiator).
    const onPeerJoin = (p: { id: string; name: string }) => ensurePeer(p.id, p.name, false);
    const onPeerLeave = (d: { id: string }) => dropPeer(d.id);

    const onSignal = async ({ from, data }: { from: string; data: RtcSignalData }) => {
      const rec = peersRef.current.get(from) ?? ensurePeer(from, "Player", false);
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

  const btn: React.CSSProperties = { width: "auto", padding: "6px 10px", fontSize: "0.85rem" };

  return (
    <div style={{ position: "fixed", left: 12, bottom: 12, zIndex: 40, display: "flex", flexDirection: "column", gap: 8, maxWidth: "min(72vw, 640px)" }}>
      {active && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: 6, background: "rgba(20,16,12,0.72)", borderRadius: 12, backdropFilter: "blur(4px)" }}>
          <VideoTile stream={localStream} name={L(locale, "Bạn", "You")} muted mirror />
          {tiles.map((t) => (
            <VideoTile key={t.id} stream={t.stream} name={t.name} />
          ))}
        </div>
      )}

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
