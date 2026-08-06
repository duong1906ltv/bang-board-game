"use client";

// Lightweight i18n for the client. Proper nouns (card & character names) stay as
// printed; roles, abilities, UI chrome, banners and messages are translated.
import { useEffect, useState } from "react";
import type { ErrorCode, GameError } from "./errors";
import type { Role } from "./types";
import type { PlayerView, LogEntry } from "./types";
// Pure data (no engine import at runtime), so it is safe in a client bundle.
import { EVENT_BY_ID } from "./events";

export type Locale = "vi" | "en";

// --- locale store (persisted, shared across components) ---
let current: Locale = "vi";
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}
// Keep <html lang> in sync with the chosen locale (screen readers / SEO). The
// server renders lang="vi"; this corrects it on the client once a locale loads.
function syncHtmlLang() {
  if (typeof document !== "undefined") document.documentElement.lang = current;
}
export function setLocale(l: Locale) {
  current = l;
  try {
    localStorage.setItem("bang:lang", l);
  } catch {}
  syncHtmlLang();
  listeners.forEach((f) => f());
}
export function initLocale() {
  try {
    const s = localStorage.getItem("bang:lang");
    if (s === "en" || s === "vi") current = s;
  } catch {}
  syncHtmlLang();
}
export function useLocale(): Locale {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return current;
}

export function L(locale: Locale, vi: string, en: string): string {
  return locale === "vi" ? vi : en;
}

// Render a player's name, substituting "bạn"/"you" for the viewer so text reads
// naturally. `subj` is the sentence-initial (capitalised) form; `obj` is the
// mid-sentence form.
function nameRefs(l: Locale, youName?: string) {
  const vi = l === "vi";
  const subj = (n?: string) => (n && n === youName ? (vi ? "Bạn" : "You") : n ?? "");
  const obj = (n?: string) => (n && n === youName ? (vi ? "bạn" : "you") : n ?? "");
  return { subj, obj };
}

// --- roles ---
const ROLE_LABEL: Record<Role, [string, string]> = {
  sheriff: ["Cảnh Sát Trưởng", "Sheriff"],
  deputy: ["Cảnh Sát Phó", "Deputy"],
  outlaw: ["Tội Phạm", "Outlaw"],
  renegade: ["Phản Bội", "Renegade"],
};
const ROLE_GOAL: Record<Role, [string, string]> = {
  sheriff: ["Tiêu diệt tất cả Tội Phạm và Phản Bội.", "Eliminate all Outlaws and the Renegade."],
  deputy: ["Bảo vệ Cảnh Sát Trưởng. Thắng cùng phe Cảnh Sát.", "Protect the Sheriff. Win with the Law."],
  outlaw: ["Hạ gục Cảnh Sát Trưởng.", "Kill the Sheriff."],
  renegade: ["Là người sống sót cuối cùng — Cảnh Sát Trưởng chết cuối.", "Be the last one standing — Sheriff dies last."],
};
export const roleLabel = (l: Locale, r: Role) => ROLE_LABEL[r][l === "vi" ? 0 : 1];

