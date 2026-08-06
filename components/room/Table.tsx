"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Character, PlayerView, PlayerPublic, ROLE_EMOJI, type EventView } from "@/lib/types";
import { rankLabel, SUIT_SYMBOL, type Card } from "@/lib/cards";
import { getFx, setFx, getIntroSeen, setIntroSeen } from "@/lib/prefs";
import { L, useLocale, roleLabel, checkText } from "@/lib/i18n";
import { CHECK_ICON } from "./constants";
import { Briefing } from "./Briefing";
import { CardModal } from "./CardModal";
import { CharacterFace } from "./CharacterFace";
import { DragCard } from "./DragCard";
import { DrawControls } from "./DrawControls";
import { EventBanner } from "./EventBanner";
import { EventChips } from "./EventChips";
import { HpPips } from "./HpPips";
import { LogPanel } from "./LogPanel";
import { ResultOverlay } from "./ResultOverlay";
import { SettingsMenu } from "./SettingsMenu";

// 3D table (react-three-fiber). Loaded client-only: Three.js needs the browser.
const TableScene = dynamic(() => import("@/components/three/TableScene"), { ssr: false });

export function Table({
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

      <ResultOverlay view={view} onRestart={onRestart} onPlayAgain={onPlayAgain} />

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

      <LogPanel log={view.log} inbox={you.inbox} youName={you.name} onInspect={setInfoCard} />

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
            <button
              onClick={onEndTurn}
              disabled={overLimit > 0}
              title={overLimit > 0 ? L(locale, "Chạm một lá rồi chọn Bỏ bài", "Tap a card and choose Discard") : undefined}
            >
              {overLimit > 0
                ? L(locale, `Giữ tối đa ${you.handLimit} lá (còn dư ${overLimit})`, `Keep max ${you.handLimit} (${overLimit} over)`)
                : L(locale, "Kết thúc lượt →", "End turn →")}
            </button>
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
    </div>
  );
}
