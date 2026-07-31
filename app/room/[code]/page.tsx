"use client";

import { useEffect, useMemo, useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity } from "@/lib/socketClient";
import { Character, PlayerView, PlayerPublic, ROLE_EMOJI, type EventLevel, type EventView, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/types";
import { CARD_DEF_BY_ID, rankLabel, SUIT_SYMBOL, type Card } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { toggleMusic, setMusicVolume, getMusicVolume } from "@/lib/music";
import { getFx, setFx, getIntroSeen, setIntroSeen } from "@/lib/prefs";
import TurnAlert, { AlertToggle } from "@/components/TurnAlert";
import {
  L,
  useLocale,
  setLocale,
  initLocale,
  roleLabel,
  roleGoal,
  charAbility,
  eventName,
  eventDesc,
  eventLevelLabel,
  winnerText,
  formatPending,
  checkText,
  actionLabel,
  tError,
  logText,
} from "@/lib/i18n";
import { LangToggle } from "@/components/LangToggle";
import { CHARACTER_PHOTO } from "@/lib/characterArt";
import type { GameError } from "@/lib/errors";


// 3D table (react-three-fiber). Loaded client-only: Three.js needs the browser.
const TableScene = dynamic(() => import("@/components/three/TableScene"), { ssr: false });

// In-game voice/video (WebRTC). Client-only: uses getUserMedia / RTCPeerConnection.
const VideoChat = dynamic(() => import("@/components/VideoChat"), { ssr: false });

// Toggle + volume for the procedural wild-west background music (starts on this
// user gesture).
function MusicToggle() {
  const locale = useLocale();
  const [on, setOn] = useState(false);
  const [vol, setVol] = useState(getMusicVolume());
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        className="ghost"
        style={{ width: "auto", padding: "4px 10px", fontSize: "0.9rem" }}
        onClick={() => setOn(toggleMusic())}
        title={L(locale, "Nhạc nền miền Tây", "Wild-west background music")}
      >
        {on ? "🎵" : "🔇"}
      </button>
      {on && (
        <input
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={vol}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVol(v);
            setMusicVolume(v);
          }}
          title={L(locale, "Âm lượng nhạc", "Music volume")}
          style={{ width: 72, accentColor: "#e0a955", cursor: "pointer" }}
        />
      )}
    </span>
  );
}

// ─── Settings button (⚙️) ────────────────────────────────────────────────────
// Everything that is NOT match state lives in here (graphics, music, language, turn
// alerts, surrender), so the HUD outside can stay down to what you read constantly
// while playing: role, life, character, range.
//
//
// The button sits inside the HUD (`position:fixed; zIndex:55`), which is its own
// stacking context: an `absolute` child panel would be CLAMPED to level 55 and drawn
// over by later HUD siblings (banner 56, card row 55). Hence the panel is PORTALed to
// body, where zIndex 1300 really does sit above the shared ladder
// (scene 40 < cam/mic 45 < HUD 55 < modal).
function SettingsMenu({
  fx,
  onToggleFx,
  canSurrender,
  onSurrender,
}: {
  fx: boolean;
  onToggleFx: () => void;
  canSurrender?: boolean;
  onSurrender?: () => void;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Portals need a document, so nothing renders until after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <span>
      <button
        className="ghost"
        style={{ width: "auto", padding: "4px 10px", fontSize: "0.9rem" }}
        onClick={() => setOpen((o) => !o)}
        title={L(locale, "Cài đặt hiển thị", "Display settings")}
      >
        ⚙️
      </button>
      {open && mounted && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 1300 }} onClick={() => setOpen(false)} />
          <div
            style={{
              // Anchored under the HUD by hand (top:12 + ~40px tall): the portal left the button behind.
              position: "fixed",
              top: 62,
              left: 12,
              zIndex: 1301,
              minWidth: 240,
              maxWidth: "calc(100vw - 24px)",
              padding: 12,
              background: "rgba(16,13,10,0.98)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                opacity: 0.6,
                marginBottom: 8,
              }}
            >
              {L(locale, "Cài đặt", "Settings")}
            </div>
            <button
              className="ghost"
              style={{ width: "100%", padding: "8px 10px", fontSize: 13 }}
              onClick={onToggleFx}
            >
              {fx
                ? L(locale, "✨ Hiệu ứng: BẬT", "✨ Effects: ON")
                : L(locale, "○ Hiệu ứng: TẮT", "○ Effects: OFF")}
            </button>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8, lineHeight: 1.45 }}>
              {L(
                locale,
                "Ánh sáng loé đèn dầu + viền tối quanh bàn. Tắt đi nếu máy chạy chậm.",
                "Lamp bloom + vignette around the table. Turn off if the game runs slow."
              )}
            </div>
            <AlertToggle />

            <Divider />
            {/* Set once and forget — not worth HUD space. */}
            <Row label={L(locale, "Nhạc nền", "Music")}>
              <MusicToggle />
            </Row>
            <Row label={L(locale, "Ngôn ngữ", "Language")}>
              <LangToggle padding="6px 10px" />
            </Row>

            {canSurrender && onSurrender && (
              <>
                <Divider />
                <button
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 13,
                    background: "transparent", border: "1px solid #c0392b", color: "#ffb3a7",
                  }}
                  onClick={() => { setOpen(false); onSurrender(); }}
                >
                  {L(locale, "🏳️ Đầu hàng", "🏳️ Surrender")}
                </button>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.45 }}>
                  {L(
                    locale,
                    "Rời khỏi ván: lộ vai, bỏ hết bài. Có bước xác nhận.",
                    "Leave the game: role revealed, cards discarded. You'll be asked to confirm."
                  )}
                </div>
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "12px 0 10px" }} />;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 }}>
      <span style={{ fontSize: 13, opacity: 0.85 }}>{label}</span>
      {children}
    </div>
  );
}

