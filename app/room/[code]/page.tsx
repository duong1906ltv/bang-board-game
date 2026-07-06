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
} from "@/lib/types";
import { SUIT_SYMBOL } from "@/lib/cards";

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
        <Table view={view} onEndTurn={endTurn} onRestart={restart} />
      )}
    </main>
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
  onEndTurn,
  onRestart,
}: {
  view: PlayerView;
  onEndTurn: () => void;
  onRestart: () => void;
}) {
  const isMyTurn = view.turnSeat != null && view.turnSeat === view.you.seat && view.you.alive;
  const you = view.you;

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

      <div className="seats">
        {view.players.map((p) => (
          <div
            key={p.id}
            className={[
              "seat",
              p.isTurn ? "turn" : "",
              p.alive ? "" : "dead",
              p.id === view.you.id ? "me" : "",
            ].join(" ")}
          >
            <div className="seat-name">
              <span className={`dot ${p.connected ? "on" : "off"}`} />
              {p.name}
              {p.id === view.you.id && <span className="muted"> (bạn)</span>}
            </div>
            <div className="seat-meta">
              Ghế #{p.seat + 1}
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
        ))}
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
        <HpPips hp={you.hp} maxHp={you.maxHp} />

        <label style={{ marginTop: 12 }}>Bài trên tay ({you.hand.length})</label>
        <div className="hand">
          {you.hand.length === 0 ? (
            <span className="muted">Chưa có lá bài nào (lớp bài sẽ thêm sau).</span>
          ) : (
            you.hand.map((c) => {
              const red = c.suit === "hearts" || c.suit === "diamonds";
              return (
                <span key={c.id} className="card-chip">
                  {c.name}{" "}
                  <span style={{ color: red ? "#ff6b6b" : "var(--muted)" }}>
                    {SUIT_SYMBOL[c.suit]}
                    {c.rank ?? ""}
                  </span>
                </span>
              );
            })
          )}
        </div>

        <div style={{ height: 14 }} />
        {you.alive ? (
          <button onClick={onEndTurn} disabled={!isMyTurn}>
            {isMyTurn ? "Kết thúc lượt →" : "Chưa tới lượt bạn"}
          </button>
        ) : (
          <p className="muted">Bạn đã bị loại — theo dõi ván đấu tiếp diễn.</p>
        )}
      </div>
    </div>
  );
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
