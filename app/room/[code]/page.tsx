"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity, loadLook } from "@/lib/socketClient";
import { PlayerView, type EventLevel } from "@/lib/types";
import TurnAlert from "@/components/TurnAlert";
import { L, useLocale, initLocale, tError } from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import type { GameError } from "@/lib/errors";
import { Draft } from "@/components/room/Draft";
import { Lobby } from "@/components/room/Lobby";
import { PendingNote } from "@/components/room/PendingNote";
import { ReactionPanel } from "@/components/room/ReactionPanel";
import { Table } from "@/components/room/Table";

// In-game voice/video (WebRTC). Client-only: uses getUserMedia / RTCPeerConnection.
const VideoChat = dynamic(() => import("@/components/VideoChat"), { ssr: false });

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || "").toUpperCase();
  const locale = useLocale();

  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<GameError | string | null>(null);
  const [copied, setCopied] = useState(false);
  // Tạm ẩn voice/video (chưa có người dùng). Bật lại: đổi thành true.
  const VOICE_CHAT_ENABLED = false;

  useEffect(() => {
    initLocale();
    const socket = getSocket();
    const playerId = loadIdentity(code);
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    function attemptRejoin() {
      if (!playerId) {
        router.replace("/");
        return;
      }
      // The look goes back up on every rejoin, not just on the way in: the server holds
      // it only for as long as the room lives, so after a restart this browser is the
      // only thing that still remembers which figure this seat was wearing.
      socket.timeout(8000).emit("rejoin", { code, playerId, look: loadLook() ?? undefined }, (err, res) => {
        if (err || !res?.ok) {
          setError(res?.error ?? { code: "no-such-room" as const });
          redirectTimer = setTimeout(() => router.replace("/"), 1200);
        }
      });
    }

    socket.on("view", setView);
    socket.on("errorMsg", setError);
    socket.on("connect", attemptRejoin);
    attemptRejoin();

    return () => {
      socket.off("view", setView);
      socket.off("errorMsg", setError);
      socket.off("connect", attemptRejoin);
      clearTimeout(redirectTimer);
    };
  }, [code, router]);

  function copyCode() {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {}); // clipboard permission denied / not a secure context
  }

  const socket = getSocket();
  const start = () => socket.emit("startGame", { code });
  const addBot = () => socket.emit("addBot", { code });
  const removeBot = () => socket.emit("removeBot", { code });
  const setEventLevel = (level: EventLevel) => socket.emit("setEventLevel", { code, level });
  const pick = (characterId: string) => socket.emit("pickCharacter", { code, characterId });
  const draw = (source?: "deck" | "discard" | "player", targetId?: string) =>
    socket.emit("drawCards", { code, source, targetId });
  const sidHeal = (cardIds: string[]) => socket.emit("sidHeal", { code, cardIds });
  const play = (cardId: string, targetId?: string, targetCardId?: string) =>
    socket.emit("playCard", { code, cardId, targetId, targetCardId });
  const respond = (type: "missed" | "beer" | "bang" | "pass", cardId?: string) =>
    socket.emit("respond", { code, type, cardId });
  const choose = (cardId: string) => socket.emit("choose", { code, cardId });
  const discard = (cardId: string) => socket.emit("discardCard", { code, cardId });
  const endTurn = () => socket.emit("endTurn", { code });
  const surrender = () => socket.emit("surrender", { code });
  const restart = () => socket.emit("restart", { code });
  const playAgain = () => socket.emit("playAgain", { code });

  if (!view) {
    return (
      <main className="wrap">
        <p className="muted">{L(locale, `Đang kết nối phòng ${code}…`, `Connecting to room ${code}…`)}</p>
        {error && <p className="err">{tError(locale, error)}</p>}
      </main>
    );
  }

  return (
    <main className="wrap">
      <Header code={code} copied={copied} onCopy={copyCode} />
      {error && <p className="err">{tError(locale, error)}</p>}

      {VOICE_CHAT_ENABLED && <VideoChat code={code} selfPlayerId={view.you.id} />}
      {/* calls you back when it is your turn or you must react while the tab is hidden */}
      <TurnAlert view={view} />

      {view.phase === "lobby" && (
        <Lobby view={view} onStart={start} onAddBot={addBot} onRemoveBot={removeBot} onSetEventLevel={setEventLevel} />
      )}
      {view.phase === "drafting" && <Draft view={view} onPick={pick} />}
      {(view.phase === "playing" || view.phase === "result") && (
        <Table view={view} onDraw={draw} onPlay={play} onDiscard={discard} onSidHeal={sidHeal} onEndTurn={endTurn} onSurrender={surrender} onRestart={restart} onPlayAgain={playAgain} onChoose={choose} />
      )}

      {view.pending &&
        (view.pending.youMustRespond ? (
          <ReactionPanel view={view} onRespond={respond} onChoose={choose} />
        ) : (
          <PendingNote view={view} />
        ))}
    </main>
  );
}

function Header({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  const locale = useLocale();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <h1 style={{ fontSize: "1.8rem" }}>🤠 Bang!</h1>
      <div className="row" style={{ alignItems: "center" }}>
        <span className="muted">{L(locale, "Mã phòng:", "Room:")}</span>
        <span className="code-pill" style={{ fontSize: "1.2rem", letterSpacing: 4, padding: "6px 12px" }}>{code}</span>
        <button className="ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={onCopy}>
          {copied ? L(locale, "Đã chép ✓", "Copied ✓") : L(locale, "Chép", "Copy")}
        </button>
        <LangToggle padding="6px 10px" />
      </div>
    </div>
  );
}
