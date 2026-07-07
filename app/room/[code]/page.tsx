"use client";

import { useEffect, useMemo, useState, useRef, type PointerEvent as ReactPointerEvent } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity } from "@/lib/socketClient";
import { Character, PlayerView, ROLE_EMOJI } from "@/lib/types";
import { SUIT_SYMBOL, rankLabel, CARD_DEF_BY_ID, type Card } from "@/lib/cards";
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
        <p className="modal-ability">{formatPending(locale, p, you.name)}</p>
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
  const [logOpen, setLogOpen] = useState(false);
  const [dragDelta, setDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [notice, setNotice] = useState("");
  const [info, setInfo] = useState<{ title: string; icon: string; body: string } | null>(null);
  const [infoCard, setInfoCard] = useState<Card | null>(null);
  const [charView, setCharView] = useState<Character | null>(null);

  const inspectCard = (c: Card) => setInfoCard(c);
  const showRole = () => {
    if (!you.role) return;
    setInfo({ title: roleLabel(locale, you.role), icon: ROLE_EMOJI[you.role], body: roleGoal(locale, you.role) });
  };
  // Cards freshly added to your hand — animated in for a "draw" effect.
  const [justDrew, setJustDrew] = useState<Set<string>>(new Set());
  const prevHandRef = useRef<string[]>([]);

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

  // 3D drag gestures: drag a card UP to play/aim, drag RIGHT to discard.
  const playGesture = (card: { id: string; defId: string }) => {
    if (!inPlayPhase) return;
    // Bang! is once per turn (unless Volcanic / Willy) — say so up front instead
    // of letting the player aim into a silent rejection.
    if (card.defId === "bang" && !you.canBang) {
      return flash(L(locale, "Bạn hết lượt Bang!", "No Bang! left this turn."));
    }
    if (TARGETED.includes(card.defId)) {
      return setAiming({ id: card.id, defId: card.defId });
    }
    onPlay(card.id);
  };
  const discardGesture = (card: { id: string }) => {
    // Only discard when over the hand limit (hand > hp).
    if (!inPlayPhase) return;
    if (you.hand.length <= you.hp) {
      return flash(L(locale, "Chỉ bỏ được khi số bài > máu.", "Can only discard when over the hand limit."));
    }
    onDiscard(card.id);
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
          <TableScene
            view={view}
            targetIds={aiming ? view.players.filter((p) => canTarget(p)).map((p) => p.id) : []}
            onPickTarget={fireAt}
            onInspect={inspectCard}
          />
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

      {!threeD && (
      <div className="you-panel">
        <h3>{L(locale, "Thông tin của bạn", "Your info")}</h3>
        {you.role && (
          <>
            <div>
              <span className="role-badge" style={{ fontSize: "0.9rem" }}>{ROLE_EMOJI[you.role]} {roleLabel(locale, you.role)}</span>
              {threeD && you.character && (
                <span className="badge" style={{ marginLeft: 8 }}>🎭 {you.character.name}</span>
              )}
            </div>
            {!threeD && <p className="muted" style={{ marginTop: 6 }}>🎯 {roleGoal(locale, you.role)}</p>}
          </>
        )}
        {!threeD && you.character && (
          <div style={{ marginTop: 10 }}>
            <CharacterFace c={you.character} />
          </div>
        )}
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          <HpPips hp={you.hp} maxHp={you.maxHp} />
          <span className="badge">🎯 {L(locale, "Tầm bắn", "Range")} {you.range}</span>
        </div>

        {!threeD && you.equipment.length > 0 && (
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
              <div key={c.id} className={justDrew.has(c.id) ? "draw-in" : undefined}>
                <PlayingCard
                  card={c}
                  onClick={inPlayPhase ? () => cardAction(c) : undefined}
                  selected={sidPick.includes(c.id) || aiming?.id === c.id}
                />
              </div>
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
                {L(locale, `Chỉ giữ tối đa ${you.hp} lá & kết thúc`, `Keep max ${you.hp} & end turn`)}
              </button>
            ) : (
              <button onClick={onEndTurn}>{L(locale, "Kết thúc lượt →", "End turn →")}</button>
            )}
          </>
        )}
      </div>
      )}

      {notice && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "18%",
            transform: "translateX(-50%)",
            zIndex: 1200,
            background: "rgba(180,40,40,0.95)",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 10,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,.5)",
            pointerEvents: "none",
            maxWidth: "80vw",
            textAlign: "center",
          }}
        >
          {notice}
        </div>
      )}

      {/* card detail popup — shows the actual card face + full effect */}
      {infoCard && (
        <div
          onClick={() => setInfoCard(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, maxWidth: 320 }}
          >
            <div style={{ transform: "scale(1.6)", transformOrigin: "top center", marginBottom: 60 }}>
              <PlayingCard card={infoCard} />
            </div>
            <p className="muted" style={{ textAlign: "center", lineHeight: 1.5, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
              {CARD_DEF_BY_ID[infoCard.defId]?.effect}
            </p>
            <button style={{ width: "auto", padding: "10px 24px" }} onClick={() => setInfoCard(null)}>{L(locale, "Đóng", "Close")}</button>
          </div>
        </div>
      )}

      {/* character card popup */}
      {charView && (
        <div
          onClick={() => setCharView(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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
          style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
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

      {/* end-of-game overlay for the 3D view (2D has its own banner) */}
      {threeD && view.phase === "result" && view.winner && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "system-ui, sans-serif", padding: 20 }}>
          <div style={{ fontSize: "1.8rem", fontWeight: 800, color: "#f0e2c0", textAlign: "center" }}>{winnerText(locale, view.winner)}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {view.you.isHost && (
              <button style={{ width: "auto", padding: "12px 20px" }} onClick={onRestart}>{L(locale, "🔁 Chơi lại / Về phòng chờ", "🔁 Play again / Lobby")}</button>
            )}
            <button className="ghost" style={{ width: "auto", padding: "12px 20px" }} onClick={() => setThreeD(false)}>{L(locale, "🃏 Xem bảng 2D", "🃏 View 2D")}</button>
          </div>
          {!view.you.isHost && <p className="muted">{L(locale, "Chờ chủ phòng bắt đầu ván mới…", "Waiting for the host…")}</p>}
        </div>
      )}

      {threeD && (
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
          </div>

          {/* action history — top-right, collapsible, scrollable */}
          {view.log.length > 0 && (
            <div style={{ position: "fixed", top: 56, right: 12, zIndex: 55, width: 220, background: "rgba(20,18,16,0.82)", borderRadius: 10, fontFamily: "system-ui, sans-serif", color: "#f0e2c0", overflow: "hidden" }}>
              <div
                onClick={() => setLogOpen((o) => !o)}
                style={{ padding: "6px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", borderBottom: "1px solid rgba(240,226,192,0.2)" }}
              >
                <span>📜 {L(locale, "Lịch sử", "History")}</span>
                <span>{logOpen ? "▾" : "▸"}</span>
              </div>
              <div style={{ maxHeight: logOpen ? "56vh" : 118, overflowY: "auto", padding: "6px 10px", display: "flex", flexDirection: "column", gap: 3, fontSize: 12, lineHeight: 1.3 }}>
                {[...view.log].reverse().map((e) => (
                  <div key={e.id} style={{ opacity: e.kind === "turn" ? 0.7 : 1, fontWeight: e.kind === "death" ? 700 : 400 }}>
                    {logText(locale, e, you.name)}
                  </div>
                ))}
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
                  {isSid && you.hp < you.maxHp && you.hand.length >= 2 && (
                    <button className="ghost" onClick={() => { setSidPicking((v) => !v); setSidPick([]); }}>
                      {sidPicking ? L(locale, `Chọn 2 lá (${sidPick.length}/2)`, `Pick 2 (${sidPick.length}/2)`) : L(locale, "Sid: bỏ 2 → +1 máu", "Sid: discard 2 → +1")}
                    </button>
                  )}
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

          {/* aiming: click a green scope over a target (rendered in the 3D scene) */}
          {aiming && (
            <div style={{ position: "fixed", left: "50%", top: "8%", transform: "translateX(-50%)", zIndex: 56, display: "flex", alignItems: "center", gap: 12, background: "rgba(20,18,16,0.92)", padding: "10px 16px", borderRadius: 12, color: "#f0e2c0", fontFamily: "system-ui, sans-serif", maxWidth: "90vw", textAlign: "center" }}>
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
                    canInteract={inPlayPhase}
                    canDiscard={overLimit > 0}
                    entering={justDrew.has(c.id)}
                    selected={sidPick.includes(c.id) || aiming?.id === c.id}
                    onPlay={() => (sidPicking ? cardAction(c) : playGesture(c))}
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

// The character rendered in the same playing-card style as the deck cards.
function CharacterFace({ c }: { c: Character }) {
  const locale = useLocale();
  return (
    <div className="pcard pcard-md pc-character" style={{ height: "auto", minHeight: 168 }}>
      <div className="pc-name">{c.name}</div>
      <div className="pc-center" style={{ minHeight: 46, flex: "0 0 auto" }}>
        <span className="pc-icon">🤠</span>
      </div>
      <div className="pc-desc" style={{ WebkitLineClamp: 7 }}>{charAbility(locale, c.id)}</div>
      <span className="pc-corner">❤️{c.maxHp}{c.rank ? ` · ${c.rank}` : ""}</span>
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
