"use client";

import { useEffect, useMemo, useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity } from "@/lib/socketClient";
import { Character, PlayerView, PlayerPublic, ROLE_EMOJI } from "@/lib/types";
import { CARD_DEF_BY_ID, rankLabel, SUIT_SYMBOL, type Card } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
import { toggleMusic, setMusicVolume, getMusicVolume } from "@/lib/music";
import {
  L,
  useLocale,
  setLocale,
  initLocale,
  roleLabel,
  roleGoal,
  charAbility,
  winnerText,
  formatPending,
  checkText,
  actionLabel,
  tError,
  logText,
} from "@/lib/i18n";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 7;

// 3D table (react-three-fiber). Loaded client-only: Three.js needs the browser.
const TableScene = dynamic(() => import("@/components/three/TableScene"), { ssr: false });

function LangToggle() {
  const locale = useLocale();
  return (
    <button
      className="ghost"
      style={{ width: "auto", padding: "6px 10px" }}
      onClick={() => setLocale(locale === "vi" ? "en" : "vi")}
      title="Đổi ngôn ngữ / Switch language"
    >
      {locale === "vi" ? "🇻🇳 VI" : "🇬🇧 EN"}
    </button>
  );
}

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

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || "").toUpperCase();
  const locale = useLocale();

  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    initLocale();
    const socket = getSocket();
    const playerId = loadIdentity(code);

    function attemptRejoin() {
      if (!playerId) {
        router.replace("/");
        return;
      }
      socket.emit("rejoin", { code, playerId }, (res) => {
        if (!res.ok) {
          setError(res.error || "Không vào lại được phòng");
          setTimeout(() => router.replace("/"), 1200);
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
    };
  }, [code, router]);

  function copyCode() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const socket = getSocket();
  const start = () => socket.emit("startGame", { code });
  const addBot = () => socket.emit("addBot", { code });
  const removeBot = () => socket.emit("removeBot", { code });
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

      {view.phase === "lobby" && <Lobby view={view} onStart={start} onAddBot={addBot} onRemoveBot={removeBot} />}
      {view.phase === "drafting" && <Draft view={view} onPick={pick} />}
      {(view.phase === "playing" || view.phase === "result") && (
        <Table view={view} onDraw={draw} onPlay={play} onDiscard={discard} onSidHeal={sidHeal} onEndTurn={endTurn} onSurrender={surrender} onRestart={restart} onPlayAgain={playAgain} />
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
        top: "50%",
        left: 12,
        transform: "translateY(-50%)",
        zIndex: 1000,
        background: "rgba(20,18,16,0.92)",
        color: "#f0e2c0",
        padding: "8px 16px",
        borderRadius: 12,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignItems: "flex-start",
        width: 150,
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

const PENDING_EMOJI: Record<string, string> = { bang: "🔫", dying: "💀", multi: "🎯", duel: "⚔️", store: "🏪", kit: "🎴" };
const CHECK_ICON: Record<string, string> = { dynamite: "🧨", jail: "⛓️", barrel: "🛢️", blackjack: "🎴", "lucky-duke": "🍀" };
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

  const doAction = (a: "missed" | "beer" | "bang" | "pass") => {
    if (a === "pass") return onRespond("pass");
    // Calamity Janet may play Bang! as Missed! (and vice versa) — fall back to the
    // swapped card so she can react even without the literal card in hand.
    const alt =
      you.character?.id === "calamity-janet"
        ? a === "missed"
          ? "bang"
          : a === "bang"
          ? "missed"
          : null
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
          zIndex: 1000,
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

        {(p.kind === "store" || p.kind === "kit") && (
          <div className="card-row" style={{ justifyContent: "center" }}>
            {(p.storeCards ?? []).map((c) => (
              <PlayingCard
                key={c.id}
                card={c}
                size="sm"
                onClick={p.youMustRespond ? () => onChoose(c.id) : undefined}
                dimmed={!p.youMustRespond}
              />
            ))}
          </div>
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
        <LangToggle />
      </div>
    </div>
  );
}

function Lobby({
  view,
  onStart,
  onAddBot,
  onRemoveBot,
}: {
  view: PlayerView;
  onStart: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
}) {
  const locale = useLocale();
  const n = view.players.length;
  const botCount = view.players.filter((p) => p.isBot).length;
  const canStart = view.you.isHost && n >= MIN_PLAYERS && n <= MAX_PLAYERS;

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
              <span className="badge">{L(locale, "AI 🤖", "AI 🤖")}</span>
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
      {view.you.isHost ? (
        <button onClick={onStart} disabled={!canStart}>
          {n < MIN_PLAYERS ? L(locale, `Cần thêm ${MIN_PLAYERS - n} người`, `Need ${MIN_PLAYERS - n} more`) : L(locale, "Bắt đầu ván", "Start game")}
        </button>
      ) : (
        <p className="muted">{L(locale, "Đang chờ chủ phòng bắt đầu…", "Waiting for the host to start…")}</p>
      )}
    </div>
  );
}

function Draft({ view, onPick }: { view: PlayerView; onPick: (id: string) => void }) {
  const locale = useLocale();
  const draft = view.draft!;

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">{L(locale, "Chọn nhân vật", "Pick a character")}</h2>
      </div>
      <p className="muted">
        {L(locale, "Chọn 1 trong 2 nhân vật. Cứ thong thả — không giới hạn thời gian.", "Pick 1 of 2. Take your time — no time limit.")}
      </p>

      {view.you.role && (
        <p className="muted" style={{ marginTop: 4 }}>
          {L(locale, "Vai của bạn:", "Your role:")} <strong>{ROLE_EMOJI[view.you.role]} {roleLabel(locale, view.you.role)}</strong>
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 12 }}>
        {draft.choices.map((c) => {
          const picked = draft.yourPick?.id === c.id;
          const locked = draft.youPicked;
          return (
            <div
              key={c.id}
              className={`selectable ${picked ? "picked" : ""}`}
              style={{ textAlign: "left", cursor: locked ? "default" : "pointer", opacity: locked && !picked ? 0.45 : 1 }}
              onClick={() => !locked && onPick(c.id)}
            >
              <CharacterCard c={c} />
              {picked && <div className="badge" style={{ marginTop: 8 }}>{L(locale, "Đã chọn ✓", "Picked ✓")}</div>}
            </div>
          );
        })}
      </div>

      <div style={{ height: 14 }} />
      <p className="muted">
        {draft.youPicked
          ? L(locale, `Đã khóa. Đang chờ: ${draft.waitingFor.join(", ") || "—"}`, `Locked. Waiting for: ${draft.waitingFor.join(", ") || "—"}`)
          : L(locale, "Hãy chọn nhanh!", "Choose quickly!")}
        {" · "}
        {draft.pickedCount}/{draft.totalCount}
      </p>
    </div>
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
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 320 }}>
        <div style={{ transform: "scale(1.5)", transformOrigin: "top center", marginBottom: 70 }}>
          <PlayingCard card={card} />
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
  const overLimit = Math.max(0, you.hand.length - you.hp);
  const inPlayPhase = isMyTurn && you.turnPhase !== "draw";
  const [aiming, setAiming] = useState<{ id: string; defId: string } | null>(null);
  const [sidPick, setSidPick] = useState<string[]>([]);
  const [sidPicking, setSidPicking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  // User-resizable size for the 3D history panel; persisted across re-renders so
  // socket updates don't snap it back.
  const [logSize, setLogSize] = useState<{ w: number; h: number }>({ w: 240, h: 300 });
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [info, setInfo] = useState<{ title: string; icon: string; body: string } | null>(null);
  const [infoCard, setInfoCard] = useState<Card | null>(null);
  const [charView, setCharView] = useState<Character | null>(null);
  const [confirmPlay, setConfirmPlay] = useState<Card | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<Card | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [playerInfo, setPlayerInfo] = useState<PlayerPublic | null>(null);

  const inspectCard = (c: Card) => setInfoCard(c);
  // Open a card mentioned in the log as the same card-face popup as a table card.
  const showLogCard = (def: { id: string; name: string }) =>
    setInfoCard({ id: "log", defId: def.id, name: def.name, suit: "spades", rank: 1 });
  const showRole = () => {
    if (!you.role) return;
    setInfo({ title: roleLabel(locale, you.role), icon: ROLE_EMOJI[you.role], body: roleGoal(locale, you.role) });
  };
  // Cards freshly added to your hand — animated in for a "draw" effect.
  const [justDrew, setJustDrew] = useState<Set<string>>(new Set());
  const prevHandRef = useRef<string[]>([]);
  // Scrolling ticker announcing the latest Draw!-check result.
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

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((cur) => (cur === msg ? "" : cur)), 1800);
  };

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
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // End-of-turn discard mode: once trimmed to the hand limit, end the turn.
  useEffect(() => {
    if (discarding && overLimit === 0) {
      onEndTurn();
      setDiscarding(false);
    }
  }, [discarding, overLimit, onEndTurn]);
  // Leaving your turn cancels any pending discard mode.
  useEffect(() => {
    if (!inPlayPhase && discarding) setDiscarding(false);
  }, [inPlayPhase, discarding]);
  const TARGETED = ["bang", "jail", "panic", "cat-balou", "duel"];
  const isSid = you.character?.id === "sid-ketchum";
  const isCalamity = you.character?.id === "calamity-janet";
  // Calamity Janet may fire a Missed! as a Bang! — so a Missed! in hand aims like
  // a Bang! (targeting + range), and it counts against her Bang!/turn limit.
  const bangLike = (defId: string) => defId === "bang" || (isCalamity && defId === "missed");
  const needsTarget = (defId: string) => TARGETED.includes(defId) || bangLike(defId);

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
    if (needsTarget(card.defId)) {
      return setAiming((cur) => (cur?.id === card.id ? null : { id: card.id, defId: card.defId }));
    }
    onPlay(card.id);
  };

  // 3D drag gestures: drag a card UP to play/aim, drag RIGHT to discard.
  const playGesture = (card: { id: string; defId: string }) => {
    if (!inPlayPhase) return;
    // Bang! is once per turn (unless Volcanic / Willy) — say so up front instead
    // of letting the player aim into a silent rejection.
    if (bangLike(card.defId) && !you.canBang) {
      return flash(L(locale, "Bạn hết lượt Bang!", "No Bang! left this turn."));
    }
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
    if (bangLike(card.defId) && !you.canBang) {
      return flash(L(locale, "Bạn hết lượt Bang!", "No Bang! left this turn."));
    }
    setConfirmPlay(card);
  };
  const doConfirmedPlay = () => {
    const c = confirmPlay;
    setConfirmPlay(null);
    if (c) playGesture(c);
  };

  const discardGesture = (card: { id: string }) => {
    // Only discard when over the hand limit (hand > hp).
    if (!inPlayPhase) return;
    if (you.hand.length <= you.hp) {
      return flash(L(locale, "Chỉ bỏ được khi số bài > máu.", "Can only discard when over the hand limit."));
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

  const canTarget = (p: (typeof view.players)[number]) => {
    if (!aiming || !p.alive || p.id === you.id) return false;
    if (bangLike(aiming.defId)) return p.distance != null && p.distance <= you.range;
    if (aiming.defId === "jail") return p.role !== "sheriff" && !p.equipment.some((c) => c.defId === "jail");
    if (aiming.defId === "panic") return p.distance != null && p.distance <= 1;
    if (aiming.defId === "cat-balou") return p.handCount > 0 || p.equipment.length > 0;
    if (aiming.defId === "duel") return true;
    if (aiming.defId === "jesse") return p.handCount > 0;
    return false;
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
        />
      </div>


      {marquee && (
        <div className="marquee-wrap">
          <span key={marquee} className="marquee-track" onAnimationEnd={() => setMarquee(null)}>
            {marquee}
          </span>
        </div>
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

      {/* one shared card popup: inspect (with effect) or play/discard confirm */}
      {infoCard && <CardModal card={infoCard} onClose={() => setInfoCard(null)} showEffect />}
      {confirmPlay && (
        <CardModal
          card={confirmPlay}
          onClose={() => setConfirmPlay(null)}
          actions={[
            { label: L(locale, "Đánh bài", "Play"), onClick: doConfirmedPlay },
            { label: L(locale, "Hủy", "Cancel"), onClick: () => setConfirmPlay(null), ghost: true },
          ]}
        />
      )}
      {confirmDiscard && (
        <CardModal
          card={confirmDiscard}
          onClose={() => setConfirmDiscard(null)}
          actions={[
            { label: L(locale, "Bỏ bài", "Discard"), onClick: doConfirmedDiscard },
            { label: L(locale, "Hủy", "Cancel"), onClick: () => setConfirmDiscard(null), ghost: true },
          ]}
        />
      )}

      {/* confirm before surrendering */}
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

      {/* another player's info: role (if revealed) + character card */}
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

      {/* character card popup */}
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

      {/* role / character info popup */}
      {info && (
        <div
          onClick={() => setInfo(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 340, width: "100%", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, textAlign: "center", fontFamily: "system-ui, sans-serif" }}
          >
            <div style={{ fontSize: 40 }}>{info.icon}</div>
            <div style={{ fontWeight: 800, fontSize: "1.15rem", margin: "6px 0 10px" }}>{info.title}</div>
            <p className="muted" style={{ lineHeight: 1.5 }}>{info.body}</p>
            <button style={{ marginTop: 12 }} onClick={() => setInfo(null)}>{L(locale, "Đóng", "Close")}</button>
          </div>
        </div>
      )}

      {/* end-of-game overlay */}
      {view.phase === "result" && view.winner && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.78)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, fontFamily: "system-ui, sans-serif", padding: 20, overflowY: "auto" }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f0e2c0", textAlign: "center" }}>{winnerText(locale, view.winner)}</div>

          {/* everyone's roles, revealed */}
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
            {view.you.isHost ? (
              <>
                <button style={{ width: "auto", padding: "12px 24px" }} onClick={onPlayAgain}>{L(locale, "🔁 Chơi lại", "🔁 Play again")}</button>
                <button className="ghost" style={{ width: "auto", padding: "12px 24px" }} onClick={onRestart}>{L(locale, "🏠 Về phòng chờ", "🏠 Back to lobby")}</button>
              </>
            ) : (
              <p className="muted">{L(locale, "Chờ chủ phòng bắt đầu ván mới…", "Waiting for the host…")}</p>
            )}
          </div>
        </div>
      )}

      {(
        <>
          {/* compact status — tap the role to see your objective */}
          <div style={{ position: "fixed", top: 12, left: 12, zIndex: 55, display: "flex", alignItems: "center", gap: 10, background: "rgba(20,18,16,0.82)", padding: "8px 12px", borderRadius: 10, color: "#f0e2c0", fontFamily: "system-ui, sans-serif", flexWrap: "wrap", maxWidth: "70vw" }}>
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
            <MusicToggle />
            <LangToggle />
            {you.alive && view.phase === "playing" && (
              <button
                className="ghost"
                style={{ width: "auto", padding: "4px 10px", fontSize: "0.8rem", borderColor: "#c0392b", color: "#ffb3a7" }}
                onClick={() => setConfirmSurrender(true)}
                title={L(locale, "Đầu hàng — rời khỏi ván", "Surrender — leave the game")}
              >
                {L(locale, "🏳️ Đầu hàng", "🏳️ Surrender")}
              </button>
            )}
          </div>

          {/* action history — top-right, collapsible, scrollable, drag-to-resize */}
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
              <div style={{ flex: "1 1 auto", minHeight: 0, maxHeight: logOpen ? undefined : 118, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, lineHeight: 1.3 }}>
                {[...view.log].reverse().map((e) => {
                  const text = logText(locale, e, you.name);
                  // Make a played/reacted card name a link that opens its info.
                  const def = (e.kind === "play" || e.kind === "react") && e.card ? CARD_DEF_BY_NAME[e.card] : undefined;
                  const idx = def && e.card ? text.indexOf(e.card) : -1;
                  return (
                    <div key={e.id} style={{ opacity: e.kind === "turn" ? 0.7 : 1, fontWeight: e.kind === "death" ? 700 : 400 }}>
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

          {/* central actions, just below the deck, on your turn */}
          {you.alive && isMyTurn && !aiming && (
            <div style={{ position: "fixed", left: "50%", top: "53%", transform: "translateX(-50%)", zIndex: 55, width: 240, display: "flex", flexDirection: "column", gap: 8 }}>
              {you.turnPhase === "draw" ? (
                <DrawControls you={you} onDraw={onDraw} aimJesse={() => setAiming({ id: "", defId: "jesse" })} />
              ) : (
                <>
                  <button
                    onClick={onEndTurn}
                    disabled={overLimit > 0}
                    title={overLimit > 0 ? L(locale, "Kéo bài sang PHẢI để bỏ bớt", "Drag cards RIGHT to discard") : undefined}
                  >
                    {overLimit > 0
                      ? L(locale, `Giữ tối đa ${you.hp} lá (còn dư ${overLimit})`, `Keep max ${you.hp} (${overLimit} over)`)
                      : L(locale, "Kết thúc lượt →", "End turn →")}
                  </button>{" "}
                </>
              )}
            </div>
          )}

          {/* Sid Ketchum: discard 2 → heal 1, usable ANY time (even off-turn / dying) */}
          {isSid && you.alive && you.hp < you.maxHp && you.hand.length >= 2 && (
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

          {/* aiming: click a green scope over a target (rendered in the 3D scene) */}
          {aiming && (
            <div style={{ position: "fixed", left: 12, top: "50%", transform: "translateY(-50%)", zIndex: 56, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, background: "rgba(20,18,16,0.92)", padding: "10px 14px", borderRadius: 12, color: "#f0e2c0", fontFamily: "system-ui, sans-serif", width: 150, lineHeight: 1.35 }}>
              <span>🎯 {L(locale, aimText[aiming.defId]?.[0] ?? "Bấm kính nhắm để chọn mục tiêu", aimText[aiming.defId]?.[1] ?? "Click a scope to pick a target")}</span>
              <button className="ghost" style={{ width: "auto", padding: "6px 12px" }} onClick={() => setAiming(null)}>{L(locale, "Hủy", "Cancel")}</button>
            </div>
          )}

          {/* trash bin beside the hand — drag a card onto it to discard (only
              relevant when over the hand limit) */}
          {overLimit > 0 && (
            (() => {
              const over = dragZone(dragDelta, true) === "discard";
              return (
                <div
                  style={{
                    position: "fixed",
                    right: 24,
                    bottom: 40,
                    zIndex: 56,
                    pointerEvents: "none",
                    width: over ? 84 : 66,
                    height: over ? 84 : 66,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: over ? 40 : 30,
                    background: over ? "rgba(231,76,60,0.9)" : "rgba(20,18,16,0.8)",
                    border: `2px dashed ${over ? "#fff" : "#e74c3c"}`,
                    boxShadow: over ? "0 0 20px #e74c3c" : "none",
                    transition: "all .12s",
                  }}
                  title={L(locale, "Kéo lá vào đây để bỏ", "Drag a card here to discard")}
                >
                  🗑️
                </div>
              );
            })()
          )}

          {/* draggable hand */}
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
              {sidPicking ? L(locale, `Chạm 2 lá để bỏ (${sidPick.length}/2)`, `Tap 2 cards to discard (${sidPick.length}/2)`) : overLimit > 0 ? L(locale, "Chạm hoặc kéo LÊN để đánh · vào 🗑️ để bỏ lá dư", "Tap or drag UP to play · into 🗑️ to discard") : L(locale, "Chạm hoặc kéo LÊN để đánh", "Tap or drag UP to play")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const DRAG_PLAY = 55;
const DRAG_DISC = 80;
const TAP_MAX = 10; // movement under this = a tap
// Which drop zone a drag delta is over ("play" up / "discard" right).
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
  const char = you.character?.id;
  if (char === "jesse-jones") {
    return (
      <>
        <button onClick={() => onDraw()}>{L(locale, "Rút 2 lá thường 🂠", "Draw 2 normally 🂠")}</button>
        <div style={{ height: 8 }} />
        <button className="ghost" onClick={aimJesse}>{L(locale, "Rút 1 lá từ tay người khác", "Draw 1 from a hand")}</button>
      </>
    );
  }
  if (char === "pedro-ramirez") {
    return (
      <>
        <button onClick={() => onDraw()}>{L(locale, "Rút 2 lá thường 🂠", "Draw 2 normally 🂠")}</button>
        <div style={{ height: 8 }} />
        <button className="ghost" onClick={() => onDraw("discard")}>{L(locale, "Rút lá bỏ trên cùng + 1", "Take top discard + 1")}</button>
      </>
    );
  }
  return <button onClick={() => onDraw()}>{L(locale, "Rút 2 lá 🂠", "Draw 2 🂠")}</button>;
}

function CharacterCard({ c }: { c: Character }) {
  const locale = useLocale();
  return (
    <div>
      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
        🎭 {c.name}
        {c.rank && <span className="badge" style={{ fontSize: "0.7rem" }}>{L(locale, "Hạng", "Tier")} {c.rank}</span>}
        <span className="badge" style={{ fontSize: "0.7rem" }}>❤️ {c.maxHp}</span>
      </div>
      <p className="muted" style={{ marginTop: 6, fontSize: "0.85rem", lineHeight: 1.4 }}>
        {charAbility(locale, c.id)}
      </p>
    </div>
  );
}

// The character rendered as a playing-card face: title banner, portrait, then
// the full ability text below. Bullets (max HP) top-right; no tier rank.
function CharacterFace({ c }: { c: Character }) {
  const locale = useLocale();
  return (
    <div className="pcard pc-character" style={{ width: 150, height: "auto" }}>
      <div className="pc-name" style={{ fontSize: "0.82rem" }}>{c.name}</div>
      <div className="pc-center" style={{ minHeight: 60, flex: "0 0 auto" }}>
        <span className="pc-icon" style={{ fontSize: "2.8rem" }}>🤠</span>
      </div>
      <div className="pc-desc" style={{ display: "block", WebkitLineClamp: "unset" as unknown as number, fontSize: "0.56rem", lineHeight: 1.25, padding: "4px 4px 6px" }}>
        {charAbility(locale, c.id)}
      </div>
      <span className="pc-corner">🔴 {c.maxHp}</span>
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
