"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket, loadIdentity } from "@/lib/socketClient";
import { PlayerView, ROLE_EMOJI, ROLE_GOAL, ROLE_LABELS } from "@/lib/types";

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

    // Reconnect / rejoin using the identity saved for this room.
    function attemptRejoin() {
      if (!playerId) {
        // No identity for this room — bounce to the lobby to join properly.
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
      <Header code={code} copied={copied} onCopy={copyCode} phase={view.phase} />
      {error && <p className="err">{error}</p>}

      {view.phase === "lobby" && <Lobby view={view} onStart={start} />}
      {view.phase === "playing" && (
        <Table view={view} onEndTurn={endTurn} onRestart={restart} />
      )}
      {view.phase === "result" && <Table view={view} onEndTurn={endTurn} onRestart={restart} />}
    </main>
  );
}

function Header({
  code,
  copied,
  onCopy,
  phase,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
  phase: string;
}) {
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
        {view.you.isHost && (
          <button className="ghost" style={{ width: "auto", padding: "8px 12px" }} onClick={onRestart}>
            Về phòng chờ
          </button>
        )}
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

      {/* Your private panel — only you see your own role + hand. */}
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
        <HpPips hp={you.hp} maxHp={you.maxHp} />
        <div className="muted" style={{ marginTop: 4 }}>
          Nhân vật: {you.characterName ?? "— (chờ bộ nhân vật)"}
        </div>

        <label style={{ marginTop: 12 }}>Bài trên tay ({you.hand.length})</label>
        <div className="hand">
          {you.hand.length === 0 ? (
            <span className="muted">Chưa có lá bài nào (lớp bài sẽ thêm sau).</span>
          ) : (
            you.hand.map((c) => (
              <span key={c.id} className="card-chip">
                {c.name}
              </span>
            ))
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
