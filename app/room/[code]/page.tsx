"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity } from "@/lib/socketClient";
import { Character, PlayerView, ROLE_EMOJI } from "@/lib/types";
import { SUIT_SYMBOL, rankLabel } from "@/lib/cards";
import { PlayingCard } from "@/components/PlayingCard";
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
  const play = (cardId: string, targetId?: string) => socket.emit("playCard", { code, cardId, targetId });
  const respond = (type: "missed" | "beer" | "bang" | "pass", cardId?: string) =>
    socket.emit("respond", { code, type, cardId });
  const choose = (cardId: string) => socket.emit("choose", { code, cardId });
  const discard = (cardId: string) => socket.emit("discardCard", { code, cardId });
  const endTurn = () => socket.emit("endTurn", { code });
  const restart = () => socket.emit("restart", { code });

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
        <Table view={view} onDraw={draw} onPlay={play} onDiscard={discard} onSidHeal={sidHeal} onEndTurn={endTurn} onRestart={restart} />
      )}

      {view.pending && <ReactionPanel view={view} onRespond={respond} onChoose={choose} />}
    </main>
  );
}

const PENDING_EMOJI: Record<string, string> = { bang: "🔫", dying: "💀", multi: "🎯", duel: "⚔️", store: "🏪", kit: "🎴" };

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
  const remaining = useCountdown(p.endsAt);
  const you = view.you;

  const doAction = (a: "missed" | "beer" | "bang" | "pass") => {
    if (a === "pass") return onRespond("pass");
    const card = you.hand.find((c) => c.defId === a);
    onRespond(a, card?.id);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ color: "var(--accent)" }}>
        <div className="modal-emoji">{PENDING_EMOJI[p.kind]}</div>
        <p className="modal-ability">{formatPending(locale, p)}</p>
        {p.kind === "bang" && (
          <p className="muted">
            {L(locale, `Cần ${(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! để né`, `Need ${(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! to dodge`)}
          </p>
        )}
        <div className="timer">{remaining}s</div>

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
  const remaining = useCountdown(draft.endsAt);

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">{L(locale, "Chọn nhân vật", "Pick a character")}</h2>
        <span className="timer" style={{ fontSize: "1.8rem" }}>{remaining}s</span>
      </div>
      <p className="muted">
        {L(locale, "Chọn 1 trong 2 nhân vật. Hết giờ sẽ tự chọn theo hạng — cùng hạng thì ngẫu nhiên.", "Pick 1 of 2. On timeout the higher-tier one is auto-picked (ties random).")}
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