// ─── Entry briefing ─────────────────────────────────────────────────────────
// Shown automatically only on this device's first game (localStorage); afterwards it
// is reachable from the ⓘ role badge.
function Briefing({
  role,
  character,
  onClose,
}: {
  role: NonNullable<PlayerView["you"]["role"]>;
  character: Character | null;
  onClose: () => void;
}) {
  const locale = useLocale();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: 520,
          maxHeight: "90%",
          overflowY: "auto",
          padding: 28,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>{ROLE_EMOJI[role]}</div>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, margin: "6px 0 2px" }}>
            {roleLabel(locale, role)}
          </div>
        </div>
        <p style={{ lineHeight: 1.7, color: "var(--text)", fontSize: 15, marginTop: 12 }}>
          🎯 {roleGoal(locale, role)}
        </p>
        {character && (
          <p style={{ lineHeight: 1.7, color: "var(--muted)", fontSize: 14, marginTop: 10 }}>
            🎭 <b style={{ color: "var(--accent)" }}>{character.name}</b> —{" "}
            {charAbility(locale, character.id)}
          </p>
        )}
        <div
          style={{
            marginTop: 18,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              opacity: 0.6,
            }}
          >
            {L(locale, "Cách chơi", "Controls")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Bấm lá trên tay để xem, rồi xác nhận để chơi.", "• Click a card in hand to inspect, then confirm to play.")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Lá cần mục tiêu: bấm người chơi quanh bàn để nhắm.", "• Targeted cards: click a player around the table to aim.")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Bấm badge 🎭 / ⓘ trên HUD để xem lại nhân vật và vai.", "• Use the 🎭 / ⓘ badges in the HUD to review your character and role.")}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)" }}>
            {L(locale, "• Máy chạy chậm? Vào ⚙️ tắt hiệu ứng đồ hoạ.", "• Running slow? Turn off effects in ⚙️.")}
          </div>
        </div>
        <button style={{ width: "auto", alignSelf: "center", marginTop: 18, padding: "10px 28px" }} onClick={onClose}>
          {L(locale, "Vào bàn", "Enter the table")}
        </button>
      </div>
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || "").toUpperCase();
  const locale = useLocale();

  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<GameError | string | null>(null);
  const [copied, setCopied] = useState(false);
  // Webcam feeds keyed by playerId, published by VideoChat and painted onto the
  // matching seat in the 3D table.
  const [feeds, setFeeds] = useState<Map<string, MediaStream>>(new Map());
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
      socket.timeout(8000).emit("rejoin", { code, playerId }, (err, res) => {
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

      {VOICE_CHAT_ENABLED && <VideoChat code={code} selfPlayerId={view.you.id} onFeeds={setFeeds} />}
      {/* calls you back when it is your turn or you must react while the tab is hidden */}
      <TurnAlert view={view} />

      {view.phase === "lobby" && (
        <Lobby view={view} onStart={start} onAddBot={addBot} onRemoveBot={removeBot} onSetEventLevel={setEventLevel} />
      )}
      {view.phase === "drafting" && <Draft view={view} onPick={pick} />}
      {(view.phase === "playing" || view.phase === "result") && (
        <Table view={view} feeds={feeds} onDraw={draw} onPlay={play} onDiscard={discard} onSidHeal={sidHeal} onEndTurn={endTurn} onSurrender={surrender} onRestart={restart} onPlayAgain={playAgain} />
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

// A small non-blocking banner for players who aren't the one acting on a pending.
function PendingNote({ view }: { view: PlayerView }) {
  const locale = useLocale();
  const p = view.pending!;
  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: "50%",
        transform: "translateX(-50%)",
        // Above the event banner (1120): a pending is the one thing the whole table
        // is waiting on, so it must outrank an informational announcement. Below it,
        // the banner's click-catcher swallowed the reaction buttons.
        zIndex: 1180,
        background: "rgba(20,18,16,0.92)",
        color: "#f0e2c0",
        padding: "8px 16px",
        borderRadius: 12,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        maxWidth: "90vw",
        lineHeight: 1.35,
        boxShadow: "0 4px 16px rgba(0,0,0,.5)",
        pointerEvents: "none",
      }}
    >
      <span style={{ fontSize: 18 }}>{PENDING_EMOJI[p.kind]}</span>
      <span>{formatPending(locale, p, view.you.name)}</span>
      {p.kind === "multi" && p.waiting && p.waiting.length > 0 && (
        <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>
          · {L(locale, "chờ", "waiting")}: {p.waiting.join(", ")}
        </span>
      )}
    </div>
  );
}

const PENDING_EMOJI: Record<string, string> = { bang: "🔫", dying: "💀", multi: "🎯", duel: "⚔️", store: "🏪", kit: "🎴", check: "🎲" };
const CHECK_ICON: Record<string, string> = { dynamite: "🧨", jail: "⛓️", barrel: "🛢️", blackjack: "🎴" };
// Card name → definition, so a card mentioned in the log can be clicked to view it.
const CARD_DEF_BY_NAME: Record<string, { id: string; name: string; effect: string }> = Object.fromEntries(
  Object.values(CARD_DEF_BY_ID).map((d) => [d.name, d])
);

function ReactionPanel({
  view,
  onRespond,
  onChoose,
}: {
  view: PlayerView;
  onRespond: (type: "missed" | "beer" | "bang" | "pass", cardId?: string) => void;
  onChoose: (cardId: string) => void;
}) {
  const locale = useLocale();
  const p = view.pending!;
  const you = view.you;

  const [open, setOpen] = useState(true);
  // A store/kit card the player tapped to read before committing. Picking used to
  // fire on the first tap off a thumbnail with no effect text anywhere, so choosing
  // from a General Store meant either knowing all 21 cards by their art or guessing.
  const [preview, setPreview] = useState<Card | null>(null);

  const doAction = (a: "missed" | "beer" | "bang" | "pass") => {
    if (a === "pass") return onRespond("pass");
    // Some characters may play one card as another (Calamity Janet swaps
    // Bang!/Missed!) — fall back to the swapped card so the reaction is still
    // possible without the literal card in hand.
    const swap = you.character?.effect.useAs;
    const alt =
      swap && swap.includes(a)
        ? swap[0] === a
          ? swap[1]
          : swap[0]
        : null;
    const card = you.hand.find((c) => c.defId === a) ?? (alt ? you.hand.find((c) => c.defId === alt) : undefined);
    onRespond(a, card?.id);
  };

  // Minimized: a small chip so you can look at your hand / other cards, then reopen.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: "50%",
          left: 12,
          transform: "translateY(-50%)",
          // See PendingNote: urgency ordering, above the event banner.
        zIndex: 1180,
          width: 150,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-start",
          textAlign: "left",
          lineHeight: 1.35,
          background: "var(--accent2)",
          boxShadow: "0 4px 16px rgba(0,0,0,.5)",
        }}
      >
        <span>{PENDING_EMOJI[p.kind]} {formatPending(locale, p, you.name)}</span>
        <span style={{ textDecoration: "underline" }}>{L(locale, "Phản ứng", "Respond")}</span>
      </button>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ color: "var(--accent)", position: "relative" }}>
        <button
          className="ghost"
          onClick={() => setOpen(false)}
          style={{ position: "absolute", top: 8, right: 8, width: "auto", padding: "4px 10px", fontSize: "0.8rem" }}
          title={L(locale, "Thu nhỏ để xem bài", "Minimize to view cards")}
        >
          {L(locale, "Xem bài ▾", "View cards ▾")}
        </button>
        <div className="modal-emoji">{PENDING_EMOJI[p.kind]}</div>
        <p className="modal-ability">{formatPending(locale, p, you.name)}</p>
        {p.kind === "bang" && (
          <p className="muted">
            {L(locale, `Cần ${(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! để né`, `Need ${(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! to dodge`)}
          </p>
        )}
        {p.kind === "multi" && p.waiting && p.waiting.length > 0 && (
          <p className="muted">{L(locale, "Đang chờ", "Waiting for")}: {p.waiting.join(", ")}</p>
        )}

        {/* Dynamite / Jail reveal: the actual card, big enough to read, with what it
            means underneath. Held here until dismissed — this is the only moment the
            player learns whether their turn survived. */}
        {p.kind === "check" && (
          <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", margin: "4px 0 12px" }}>
            {(p.checks ?? []).map((c, i) => {
              const t = checkText(locale, c.kind, c.outcome);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  {c.card && <PlayingCard card={c.card} size="sm" />}
                  <span style={{ fontWeight: 700 }}>{CHECK_ICON[c.kind] ?? "🎴"} {t.kind}</span>
                  <span className="muted">{t.outcome}</span>
                </div>
              );
            })}
          </div>
        )}

        {(p.kind === "store" || p.kind === "kit") && (
          <>
            <div className="card-row" style={{ justifyContent: "center" }}>
              {(p.storeCards ?? []).map((c) => (
                <PlayingCard
                  key={c.id}
                  card={c}
                  size="sm"
                  // Tapping opens the card full-size with its effect text; the pick
                  // itself is confirmed from there. Onlookers may read the cards too —
                  // they are face-up on the table — they just get no pick button.
                  onClick={() => setPreview(c)}
                  dimmed={!p.youMustRespond}
                />
              ))}
            </div>
            {/* Re-read from the live list: a card you were still reading about can be
                taken by whoever picks before you, and offering "take this" for a card
                that has already left the table is a rejection waiting to happen. */}
            {preview && (p.storeCards ?? []).some((c) => c.id === preview.id) && (
              <CardModal
                card={preview}
                showEffect
                onClose={() => setPreview(null)}
                actions={
                  p.youMustRespond
                    ? [
                        { label: L(locale, "Chọn lá này", "Take this card"), onClick: () => { setPreview(null); onChoose(preview.id); } },
                        { label: L(locale, "Đóng", "Close"), onClick: () => setPreview(null), ghost: true },
                      ]
                    : undefined
                }
              />
            )}
          </>
        )}

        {p.actions.map((a, i) => (
          <div key={a}>
            {i > 0 && <div style={{ height: 8 }} />}
            <button className={a === "pass" ? "ghost" : ""} onClick={() => doAction(a)}>
              {actionLabel(locale, a)}
            </button>
          </div>
        ))}

        {!p.youMustRespond && p.kind !== "store" && (
          <p className="muted" style={{ marginTop: 10 }}>{L(locale, "Đang chờ người khác…", "Waiting for others…")}</p>
        )}
      </div>
    </div>
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

