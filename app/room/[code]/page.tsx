"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity } from "@/lib/socketClient";
import {
  Character,
  PlayerView,
  ROLE_EMOJI,
  ROLE_GOAL,
  ROLE_LABELS,
  WINNER_LABEL,
} from "@/lib/types";
import { SUIT_SYMBOL, rankLabel } from "@/lib/cards";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 7;

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code || "").toUpperCase();

  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
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
        <p className="muted">Đang kết nối phòng {code}…</p>
        {error && <p className="err">{error}</p>}
      </main>
    );
  }

  return (
    <main className="wrap">
      <Header code={code} copied={copied} onCopy={copyCode} />
      {error && <p className="err">{error}</p>}

      {view.phase === "lobby" && <Lobby view={view} onStart={start} />}
      {view.phase === "drafting" && <Draft view={view} onPick={pick} />}
      {(view.phase === "playing" || view.phase === "result") && (
        <Table view={view} onDraw={draw} onPlay={play} onDiscard={discard} onSidHeal={sidHeal} onEndTurn={endTurn} onRestart={restart} />
      )}

      {view.pending && <ReactionPanel view={view} onRespond={respond} onChoose={choose} />}
    </main>
  );
}

// Modal for an in-flight reaction / choice (Bang!, dying, Indians!, Gatling,
// Duel, General Store).
const ACTION_LABEL: Record<string, string> = {
  missed: "Đánh Missed!",
  beer: "Uống Beer 🍺",
  bang: "Bỏ 1 Bang!",
  pass: "Bỏ qua / Chịu",
};
const PENDING_EMOJI: Record<string, string> = {
  bang: "🔫",
  dying: "💀",
  multi: "🎯",
  duel: "⚔️",
  store: "🏪",
  kit: "🎴",
};