// Format one action-history entry. `youName` is the viewer's name so it can be
// rendered as "bạn"/"you" for natural phrasing.
export function logText(l: Locale, e: LogEntry, youName?: string): string {
  const vi = l === "vi";
  const { subj, obj } = nameRefs(l, youName);
  switch (e.kind) {
    case "turn":
      return vi ? `▶ Đến lượt ${obj(e.a)}` : `▶ ${subj(e.a)}'s turn`;
    case "draw":
      // `b` present = `took` cards came out of that player's hand, any remainder off
      // the deck (Jesse Jones takes 1 + deck; El Gringo steals N). Spelled out so
      // nobody reads the total as the amount taken from them.
      if (e.b) {
        const took = e.took ?? 1;
        const fromDeck = Math.max(0, (e.n ?? 0) - took);
        return vi
          ? `${subj(e.a)} lấy ${took} lá từ tay ${obj(e.b)}${fromDeck ? ` + rút ${fromDeck} lá từ nọc` : ""}`
          : `${subj(e.a)} took ${took} from ${obj(e.b)}${fromDeck ? ` + drew ${fromDeck}` : ""}`;
      }
      return vi ? `${subj(e.a)} rút ${e.n} lá` : `${subj(e.a)} drew ${e.n}`;
    case "play":
      if (!e.b) return vi ? `${subj(e.a)} đánh ${e.card}` : `${subj(e.a)} played ${e.card}`;
      if (e.card === "Bang!") return vi ? `${subj(e.a)} bắn vào ${obj(e.b)}` : `${subj(e.a)} shot ${obj(e.b)}`;
      return vi ? `${subj(e.a)} dùng ${e.card} lên ${obj(e.b)}` : `${subj(e.a)} used ${e.card} on ${obj(e.b)}`;
    case "react":
      if (e.card === "Missed!") return vi ? `${subj(e.a)} né bằng Missed!` : `${subj(e.a)} dodged with Missed!`;
      if (e.card === "Beer") return vi ? `${subj(e.a)} uống Beer để trụ lại` : `${subj(e.a)} drank Beer to survive`;
      if (e.card === "Bang!") return vi ? `${subj(e.a)} bỏ 1 Bang!` : `${subj(e.a)} discarded a Bang!`;
      return vi ? `${subj(e.a)} phản ứng ${e.card}` : `${subj(e.a)} responded ${e.card}`;
    case "discard":
      return vi ? `${subj(e.a)} bỏ ${e.n ?? 1} lá bài` : `${subj(e.a)} discarded ${e.n ?? 1} card(s)`;
    case "check": {
      const t = checkText(l, e.checkKind ?? "", e.outcome ?? "");
      return `🎲 ${subj(e.a)} — ${t.kind}${e.card ? ` (${e.card})` : ""}: ${t.outcome}`;
    }
    case "hit":
      return vi ? `${subj(e.a)} mất ${e.n} máu (còn ${e.hp}❤️)` : `${subj(e.a)} took ${e.n} (${e.hp}❤️ left)`;
    case "heal":
      return vi ? `${subj(e.a)} hồi ${e.n} máu` : `${subj(e.a)} healed ${e.n}`;
    case "death":
      return (vi ? `☠️ ${subj(e.a)} bị loại` : `☠️ ${subj(e.a)} eliminated`) + (e.role ? ` — ${roleLabel(l, e.role)}` : "");
    case "surrender":
      return (vi ? `🏳️ ${subj(e.a)} đầu hàng` : `🏳️ ${subj(e.a)} surrendered`) + (e.role ? ` — ${roleLabel(l, e.role)}` : "");
    case "event": {
      const def = EVENT_BY_ID[e.event ?? ""];
      const icon = def?.emoji ?? "🎲";
      const name = eventName(l, e.event ?? "");
      return vi ? `${icon} ${name} · cả bàn` : `${icon} ${name} · whole table`;
    }
    default:
      return "";
  }
}
export const roleGoal = (l: Locale, r: Role) => ROLE_GOAL[r][l === "vi" ? 0 : 1];

// --- character abilities (names kept as printed) ---
const CHAR_ABILITY: Record<string, [string, string]> = {
  "kit-carlson": ["Xem 3 lá trên cùng bộ bài, chọn 2 lá để rút và trả lá còn lại xuống dưới.", "Look at the top 3 cards of the deck and draw 2 of them; the third goes back."],
  "suzy-lafayette": ["Ngay khi hết bài trên tay, rút 1 lá.", "As soon as she has no cards in hand, she draws a card."],
  "willy-the-kid": ["Có thể chơi bao nhiêu lá Bang! tùy thích mỗi lượt.", "He can play any number of Bang! cards each turn."],
  "jesse-jones": ["Lá rút đầu tiên có thể lấy từ tay một người chơi khác.", "He may draw his first card from a player's hand."],
  "el-gringo": ["Mỗi khi bị một người chơi gây sát thương, rút 1 lá từ tay người đó.", "Each time he is hit by a player, he draws a card from that player's hand."],
  "paul-regret": ["Mọi người thấy anh ta ở khoảng cách +1.", "All players see him at a distance increased by 1."],
  "slab-the-killer": ["Đối thủ cần 2 lá Missed! mới né được Bang! của anh ta.", "Players need 2 Missed! to cancel his Bang!."],
  "jourdonnais": ["Khi là mục tiêu của Bang!, có thể Draw!; ra lá Cơ (Heart) thì coi như Missed!.", "When targeted by a Bang!, he may Draw!; on a Heart he is Missed!."],
  "lucky-duke": ["Mỗi khi Draw!, lật 2 lá trên cùng và chọn 1.", "Each time he Draws!, he flips the top two cards and picks one."],
  "calamity-janet": ["Có thể dùng Bang! làm Missed! và ngược lại.", "She can play Bang! as Missed! and vice versa."],
  "rose-doolan": ["Thấy mọi người ở khoảng cách −1.", "She sees all players at a distance decreased by 1."],
  "vulture-sam": ["Mỗi khi một người chơi bị loại, lấy toàn bộ bài của người đó vào tay.", "Whenever a player is eliminated, he takes all their cards into his hand."],
  "pedro-ramirez": ["Lá rút đầu tiên có thể lấy từ chồng bài bỏ (discard).", "He may draw his first card from the discard pile."],
  "bart-cassidy": ["Mỗi khi bị mất máu, rút 1 lá.", "Each time he loses a life point, he draws a card."],
  "black-jack": ["Lá rút thứ hai được lật ngửa; nếu là Cơ/Rô thì rút thêm 1 lá.", "He reveals his 2nd drawn card; on Heart/Diamond he draws one more."],
  "sid-ketchum": ["Có thể bỏ 2 lá để hồi 1 máu.", "He may discard 2 cards to regain 1 life point."],
};
export const charAbility = (l: Locale, id?: string | null) =>
  (id && CHAR_ABILITY[id] ? CHAR_ABILITY[id][l === "vi" ? 0 : 1] : "");

