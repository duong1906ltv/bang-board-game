"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Character, PlayerView, PlayerPublic, ROLE_EMOJI } from "@/lib/types";
import { type Card } from "@/lib/cards";
import { getIntroSeen, setIntroSeen } from "@/lib/prefs";
import { useDisplayPrefs } from "./useDisplayPrefs";
import { useTableFeedback } from "./useTableFeedback";
import { L, useLocale, roleLabel } from "@/lib/i18n";
import { Briefing } from "./Briefing";
import { CardModal } from "./CardModal";
import { CharacterFace } from "./CharacterFace";
import { HandCard } from "./HandCard";
import { DrawControls } from "./DrawControls";
import { EventBanner } from "./EventBanner";
import { EventChips } from "./EventChips";
import { HpPips } from "./HpPips";
import { LogPanel } from "./LogPanel";
import { ResultOverlay } from "./ResultOverlay";
import { SettingsMenu } from "./SettingsMenu";
import { TableChoice } from "./TableChoice";

// 3D table (react-three-fiber). Loaded client-only: Three.js needs the browser.
const TableScene = dynamic(() => import("@/components/three/TableScene"), { ssr: false });

export function Table({
  view,
  onDraw,
  onPlay,
  onDiscard,
  onSidHeal,
  onEndTurn,
  onSurrender,
  onRestart,
  onPlayAgain,
  onChoose,
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
  onChoose: (cardId: string) => void;
}) {
  const locale = useLocale();
  const isMyTurn = view.turnSeat != null && view.turnSeat === view.you.seat && view.you.alive;
  const you = view.you;
  // The end-of-turn hand limit is normally your life total, but events shift it
  // (Drought / Hangover), so the server sends the resolved number.
  const overLimit = Math.max(0, you.hand.length - you.handLimit);
  const inPlayPhase = isMyTurn && you.turnPhase !== "draw";
  const [aiming, setAiming] = useState<{ id: string; defId: string } | null>(null);
  // A counter, not a boolean: every press has to reach the scene, including the second
  // press after you have orbited away again, and a boolean would only fire once.
  const [homeKey, setHomeKey] = useState(0);
  // A General Store or a Kit Carlson is answered out on the table, not in a panel.
  const tableChoice = view.pending?.kind === "store" || view.pending?.kind === "kit";
  const [sidPick, setSidPick] = useState<string[]>([]);
  const [sidPicking, setSidPicking] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Which cards the end-of-turn discard has picked so far. Held here rather than thrown
  // one by one so the whole discard is a single decision the player can back out of.
  const [discardPick, setDiscardPick] = useState<string[]>([]);
  const [infoCard, setInfoCard] = useState<Card | null>(null);
  const [charView, setCharView] = useState<Character | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [playerInfo, setPlayerInfo] = useState<PlayerPublic | null>(null);
  const { fx, toggleFx, shotCam, toggleShotCam, models, toggleModels, sfx, toggleSfx } =
    useDisplayPrefs();
  // Auto-opens only on this device's first game.
  const [briefing, setBriefing] = useState(false);
  useEffect(() => {
    if (!getIntroSeen()) setBriefing(true);
  }, []);
  const closeBriefing = () => {
    setIntroSeen();
    setBriefing(false);
  };

  const inspectCard = (c: Card) => setInfoCard(c);
  const showRole = () => setBriefing(true);
  const { marquee, clearMarquee, eventBatch, dismissEvents, justDrew, notice, flash } =
    useTableFeedback(view);

  // Escape dismisses any open popup and cancels aim / Sid-pick mode — the same
  // exits the click-outside overlays offer, but for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setInfoCard(null); setCharView(null); setPlayerInfo(null); closeBriefing(); dismissEvents();
      setConfirmSurrender(false); setDiscarding(false);
      setAiming(null); setSidPicking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


  useEffect(() => {
    if (discarding && overLimit === 0) {
      onEndTurn();
      setDiscarding(false);
    }
  }, [discarding, overLimit, onEndTurn]);
  useEffect(() => {
    if (!inPlayPhase && discarding) setDiscarding(false);
  }, [inPlayPhase, discarding]);
  // A card can leave the hand without being discarded — Sid burning two, an opponent's
  // Panic! — and a selection holding an id that is no longer there would arm the confirm
  // for a card the server will refuse.
  useEffect(() => {
    setDiscardPick((s) => {
      const live = s.filter((id) => you.hand.some((c) => c.id === id));
      return live.length === s.length ? s : live;
    });
  }, [you.hand]);

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

  // What a TAP does — which is the whole interface to your hand now. Three modes own it
  // in turn: Sid Ketchum picking his two, the discard that ends a turn picking its N,
  // and otherwise playing the card outright. Reading a card is a press-and-hold.
  const cardAction = (card: Card) => {
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
    // Selecting, NOT throwing. The cards go together when the confirm is pressed, so a
    // misplaced tap here costs nothing and there is a moment to look at the three you
    // are about to lose before they are gone.
    if (discarding) {
      return setDiscardPick((s) => (s.includes(card.id) ? s.filter((x) => x !== card.id) : [...s, card.id]));
    }
    if (blockOneCard(card.defId)) return;
    if (needsTarget(card.defId)) {
      return setAiming({ id: card.id, defId: card.defId });
    }
    onPlay(card.id);
  };

  // The discard fires as one act, in the order they were picked. The turn ends itself
  // once the hand is back at the limit — see the effect above that watches overLimit —
  // so there is nothing to chain onto the last one.
  const confirmDiscard = () => {
    if (discardPick.length !== overLimit) return;
    for (const id of discardPick) onDiscard(id);
    setDiscardPick([]);
  };

  // The engine resolves who each card may be aimed at (targetProblem in game.ts)
  // and ships the answer in the view, so this is pure lookup — no second rulebook.
  const canTarget = (p: (typeof view.players)[number]) => {
    if (!aiming) return false;
    const ids = you.legalTargets[aiming.defId];
    return !!ids?.includes(p.id);
  };
  const fireAt = (targetId: string, targetCardId?: string) => {
    if (!aiming) return;
    onPlay(aiming.id, targetId, targetCardId);
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
    "cat-balou": ["Bấm kính nhắm (bỏ 1 lá tay ngẫu nhiên) hoặc bấm lá xanh trên bàn để bỏ lá đó", "Click the scope (random hand card) or a table card to discard it"],
  };

  return (
    <div className="card wide" style={{ marginTop: 16 }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#141210" }}>
        <TableScene
          view={view}
          homeKey={homeKey}
          targetIds={aiming ? view.players.filter((p) => canTarget(p)).map((p) => p.id) : []}
          onPickTarget={fireAt}
          onInspect={inspectCard}
          onInspectPlayer={setPlayerInfo}
          pickCardMode={pickCardMode}
          onPickCard={(ownerId, cardId) => fireAt(ownerId, cardId)}
          /* You draw by clicking the deck, so the pile is armed exactly when the old
             "Rút 2 lá" button used to be shown. Not while aiming: a click on the felt
             then belongs to whatever you are pointing at. */
          canDraw={isMyTurn && you.turnPhase === "draw" && !aiming}
          onDrawDeck={() => onDraw()}
          /* Jesse Jones' other draw option, as a thing on the table rather than a
             button: the hands he may raid light up and taking one is a click on the
             cards. `legalDrawTargets` is empty for everybody else, so no character
             check is needed here — the engine has already answered it. */
          stealIds={isMyTurn && you.turnPhase === "draw" && !aiming ? you.legalDrawTargets : []}
          onSteal={(id) => onDraw("player", id)}
          fx={fx}
          shotCam={shotCam}
          models={models}
        />
      </div>

      {marquee && (
        <div className="marquee-wrap">
          <span key={marquee} className="marquee-track" onAnimationEnd={clearMarquee}>
            {marquee}
          </span>
        </div>
      )}

      {eventBatch.length > 0 && (
        <EventBanner key={eventBatch[0].seq} evs={eventBatch} onDone={dismissEvents} />
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
      <TableChoice pending={view.pending ?? null} youName={view.you.name} onChoose={onChoose} />

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
          {/* Orbiting the room is free, so a player can end up under the table or facing
              a wall with no way back short of a reload. Icon-only like the gear beside
              it — the bar is already carrying five things. */}
          <button
            className="ghost"
            style={{ width: "auto", padding: "4px 9px", fontSize: "0.9rem" }}
            onClick={() => setHomeKey((k) => k + 1)}
            title={L(locale, "Về góc nhìn mặc định", "Reset the camera")}
          >
            🎥
          </button>
          <SettingsMenu
            fx={fx}
            onToggleFx={toggleFx}
            shotCam={shotCam}
            onToggleShotCam={toggleShotCam}
            models={models}
            onToggleModels={toggleModels}
            sfx={sfx}
            onToggleSfx={toggleSfx}
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
          Down here they belong to the HUD, and the felt stays clear.

          Hidden while a choice is staged on the table. Two reasons, and the second is
          the one that bites: the engine refuses every play until the pending resolves,
          so these are dead controls — and this panel is `position: fixed` at zIndex 55
          over a canvas at zIndex 40, which puts it in front of EVERYTHING drawn inside
          the scene however high that thing sets its own z-index. Centred and opaque, it
          sat exactly on the picker's confirm button and swallowed the clicks. */}
      {you.alive && isMyTurn && !aiming && !tableChoice && (
        <div
          style={{
            position: "fixed",
            // Bottom right, the one free corner: the badges own the top left, Sid
            // Ketchum's heal button the bottom left, and the hand runs across the middle
            // (its cards stand ~160 tall from the foot of the screen, so this clears
            // them). It used to sit dead centre above the hand, over the near half of
            // the felt — the busiest part of the table and the part the cards in play
            // and the waiting guns are on.
            right: 12,
            bottom: 180,
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
            <DrawControls you={you} onDraw={onDraw} />
          ) : (
            /* Ending a turn over the hand limit is two steps, and the button is both of
               them in order: press once to enter discard mode, tap the cards, press the
               confirm. It used to go dead while you were over the limit and leave you to
               work out that cards had to go first. */
            discarding ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={confirmDiscard}
                  disabled={discardPick.length !== overLimit}
                  style={{ flex: 1 }}
                >
                  {L(
                    locale,
                    `Xác nhận bỏ ${discardPick.length}/${overLimit}`,
                    `Confirm discard ${discardPick.length}/${overLimit}`
                  )}
                </button>
                <button
                  className="ghost"
                  style={{ width: "auto", padding: "12px 14px" }}
                  onClick={() => { setDiscarding(false); setDiscardPick([]); }}
                >
                  {L(locale, "Huỷ", "Cancel")}
                </button>
              </div>
            ) : (
              <button onClick={() => (overLimit > 0 ? setDiscarding(true) : onEndTurn())}>
                {overLimit > 0
                  ? L(locale, `Kết thúc lượt → bỏ ${overLimit} lá`, `End turn → discard ${overLimit}`)
                  : L(locale, "Kết thúc lượt →", "End turn →")}
              </button>
            )
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
              <HandCard
                card={c}
                canInteract={inPlayPhase || sidPicking}
                entering={justDrew.has(c.id)}
                selected={sidPick.includes(c.id) || discardPick.includes(c.id) || aiming?.id === c.id}
                onTap={() => cardAction(c)}
                onInspect={() => setInfoCard(c)}
              />
            </div>
          ))}
        </div>
      )}

      {inPlayPhase && !aiming && you.hand.length > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 176, transform: "translateX(-50%)", zIndex: 55, color: "rgba(240,226,192,0.85)", fontSize: 13, fontFamily: "system-ui, sans-serif", textShadow: "0 1px 3px #000", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {sidPicking
            ? L(locale, `Chạm 2 lá để bỏ (${sidPick.length}/2)`, `Tap 2 cards to discard (${sidPick.length}/2)`)
            : discarding
              ? L(locale, `Chọn ${overLimit} lá để bỏ (${discardPick.length}/${overLimit})`, `Pick ${overLimit} to discard (${discardPick.length}/${overLimit})`)
              : you.jailed
                ? L(locale, "Bị giam — không đánh được · kết thúc lượt để bỏ bài", "In jail — nothing can be played · end turn to discard")
                : L(locale, "Chạm để đánh · giữ để xem lá", "Tap to play · hold to read")}
        </div>
      )}
    </div>
  );
}