function Table({
  view,
  onDraw,
  onPlay,
  onDiscard,
  onSidHeal,
  onEndTurn,
  onRestart,
}: {
  view: PlayerView;
  onDraw: (source?: "deck" | "discard" | "player", targetId?: string) => void;
  onPlay: (cardId: string, targetId?: string) => void;
  onDiscard: (cardId: string) => void;
  onSidHeal: (cardIds: string[]) => void;
  onEndTurn: () => void;
  onRestart: () => void;
}) {
  const locale = useLocale();
  const isMyTurn = view.turnSeat != null && view.turnSeat === view.you.seat && view.you.alive;
  const you = view.you;
  const overLimit = Math.max(0, you.hand.length - you.hp);
  const inPlayPhase = isMyTurn && you.turnPhase !== "draw";
  const [aiming, setAiming] = useState<{ id: string; defId: string } | null>(null);
  const [sidPick, setSidPick] = useState<string[]>([]);
  const [sidPicking, setSidPicking] = useState(false);
  const [threeD, setThreeD] = useState(false);
  const [discarding, setDiscarding] = useState(false);

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

  // Opponents ordered clockwise starting from the seat after you, so the arc
  // around the felt reads in natural play order.
  const opponents = useMemo(() => {
    const others = view.players.filter((p) => p.id !== you.id);
    return others.slice().sort((a, b) => {
      const da = (a.seat - you.seat + 100) % 100;
      const db = (b.seat - you.seat + 100) % 100;
      return da - db;
    });
  }, [view.players, you.id, you.seat]);

  const cardAction = (card: { id: string; defId: string }) => {
    if (!inPlayPhase) return;
    if (sidPicking) {
      const next = sidPick.includes(card.id) ? sidPick.filter((x) => x !== card.id) : [...sidPick, card.id];
      if (next.length === 2) {
        onSidHeal(next);
        setSidPick([]);
        setSidPicking(false);
      } else setSidPick(next);
      return;
    }
    // A click discards only in explicit end-of-turn discard mode; otherwise it
    // always plays (or starts aiming), even while over the hand limit.
    if (discarding) return onDiscard(card.id);
    if (TARGETED.includes(card.defId)) {
      return setAiming((cur) => (cur?.id === card.id ? null : { id: card.id, defId: card.defId }));
    }
    onPlay(card.id);
  };

  const canTarget = (p: (typeof view.players)[number]) => {
    if (!aiming || !p.alive || p.id === you.id) return false;
    if (aiming.defId === "bang") return p.distance != null && p.distance <= you.range;
    if (aiming.defId === "jail") return p.role !== "sheriff" && !p.equipment.some((c) => c.defId === "jail");
    if (aiming.defId === "panic") return p.distance != null && p.distance <= 1;
    if (aiming.defId === "cat-balou") return p.handCount > 0 || p.equipment.length > 0;
    if (aiming.defId === "duel") return true;
    if (aiming.defId === "jesse") return p.handCount > 0;
    return false;
  };
  const fireAt = (targetId: string) => {
    if (!aiming) return;
    if (aiming.defId === "jesse") onDraw("player", targetId);
    else onPlay(aiming.id, targetId);
    setAiming(null);
  };

  const aimText: Record<string, [string, string]> = {
    bang: [`Chọn mục tiêu Bang! (trong tầm ${you.range})`, `Choose a Bang! target (range ${you.range})`],
    jail: ["Chọn người để bỏ tù (không phải Sheriff)", "Choose someone to jail (not the Sheriff)"],
    panic: ["Chọn người ở khoảng cách 1 để rút bài", "Choose someone at distance 1 to take a card"],
    duel: ["Chọn người để Duel", "Choose someone to Duel"],
    jesse: ["Chọn người để rút 1 lá từ tay họ", "Choose whose hand to draw from"],
    "cat-balou": ["Chọn người để ép bỏ 1 lá", "Choose someone to discard a card"],
  };

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">{L(locale, "Bàn chơi", "Table")}</h2>
        <div className="row" style={{ alignItems: "center" }}>
          <button
            className="ghost"
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => setThreeD((v) => !v)}
            title={L(locale, "Đổi giao diện bàn 2D/3D", "Toggle 2D/3D table")}
          >
            {threeD ? "🃏 2D" : "🎲 3D"}
          </button>
          {view.you.isHost && (
            <button className="ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={onRestart}>
              {L(locale, "Về phòng chờ", "To lobby")}
            </button>
          )}
          <LangToggle />
        </div>
      </div>

      {view.phase === "result" && view.winner && (
        <div className={`banner ${view.winner === "outlaws" ? "werewolf" : view.winner === "sheriff" ? "village" : "none"}`}>
          {winnerText(locale, view.winner)}
        </div>
      )}

      {view.checks.length > 0 && (
        <div className="banner none">
          {view.checks.map((ck, i) => {
            const t = checkText(locale, ck.kind, ck.outcome);
            return (
              <div key={i}>
                🎲 {ck.name} — {t.kind}: {ck.card ? `${rankLabel(ck.card.rank)}${SUIT_SYMBOL[ck.card.suit]}` : "?"} → {t.outcome}
              </div>
            );
          })}
        </div>
      )}

      {aiming && (
        <div className="banner none">
          🎯 {L(locale, aimText[aiming.defId]?.[0] ?? "", aimText[aiming.defId]?.[1] ?? "")} ·{" "}
          <button className="ghost" style={{ width: "auto", padding: "4px 10px" }} onClick={() => setAiming(null)}>
            {L(locale, "Hủy", "Cancel")}
          </button>
        </div>
      )}

      {threeD ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#141210" }}>
          <TableScene view={view} />
          <button
            className="ghost"
            style={{ position: "fixed", top: 12, right: 12, zIndex: 60, width: "auto", padding: "8px 14px" }}
            onClick={() => setThreeD(false)}
          >
            {L(locale, "🃏 Thoát 3D", "🃏 Exit 3D")}
          </button>
        </div>
      ) : (
      <div className="board">
        {opponents.map((p, i) => {
          const targetable = canTarget(p);
          const n = opponents.length;
          const t = (i + 0.5) / n; // 0..1 across the top arc, left → right
          const angle = Math.PI * (1 - t);
          const left = 50 + 38 * Math.cos(angle);
          const top = 50 - 34 * Math.sin(angle);
          return (
            <div
              key={p.id}
              className={["seat", p.isTurn ? "turn" : "", p.alive ? "" : "dead", targetable ? "selectable picked" : ""].join(" ")}
              onClick={() => targetable && fireAt(p.id)}
              style={{ left: `${left}%`, top: `${top}%`, cursor: targetable ? "pointer" : "default" }}
            >
              <div className="seat-name">
                <span className={`dot ${p.connected ? "on" : "off"}`} />
                {p.name}
              </div>
              <div className="seat-meta">
                {L(locale, "Ghế", "Seat")} #{p.seat + 1}
                {p.distance != null && ` · ${L(locale, "cách", "dist")} ${p.distance}`}
                {p.isTurn && ` · ${L(locale, "đang tới lượt", "their turn")}`}
                {!p.alive && ` · ${L(locale, "đã chết", "dead")}`}
              </div>
              {p.character && (
                <div className="seat-meta" style={{ color: "var(--accent)", marginTop: 4 }}>
                  🎭 {p.character.name}
                  {p.character.rank ? ` (${p.character.rank})` : ""}
                </div>
              )}
              <HpPips hp={p.hp} maxHp={p.maxHp} />
              {p.equipment.length > 0 && (
                <div className="seat-meta" style={{ marginTop: 4 }}>
                  🔵 {p.equipment.map((c) => `${c.name}${SUIT_SYMBOL[c.suit]}`).join(", ")}
                </div>
              )}
              <div>
                {p.role ? (
                  <span className="role-badge">{ROLE_EMOJI[p.role]} {roleLabel(locale, p.role)}</span>
                ) : (
                  <span className="role-badge hidden">{L(locale, "Vai ẩn", "Hidden role")}</span>
                )}
              </div>
              <div className="seat-meta">🂠 {p.handCount}</div>
            </div>
          );
        })}

        <div className="board-center">
          <div className="pile">
            <span className="pile-label">{L(locale, "Bộ bài", "Deck")}</span>
            <div className="pile-deck">
              🂠<span className="pile-count">{view.deckCount}</span>
            </div>
          </div>
          <div className="pile">
            <span className="pile-label">{L(locale, "Bài bỏ", "Discard")}</span>
            <div className="pile-discard">
              🗑️<span className="pile-count">{view.discardCount}</span>
            </div>
          </div>
        </div>
      </div>
      )}

      <div
        className="you-panel"
        style={
          threeD
            ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: "46vh", overflowY: "auto", margin: 0, borderRadius: "16px 16px 0 0", background: "rgba(20,18,16,0.94)", backdropFilter: "blur(3px)" }
            : undefined
        }
      >
        <h3>{L(locale, "Thông tin của bạn", "Your info")}</h3>
        {you.role && (
          <>
            <div>
              <span className="role-badge" style={{ fontSize: "0.9rem" }}>{ROLE_EMOJI[you.role]} {roleLabel(locale, you.role)}</span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>🎯 {roleGoal(locale, you.role)}</p>
          </>
        )}
        {you.character && (
          <div style={{ marginTop: 10 }}>
            <CharacterCard c={you.character} />
          </div>
        )}
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          <HpPips hp={you.hp} maxHp={you.maxHp} />
          <span className="badge">🎯 {L(locale, "Tầm bắn", "Range")} {you.range}</span>
        </div>

        {you.equipment.length > 0 && (
          <>
            <label style={{ marginTop: 12 }}>{L(locale, "Bài xanh trên bàn", "In play")}</label>
            <div className="card-row">
              {you.equipment.map((c) => (
                <PlayingCard key={c.id} card={c} size="sm" />
              ))}
            </div>
          </>
        )}

        <label style={{ marginTop: 12 }}>
          {L(locale, "Bài trên tay", "Hand")} ({you.hand.length})
          {inPlayPhase && (discarding ? L(locale, ` · bấm lá để bỏ (còn ${overLimit})`, ` · click a card to discard (${overLimit} left)`) : L(locale, " · bấm để đánh", " · click to play"))}
        </label>
        <div className="card-row">
          {you.hand.length === 0 ? (
            <span className="muted">{L(locale, "Chưa có lá nào.", "No cards.")}</span>
          ) : (
            you.hand.map((c) => (
              <PlayingCard
                key={c.id}
                card={c}
                onClick={inPlayPhase ? () => cardAction(c) : undefined}
                selected={sidPick.includes(c.id) || aiming?.id === c.id}
              />
            ))
          )}
        </div>

        <div style={{ height: 14 }} />
        {!you.alive ? (
          <p className="muted">{L(locale, "Bạn đã bị loại — theo dõi tiếp.", "You're out — spectating.")}</p>
        ) : !isMyTurn ? (
          <button disabled>{L(locale, "Chưa tới lượt bạn", "Not your turn")}</button>
        ) : you.turnPhase === "draw" ? (
          <DrawControls you={you} onDraw={onDraw} aimJesse={() => setAiming({ id: "", defId: "jesse" })} />
        ) : (
          <>
            {isSid && you.hp < you.maxHp && you.hand.length >= 2 && (
              <>
                <button className="ghost" onClick={() => { setSidPicking((v) => !v); setSidPick([]); }}>
                  {sidPicking ? L(locale, `Chọn 2 lá để bỏ… (${sidPick.length}/2)`, `Pick 2 to discard… (${sidPick.length}/2)`) : L(locale, "Sid: bỏ 2 lá → +1 máu", "Sid: discard 2 → +1 life")}
                </button>
                <div style={{ height: 8 }} />
              </>
            )}
            {discarding ? (
              <button className="ghost" onClick={() => setDiscarding(false)}>
                {L(locale, `Đang bỏ bài (còn ${overLimit}) · Hủy`, `Discarding (${overLimit} left) · Cancel`)}
              </button>
            ) : overLimit > 0 ? (
              <button onClick={() => setDiscarding(true)}>
                {L(locale, `Bỏ ${overLimit} lá để kết thúc →`, `Discard ${overLimit} to end →`)}
              </button>
            ) : (
              <button onClick={onEndTurn}>{L(locale, "Kết thúc lượt →", "End turn →")}</button>
            )}
          </>
        )}
      </div>
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

function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