// --- winner ---
const WINNER: Record<string, [string, string]> = {
  sheriff: ["Phe Cảnh Sát thắng! ⭐", "The Law wins! ⭐"],
  outlaws: ["Phe Tội Phạm thắng! 🤠", "The Outlaws win! 🤠"],
  renegade: ["Phản Bội thắng! 🐍", "The Renegade wins! 🐍"],
};
export const winnerText = (l: Locale, w: string) => (WINNER[w] ? WINNER[w][l === "vi" ? 0 : 1] : "");

// --- pending descriptions (built from structured fields) ---
export function formatPending(l: Locale, p: PlayerView["pending"], youName?: string): string {
  if (!p) return "";
  const { subj, obj } = nameRefs(l, youName);
  const a = subj(p.actorName);
  const b = obj(p.targetName);
  switch (p.kind) {
    case "bang":
      return L(l, `${a} bắn vào ${b}`, `${a} shoots ${b}`);
    case "dying":
      return L(l, `${a} sắp gục — cần Beer để sống`, `${a} is dying — needs a Beer to survive`);
    case "multi":
      return p.effect === "indians"
        ? L(l, `${a} dùng Indians! — bỏ 1 Bang! hoặc mất 1 máu`, `${a} plays Indians! — discard a Bang! or lose 1 life`)
        : L(l, `${a} dùng Gatling — đánh Missed! hoặc mất 1 máu`, `${a} plays Gatling — play a Missed! or lose 1 life`);
    case "duel":
      return L(l, `Duel: ${a} vs ${b} — tới lượt ${obj(p.turnName)} bỏ Bang!`, `Duel: ${a} vs ${b} — ${obj(p.turnName)} must discard a Bang!`);
    case "kit":
      return L(l, `${a} (Kit Carlson) chọn 2 trong 3 lá`, `${a} (Kit Carlson) picks 2 of 3 cards`);
    case "store":
      return L(l, `General Store — ${a} đang chọn bài`, `General Store — ${a} is picking`);
    case "check":
      return L(l, `${a} lật bài kiểm tra`, `${a} makes a Draw!`);
  }
}