function ReactionPanel({
  view,
  onRespond,
  onChoose,
}: {
  view: PlayerView;
  onRespond: (type: "missed" | "beer" | "bang" | "pass", cardId?: string) => void;
  onChoose: (cardId: string) => void;
}) {
  const p = view.pending!;
  const remaining = useCountdown(p.endsAt);
  const you = view.you;

  // Send a response, attaching the relevant card id from your hand when needed.
  const doAction = (a: "missed" | "beer" | "bang" | "pass") => {
    if (a === "pass") return onRespond("pass");
    const card = you.hand.find((c) => c.defId === a);
    onRespond(a, card?.id);
  };

  const bystander = !p.youMustRespond;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ color: "var(--accent)" }}>
        <div className="modal-emoji">{PENDING_EMOJI[p.kind]}</div>
        <p className="modal-ability">{p.info}</p>
        {p.kind === "bang" && (
          <p className="muted">Cần {(p.missedNeeded ?? 1) - (p.missedPlayed ?? 0)} Missed! để né</p>
        )}
        <div className="timer">{remaining}s</div>

        {/* General Store / Kit Carlson: pick from the revealed cards. */}
        {(p.kind === "store" || p.kind === "kit") && (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(90px,1fr))", marginTop: 10 }}>
            {(p.storeCards ?? []).map((c) => {
              const red = c.suit === "hearts" || c.suit === "diamonds";
              return (
                <div
                  key={c.id}
                  className="selectable"
                  style={{ cursor: p.youMustRespond ? "pointer" : "default", opacity: p.youMustRespond ? 1 : 0.7 }}
                  onClick={() => p.youMustRespond && onChoose(c.id)}
                >
                  <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{c.name}</div>
                  <div style={{ color: red ? "#ff6b6b" : "var(--muted)" }}>
                    {rankLabel(c.rank)}
                    {SUIT_SYMBOL[c.suit]}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Response buttons for the player who must act. */}
        {p.actions.map((a, i) => (
          <div key={a}>
            {i > 0 && <div style={{ height: 8 }} />}
            <button className={a === "pass" ? "ghost" : ""} onClick={() => doAction(a)}>
              {ACTION_LABEL[a]}
            </button>
          </div>
        ))}

        {bystander && p.kind !== "store" && <p className="muted" style={{ marginTop: 10 }}>Đang chờ người khác…</p>}
      </div>
    </div>
  );
}

function Header({ code, copied, onCopy }: { code: string; copied: boolean; onCopy: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <h1 style={{ fontSize: "1.8rem" }}>🤠 Bang!</h1>
      <div className="row" style={{ alignItems: "center" }}>
        <span className="muted">Mã phòng:</span>
        <span className="code-pill" style={{ fontSize: "1.2rem", letterSpacing: 4, padding: "6px 12px" }}>
          {code}
        </span>
        <button className="ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={onCopy}>
          {copied ? "Đã chép ✓" : "Chép"}
        </button>
      </div>
    </div>
  );
}

function Lobby({ view, onStart }: { view: PlayerView; onStart: () => void }) {
  const n = view.players.length;
  const canStart = view.you.isHost && n >= MIN_PLAYERS && n <= MAX_PLAYERS;

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <h2 className="section-title">Phòng chờ</h2>
      <p className="muted">
        {n}/{MAX_PLAYERS} người · cần tối thiểu {MIN_PLAYERS} để bắt đầu
      </p>

      <ul className="players">
        {view.players.map((p) => (
          <li key={p.id}>
            <span>
              <span className={`dot ${p.connected ? "on" : "off"}`} />
              {p.name}
              {p.id === view.you.id && <span className="muted"> (bạn)</span>}
            </span>
            {p.isHost && <span className="badge">Chủ phòng ⭐</span>}
          </li>
        ))}
      </ul>

      {view.roleSetup.length > 0 && (
        <>
          <label style={{ marginTop: 8 }}>Phân bố vai với {n} người</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {view.roleSetup.map((r) => (
              <span key={r.role} className="badge">
                {ROLE_EMOJI[r.role]} {ROLE_LABELS[r.role]} ×{r.count}
              </span>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 16 }} />
      {view.you.isHost ? (
        <button onClick={onStart} disabled={!canStart}>
          {n < MIN_PLAYERS ? `Cần thêm ${MIN_PLAYERS - n} người` : "Bắt đầu ván"}
        </button>
      ) : (
        <p className="muted">Đang chờ chủ phòng bắt đầu…</p>
      )}
    </div>
  );
}

function Draft({ view, onPick }: { view: PlayerView; onPick: (id: string) => void }) {
  const draft = view.draft!;
  const remaining = useCountdown(draft.endsAt);

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">Chọn nhân vật</h2>
        <span className="timer" style={{ fontSize: "1.8rem" }}>{remaining}s</span>
      </div>
      <p className="muted">
        Chọn 1 trong 2 nhân vật trong {remaining}s. Hết giờ sẽ tự chọn theo hạng (rank) — cùng hạng thì ngẫu nhiên.
      </p>

      {view.you.role && (
        <p className="muted" style={{ marginTop: 4 }}>
          Vai của bạn: <strong>{ROLE_EMOJI[view.you.role]} {ROLE_LABELS[view.you.role]}</strong>
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
              {picked && <div className="badge" style={{ marginTop: 8 }}>Đã chọn ✓</div>}
            </div>
          );
        })}
      </div>

      <div style={{ height: 14 }} />
      <p className="muted">
        {draft.youPicked
          ? `Đã khóa nhân vật. Đang chờ ${draft.waitingFor.length} người: ${draft.waitingFor.join(", ") || "—"}`
          : "Hãy chọn nhanh!"}
        {" · "}
        {draft.pickedCount}/{draft.totalCount} đã chọn
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
  const isMyTurn = view.turnSeat != null && view.turnSeat === view.you.seat && view.you.alive;
  const you = view.you;
  const overLimit = Math.max(0, you.hand.length - you.hp); // cards to discard before ending
  const inPlayPhase = isMyTurn && you.turnPhase !== "draw";
  const [aiming, setAiming] = useState<{ id: string; defId: string } | null>(null); // card awaiting a target
  const [sidPick, setSidPick] = useState<string[]>([]); // Sid Ketchum: cards selected to discard
  const [sidPicking, setSidPicking] = useState(false); // Sid heal mode active
  const TARGETED = ["bang", "jail", "panic", "cat-balou", "duel"];
  const isSid = you.character?.id === "sid-ketchum";

  // Click behavior for a hand card: Sid selection, discard excess, aim, or play.
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
    if (overLimit > 0) return onDiscard(card.id);
    if (TARGETED.includes(card.defId)) {
      return setAiming((cur) => (cur?.id === card.id ? null : { id: card.id, defId: card.defId }));
    }
    onPlay(card.id);
  };

  // Which seats are valid targets while aiming (rules differ per card).
  const canTarget = (p: (typeof view.players)[number]) => {
    if (!aiming || !p.alive || p.id === you.id) return false;
    if (aiming.defId === "bang") return p.distance != null && p.distance <= you.range;
    if (aiming.defId === "jail") return p.role !== "sheriff" && !p.equipment.some((c) => c.defId === "jail");
    if (aiming.defId === "panic") return p.distance != null && p.distance <= 1;
    if (aiming.defId === "cat-balou") return p.handCount > 0 || p.equipment.length > 0;
    if (aiming.defId === "duel") return true; // any living opponent
    if (aiming.defId === "jesse") return p.handCount > 0; // Jesse Jones draws from a hand
    return false;
  };
  const fireAt = (targetId: string) => {
    if (!aiming) return;
    if (aiming.defId === "jesse") onDraw("player", targetId);
    else onPlay(aiming.id, targetId);
    setAiming(null);
  };

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 className="section-title">Bàn chơi</h2>
        <div className="row" style={{ alignItems: "center" }}>
          <span className="badge">🂠 Bộ bài: {view.deckCount}</span>
          <span className="badge">🗑️ Bỏ: {view.discardCount}</span>
          {view.you.isHost && (
            <button className="ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={onRestart}>
              Về phòng chờ
            </button>
          )}
        </div>
      </div>

      {view.phase === "result" && view.winner && (
        <div className={`banner ${view.winner === "outlaws" ? "werewolf" : view.winner === "sheriff" ? "village" : "none"}`}>
          {WINNER_LABEL[view.winner]}
        </div>
      )}

      {view.checks.length > 0 && (
        <div className="banner none">
          {view.checks.map((ck, i) => (
            <div key={i}>
              🎲 {ck.name} — {ck.kind === "dynamite" ? "Dynamite" : ck.kind === "jail" ? "Jail" : "Barrel"}:{" "}
              {ck.card ? `${rankLabel(ck.card.rank)}${SUIT_SYMBOL[ck.card.suit]}` : "?"} → {ck.outcome}
            </div>
          ))}
        </div>
      )}

      {aiming && (
        <div className="banner none">
          🎯{" "}
          {aiming.defId === "bang"
            ? `Chọn mục tiêu Bang! (trong tầm ${you.range})`
            : aiming.defId === "jail"
            ? "Chọn người để bỏ tù (không phải Sheriff)"
            : aiming.defId === "panic"
            ? "Chọn người ở khoảng cách 1 để rút bài"
            : aiming.defId === "duel"
            ? "Chọn người để Duel (đấu bỏ Bang!)"
            : aiming.defId === "jesse"
            ? "Chọn người để rút 1 lá từ tay họ (Jesse Jones)"
            : "Chọn người để ép bỏ 1 lá (Cat Balou)"}{" "}
          ·{" "}
          <button className="ghost" style={{ width: "auto", padding: "4px 10px" }} onClick={() => setAiming(null)}>
            Hủy
          </button>
        </div>
      )}

      <div className="seats">
        {view.players.map((p) => {
          const targetable = canTarget(p);
          return (
          <div
            key={p.id}
            className={[
              "seat",
              p.isTurn ? "turn" : "",
              p.alive ? "" : "dead",
              p.id === view.you.id ? "me" : "",
              targetable ? "selectable picked" : "",
            ].join(" ")}
            onClick={() => targetable && fireAt(p.id)}
            style={{ cursor: targetable ? "pointer" : "default" }}
          >
            <div className="seat-name">
              <span className={`dot ${p.connected ? "on" : "off"}`} />
              {p.name}
              {p.id === view.you.id && <span className="muted"> (bạn)</span>}
            </div>
            <div className="seat-meta">
              Ghế #{p.seat + 1}
              {p.distance != null && ` · cách ${p.distance}`}
              {p.isTurn && " · đang tới lượt"}
              {!p.alive && " · đã chết"}
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
                <span className="role-badge">
                  {ROLE_EMOJI[p.role]} {ROLE_LABELS[p.role]}
                </span>
              ) : (
                <span className="role-badge hidden">Vai ẩn</span>
              )}
            </div>
            <div className="seat-meta">🂠 {p.handCount} lá</div>
          </div>
          );
        })}
      </div>

      {/* Your private panel — only you see your own role. */}
      <div className="you-panel">
        <h3>Thông tin của bạn</h3>
        {you.role && (
          <>
            <div>
              <span className="role-badge" style={{ fontSize: "0.9rem" }}>
                {ROLE_EMOJI[you.role]} {ROLE_LABELS[you.role]}
              </span>
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              🎯 {ROLE_GOAL[you.role]}
            </p>
          </>
        )}
        {you.character && (
          <div style={{ marginTop: 10 }}>
            <CharacterCard c={you.character} />
          </div>
        )}
        <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          <HpPips hp={you.hp} maxHp={you.maxHp} />
          <span className="badge">🎯 Tầm bắn {you.range}</span>
        </div>

        {you.equipment.length > 0 && (
          <>
            <label style={{ marginTop: 12 }}>Bài xanh trên bàn</label>
            <div className="hand">
              {you.equipment.map((c) => (
                <span key={c.id} className="card-chip">
                  {c.name} {rankLabel(c.rank)}
                  {SUIT_SYMBOL[c.suit]}
                </span>
              ))}
            </div>
          </>
        )}

        <label style={{ marginTop: 12 }}>
          Bài trên tay ({you.hand.length})
          {inPlayPhase && (overLimit > 0 ? ` · bấm để bỏ ${overLimit} lá dư` : " · bấm để đánh")}
        </label>
        <div className="hand">
          {you.hand.length === 0 ? (
            <span className="muted">Chưa có lá nào.</span>
          ) : (
            you.hand.map((c) => {
              const red = c.suit === "hearts" || c.suit === "diamonds";
              return (
                <span
                  key={c.id}
                  className="card-chip"
                  onClick={() => cardAction(c)}
                  style={{
                    cursor: inPlayPhase ? "pointer" : "default",
                    borderColor:
                      sidPick.includes(c.id) || aiming?.id === c.id
                        ? "var(--accent)"
                        : overLimit > 0
                        ? "var(--danger)"
                        : undefined,
                  }}
                  title={inPlayPhase ? (overLimit > 0 ? "Bấm để bỏ" : "Bấm để đánh") : undefined}
                >
                  {c.name}{" "}
                  <span style={{ color: red ? "#ff6b6b" : "var(--muted)" }}>
                    {rankLabel(c.rank)}
                    {SUIT_SYMBOL[c.suit]}
                  </span>
                </span>
              );
            })
          )}
        </div>

        <div style={{ height: 14 }} />
        {!you.alive ? (
          <p className="muted">Bạn đã bị loại — theo dõi ván đấu tiếp diễn.</p>
        ) : !isMyTurn ? (
          <button disabled>Chưa tới lượt bạn</button>
        ) : you.turnPhase === "draw" ? (
          <DrawControls you={you} onDraw={onDraw} aimJesse={() => setAiming({ id: "", defId: "jesse" })} />
        ) : (
          <>
            {isSid && you.hp < you.maxHp && you.hand.length >= 2 && (
              <>
                <button className="ghost" onClick={() => { setSidPicking((v) => !v); setSidPick([]); }}>
                  {sidPicking ? `Chọn 2 lá để bỏ… (${sidPick.length}/2)` : "Sid: bỏ 2 lá → +1 máu"}
                </button>
                <div style={{ height: 8 }} />
              </>
            )}
            <button onClick={onEndTurn} disabled={overLimit > 0}>
              {overLimit > 0 ? `Bỏ bớt ${overLimit} lá để kết thúc` : "Kết thúc lượt →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Draw-phase buttons; Jesse Jones and Pedro Ramirez get their alternate source.
function DrawControls({
  you,
  onDraw,
  aimJesse,
}: {
  you: PlayerView["you"];
  onDraw: (source?: "deck" | "discard" | "player", targetId?: string) => void;
  aimJesse: () => void;
}) {
  const char = you.character?.id;
  if (char === "jesse-jones") {
    return (
      <>
        <button onClick={() => onDraw()}>Rút 2 lá thường 🂠</button>
        <div style={{ height: 8 }} />
        <button className="ghost" onClick={aimJesse}>Rút 1 lá từ tay người khác</button>
      </>
    );
  }
  if (char === "pedro-ramirez") {
    return (
      <>
        <button onClick={() => onDraw()}>Rút 2 lá thường 🂠</button>
        <div style={{ height: 8 }} />
        <button className="ghost" onClick={() => onDraw("discard")}>Rút lá bỏ trên cùng + 1</button>
      </>
    );
  }
  return <button onClick={() => onDraw()}>Rút 2 lá 🂠</button>;
}

function CharacterCard({ c }: { c: Character }) {
  return (
    <div>
      <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
        🎭 {c.name}
        {c.rank && <span className="badge" style={{ fontSize: "0.7rem" }}>Hạng {c.rank}</span>}
        <span className="badge" style={{ fontSize: "0.7rem" }}>❤️ {c.maxHp}</span>
      </div>
      <p className="muted" style={{ marginTop: 6, fontSize: "0.85rem", lineHeight: 1.4 }}>
        {c.ability}
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
    <div className="hp" title={`${hp}/${maxHp} máu`}>
      {pips.map((filled, i) => (
        <span key={i} className={`pip ${filled ? "" : "empty"}`} />
      ))}
    </div>
  );
}

// Ticking countdown (seconds) to an epoch-ms deadline.
function useCountdown(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
