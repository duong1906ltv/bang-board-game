"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AbilityKind, Character, PendingAction, PlayerView, PlayerPublic, ROLE_EMOJI } from "@/lib/types";
import { CARD_DEF_BY_ID, type Card } from "@/lib/cards";
import { getIntroSeen, setIntroSeen } from "@/lib/prefs";
import { useDisplayPrefs } from "./useDisplayPrefs";
import { useTableFeedback } from "./useTableFeedback";
import { L, useLocale, roleLabel, tError } from "@/lib/i18n";
import { AbilityBar, ABILITY_SPEC } from "./AbilityBar";
import { GreenCardBar } from "./GreenCardBar";
import { Briefing } from "./Briefing";
import { CardModal } from "./CardModal";
import { CharacterFace } from "./CharacterFace";
import { HandCard } from "./HandCard";
import { DrawControls } from "./DrawControls";
import { EventBanner } from "./EventBanner";
import { EventChips } from "./EventChips";
import { PredictPanel } from "./PredictPanel";
import { PredictReveal } from "./PredictReveal";
import { MissionChip } from "./MissionChip";
import { MissionReveal } from "./MissionReveal";
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
  onRespond,
  onDiscard,
  onUseAbility,
  onUseEquip,
  onEndTurn,
  onSurrender,
  onRestart,
  onPlayAgain,
  onChoose,
  onPredict,
  onCancelPredict,
}: {
  view: PlayerView;
  onDraw: (source?: "deck" | "discard" | "player" | "equipment", targetId?: string, cardId?: string) => void;
  onPlay: (cardId: string, targetId?: string, targetCardId?: string, payCardIds?: string[]) => void;
  // Brawl bắt bạn tự chọn lá bỏ, mà tay bài nằm ở đây chứ không ở ReactionPanel.
  onRespond: (type: PendingAction, cardId?: string) => void;
  onDiscard: (cardId: string) => void;
  onUseAbility: (kind: AbilityKind, cardIds: string[], targetId?: string) => void;
  onUseEquip: (cardId: string, targetId?: string) => void;
  onEndTurn: () => void;
  onSurrender: () => void;
  onRestart: () => void;
  onPlayAgain: () => void;
  onChoose: (cardId: string) => void;
  onPredict: (subjectId: string, value: string) => void;
  onCancelPredict: (subjectId: string) => void;
}) {
  const locale = useLocale();
  const you = view.you;
  // Everything that asks "may I act" asks this, not `alive`: a ghost is dead and still
  // holds a turn. The two are never both true, so this is exactly "has a body to play
  // with right now".
  const acting = you.alive || you.ghost;
  const isMyTurn = view.turnSeat != null && view.turnSeat === you.seat && acting;
  // The end-of-turn hand limit is normally your life total, but events shift it
  // (Drought / Hangover), so the server sends the resolved number.
  const overLimit = Math.max(0, you.hand.length - you.handLimit);
  const inPlayPhase = isMyTurn && you.turnPhase !== "draw";
  // `ability` có mặt khi phát bắn này đến từ nút năng lực (Doc Holyday) chứ không từ một
  // lá bài trên tay — lúc đó `id` rỗng vì không có lá nào để đánh đi.
  const [aiming, setAiming] = useState<{
    id: string;
    defId: string;
    ability?: { kind: AbilityKind; cardIds: string[] };
    pay?: string[];
    green?: boolean; // lá đi từ trước mặt bạn, không phải từ tay
  } | null>(null);
  // Lá đang chờ bạn xác nhận đánh. Cùng họ với `aiming` ở trên, và cố ý nằm ngay cạnh nó:
  // cả hai là "một nhát tap đã mở một nước đi nhưng nước đó CHƯA xảy ra", và giữa chúng là
  // toàn bộ tay bài — lá cần ngắm thì lùi được bằng nút Hủy của thanh ngắm, lá không cần
  // ngắm thì trước đây bay thẳng khỏi tay, không có đường lui nào. Đây là đường lui đó.
  const [confirmPlay, setConfirmPlay] = useState<Card | null>(null);
  // A counter, not a boolean: every press has to reach the scene, including the second
  // press after you have orbited away again, and a boolean would only fire once.
  const [homeKey, setHomeKey] = useState(0);
  // A General Store or a Kit Carlson is answered out on the table, not in a panel.
  const tableChoice = view.pending?.kind === "store" || view.pending?.kind === "kit";
  // Năng lực đang chờ bạn chọn lá cho nó. Một state cho cả bốn năng lực: chúng khác nhau
  // ở số lá và ở chỗ có phải ngắm ai không, và cả hai điều đó nằm trong ABILITY_SPEC.
  const [ability, setAbility] = useState<{ kind: AbilityKind; pick: string[] } | null>(null);
  // Lá đang chờ bạn chọn đủ lá trả giá cho nó (Whisky/Tequila/Brawl/Rag Time/Springfield).
  // Trả giá TRƯỚC khi ngắm, vì trả giá có thể làm số lá còn lại đổi.
  const [paying, setPaying] = useState<{ card: Card; pick: string[] } | null>(null);
  // Lá green đang chờ bạn chọn mục tiêu cho nó. Chỉ dùng cho lá CÓ mục tiêu — lá không
  // cần ngắm thì bấm là chạy luôn.
  const [greenAim, setGreenAim] = useState<string | null>(null);
  // Hai chế độ bỏ bài, không phải một cờ. "forced" là bước bắt buộc trước khi hết lượt —
  // đúng số lá vượt giới hạn, rồi lượt tự kết thúc. "free" là bỏ CHỦ ĐỘNG, bao nhiêu lá cũng
  // được, và không kết thúc lượt.
  //
  // Trước đây chỉ có "forced", và đó là một lỗi im lặng: engine cho bỏ bài lúc nào cũng được
  // (discardCard không kiểm giới hạn tay), nhiệm vụ "Ném đi" được viết dựa trên đúng khả năng
  // đó — nó đòi `!forced` — nhưng UI không có đường nào tạo ra một lần bỏ không-bắt-buộc. Nên
  // nhiệm vụ đó KHÔNG THỂ hoàn thành, và vì nhiệm vụ là bí mật nên người chơi mất nó cả ván
  // mà không biết để mà cãi.
  const [discardMode, setDiscardMode] = useState<null | "forced" | "free">(null);
  const discarding = discardMode !== null;
  const setDiscarding = (on: boolean) => setDiscardMode(on ? "forced" : null);
  // Which cards the end-of-turn discard has picked so far. Held here rather than thrown
  // one by one so the whole discard is a single decision the player can back out of.
  const [discardPick, setDiscardPick] = useState<string[]>([]);
  const [infoCard, setInfoCard] = useState<Card | null>(null);
  const [charView, setCharView] = useState<Character | null>(null);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [playerInfo, setPlayerInfo] = useState<PlayerPublic | null>(null);
  const { fx, toggleFx, shotCam, toggleShotCam, models, toggleModels, sfx, toggleSfx, lowSpec, toggleLowSpec } =
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
  const {
    marquee, clearMarquee, eventBatch, dismissEvents, reveal, dismissReveal,
    missionReveal, dismissMission, justDrew, notice, flash,
  } = useTableFeedback(view);

  // Escape dismisses any open popup and cancels aim / Sid-pick mode — the same
  // exits the click-outside overlays offer, but for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setInfoCard(null); setCharView(null); setPlayerInfo(null); closeBriefing(); dismissEvents();
      setConfirmSurrender(false); setDiscarding(false);
      setAiming(null); setAbility(null); setPaying(null); setGreenAim(null); setConfirmPlay(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissEvents]);


  useEffect(() => {
    // CHỈ "forced": bỏ chủ động về đúng giới hạn không được kéo lượt kết thúc theo.
    if (discardMode === "forced" && overLimit === 0) {
      onEndTurn();
      setDiscardMode(null);
    }
  }, [discardMode, overLimit, onEndTurn]);
  useEffect(() => {
    if (!inPlayPhase && discarding) setDiscardMode(null);
  }, [inPlayPhase, discarding]);
  // Discard mode is left from four places — the confirm, the cancel, Escape, and the turn
  // ending under it — so the selection is emptied HERE rather than at each of them, where
  // the fourth one would eventually be forgotten and leave a stale pick to greet the next
  // discard already half-made.
  useEffect(() => {
    if (!discarding) setDiscardPick([]);
  }, [discarding]);
  // A card can leave the hand without being discarded — Sid burning two, an opponent's
  // Panic! — and a selection holding an id that is no longer there would arm the confirm
  // for a card the server will refuse.
  useEffect(() => {
    setDiscardPick((s) => {
      const live = s.filter((id) => you.hand.some((c) => c.id === id));
      return live.length === s.length ? s : live;
    });
  }, [you.hand]);
  // Cùng lý do như trên, cho hộp xác nhận: lượt có thể kết thúc dưới chân nó (hết giờ, đầu
  // hàng, Dynamite nổ chết) và lá có thể rời tay mà không do bạn bỏ. Một hộp còn mở trong hai
  // trường hợp đó là một nút "Đánh lá này" chỉ dẫn tới lỗi của server. Trả về CHÍNH object cũ
  // khi không có gì đổi để React bỏ qua lần set này — effect chạy mỗi lần tay bài đổi.
  useEffect(() => {
    setConfirmPlay((c) => (c && inPlayPhase && you.hand.some((h) => h.id === c.id) ? c : null));
  }, [inPlayPhase, you.hand]);

  const isTargeted = (defId: string) => !!CARD_DEF_BY_ID[defId]?.target;
  // A character whose useAs pair covers Bang! can fire the swapped card as one, so
  // that card aims like a Bang! (targeting + range) and counts against the
  // Bang!/turn limit.
  const swapPair = you.character?.effect.useAs;
  const bangLike = (defId: string) =>
    defId === "bang" || (!!swapPair && swapPair.includes("bang") && swapPair.includes(defId));
  const needsTarget = (defId: string) => isTargeted(defId) || bangLike(defId);

  // Which plays are unavailable right now. The reasons (once-per-turn house rule,
  // random-event bans, the Bang! budget) are all resolved server-side and arrive as
  // `blockedDefIds` / `canBang`, so the client never re-derives a rule and can't
  // disagree with the engine. Returns true (and flashes why) when blocked, so the
  // player never aims into a silent server rejection.
  const blockOneCard = (defId: string) => {
    // Jail blocks every card, so it arrives as a full `blockedDefIds` and would otherwise
    // be reported below as "an event blocks this card" — the wrong reason, and now the
    // one a jailed player hits on every single tap.
    if (you.jailed) {
      flash(L(locale, "Đang bị giam — chỉ bỏ bài rồi kết thúc lượt", "In jail — discard down, then end the turn."));
      return true;
    }
    // Né/Missed! đánh chủ động thì engine LUÔN từ chối (missed-is-reaction-only). Chặn
    // ngay ở đây vì Né là lá nhiều thứ hai trong nọc (12 lá) và cái tap đó là phản xạ của
    // mọi người mới: không chặn thì nó thành một hộp xác nhận mà nút "Đánh" chỉ có đúng một
    // kết cục là câu lỗi — đúng thứ hộp xác nhận sinh ra để loại bỏ.
    //
    // Đây là thuộc tính TĨNH của lá, cùng loại với `TARGETED` ngay trên, nên client biết nó
    // là an toàn. Luật theo TRẠNG THÁI thì tuyệt đối không: Beer lúc máu đầy, Mustang đã có
    // trên bàn — những cái đó vẫn để server trả lời, vì một bản sao luật ở client sẽ lệch
    // ngay lần đầu có event nới luật đó ra.
    //
    // `!bangLike` là chỗ Calamity Janet đi qua: cô ta bắn Né như Bang!, và lá đó phải rơi
    // xuống nhánh cần-mục-tiêu bên dưới thay vì bị chặn ở đây.
    if (defId === "missed" && !bangLike(defId)) {
      flash(tError(locale, { code: "missed-is-reaction-only" }));
      return true;
    }
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
    // Không gác sau inPlayPhase: Sid Ketchum bỏ bài lấy máu được cả ngoài lượt mình, và
    // server đã quyết ai bấm được gì qua `you.abilities`.
    if (ability) {
      const spec = ABILITY_SPEC[ability.kind];
      const next = ability.pick.includes(card.id)
        ? ability.pick.filter((x) => x !== card.id)
        : [...ability.pick, card.id];
      if (next.length < spec.need) return setAbility({ ...ability, pick: next });
      setAbility(null);
      // Doc Holyday còn phải ngắm; hai người kia xong ngay khi đủ lá.
      if (spec.aims) setAiming({ id: "", defId: "bang", ability: { kind: ability.kind, cardIds: next } });
      else onUseAbility(ability.kind, next);
      return;
    }
    // Brawl: bạn tự chọn lá của mình để bỏ. Ngoài lượt mình, nên không gác sau inPlayPhase.
    if (view.pending?.kind === "toss" && view.pending.youMustRespond) {
      return onRespond("toss", card.id);
    }
    if (!inPlayPhase) return;
    // Đang gom lá trả giá: chạm để chọn/bỏ chọn, đủ số thì mới đi tiếp.
    if (paying) {
      const need = CARD_DEF_BY_ID[paying.card.defId]?.costDiscard ?? 0;
      if (card.id === paying.card.id) return; // lá đang đánh không trả giá cho chính nó
      const next = paying.pick.includes(card.id)
        ? paying.pick.filter((x) => x !== card.id)
        : [...paying.pick, card.id];
      if (next.length < need) return setPaying({ ...paying, pick: next });
      const played = paying.card;
      setPaying(null);
      if (needsTarget(played.defId)) setAiming({ id: played.id, defId: played.defId, pay: next });
      else onPlay(played.id, undefined, undefined, next);
      return;
    }
    // Selecting, NOT throwing. The cards go together when the confirm is pressed, so a
    // misplaced tap here costs nothing and there is a moment to look at the three you
    // are about to lose before they are gone.
    if (discarding) {
      return setDiscardPick((s) => (s.includes(card.id) ? s.filter((x) => x !== card.id) : [...s, card.id]));
    }
    if (blockOneCard(card.defId)) return;
    // Phải trả giá thì gom lá trả giá trước, ngắm sau.
    if ((CARD_DEF_BY_ID[card.defId]?.costDiscard ?? 0) > 0) {
      return setPaying({ card, pick: [] });
    }
    if (needsTarget(card.defId)) {
      return setAiming({ id: card.id, defId: card.defId });
    }
    // Không cần ngắm → phải xác nhận. Đó là cả luật, không có ngoại lệ nào trong 16 loại lá
    // rơi vào đây (đếm bằng script trên CARD_DEFS: 22 loại = 16 xác nhận + 5 ngắm + Né).
    //
    // Lá cần ngắm đã có một nhịp thứ hai sẵn (chọn mục tiêu, kèm nút Hủy), nên tap nhầm
    // chúng không mất gì. Lá không cần ngắm thì trước đây rời tay ngay tại nhát tap này —
    // và trong đó có Dynamite tự gắn bom lên mình, có súng bỏ luôn cây đang cầm, có Gatling
    // bắn cả bàn. Ranh giới "mất mát hay không" thì có thật, nhưng nó không đọc được từ mặt
    // lá; một luật mà người chơi tự suy ra được từ hình ảnh trên tay đáng hơn vài nhát bấm
    // tiết kiệm được ở Mustang với Stagecoach.
    setConfirmPlay(card);
  };

  // The discard fires as one act, in the order they were picked. The turn ends itself
  // once the hand is back at the limit — see the effect above that watches overLimit —
  // so there is nothing to chain onto the last one.
  // Bao nhiêu lá được phép bỏ trong chế độ hiện tại. "forced" đòi ĐÚNG số vượt giới hạn;
  // "free" nhận từ 1 lá trở lên nhưng phải chừa lại một lá — engine từ chối một lần bỏ chủ
  // động làm tay trắng, vì Suzy Lafayette rút ngay khi hết bài và bỏ-rồi-rút là vòng bốc bài
  // vô hạn. Kiểm ở đây chỉ để nút không mời người chơi bấm vào một lần bị từ chối.
  const freeMax = Math.max(0, you.hand.length - 1);
  const discardOk =
    discardMode === "forced"
      ? discardPick.length === overLimit
      : discardPick.length >= 1 && discardPick.length <= freeMax;
  const confirmDiscard = () => {
    if (!discardOk) return;
    for (const id of discardPick) onDiscard(id);
    if (discardMode === "free") setDiscardMode(null);
  };

  // The engine resolves who each card may be aimed at (targetProblem in game.ts)
  // and ships the answer in the view, so this is pure lookup — no second rulebook.
  //
  // Khoá theo id lá bài trước, tên bài chỉ là đường lui: Apache Kid miễn nhiễm bài Rô nên
  // hai lá Bang! cùng nằm trên tay có thể có mục tiêu hợp lệ khác nhau, và khoá theo tên
  // thì hai lá đó dùng chung một câu trả lời.
  const canTarget = (p: (typeof view.players)[number]) => {
    if (!aiming) return false;
    // Phát bắn của Doc Holyday không đi ra từ một lá bài nào, nên nó có danh sách mục
    // tiêu riêng do server dựng — legalTargets khoá theo lá thì không có chỗ cho nó.
    const ids = aiming.ability
      ? you.abilityTargets
      : aiming.green
      ? you.greenTargets[aiming.id]
      : you.legalTargets[aiming.id] ?? you.legalTargets[aiming.defId];
    return !!ids?.includes(p.id);
  };
  const fireAt = (targetId: string, targetCardId?: string) => {
    if (!aiming) return;
    if (aiming.ability) onUseAbility(aiming.ability.kind, aiming.ability.cardIds, targetId);
    else if (aiming.green) onUseEquip(aiming.id, targetId);
    else onPlay(aiming.id, targetId, targetCardId, aiming.pay);
    setAiming(null);
    setGreenAim(null);
  };
  // Cat Balou / Panic! may hit a specific face-up card on the table.
  // Pat Brennan chỉ đích danh một lá trên bàn thay cho cả phần rút của mình. Dùng lại
  // đúng cơ chế chọn-lá-trên-bàn của Cat Balou / Panic — cũng là "bấm vào một lá đang
  // bày ra" — thay vì dựng một chế độ thứ hai làm cùng một việc.
  // Vera Custer chọn người để mượn năng lực: cùng một nhát bấm vào crosshair như khi
  // ngắm bắn, nên dùng lại đúng cơ chế đó thay vì dựng bảng chọn thứ hai.
  const veraPick = view.pending?.kind === "copy" && view.pending.youMustRespond;
  const brennanDraw =
    isMyTurn && you.turnPhase === "draw" && !view.pending && you.legalDrawTargets.length > 0
      && you.character?.effect.drawMode === "brennan";
  const pickCardMode = brennanDraw || aiming?.defId === "cat-balou" || aiming?.defId === "panic";

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
          targetIds={
            veraPick
              ? view.players.filter((p) => p.alive && p.id !== you.id).map((p) => p.id)
              : brennanDraw
              ? you.legalDrawTargets
              : aiming
              ? view.players.filter((p) => canTarget(p)).map((p) => p.id)
              : []
          }
          onPickTarget={(id) => (veraPick ? onRespond("pass", id) : fireAt(id))}
          onInspect={inspectCard}
          onInspectPlayer={setPlayerInfo}
          pickCardMode={pickCardMode}
          onPickCard={(ownerId, cardId) =>
            brennanDraw ? onDraw("equipment", ownerId, cardId) : fireAt(ownerId, cardId)
          }
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
          lowSpec={lowSpec}
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

      {reveal && (
        <PredictReveal key={reveal.seq} reveal={reveal} view={view} onDone={dismissReveal} />
      )}

      {missionReveal && (
        <MissionReveal key={missionReveal.seq} reveal={missionReveal} view={view} onDone={dismissMission} />
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
      {/* Lá hiện TO, kèm chữ hiệu ứng — không phải một thanh xác nhận mỏng. Lỗi cần bắt ở đây
          là bốc nhầm lá, và lá trên tay chỉ rộng 104px trên điện thoại: một câu "Đánh Gatling?"
          thì vẫn phải tin vào cái tên, còn mặt lá cỡ này thì tự nó nói ra bạn vừa chạm vào cái
          gì. Bấm ra ngoài = Hủy, vì hướng an toàn phải là hướng dễ bấm nhất.

          `actions` của CardModal viết từ hồi tách modal ra dùng chung mà tới giờ chưa ai gọi;
          đây đúng là chỗ nó được viết cho. */}
      {confirmPlay && (
        <CardModal
          card={confirmPlay}
          showEffect
          onClose={() => setConfirmPlay(null)}
          actions={[
            {
              label: L(locale, "Đánh lá này", "Play it"),
              onClick: () => {
                const c = confirmPlay;
                setConfirmPlay(null); // đóng TRƯỚC khi đánh: onPlay có thể sinh pending (Indians!, Gatling, General Store)
                onPlay(c.id);
              },
            },
            { label: L(locale, "Hủy", "Cancel"), onClick: () => setConfirmPlay(null), ghost: true },
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
              {playerInfo.name} {playerInfo.ghost ? "👻" : !playerInfo.alive && "☠️"}
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
            lowSpec={lowSpec}
            onToggleLowSpec={toggleLowSpec}
            canSurrender={you.alive && view.phase === "playing"}
            onSurrender={() => setConfirmSurrender(true)}
          />
        </div>

        <EventChips events={view.events} />
        <MissionChip view={view} />
        <PredictPanel view={view} onPredict={onPredict} onCancelPredict={onCancelPredict} />
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
      {acting && isMyTurn && !aiming && !tableChoice && (
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
                <button onClick={confirmDiscard} disabled={!discardOk} style={{ flex: 1 }}>
                  {discardMode === "forced"
                    ? L(
                        locale,
                        `Xác nhận bỏ ${discardPick.length}/${overLimit}`,
                        `Confirm discard ${discardPick.length}/${overLimit}`
                      )
                    : L(
                        locale,
                        `Bỏ ${discardPick.length} lá`,
                        `Throw away ${discardPick.length}`
                      )}
                </button>
                <button
                  className="ghost"
                  style={{ width: "auto", padding: "12px 14px" }}
                  onClick={() => setDiscardMode(null)}
                >
                  {L(locale, "Huỷ", "Cancel")}
                </button>
              </div>
            ) : (
              /* Entering closes the two other things that own a tap. Leaving a crosshair
                 up behind the discard would have the aim banner still asking for a target
                 while every tap was quietly selecting a card to throw away. */
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (overLimit === 0) return onEndTurn();
                    setAiming(null);
                    setAbility(null);
                    setDiscardMode("forced");
                  }}
                >
                  {overLimit > 0
                    ? L(locale, `Kết thúc lượt → bỏ ${overLimit} lá`, `End turn → discard ${overLimit}`)
                    : L(locale, "Kết thúc lượt →", "End turn →")}
                </button>
                {/* Bỏ bài CHỦ ĐỘNG. Chỉ hiện khi chưa vượt giới hạn — vượt rồi thì nút kết
                    thúc lượt bên cạnh đã là đường bỏ bài, và hai nút cùng làm một việc chỉ
                    gây lưỡng lự. Cần ≥2 lá vì engine không cho bỏ tới tay trắng.
                    Đây là đường duy nhất tạo ra được một lần bỏ KHÔNG bắt buộc, tức là đường
                    duy nhất nhiệm vụ "Ném đi" hoàn thành được. */}
                {overLimit === 0 && you.hand.length >= 2 && (
                  <button
                    className="ghost"
                    style={{ width: "auto", padding: "12px 14px" }}
                    title={L(locale, "Tự bỏ bài khỏi tay", "Throw cards away by choice")}
                    onClick={() => {
                      setAiming(null);
                      setAbility(null);
                      setDiscardMode("free");
                    }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}

      <GreenCardBar
        view={view}
        active={greenAim}
        onPress={(cardId) => {
          const c = you.equipment.find((x) => x.id === cardId);
          if (!c) return;
          setAbility(null);
          setPaying(null);
          setDiscarding(false);
          if (greenAim === cardId) {
            setGreenAim(null);
            return setAiming(null);
          }
          // Lá có mục tiêu thì ngắm trước; lá không có thì chạy luôn.
          if (CARD_DEF_BY_ID[c.defId]?.target) {
            setGreenAim(cardId);
            setAiming({ id: cardId, defId: c.defId, green: true });
          } else onUseEquip(cardId);
        }}
      />

      <AbilityBar
        view={view}
        active={ability?.kind ?? null}
        picked={ability?.pick.length ?? 0}
        onPress={(kind) => {
          setDiscarding(false);
          if (ability?.kind === kind) return setAbility(null); // bấm lại là huỷ
          // Chuck Wengam không cần lá nào — bấm là xong.
          if (ABILITY_SPEC[kind].need === 0) return onUseAbility(kind, []);
          setAbility({ kind, pick: [] });
        }}
      />

      {/* aiming: click a green scope over a target (rendered in the 3D scene).
          Docked to the top-centre, just under the HUD, so it doesn't cover the table. */}
      {aiming && (
        <div style={{ position: "fixed", left: "50%", top: 72, transform: "translateX(-50%)", zIndex: 56, display: "flex", flexDirection: "row", alignItems: "center", gap: 12, background: "rgba(20,18,16,0.92)", padding: "8px 14px", borderRadius: 12, color: "#f0e2c0", fontFamily: "system-ui, sans-serif", maxWidth: "90vw", lineHeight: 1.3, boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}>
          <span>🎯 {L(locale, aimText[aiming.defId]?.[0] ?? "Bấm kính nhắm để chọn mục tiêu", aimText[aiming.defId]?.[1] ?? "Click a scope to pick a target")}</span>
          <button className="ghost" style={{ width: "auto", padding: "6px 12px", flexShrink: 0 }} onClick={() => setAiming(null)}>{L(locale, "Hủy", "Cancel")}</button>
        </div>
      )}

      {/* A ghost turn is the one turn nobody has seen before, so it says outright what
          the rules are while you have it. Shares the aiming bar's slot rather than
          stacking above it: while you are aiming, the crosshair instruction is the more
          urgent of the two and this one has already been read. */}
      {you.ghost && !aiming && (
        <div style={{ position: "fixed", left: "50%", top: 72, transform: "translateX(-50%)", zIndex: 56, display: "flex", alignItems: "center", gap: 10, background: "rgba(28,20,44,0.92)", border: "1px solid rgba(168,140,220,0.55)", padding: "8px 14px", borderRadius: 12, color: "#e7dcff", fontFamily: "system-ui, sans-serif", maxWidth: "90vw", lineHeight: 1.35, boxShadow: "0 4px 16px rgba(0,0,0,.5)" }}>
          <span style={{ fontSize: "1.1rem" }}>👻</span>
          <span>
            {L(
              locale,
              "Lượt ma — không ai bắn được bạn, và bạn cũng không hồi máu. Hết lượt là nằm xuống lại.",
              "Ghost turn — nothing can shoot you and nothing can heal you. You lie back down when it ends."
            )}
          </span>
        </div>
      )}

      {acting && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 10, zIndex: 55, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 4, pointerEvents: "none" }}>
          {you.hand.map((c) => (
            <div key={c.id} style={{ pointerEvents: "auto" }}>
              <HandCard
                card={c}
                /* Dead while the table waits on somebody: playCardImpl refuses outright
                   with `waiting-for-reaction`, so every tap here would be an error
                   message. Answering a pending is the reaction panel's job, not the
                   hand's — except Sid's burn, which is legal at any time at all. */
                canInteract={(inPlayPhase && !view.pending) || !!ability || !!paying || (view.pending?.kind === "toss" && view.pending.youMustRespond)}
                entering={justDrew.has(c.id)}
                selected={!!ability?.pick.includes(c.id) || !!paying?.pick.includes(c.id) || paying?.card.id === c.id || discardPick.includes(c.id) || aiming?.id === c.id}
                onTap={() => cardAction(c)}
                onInspect={() => setInfoCard(c)}
              />
            </div>
          ))}
        </div>
      )}

      {inPlayPhase && !aiming && you.hand.length > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 176, transform: "translateX(-50%)", zIndex: 55, color: "rgba(240,226,192,0.85)", fontSize: 13, fontFamily: "system-ui, sans-serif", textShadow: "0 1px 3px #000", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {paying
            ? L(
                locale,
                `${paying.card.name}: chạm ${CARD_DEF_BY_ID[paying.card.defId]?.costDiscard} lá nữa để trả giá (${paying.pick.length}/${CARD_DEF_BY_ID[paying.card.defId]?.costDiscard})`,
                `${paying.card.name}: tap ${CARD_DEF_BY_ID[paying.card.defId]?.costDiscard} more card(s) to pay (${paying.pick.length}/${CARD_DEF_BY_ID[paying.card.defId]?.costDiscard})`,
              )
            : ability
            ? `${L(locale, ABILITY_SPEC[ability.kind].picking[0], ABILITY_SPEC[ability.kind].picking[1])} (${ability.pick.length}/${ABILITY_SPEC[ability.kind].need})`
            : discardMode === "forced"
              ? L(locale, `Chọn ${overLimit} lá để bỏ (${discardPick.length}/${overLimit})`, `Pick ${overLimit} to discard (${discardPick.length}/${overLimit})`)
              : discardMode === "free"
              // Nói ra cái sàn, chứ không để người chơi tự phát hiện bằng một nút bị chặn:
              // engine không cho bỏ chủ động tới tay trắng (vòng lặp rút của Suzy).
              ? L(locale, `Chạm lá để tự bỏ — chừa lại ít nhất 1 lá (${discardPick.length}/${freeMax})`, `Tap cards to throw away — keep at least one (${discardPick.length}/${freeMax})`)
              : you.jailed
                ? L(locale, "Bị giam — không đánh được · kết thúc lượt để bỏ bài", "In jail — nothing can be played · end turn to discard")
                : L(locale, "Chạm để đánh · giữ để xem lá", "Tap to play · hold to read")}
        </div>
      )}
    </div>
  );
}