// --- random events (keyed by id in lib/events.ts) ---
// [vi name, en name, vi description, en description]
const EVENT_TEXT: Record<string, [string, string, string, string]> = {
  // restrictions
  "jammed-gun": ["Súng Kẹt Đạn", "Jammed Guns", "Hết vòng này không ai đánh được Bang!.", "Nobody may play Bang! for the rest of the round."],
  "short-barrel": ["Nòng Cụt", "Short Barrels", "Tầm bắn của mọi người về 1 tới hết vòng.", "Everyone's range drops to 1 for the round."],
  prohibition: ["Lệnh Cấm Rượu", "Prohibition", "Beer và Saloon vô hiệu với tất cả tới hết vòng.", "Beer and Saloon do nothing for anyone this round."],
  fasting: ["Ngày Chay", "Fasting", "Cả vòng không ai dùng được lá rút thêm bài.", "Nobody may play card-drawing cards this round."],
  "tied-hands": ["Tay Bị Trói", "Tied Hands", "Cả vòng không ai đặt được lá xanh hay đổi súng.", "No blue cards or gun swaps this round."],
  silence: ["Im Lặng", "Silence", "Gatling, Indians! và Duel bị cấm cả vòng.", "Gatling, Indians! and Duel are forbidden all round."],
  "no-looting": ["Cấm Cướp Bóc", "No Looting", "Panic! và Cat Balou bị cấm cả vòng.", "Panic! and Cat Balou are forbidden all round."],
  drought: ["Nắng Cháy", "Drought", "Cả vòng, cuối lượt chỉ giữ được số bài = máu − 1.", "Everyone's hand limit is one lower this round."],
  "clumsy-hands": ["Tay Vụng", "Clumsy Hands", "Cả vòng, mỗi người chỉ đánh được 1 lá trong lượt của mình.", "Each player may play only 1 card per turn this round."],
  ceasefire: ["Lệnh Ngừng Bắn", "Ceasefire", "Hết vòng này không ai mất máu.", "Nobody loses life for the rest of the round."],
  "empty-pockets": ["Túi Rỗng", "Empty Pockets", "Cả vòng, đầu lượt ai cũng chỉ rút 1 lá.", "Everyone draws only 1 card this round."],
  survival: ["Chế Độ Sinh Tồn", "Survival", "Cả vòng không ai hồi máu được (vẫn cứu được khi sắp gục).", "No healing this round — a dying player may still drink to survive."],
  truce: ["Hiệp Ước", "Truce", "Cả vòng không ai được bắn hay Duel Cảnh Sát Trưởng.", "Nobody may Bang! or Duel the Sheriff this round."],

  // buffs
  "hot-streak": ["Đạn Vô Hạn", "Hot Streak", "Cả vòng ai cũng bắn Bang! không giới hạn.", "Everyone may fire unlimited Bang! this round."],
  "gun-oil": ["Dầu Súng", "Gun Oil", "Cả vòng ai cũng được bắn 2 lá Bang! mỗi lượt.", "Everyone may fire two Bang! per turn this round."],
  "eagle-eye": ["Mắt Đại Bàng", "Eagle Eyes", "Tầm bắn của mọi người +1 cả vòng.", "Everyone gets +1 range this round."],
  "sniper-nest": ["Ổ Bắn Tỉa", "Sniper Nests", "Cả vòng ai cũng bắn được ở mọi khoảng cách.", "Everyone can shoot at any distance this round."],
  "gold-rush": ["Cơn Sốt Vàng", "Gold Rush", "Cả vòng ai cũng rút thêm 1 lá ở đầu lượt.", "Everyone draws 1 extra card this round."],
  "card-rain": ["Mưa Bài", "Card Rain", "Cả vòng, đầu lượt ai cũng rút 3 lá thay vì 2.", "Everyone draws 3 instead of 2 this round."],
  frenzy: ["Cơn Điên", "Frenzy", "Cả vòng bỏ luật mỗi loại lá 1 lần/lượt.", "The once-per-turn card rule is suspended this round."],
  "happy-hour": ["Giờ Vàng", "Happy Hour", "Cả vòng, mỗi Beer hồi 2 máu.", "Each Beer restores 2 life this round."],

  // weather
  sandstorm: ["Bão Cát", "Sandstorm", "Cả vòng, mọi Bang! cần thêm 1 Missed! để né.", "Every Bang! needs one more Missed! this round."],
  fog: ["Sương Mù", "Fog", "Cả vòng, mọi người thấy nhau xa hơn 1.", "Everyone sees everyone 1 farther this round."],
  "open-plains": ["Đồng Bằng", "Open Plains", "Cả vòng, mọi người thấy nhau gần hơn 1.", "Everyone sees everyone 1 closer this round."],
  wartime: ["Thời Chiến", "Wartime", "Cả vòng, mọi sát thương +1.", "All damage is increased by 1 this round."],
  "bad-weather": ["Thời Tiết Xấu", "Bad Weather", "Cả vòng, mọi Draw! lật 2 lá và lấy lá xấu hơn.", "Every Draw! keeps the worse of two this round."],
  "lucky-table": ["Bàn May", "Lucky Table", "Cả vòng, mọi Draw! lật 2 lá và lấy lá tốt hơn.", "Every Draw! keeps the better of two this round."],
  "drunk-table": ["Cả Bàn Say", "Everyone's Drunk", "Cả vòng, mọi Bang! bay vào một mục tiêu ngẫu nhiên trong tầm.", "Every Bang! hits a random target in range this round."],

  // punishments
  plague: ["Dịch Bệnh", "Plague", "Mọi người đang trên 1 máu mất 1 máu.", "Everyone above 1 life loses 1."],
  toll: ["Thuế Quan", "Toll", "Mỗi người bỏ 1 lá ngẫu nhiên.", "Everyone discards a random card."],
  "strong-wind": ["Gió To", "Strong Wind", "Mọi Dynamite chuyển sang người kế tiếp.", "Every Dynamite passes along."],
  "wet-fuse": ["Dây Cháy Ướt", "Wet Fuse", "Mọi Dynamite trên bàn bị bỏ.", "Every Dynamite in play is discarded."],
  jailbreak: ["Vượt Ngục", "Jailbreak", "Mọi Jail bị bỏ — tù nhân được thả.", "Every Jail is discarded — prisoners walk free."],

  // boons
  "healing-spring": ["Giếng Thần", "Healing Spring", "Mọi người hồi 1 máu.", "Everyone regains 1 life."],
  "supply-drop": ["Tiếp Tế", "Supply Drop", "Mọi người rút 1 lá.", "Everyone draws a card."],
  "flea-market": ["Chợ Trời", "Flea Market", "Mở một lượt General Store miễn phí.", "A free General Store round opens."],
  reshuffle: ["Xáo Lại", "Reshuffle", "Chồng bài bỏ được trộn lại vào bộ.", "The discard pile is shuffled back into the deck."],

  // chaos
  "pass-the-hand": ["Chuyền Tay", "Pass the Hand", "Mọi người chuyền tay bài theo chiều đi.", "Everyone passes their hand along the play direction."],
  "gun-shuffle": ["Đổi Súng", "Gun Shuffle", "Mọi người chuyền súng theo chiều đi.", "Everyone passes their gun along the play direction."],
  reverse: ["Đảo Chiều", "Reverse", "Lượt này đảo chiều: người kế tiếp là người phía bên kia.", "This turn reverses: play passes the other way, then back to normal."],

};