function Lobby({
  view,
  onStart,
  onAddBot,
  onRemoveBot,
  onSetEventLevel,
}: {
  view: PlayerView;
  onStart: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onSetEventLevel: (level: EventLevel) => void;
}) {
  const locale = useLocale();
  const n = view.players.length;
  const botCount = view.players.filter((p) => p.isBot).length;
  const canStart = view.you.canStart && n >= MIN_PLAYERS && n <= MAX_PLAYERS;

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <h2 className="section-title">{L(locale, "Phòng chờ", "Lobby")}</h2>
      <p className="muted">
        {L(locale, `${n}/${MAX_PLAYERS} người · cần tối thiểu ${MIN_PLAYERS} để bắt đầu`, `${n}/${MAX_PLAYERS} players · need at least ${MIN_PLAYERS} to start`)}
      </p>

      <ul className="players">
        {view.players.map((p) => (
          <li key={p.id}>
            <span>
              <span className={`dot ${p.connected ? "on" : "off"}`} />
              {p.name}
              {p.id === view.you.id && <span className="muted"> {L(locale, "(bạn)", "(you)")}</span>}
            </span>
            {p.isBot ? (
              <span className="badge">AI 🤖</span>
            ) : (
              p.isHost && <span className="badge">{L(locale, "Chủ phòng ⭐", "Host ⭐")}</span>
            )}
          </li>
        ))}
      </ul>

      {view.roleSetup.length > 0 && (
        <>
          <label style={{ marginTop: 8 }}>{L(locale, `Phân bố vai với ${n} người`, `Roles for ${n} players`)}</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {view.roleSetup.map((r) => (
              <span key={r.role} className="badge">
                {ROLE_EMOJI[r.role]} {roleLabel(locale, r.role)} ×{r.count}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Random events: the house layer on top of the base rules. Host picks the
          density; everyone else just sees what the room is set to. */}
      <label style={{ marginTop: 12 }}>{L(locale, "Sự kiện ngẫu nhiên", "Random events")}</label>
      {view.you.isHost ? (
        <button
          className={view.eventLevel === "on" ? "" : "ghost"}
          style={{ width: "auto", padding: "8px 18px", fontSize: "0.9rem", alignSelf: "flex-start" }}
          onClick={() => onSetEventLevel(view.eventLevel === "on" ? "off" : "on")}
        >
          🎲 {view.eventLevel === "on" ? L(locale, "Sự kiện: BẬT", "Events: ON") : L(locale, "Sự kiện: TẮT", "Events: OFF")}
        </button>
      ) : (
        <span className="badge" style={{ alignSelf: "flex-start" }}>
          🎲 {eventLevelLabel(locale, view.eventLevel)}
        </span>
      )}
      <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
        {L(
          locale,
          "Đầu MỖI VÒNG — đúng lúc tới lượt Cảnh Sát Trưởng — bàn nhận 2–4 sự kiện cùng lúc, áp cho TẤT CẢ mọi người cho tới hết vòng: cấm bắn, bão cát, mưa bài, đảo chiều… Có hiệu lực ngay từ vòng đầu. Các sự kiện xung đột nhau không bao giờ ra cùng nhau, và không sự kiện nào lặp lại trong một ván.",
          "EVERY round — as play returns to the Sheriff — the table draws 2–4 events at once, all applying to EVERYONE until the round ends: no shooting, sandstorm, card rain, reversed order… Live from the very first round. Conflicting events are never drawn together, and no event repeats within a game."
        )}
      </p>

      {view.you.isHost && (
        <>
          <label style={{ marginTop: 12 }}>{L(locale, "Thêm AI để test", "Add AI for testing")}</label>
          <div className="row" style={{ gap: 8 }}>
            <button className="ghost" onClick={onAddBot} disabled={n >= MAX_PLAYERS}>
              {L(locale, "+ Thêm bot 🤖", "+ Add bot 🤖")}
            </button>
            <button className="ghost" onClick={onRemoveBot} disabled={botCount === 0}>
              {L(locale, "− Bớt bot", "− Remove bot")}
            </button>
          </div>
        </>
      )}

      <div style={{ height: 16 }} />
      {view.you.canStart ? (
        <button onClick={onStart} disabled={!canStart}>
          {n < MIN_PLAYERS ? L(locale, `Cần thêm ${MIN_PLAYERS - n} người`, `Need ${MIN_PLAYERS - n} more`) : L(locale, "Bắt đầu ván", "Start game")}
        </button>
      ) : (
        <p className="muted">{L(locale, "Đang chờ chủ phòng bắt đầu…", "Waiting for the host to start…")}</p>
      )}
    </div>
  );
}

// Fixed set of floating gold "dust motes" for the draft backdrop — fixed (not
// random) so they don't re-scatter on every render.
const DRAFT_DUST = [
  { x: 6, s: 5, dur: 11, delay: 0, o: 0.5 }, { x: 15, s: 3, dur: 14, delay: 3, o: 0.35 },
  { x: 24, s: 6, dur: 9, delay: 1.5, o: 0.6 }, { x: 33, s: 4, dur: 13, delay: 5, o: 0.4 },
  { x: 45, s: 3, dur: 16, delay: 2, o: 0.3 }, { x: 54, s: 5, dur: 10, delay: 4, o: 0.5 },
  { x: 63, s: 4, dur: 12, delay: 0.5, o: 0.45 }, { x: 72, s: 6, dur: 8, delay: 6, o: 0.55 },
  { x: 81, s: 3, dur: 15, delay: 2.5, o: 0.35 }, { x: 90, s: 5, dur: 11, delay: 4.5, o: 0.5 },
  { x: 39, s: 3, dur: 17, delay: 7, o: 0.3 }, { x: 96, s: 4, dur: 13, delay: 1, o: 0.4 },
];

function Draft({ view, onPick }: { view: PlayerView; onPick: (id: string) => void }) {
  const locale = useLocale();
  const draft = view.draft!;

  const locked = draft.youPicked;

  return (
    <div className="card draft-card" style={{ marginTop: 16 }}>
      <div className="draft-dust" aria-hidden>
        {DRAFT_DUST.map((d, i) => (
          <span
            key={i}
            style={{ left: `${d.x}%`, width: d.s, height: d.s, opacity: d.o, animationDuration: `${d.dur}s`, animationDelay: `${d.delay}s` }}
          />
        ))}
      </div>
      <div className="draft-head">
        <h2 className="section-title draft-title">{L(locale, "Chọn nhân vật", "Pick your character")}</h2>
        <p className="muted draft-sub">
          {L(locale, "Chọn 1 trong 2 — người này theo bạn suốt ván. Cứ thong thả, không giới hạn thời gian.", "Choose 1 of 2 — this hero is yours for the whole game. Take your time, no limit.")}
        </p>
        {view.you.role && (
          <div className="draft-role">
            <span className="draft-role-emoji">{ROLE_EMOJI[view.you.role]}</span>
            <span className="draft-role-text">
              <span className="draft-role-label">{L(locale, "Vai của bạn", "Your role")}</span>
              <strong>{roleLabel(locale, view.you.role)}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="draft-stage">
        {draft.choices.map((c, i) => {
          const picked = draft.yourPick?.id === c.id;
          const cls = ["draft-pick", locked && "draft-locked", locked && !picked && "draft-dimmed", picked && "draft-chosen"]
            .filter(Boolean)
            .join(" ");
          return [
            i > 0 ? <div key={`vs-${i}`} className="draft-vs">{L(locale, "hoặc", "or")}</div> : null,
            <div key={c.id} className={cls} style={{ animationDelay: `${i * 0.1}s` }} onClick={() => !locked && onPick(c.id)}>
              <div className="draft-face">
                <CharacterFace c={c} />
              </div>
              {picked ? (
                <div className="badge draft-badge">{L(locale, "Đã chọn ✓", "Picked ✓")}</div>
              ) : (
                !locked && <div className="draft-cta">{L(locale, "Chọn", "Choose")}</div>
              )}
            </div>,
          ];
        })}
      </div>

      <div className="draft-foot">
        <div className="draft-progress" title={`${draft.pickedCount}/${draft.totalCount}`}>
          {Array.from({ length: draft.totalCount }, (_, i) => (
            <span key={i} className={`draft-dot ${i < draft.pickedCount ? "on" : ""}`} />
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {locked
            ? L(locale, `Đã khóa · đang chờ ${draft.waitingFor.length} người`, `Locked · waiting for ${draft.waitingFor.length}`)
            : L(locale, "Đến lượt bạn quyết định", "Your call")}
          {" · "}
          {draft.pickedCount}/{draft.totalCount}
        </p>
      </div>
    </div>
  );
}

// Announcement for the batch of events a new round just drew. One panel listing all
// of them, not a queue shown one at a time: they take effect simultaneously, so
// reading them as a group is what tells you what this round actually plays like.
// Dismissed only by the player — X, click outside, or Escape. It used to fade out on
// a timer, which loses the announcement outright for anyone who happened to be
// looking at their hand: these change the rules of the round and are not optional
// reading. The dim backdrop is deliberately light so the table stays legible behind.
function EventBanner({ evs, onDone }: { evs: EventView[]; onDone: () => void }) {
  const locale = useLocale();
  return (
    <>
      <div
        onClick={onDone}
        style={{ position: "fixed", inset: 0, zIndex: 1119, background: "rgba(0,0,0,0.28)" }}
      />
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: "50%", top: "18%", transform: "translateX(-50%)",
        zIndex: 1120, width: "min(440px, 92vw)",
        padding: "14px 18px", borderRadius: 16, textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        background: "rgba(16,32,52,0.97)",
        border: "1px solid #5b9bd5",
        boxShadow: "0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(91,155,213,0.35)",
        animation: "eventPop .45s cubic-bezier(0.2,0.9,0.25,1) both",
      }}
    >
      <button
        onClick={onDone}
        aria-label={L(locale, "Đóng", "Close")}
        title={L(locale, "Đóng", "Close")}
        style={{
          position: "absolute", top: 6, right: 8, width: 28, height: 28, padding: 0,
          lineHeight: 1, fontSize: 16, fontWeight: 700, borderRadius: 8,
          background: "transparent", border: "1px solid rgba(240,226,192,0.35)", color: "#f0e2c0",
        }}
      >
        ✕
      </button>
      <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", opacity: 0.65, color: "#f0e2c0", paddingInline: 26 }}>
        {L(locale, `Sự kiện của vòng này · ${evs.length}`, `This round's events · ${evs.length}`)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {evs.map((ev) => (
          <div key={ev.seq} style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left" }}>
            <span style={{ fontSize: 26, lineHeight: 1.1, flex: "0 0 auto" }}>{ev.emoji}</span>
            <span>
              <span style={{ display: "block", fontSize: "1rem", fontWeight: 800, color: "#bfe0ff" }}>
                {eventName(locale, ev.id)}
              </span>
              <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.4, color: "#f0e2c0", opacity: 0.85 }}>
                {eventDesc(locale, ev.id)}
              </span>
            </span>
          </div>
        ))}
      </div>
      <button
        style={{ width: "auto", padding: "8px 22px", marginTop: 12, fontSize: 13 }}
        onClick={onDone}
      >
        {L(locale, "Đã hiểu", "Got it")}
      </button>
    </div>
    </>
  );
}

// The events currently in force, as ONE control. A round puts 2..4 of them on the
// board and a chip each turned the HUD corner into a wall of text; they are also a
// single fact — "this is what the round plays like" — so they belong in one place.
// Collapsed it shows just the emoji (enough to recognise at a glance) and the turn
// countdown; tapping opens the full list with what each one does.
function EventChips({ events }: { events: EventView[] }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "auto", padding: "3px 9px", fontSize: "0.82rem", fontWeight: 700,
          borderRadius: 8, color: "#f0e2c0", fontFamily: "system-ui, sans-serif",
          background: "rgba(16,32,52,0.92)",
          border: "1px solid rgba(91,155,213,0.7)",
          display: "flex", alignItems: "center", gap: 5,
        }}
        title={L(locale, "Xem sự kiện đang có hiệu lực", "See the events in force")}
      >
        <span style={{ fontSize: "0.95rem", letterSpacing: 1 }}>{events.map((e) => e.emoji).join("")}</span>
        <span style={{ opacity: 0.75, fontWeight: 600 }}>
          {events.length}
        </span>
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1160, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(400px, 92vw)", maxHeight: "80vh", overflowY: "auto", padding: "20px 22px", borderRadius: 16, background: "var(--panel)", border: "1px solid var(--border)", fontFamily: "system-ui, sans-serif" }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: 0.6, textAlign: "center" }}>
              {L(locale, "Sự kiện của vòng này", "This round's events")}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
              {events.map((ev) => (
                <div key={`${ev.id}-${ev.seq}`} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 26, lineHeight: 1.1, flex: "0 0 auto" }}>{ev.emoji}</span>
                  <span>
                    <span style={{ display: "block", fontWeight: 800, color: "var(--accent)" }}>
                      {eventName(locale, ev.id)}
                    </span>
                    <span className="muted" style={{ display: "block", fontSize: 13, lineHeight: 1.45 }}>
                      {eventDesc(locale, ev.id)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <button style={{ width: "auto", padding: "10px 24px", marginTop: 18, display: "block", marginInline: "auto" }} onClick={() => setOpen(false)}>
              {L(locale, "Đóng", "Close")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// One shared popup for showing a card face full-size on a dimmed backdrop. Used
// for inspecting a card (with its effect text) and for play/discard confirmations
// (with action buttons). Click the backdrop to dismiss.
function CardModal({
  card,
  onClose,
  showEffect,
  actions,
}: {
  card: Card;
  onClose: () => void;
  showEffect?: boolean;
  actions?: { label: string; onClick: () => void; ghost?: boolean }[];
}) {
  const locale = useLocale();
  const buttons = actions ?? [{ label: L(locale, "Đóng", "Close"), onClick: onClose }];
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div role="dialog" aria-modal="true" aria-label={card.name} onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 320 }}>
        <div style={{ transform: "scale(1.5)", transformOrigin: "top center", marginBottom: 70 }}>
          <PlayingCard card={card} hideCorner={card.id === "log"} />
        </div>
        {showEffect && (
          <p className="muted" style={{ textAlign: "center", lineHeight: 1.5, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
            {CARD_DEF_BY_ID[card.defId]?.effect}
          </p>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          {buttons.map((b, i) => (
            <button key={i} className={b.ghost ? "ghost" : ""} style={{ width: "auto", padding: "12px 24px" }} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Table({
  view,
  feeds,
  onDraw,
  onPlay,
  onDiscard,
  onSidHeal,
  onEndTurn,
  onSurrender,
  onRestart,
  onPlayAgain,
}: {
  view: PlayerView;
  feeds: Map<string, MediaStream>; // playerId -> webcam stream
  onDraw: (source?: "deck" | "discard" | "player", targetId?: string) => void;
  onPlay: (cardId: string, targetId?: string, targetCardId?: string) => void;
  onDiscard: (cardId: string) => void;
  onSidHeal: (cardIds: string[]) => void;
  onEndTurn: () => void;
  onSurrender: () => void;
  onRestart: () => void;
  onPlayAgain: () => void;
}) {
  const locale = useLocale();
  const isMyTurn = view.turnSeat != null && view.turnSeat === view.you.seat && view.you.alive;
  const you = view.you;
  // The end-of-turn hand limit is normally your life total, but events shift it
  // (Drought / Hangover), so the server sends the resolved number.
  const overLimit = Math.max(0, you.hand.length - you.handLimit);
  const inPlayPhase = isMyTurn && you.turnPhase !== "draw";
  const [aiming, setAiming] = useState<{ id: string; defId: string } | null>(null);
  const [sidPick, setSidPick] = useState<string[]>([]);
  const [sidPicking, setSidPicking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // User-resizable size for the 3D history panel; persisted across re-renders so
  // socket updates don't snap it back.
  const [logSize, setLogSize] = useState<{ w: number; h: number }>({ w: 240, h: 300 });
  // Newest-first log rows, with the card-name link position resolved. Formatting all
  // 40 entries is not free and this component re-renders on every pointermove while
  // a card is being dragged, so it only re-runs when the log or the language changes.
  const logRows = useMemo(
    () =>
      [...view.log].reverse().map((e) => {
        const text = logText(locale, e, you.name);
        const def = (e.kind === "play" || e.kind === "react") && e.card ? CARD_DEF_BY_NAME[e.card] : undefined;
        return { e, text, def, idx: def && e.card ? text.indexOf(e.card) : -1 };
      }),
    [view.log, locale, you.name]
  );
  // Your personal feed, newest first like the log above it. Formatted with your own
  // name so every line reads "… lên bạn" rather than repeating your name back at you.
  // `?? []` is load-bearing, not defensive noise: this view arrives over a socket from
  // whatever version the server happens to be running. A tab left open across a
  // server restart — or a rolling deploy — gets a payload built before this field
  // existed, and spreading undefined takes the whole table down with it.
  const inboxRows = useMemo(
    () => [...(you.inbox ?? [])].reverse().map((e) => ({ e, text: logText(locale, e, you.name) })),
    [you.inbox, locale, you.name]
  );
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [infoCard, setInfoCard] = useState<Card | null>(null);
  const [charView, setCharView] = useState<Character | null>(null);
  const [confirmPlay, setConfirmPlay] = useState<Card | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<Card | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [playerInfo, setPlayerInfo] = useState<PlayerPublic | null>(null);
  // Read after mount: localStorage is not available during SSR and would mismatch.
  const [fx, setFxState] = useState(true);
  // Auto-opens only on this device's first game.
  const [briefing, setBriefing] = useState(false);
  useEffect(() => {
    setFxState(getFx());
    if (!getIntroSeen()) setBriefing(true);
  }, []);
  const toggleFx = () => {
    setFxState((cur) => {
      setFx(!cur);
      return !cur;
    });
  };
  const closeBriefing = () => {
    setIntroSeen();
    setBriefing(false);
  };

  const inspectCard = (c: Card) => setInfoCard(c);
  const showLogCard = (def: { id: string; name: string }) =>
    setInfoCard({ id: "log", defId: def.id, name: def.name, suit: "spades", rank: 1 });
  const showRole = () => setBriefing(true);
  // Cards freshly added to your hand — animated in for a "draw" effect.
  const [justDrew, setJustDrew] = useState<Set<string>>(new Set());
  const prevHandRef = useRef<string[]>([]);
  const [marquee, setMarquee] = useState<string | null>(null);
  const lastCheckRef = useRef<string | null>(null);

  useEffect(() => {
    const c = view.checks[view.checks.length - 1];
    if (!c) return;
    const key = c.card?.id ?? `${c.name}-${c.kind}-${c.outcome}`;
    if (key === lastCheckRef.current) return;
    lastCheckRef.current = key;
    const t = checkText(locale, c.kind, c.outcome);
    const cardLabel = c.card ? ` (${rankLabel(c.card.rank)}${SUIT_SYMBOL[c.card.suit]})` : "";
    setMarquee(`${CHECK_ICON[c.kind] ?? "🎴"} ${c.name} — ${t.kind}${cardLabel}: ${t.outcome}`);
  }, [view.checks, locale]);

  // The batch a new round just drew, held for the banner. A whole round's events
  // arrive in one view update, so "everything above the seq watermark" IS the batch —
  // and the watermark means a view landing mid-banner never re-announces it.
  const [eventBatch, setEventBatch] = useState<EventView[]>([]);
  const seenSeqRef = useRef<number>(0);
  useEffect(() => {
    const fresh = view.eventFeed.filter((e) => e.seq > seenSeqRef.current);
    if (fresh.length === 0) return;
    seenSeqRef.current = fresh[fresh.length - 1].seq;
    setEventBatch(fresh);
  }, [view.eventFeed]);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const flash = (msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimerRef.current); // keep only the latest countdown
    noticeTimerRef.current = setTimeout(() => setNotice((cur) => (cur === msg ? "" : cur)), 1800);
  };
  // Clear the pending notice timer if the table unmounts mid-countdown.
  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  // Escape dismisses any open popup and cancels aim / Sid-pick mode — the same
  // exits the click-outside overlays offer, but for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setInfoCard(null); setCharView(null); setPlayerInfo(null); closeBriefing(); setEventBatch([]);
      setConfirmPlay(null); setConfirmDiscard(null); setConfirmSurrender(false);
      setAiming(null); setSidPicking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cur = you.hand.map((c) => c.id);
    const added = cur.filter((id) => !prevHandRef.current.includes(id));
    prevHandRef.current = cur;
    if (added.length > 0) {
      setJustDrew(new Set(added));
      const t = window.setTimeout(() => setJustDrew(new Set()), 650);
      return () => window.clearTimeout(t);
    }
  }, [you.hand]);

  // Drag the bottom-left grip to resize the right-docked 3D history panel: it
  // grows toward the left and down, so the grip follows the pointer naturally.
  // Holds the teardown for an in-progress resize drag, so an unmount while the
  // pointer is still held down doesn't leave listeners (and a stale setState
  // closure) attached to window.
  const resizeTeardownRef = useRef<(() => void) | null>(null);
  const startLogResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = logSize.w;
    const sh = logSize.h;
    const move = (ev: PointerEvent) => {
      setLogSize({
        w: Math.min(Math.max(sw + (sx - ev.clientX), 160), window.innerWidth * 0.85),
        h: Math.min(Math.max(sh + (ev.clientY - sy), 120), window.innerHeight * 0.85),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      resizeTeardownRef.current = null;
    };
    resizeTeardownRef.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  useEffect(() => () => resizeTeardownRef.current?.(), []);

  useEffect(() => {
    if (discarding && overLimit === 0) {
      onEndTurn();
      setDiscarding(false);
    }
  }, [discarding, overLimit, onEndTurn]);
  useEffect(() => {
    if (!inPlayPhase && discarding) setDiscarding(false);
  }, [inPlayPhase, discarding]);
  const TARGETED = ["bang", "jail", "panic", "cat-balou", "duel"];
  const canBurnToHeal = !!you.character?.effect.burnTwoToHeal;
  // A character whose useAs pair covers Bang! can fire the swapped card as one, so
  // that card aims like a Bang! (targeting + range) and counts against the
  // Bang!/turn limit.
  const swapPair = you.character?.effect.useAs;
  const bangLike = (defId: string) =>
    defId === "bang" || (!!swapPair && swapPair.includes("bang") && swapPair.includes(defId));
  const needsTarget = (defId: string) => TARGETED.includes(defId) || bangLike(defId);

  // Which plays are unavailable right now. The reasons (once-per-turn house rule,
  // random-event bans, the Bang! budget) are all resolved server-side and arrive as
  // `blockedDefIds` / `canBang`, so the client never re-derives a rule and can't
  // disagree with the engine. Returns true (and flashes why) when blocked, so the
  // player never aims into a silent server rejection.
  const blockOneCard = (defId: string) => {
    if (bangLike(defId) && !you.canBang) {
      flash(L(locale, "Bạn hết lượt Bang!", "No Bang! left this turn."));
      return true;
    }
    if (you.blockedDefIds.includes(defId)) {
      flash(
        you.playedDefsThisTurn.includes(defId)
          ? L(locale, "Lá này đã dùng trong lượt này", "This card was already played this turn.")
          : L(locale, "Sự kiện đang chặn lá này", "An event blocks this card.")
      );
      return true;
    }
    return false;
  };

  const cardAction = (card: { id: string; defId: string }) => {
    // Sid Ketchum can discard-to-heal any time, so his selection isn't gated by
    // being in your play phase.
    if (sidPicking) {
      const next = sidPick.includes(card.id) ? sidPick.filter((x) => x !== card.id) : [...sidPick, card.id];
      if (next.length === 2) {
        onSidHeal(next);
        setSidPick([]);
        setSidPicking(false);
      } else setSidPick(next);
      return;
    }
    if (!inPlayPhase) return;
    // A click discards only in explicit end-of-turn discard mode; otherwise it
    // always plays (or starts aiming), even while over the hand limit.
    if (discarding) return onDiscard(card.id);
    if (blockOneCard(card.defId)) return;
    if (needsTarget(card.defId)) {
      return setAiming((cur) => (cur?.id === card.id ? null : { id: card.id, defId: card.defId }));
    }
    onPlay(card.id);
  };

  // Dragging a card UP plays or aims it. Also reached from the confirm dialog, so it
  // must not assume a gesture is in progress.
  const playGesture = (card: { id: string; defId: string }) => {
    if (!inPlayPhase) return;
    if (blockOneCard(card.defId)) return;
    if (needsTarget(card.defId)) {
      return setAiming({ id: card.id, defId: card.defId });
    }
    onPlay(card.id);
  };
  // Tap/drag-up asks for confirmation first (so a stray touch can't play a card);
  // Sid selection and the "no Bang! left" case are handled without a dialog.
  const requestPlay = (card: Card) => {
    if (sidPicking) return cardAction(card);
    if (!inPlayPhase) return;
    // A tap just opens the confirm dialog (inspect the card first). Playability —
    // the Bang!/turn budget, the once-per-turn house rule, event bans — is checked
    // only when the player commits via "Đánh bài" (doConfirmedPlay -> playGesture ->
    // blockOneCard), so we never flash "no Bang! left" before they choose to play.
    setConfirmPlay(card);
  };
  const doConfirmedPlay = () => {
    const c = confirmPlay;
    setConfirmPlay(null);
    if (c) playGesture(c);
  };

  const discardGesture = (card: { id: string }) => {
    // Only when over the hand limit — which events can move, so it is not just hp.
    if (!inPlayPhase) return;
    if (you.hand.length <= you.handLimit) {
      return flash(L(locale, "Chỉ bỏ được khi số bài > giới hạn.", "Can only discard when over the hand limit."));
    }
    // Confirm first so a stray drag can't throw away a card.
    const c = you.hand.find((h) => h.id === card.id);
    if (c) setConfirmDiscard(c);
  };
  const doConfirmedDiscard = () => {
    const c = confirmDiscard;
    setConfirmDiscard(null);
    if (c) onDiscard(c.id);
  };

  // The engine resolves who each card may be aimed at (targetProblem in game.ts)
  // and ships the answer in the view, so this is pure lookup — no second rulebook.
  const canTarget = (p: (typeof view.players)[number]) => {
    if (!aiming) return false;
    const ids = aiming.defId === "jesse" ? you.legalDrawTargets : you.legalTargets[aiming.defId];
    return !!ids?.includes(p.id);
  };
  const fireAt = (targetId: string, targetCardId?: string) => {
    if (!aiming) return;
    if (aiming.defId === "jesse") onDraw("player", targetId);
    else onPlay(aiming.id, targetId, targetCardId);
    setAiming(null);
  };
  // Cat Balou / Panic! may hit a specific face-up card on the table.
  const pickCardMode = aiming?.defId === "cat-balou" || aiming?.defId === "panic";

  const aimText: Record<string, [string, string]> = {
    bang: [`Chọn mục tiêu Bang! (trong tầm ${you.range})`, `Choose a Bang! target (range ${you.range})`],
    missed: [`Dùng Né làm Bang! — chọn mục tiêu (trong tầm ${you.range})`, `Missed! as Bang! — choose a target (range ${you.range})`],
    jail: ["Chọn người để bỏ tù (không phải Sheriff)", "Choose someone to jail (not the Sheriff)"],
    panic: ["Khoảng cách 1: bấm kính nhắm (lấy 1 lá tay ngẫu nhiên) hoặc bấm lá xanh trên bàn để lấy lá đó", "Distance 1: click the scope (random hand card) or a table card to take it"],
    duel: ["Chọn người để Duel", "Choose someone to Duel"],
    jesse: ["Chọn người để rút 1 lá từ tay họ", "Choose whose hand to draw from"],
    "cat-balou": ["Bấm kính nhắm (bỏ 1 lá tay ngẫu nhiên) hoặc bấm lá xanh trên bàn để bỏ lá đó", "Click the scope (random hand card) or a table card to discard it"],
  };

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#141210" }}>
        <TableScene
          view={view}
          targetIds={aiming ? view.players.filter((p) => canTarget(p)).map((p) => p.id) : []}
          onPickTarget={fireAt}
          onInspect={inspectCard}
          onInspectPlayer={setPlayerInfo}
          pickCardMode={pickCardMode}
          onPickCard={(ownerId, cardId) => fireAt(ownerId, cardId)}
          fx={fx}
          feeds={feeds}
        />
      </div>


      {marquee && (
        <div className="marquee-wrap">
          <span key={marquee} className="marquee-track" onAnimationEnd={() => setMarquee(null)}>
            {marquee}
          </span>
        </div>
      )}

      {eventBatch.length > 0 && (
        <EventBanner key={eventBatch[0].seq} evs={eventBatch} onDone={() => setEventBatch([])} />
      )}

      {notice && (
        <div
          style={{
            position: "fixed",
            left: 12,
            top: "32%",
            zIndex: 1200,
            background: "rgba(180,40,40,0.95)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,.5)",
            pointerEvents: "none",
            width: 150,
            lineHeight: 1.35,
          }}
        >
          {notice}
        </div>
      )}

      {infoCard && <CardModal card={infoCard} onClose={() => setInfoCard(null)} showEffect />}
      {confirmPlay && (
        <CardModal
          card={confirmPlay}
          onClose={() => setConfirmPlay(null)}
          /* Actions left→right: "Hủy" · "Đánh bài" · "Bỏ bài" (only when over the hand
             limit — discarding is illegal otherwise). Backing out sits on the left,
             furthest from the thumb, and the irreversible option sits at the far end. */
          actions={[
            { label: L(locale, "Hủy", "Cancel"), onClick: () => setConfirmPlay(null), ghost: true },
            ...(you.jailed
              ? []
              : [{ label: L(locale, "Đánh bài", "Play"), onClick: doConfirmedPlay }]),
            ...(overLimit > 0
              ? [{
                  label: L(locale, "Bỏ bài", "Discard"),
                  onClick: () => {
                    const c = confirmPlay;
                    setConfirmPlay(null);
                    if (c) onDiscard(c.id);
                  },
                }]
              : []),
          ]}
        />
      )}
      {confirmDiscard && (
        <CardModal
          card={confirmDiscard}
          onClose={() => setConfirmDiscard(null)}
          /* Same ordering as the play dialog: back out on the left, discard on the right. */
          actions={[
            { label: L(locale, "Hủy", "Cancel"), onClick: () => setConfirmDiscard(null), ghost: true },
            { label: L(locale, "Bỏ bài", "Discard"), onClick: doConfirmedDiscard },
          ]}
        />
      )}

      {confirmSurrender && (
        <div
          onClick={() => setConfirmSurrender(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1150, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 340, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px 22px", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
            <div style={{ fontSize: 40 }}>🏳️</div>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "var(--text)" }}>{L(locale, "Đầu hàng?", "Surrender?")}</div>
            <p className="muted" style={{ lineHeight: 1.5 }}>
              {L(locale, "Bạn sẽ bị loại khỏi ván, lộ vai và bỏ hết bài. Không thể hoàn tác.", "You'll be eliminated, your role revealed and cards discarded. This can't be undone.")}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button style={{ width: "auto", padding: "12px 28px", background: "#c0392b" }} onClick={() => { setConfirmSurrender(false); onSurrender(); }}>{L(locale, "🏳️ Đầu hàng", "🏳️ Surrender")}</button>
              <button className="ghost" style={{ width: "auto", padding: "12px 24px" }} onClick={() => setConfirmSurrender(false)}>{L(locale, "Hủy", "Cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {playerInfo && (
        <div
          onClick={() => setPlayerInfo(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, fontFamily: "system-ui, sans-serif" }}>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--text)" }}>
              {playerInfo.name} {!playerInfo.alive && "☠️"}
            </div>
            <div className="role-badge">
              {playerInfo.role
                ? `${ROLE_EMOJI[playerInfo.role]} ${roleLabel(locale, playerInfo.role)}`
                : L(locale, "🎭 Vai ẩn", "🎭 Hidden role")}
            </div>
            {playerInfo.character && (
              <div style={{ transform: "scale(1.5)", transformOrigin: "top center", marginTop: 8, marginBottom: 80 }}>
                <CharacterFace c={playerInfo.character} />
              </div>
            )}
            <button style={{ width: "auto", padding: "10px 24px" }} onClick={() => setPlayerInfo(null)}>{L(locale, "Đóng", "Close")}</button>
          </div>
        </div>
      )}

      {charView && (
        <div
          onClick={() => setCharView(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ transform: "scale(1.6)", transformOrigin: "top center", marginBottom: 90 }}>
              <CharacterFace c={charView} />
            </div>
            <button style={{ width: "auto", padding: "10px 24px" }} onClick={() => setCharView(null)}>{L(locale, "Đóng", "Close")}</button>
          </div>
        </div>
      )}

      {briefing && you.role && (
        <Briefing role={you.role} character={you.character} onClose={closeBriefing} />
      )}

      {view.phase === "result" && view.winner && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontFamily: "system-ui, sans-serif", padding: 20, overflowY: "auto" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f0e2c0", textAlign: "center" }}>{winnerText(locale, view.winner)}</div>

          {/* Cross-game reward: enough wins in one room unlocks the escape-room link */}
          {view.you.rewardUrl ? (
            <a
              href={view.you.rewardUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: "auto", padding: "12px 22px", borderRadius: 12, textDecoration: "none",
                fontWeight: 800, textAlign: "center", color: "#231a0c",
                background: "linear-gradient(180deg,#ffd873,#e0a83a)",
                border: "1px solid #b9862a", boxShadow: "0 4px 16px rgba(224,168,58,0.45)",
              }}
            >
              🎁 {L(locale, "Nhận thưởng: Phòng thoát bí ẩn", "Claim reward: Escape Room")}
              <div style={{ fontSize: "0.72rem", fontWeight: 600, opacity: 0.8, marginTop: 2 }}>
                {L(locale, "Link riêng của bạn · dùng một lần", "Your personal link · one-time use")}
              </div>
            </a>
          ) : view.you.wins > 0 ? (
            <div style={{ color: "#f0e2c0", opacity: 0.85, fontSize: "0.95rem", textAlign: "center" }}>
              🏆 {L(locale, `Chuỗi thắng: ${view.you.wins}/3`, `Wins: ${view.you.wins}/3`)}
              <span style={{ opacity: 0.7 }}> — {L(locale, "thắng đủ 3 ván để mở phần thưởng", "win 3 to unlock a reward")}</span>
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 460 }}>
            <div style={{ color: "#f0e2c0", opacity: 0.8, fontSize: "0.9rem", textAlign: "center" }}>
              {L(locale, "Vai trò của mọi người", "Everyone's roles")}
            </div>
            {[...view.players].sort((a, b) => a.seat - b.seat).map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, background: "rgba(20,18,16,0.9)",
                  border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", color: "#f0e2c0",
                  opacity: p.alive ? 1 : 0.6,
                }}
              >
                <span style={{ fontSize: 20 }}>{p.role ? ROLE_EMOJI[p.role] : "❔"}</span>
                <span style={{ fontWeight: 700, flex: "0 0 auto" }}>
                  {p.name}{p.id === view.you.id ? L(locale, " (bạn)", " (you)") : ""}
                </span>
                <span style={{ opacity: 0.85, fontSize: "0.9rem" }}>
                  {p.role ? roleLabel(locale, p.role) : "?"}
                </span>
                {p.character && <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: "0.85rem" }}>🎭 {p.character.name}</span>}
                {!p.alive && <span title={L(locale, "Bị loại", "Eliminated")}>☠️</span>}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {/* The rematch is open to whoever may start (everyone, in a matchmade
                room); going back to the lobby stays with the host, so one tap can't
                dissolve the table out from under people who wanted another hand. */}
            {view.you.canStart ? (
              <>
                <button style={{ width: "auto", padding: "12px 24px" }} onClick={onPlayAgain}>{L(locale, "🔁 Chơi lại", "🔁 Play again")}</button>
                {view.you.isHost && (
                  <button className="ghost" style={{ width: "auto", padding: "12px 24px" }} onClick={onRestart}>{L(locale, "🏠 Về phòng chờ", "🏠 Back to lobby")}</button>
                )}
              </>
            ) : (
              <p className="muted">{L(locale, "Chờ chủ phòng bắt đầu ván mới…", "Waiting for the host…")}</p>
            )}
          </div>
        </div>
      )}

      <>
          {/* Top-left column: the status slab, then the active-event chips beneath it.
              They share ONE flow container on purpose — the slab wraps to two rows on
              narrow screens, so a chip row pinned to a fixed `top` would slide under
              it and disappear. */}
          <div style={{ position: "fixed", top: 12, left: 12, zIndex: 55, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, maxWidth: "70vw" }}>
            {/* One opaque slab rather than a row of translucent pills: at 0.82 alpha
              with gaps, the WANTED poster on the wall behind showed through between
              the badges and the whole corner read as clutter. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(18,15,12,0.94)", padding: "7px 10px", borderRadius: 12, border: "1px solid rgba(120,95,60,0.6)", boxShadow: "0 6px 20px rgba(0,0,0,0.55)", color: "#f0e2c0", fontFamily: "system-ui, sans-serif", flexWrap: "wrap", maxWidth: "100%" }}>
            {you.role && (
              <span className="role-badge" style={{ fontSize: "0.85rem", cursor: "pointer" }} onClick={showRole} title={L(locale, "Xem mục tiêu", "See objective")}>
                {ROLE_EMOJI[you.role]} {roleLabel(locale, you.role)} ⓘ
              </span>
            )}
            <HpPips hp={you.hp} maxHp={you.maxHp} />
            {you.character && <span className="badge" style={{ cursor: "pointer" }} onClick={() => setCharView(you.character)}>🎭 {you.character.name}</span>}
            <span className="badge">🎯 {you.range}</span>
            {view.you.isHost && (
              <button className="ghost" style={{ width: "auto", padding: "4px 10px", fontSize: "0.8rem" }} onClick={onRestart}>
                {L(locale, "🏠 Phòng chờ", "🏠 Lobby")}
              </button>
            )}
            <SettingsMenu
              fx={fx}
              onToggleFx={toggleFx}
              canSurrender={you.alive && view.phase === "playing"}
              onSurrender={() => setConfirmSurrender(true)}
            />
          </div>

            <EventChips events={view.events} />
          </div>

            {view.log.length > 0 && (
            <div
              style={{
                position: "fixed",
                top: 56,
                right: 12,
                zIndex: 55,
                width: logSize.w,
                height: logOpen ? logSize.h : undefined,
                maxWidth: "85vw",
                maxHeight: "85vh",
                background: "rgba(20,18,16,0.82)",
                borderRadius: 10,
                fontFamily: "system-ui, sans-serif",
                color: "#f0e2c0",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                onClick={() => setLogOpen((o) => !o)}
                style={{ flex: "0 0 auto", padding: "6px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(240,226,192,0.2)" }}
              >
                <span>📜 {L(locale, "Lịch sử", "History")}</span>
                <span>{logOpen ? "▾" : "▸"}</span>
              </div>

              {/* Pinned above the shared history and never collapsed: what other
                  players did to YOU since your last turn ended. The shared log answers
                  "what happened"; this answers "who is coming after me", which is the
                  thing you actually need before deciding your turn — and it was
                  previously buried among six other players' plays. */}
              {inboxRows.length > 0 && (
                <div style={{ flex: "0 0 auto", padding: "6px 10px", borderBottom: "1px solid rgba(240,226,192,0.2)", background: "rgba(255,120,60,0.14)", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, lineHeight: 1.3, maxHeight: 130, overflowY: "auto" }}>
                  <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.85, letterSpacing: 0.3 }}>
                    🎯 {L(locale, "Nhắm vào bạn từ lượt trước", "Aimed at you since your last turn")}
                  </div>
                  {inboxRows.map(({ e, text }) => (
                    <div key={e.id} style={{ color: "#ffb782" }}>{text}</div>
                  ))}
                </div>
              )}

              <div style={{ flex: "1 1 auto", minHeight: 0, maxHeight: logOpen ? undefined : 118, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, lineHeight: 1.3 }}>
                {logRows.map(({ e, text, def, idx }) => {
                  return (
                    <div
                      key={e.id}
                      style={{
                        opacity: e.kind === "turn" ? 0.7 : 1,
                        // Events get their own colour and weight: they change the rules
                        // rather than report a play, so they need to be findable when
                        // you scroll back asking "why couldn't I shoot?". Draw! results
                        // (Jail, Dynamite) get the same treatment for the same reason —
                        // they decide whose turn just vanished, and "did he get out of
                        // jail?" is the question people scroll back for most.
                        fontWeight: e.kind === "death" || e.kind === "event" || e.kind === "check" ? 700 : 400,
                        color: e.kind === "event" ? "#7ec8ff" : e.kind === "check" ? "#ffc46b" : undefined,
                      }}
                    >
                      {idx >= 0 && def && e.card ? (
                        <>
                          {text.slice(0, idx)}
                          <span
                            onClick={() => showLogCard(def)}
                            style={{ color: "#ffd24a", textDecoration: "underline", cursor: "pointer" }}
                          >
                            {e.card}
                          </span>
                          {text.slice(idx + e.card.length)}
                        </>
                      ) : (
                        text
                      )}
                    </div>
                  );
                })}
              </div>
              <div
                onPointerDown={startLogResize}
                title={L(locale, "Kéo để đổi kích thước", "Drag to resize")}
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: 0,
                  width: 18,
                  height: 18,
                  cursor: "nesw-resize",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "flex-start",
                  color: "rgba(240,226,192,0.6)",
                  fontSize: 12,
                  lineHeight: 1,
                  touchAction: "none",
                }}
              >
                ◣
              </div>
            </div>
          )}

          {/* Turn actions, docked just above your hand. They used to sit at
              `top: 60%`, which put DOM buttons squarely on the green felt and made
              the 3D table read as a web page with a picture of a table on it.
              Down here they belong to the HUD, and the felt stays clear. */}
          {you.alive && isMyTurn && !aiming && (
            <div
              style={{
                position: "fixed",
                left: "50%",
                bottom: 212,
                transform: "translateX(-50%)",
                zIndex: 55,
                width: 260,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 8,
                borderRadius: 12,
                background: "rgba(20,18,16,0.72)",
                border: "1px solid rgba(120,95,60,0.6)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                backdropFilter: "blur(3px)",
              }}
            >
              {you.jailed && (
                /* A jailed turn looks like any other turn from the outside, so say
                   plainly why nothing can be played. */
                <div style={{ fontSize: "0.8rem", lineHeight: 1.4, color: "#ffcf8f", textAlign: "center" }}>
                  {L(
                    locale,
                    `⛓️ Đang bị giam — mất lượt. Bỏ xuống ${you.handLimit} lá rồi kết thúc.`,
                    `⛓️ In jail — turn lost. Discard down to ${you.handLimit}, then end.`
                  )}
                </div>
              )}
              {you.turnPhase === "draw" ? (
                <DrawControls you={you} onDraw={onDraw} aimJesse={() => setAiming({ id: "", defId: "jesse" })} />
              ) : (
                <>
                  <button
                    onClick={onEndTurn}
                    disabled={overLimit > 0}
                    title={overLimit > 0 ? L(locale, "Chạm một lá rồi chọn Bỏ bài", "Tap a card and choose Discard") : undefined}
                  >
                    {overLimit > 0
                      ? L(locale, `Giữ tối đa ${you.handLimit} lá (còn dư ${overLimit})`, `Keep max ${you.handLimit} (${overLimit} over)`)
                      : L(locale, "Kết thúc lượt →", "End turn →")}
                  </button>{" "}
                </>
              )}
            </div>
          )}

          {/* Sid Ketchum: discard 2 → heal 1, usable ANY time (even off-turn / dying) */}
          {canBurnToHeal && you.alive && you.hp < you.maxHp && you.hand.length >= 2 && (
            <button
              onClick={() => { setSidPicking((v) => !v); setSidPick([]); }}
              style={{
                position: "fixed",
                left: 12,
                bottom: 132,
                zIndex: 57,
                width: "auto",
                padding: "8px 12px",
                fontSize: "0.82rem",
                fontWeight: 700,
                borderRadius: 10,
                border: `1px solid ${sidPicking ? "#33d17a" : "rgba(240,226,192,0.5)"}`,
                background: sidPicking ? "rgba(20,110,50,0.92)" : "rgba(20,18,16,0.88)",
                color: "#f0e2c0",
              }}
            >
              {sidPicking
                ? L(locale, `Chạm 2 lá để bỏ (${sidPick.length}/2) · Hủy`, `Tap 2 to discard (${sidPick.length}/2) · Cancel`)
                : L(locale, "🩹 Sid: bỏ 2 → +1 máu", "🩹 Sid: discard 2 → +1")}
            </button>
          )}

          {/* aiming: click a green scope over a target (rendered in the 3D scene).
              Docked to the top-centre, just under the HUD, so it doesn't cover the table. */}
          {aiming && (
            <div style={{ position: "fixed", left: "50%", top: 72, transform: "translateX(-50%)", zIndex: 56, display: "flex", flexDirection: "row", alignItems: "center", gap: 12, background: "rgba(20,18,16,0.92)", padding: "8px 14px", borderRadius: 12, color: "#f0e2c0", fontFamily: "system-ui, sans-serif", maxWidth: "90vw", lineHeight: 1.3, boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}>
              <span>🎯 {L(locale, aimText[aiming.defId]?.[0] ?? "Bấm kính nhắm để chọn mục tiêu", aimText[aiming.defId]?.[1] ?? "Click a scope to pick a target")}</span>
              <button className="ghost" style={{ width: "auto", padding: "6px 12px", flexShrink: 0 }} onClick={() => setAiming(null)}>{L(locale, "Hủy", "Cancel")}</button>
            </div>
          )}

            {you.alive && (
            <div style={{ position: "fixed", left: 0, right: 0, bottom: 10, zIndex: 55, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 4, pointerEvents: "none" }}>
              {you.hand.map((c) => (
                <div key={c.id} style={{ pointerEvents: "auto" }}>
                  <DragCard
                    card={c}
                    canInteract={inPlayPhase || sidPicking}
                    canDiscard={overLimit > 0}
                    entering={justDrew.has(c.id)}
                    selected={sidPick.includes(c.id) || aiming?.id === c.id}
                    onPlay={() => requestPlay(c)}
                    onDiscard={() => discardGesture(c)}
                    onDragState={setDragDelta}
                  />
                </div>
              ))}
            </div>
          )}
          {inPlayPhase && !aiming && !dragDelta && you.hand.length > 0 && (
            <div style={{ position: "fixed", left: "50%", bottom: 176, transform: "translateX(-50%)", zIndex: 55, color: "rgba(240,226,192,0.85)", fontSize: 13, fontFamily: "system-ui, sans-serif", textShadow: "0 1px 3px #000", whiteSpace: "nowrap", pointerEvents: "none" }}>
              {sidPicking
                ? L(locale, `Chạm 2 lá để bỏ (${sidPick.length}/2)`, `Tap 2 cards to discard (${sidPick.length}/2)`)
                : you.jailed
                  ? L(locale, "Chạm một lá để bỏ · không đánh được khi bị giam", "Tap a card to discard · nothing can be played in jail")
                  : overLimit > 0
                    ? L(locale, "Chạm một lá để chọn Đánh hoặc Bỏ", "Tap a card to Play or Discard")
                    : L(locale, "Chạm hoặc kéo LÊN để đánh", "Tap or drag UP to play")}
            </div>
          )}
      </>
    </div>
  );
}

const DRAG_PLAY = 55;
const DRAG_DISC = 80;
const TAP_MAX = 10; // movement under this = a tap
function dragZone(d: { dx: number; dy: number } | null, canDiscard: boolean): "play" | "discard" | null {
  if (!d) return null;
  if (d.dy < -DRAG_PLAY && Math.abs(d.dy) > Math.abs(d.dx)) return "play";
  if (canDiscard && d.dx > DRAG_DISC && Math.abs(d.dx) >= Math.abs(d.dy)) return "discard";
  return null;
}

// A hand card you drag: up plays it; right discards it (only when over the hand
// limit). Anything else snaps back. Reports its drag state so the parent can
// show the drop zones.
function DragCard({
  card,
  canInteract,
  canDiscard,
  selected,
  entering,
  onPlay,
  onDiscard,
  onDragState,
}: {
  card: Card;
  canInteract: boolean;
  canDiscard: boolean;
  selected?: boolean;
  entering?: boolean;
  onPlay: () => void;
  onDiscard: () => void;
  onDragState?: (d: { dx: number; dy: number } | null) => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const zone = dragZone(drag, canDiscard);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ dx: 0, dy: 0 });
    onDragState?.({ dx: 0, dy: 0 });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const d = { dx: e.clientX - start.current.x, dy: e.clientY - start.current.y };
    setDrag(d);
    onDragState?.(d);
  };
  const up = () => {
    if (!start.current) return;
    const z = zone;
    const d = drag;
    start.current = null;
    setDrag(null);
    onDragState?.(null);
    if (z === "play") return onPlay();
    if (z === "discard") return onDiscard();
    // A tap (barely moved) also plays — the easy path.
    if (d && Math.abs(d.dx) < TAP_MAX && Math.abs(d.dy) < TAP_MAX) onPlay();
  };
  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{
        touchAction: "none",
        userSelect: "none",
        cursor: canInteract ? "grab" : "default",
        transform: drag ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.06)` : undefined,
        transition: drag ? "none" : "transform .16s ease",
        animation: entering && !drag ? "drawIn 0.5s cubic-bezier(0.2,0.85,0.25,1) both" : undefined,
        borderRadius: 10,
        position: "relative",
        zIndex: drag ? 60 : undefined,
        boxShadow:
          zone === "play"
            ? "0 0 0 3px #2ecc71, 0 10px 24px rgba(0,0,0,.55)"
            : zone === "discard"
            ? "0 0 0 3px #e74c3c, 0 10px 24px rgba(0,0,0,.55)"
            : undefined,
      }}
    >
      <PlayingCard card={card} selected={selected} />
    </div>
  );
}

function DrawControls({
  you,
  onDraw,
  aimJesse,
}: {
  you: PlayerView["you"];
  onDraw: (source?: "deck" | "discard" | "player", targetId?: string) => void;
  aimJesse: () => void;
}) {
  const locale = useLocale();
  // Draw modes that offer a second, non-deck source. The other two modes (Kit
  // Carlson, Black Jack) change what the deck hands over, not where it comes from,
  // so they need no extra button.
  const alt: Partial<Record<string, { label: [string, string]; onClick: () => void }>> = {
    jesse: { label: ["Rút 1 lá từ tay người khác", "Draw 1 from a hand"], onClick: aimJesse },
    pedro: { label: ["Rút lá bỏ trên cùng + 1", "Take top discard + 1"], onClick: () => onDraw("discard") },
  };
  const extra = alt[you.character?.effect.drawMode ?? ""];
  return (
    <>
      <button onClick={() => onDraw()}>
        {extra
          ? L(locale, "Rút 2 lá thường 🂠", "Draw 2 normally 🂠")
          : L(locale, "Rút 2 lá 🂠", "Draw 2 🂠")}
      </button>
      {extra && (
        <>
          <div style={{ height: 8 }} />
          <button className="ghost" onClick={extra.onClick}>
            {L(locale, extra.label[0], extra.label[1])}
          </button>
        </>
      )}
    </>
  );
}

// The character as a playing card, matching the printed ones: name banner, portrait
// with a column of hearts for life points, ability text below. Used both in the draft
// (where you compare two side by side) and in the review popups.
//
// The height is FIXED rather than fitting the text: the draft shows two of these next
// to each other, and 226px is the tallest any of the 16 abilities needs in either
// language (measured against this exact CSS — the longest, Kit Carlson, overflows
// below 216). Short abilities leave empty space instead of shrinking the card.
function CharacterFace({ c }: { c: Character }) {
  const locale = useLocale();
  const portrait = CHARACTER_PHOTO[c.id];
  return (
    // `pc-frame` and `pcard-md` are both load-bearing, not decoration:
    //  - `.pcard` is `display: flex` with the default ROW direction; the column
    //    stacking lives on `.pc-frame`. Without that wrapper the name, art and
    //    ability laid out side by side, `.pc-center` (flex: 1) swallowed the width,
    //    and every text child got squeezed to nothing by its own `overflow: hidden`.
    //  - font-size for `.pc-name` / `.pc-desc` is only ever declared under a size
    //    class, so without `pcard-md` the ability text had no size at all.
    // The inline width/height still override the size class's fixed box.
    <div className="pcard pcard-md pc-character" style={{ width: 168, height: 226 }}>
      <div className="pc-frame">
        <div className="pc-name" style={{ fontSize: "0.72rem" }}>{c.name}</div>
        <div className="pc-center" style={{ height: 132, flex: "0 0 auto" }}>
          {portrait ? (
            <img className="pc-art pc-art-full" src={portrait} alt="" draggable={false} />
          ) : (
            <span className="pc-icon" style={{ fontSize: "2.6rem" }}>🤠</span>
          )}
          <span className="pc-lives" title={`${c.maxHp} ${L(locale, "máu", "life")}`}>
            {Array.from({ length: c.maxHp }, (_, i) => (
              <span key={i} className="pc-life">❤</span>
            ))}
          </span>
        </div>
        <div
          className="pc-desc"
          style={{
            display: "block", // drop the -webkit-box clamp: the ability must read in full
            WebkitLineClamp: "unset" as unknown as number,
            fontSize: "0.58rem",
            lineHeight: 1.32,
            padding: "5px 4px 4px",
            flex: "1 1 auto", // short abilities leave space below, they don't re-centre
          }}
        >
          {charAbility(locale, c.id)}
        </div>
      </div>
    </div>
  );
}

function HpPips({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pips = useMemo(() => {
    const arr: boolean[] = [];
    for (let i = 0; i < maxHp; i++) arr.push(i < hp);
    return arr;
  }, [hp, maxHp]);
  if (maxHp <= 0) return null;
  return (
    <div className="hp" title={`${hp}/${maxHp}`}>
      {pips.map((filled, i) => (
        <span key={i} className={`pip ${filled ? "" : "empty"}`} />
      ))}
    </div>
  );
}