export const eventName = (l: Locale, id: string) => EVENT_TEXT[id]?.[l === "vi" ? 0 : 1] ?? id;
export const eventDesc = (l: Locale, id: string) => EVENT_TEXT[id]?.[l === "vi" ? 2 : 3] ?? "";

// Events are a plain on/off switch, not a frequency dial — see the note in events.ts.
const EVENT_LEVEL_LABEL: Record<string, [string, string]> = {
  off: ["Tắt", "Off"],
  on: ["Bật", "On"],
};
export const eventLevelLabel = (l: Locale, lv: string) =>
  EVENT_LEVEL_LABEL[lv]?.[l === "vi" ? 0 : 1] ?? lv;

// --- Draw! check reveals ---
const CHECK_KIND: Record<string, [string, string]> = {
  dynamite: ["Dynamite", "Dynamite"],
  jail: ["Jail", "Jail"],
  barrel: ["Barrel", "Barrel"],
  blackjack: ["Black Jack", "Black Jack"],
};
const CHECK_OUTCOME: Record<string, [string, string]> = {
  blast: ["Nổ! −3 máu", "Blast! −3 life"],
  safe: ["An toàn", "Safe"],
  free: ["Thoát tù", "Freed"],
  skip: ["Bỏ lượt", "Turn skipped"],
  hit: ["Né được!", "Missed!"],
  miss: ["Trượt", "No luck"],
  bonus: ["Rút thêm 1!", "Draw 1 more!"],
  nobonus: ["Không thêm", "No bonus"],
};
export function checkText(l: Locale, kind: string, outcome: string): { kind: string; outcome: string } {
  const i = l === "vi" ? 0 : 1;
  return {
    kind: CHECK_KIND[kind]?.[i] ?? kind,
    outcome: CHECK_OUTCOME[outcome]?.[i] ?? outcome,
  };
}

// --- action buttons ---
const ACTIONS: Record<string, [string, string]> = {
  missed: ["Đánh Missed!", "Play Missed!"],
  beer: ["Uống Beer 🍺", "Drink Beer 🍺"],
  bang: ["Bỏ 1 Bang!", "Discard a Bang!"],
  pass: ["Bỏ qua", "Pass"],
};
export const actionLabel = (l: Locale, a: string) => (ACTIONS[a] ? ACTIONS[a][l === "vi" ? 0 : 1] : a);

// Every refusal the engine can return, in both languages. `{n}` / `{s}` are filled
// from the error's own fields — the engine never carries display copy.
const ERROR_TEXT: Record<ErrorCode, [string, string]> = {
  "no-such-room": ["Phòng không tồn tại", "No such room"],
  "cannot-start": ["Không thể bắt đầu", "Cannot start"],
  "cannot-add-bot": ["Không thêm được bot", "Could not add a bot"],
  "player-not-found": ["Không tìm thấy người chơi", "Player not found"],
  "bad-player-count": ["Số người chơi không hợp lệ", "Invalid player count"],
  "game-in-progress": ["Ván đang diễn ra", "A game is in progress"],
  "already-started": ["Ván đã bắt đầu", "The game already started"],
  "not-your-turn": ["Không phải lượt của bạn", "Not your turn"],
  "must-draw-first": ["Bạn phải rút bài trước", "You must draw first"],
  "waiting-for-reaction": ["Đang chờ phản ứng", "Waiting for a reaction"],
  "jailed-discard-only": [
    "Đang bị giam — chỉ được bỏ bài rồi kết thúc lượt",
    "In jail — you may only discard, then end your turn",
  ],
  "not-your-reaction": ["Không phải lượt phản ứng của bạn", "Not your reaction"],
  "not-your-duel-turn": ["Chưa tới lượt bạn trong Duel", "Not your turn in the duel"],
  "not-your-pick": ["Chưa tới lượt chọn của bạn", "Not your pick"],
  "invalid-card": ["Lá không hợp lệ", "Invalid card"],
  "card-not-in-hand": ["Không có lá đó", "You don't have that card"],
  "card-not-implemented": ["Lá này sẽ hỗ trợ ở bước sau", "This card isn't supported yet"],
  "missed-is-reaction-only": ["Missed! chỉ dùng để phản ứng Bang!", "Missed! only answers a Bang!"],
  "invalid-target": ["Mục tiêu không hợp lệ", "Invalid target"],
  "out-of-range": ["Mục tiêu ngoài tầm bắn", "Target out of range"],
  "panic-needs-distance-1": [
    "Chỉ lấy được của người ở khoảng cách 1",
    "Only from a player at distance 1",
  ],
  "target-has-no-cards": ["Mục tiêu không có bài", "The target has no cards"],
  "cannot-jail-sheriff": ["Không thể bỏ tù Cảnh Sát Trưởng", "The Sheriff cannot be jailed"],
  "already-jailed": ["Người này đã bị giam", "Already in jail"],
  "truce-protects-sheriff": [
    "Hiệp Ước: không được bắn Cảnh Sát Trưởng",
    "Truce: the Sheriff cannot be shot",
  ],
  "hp-full": ["Máu đã đầy", "Already at full life"],
  "pick-two-distinct": ["Chọn đúng 2 lá khác nhau", "Pick exactly 2 different cards"],
  "ability-unavailable": [
    "Nhân vật của bạn không làm được việc này",
    "Your character cannot do that",
  ],
  "event-forbids-heal": ["Sự kiện đang cấm hồi máu", "An event forbids healing"],
  "event-bans-kind": ["Sự kiện đang cấm loại lá này", "An event bans this kind of card"],
  "event-bans-bang": ["Sự kiện: không được bắn lượt này", "Event: no shooting this turn"],
  "bang-limit-reached": [
    "Chỉ 1 Bang!/lượt (trừ Volcanic/Willy)",
    "Only 1 Bang! per turn (Volcanic/Willy aside)",
  ],
  "room-full": ["Phòng đã đầy (tối đa {n})", "Room full (max {n})"],
  "need-players": ["Cần tối thiểu {n} người", "Need at least {n} players"],
  "too-many-players": ["Tối đa {n} người", "At most {n} players"],
  "hand-over-limit": ["Bỏ bớt {n} lá (giới hạn = máu)", "Discard {n} card(s) (limit = life)"],
  "already-in-play": ["Đã có {s} trên bàn", "{s} is already in play"],
  "no-valid-card": ["Không có {s} hợp lệ", "No valid {s}"],
  "need-more-missed": ["Cần đủ {n} Missed! để né", "Need {n} Missed! to dodge"],
  "event-bans-card": ["Sự kiện đang cấm {s}", "An event bans {s}"],
  "event-play-limit": [
    "Sự kiện: chỉ được đánh {n} lá lượt này",
    "Event: only {n} card(s) playable this turn",
  ],
  "card-already-used-this-turn": ["Đã dùng {s} trong lượt này", "Already played {s} this turn"],
};

export function tError(l: Locale, e: GameError | string | null | undefined): string {
  if (!e) return "";
  if (typeof e === "string") return e; // client-side messages are already localised
  const tpl = ERROR_TEXT[e.code]?.[l === "vi" ? 0 : 1] ?? e.code;
  return tpl.replace("{n}", String(e.n ?? "")).replace("{s}", e.s ?? "");
}
