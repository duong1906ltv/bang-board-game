"use client";

// Lightweight i18n for the client. Proper nouns (card & character names) stay as
// printed; roles, abilities, UI chrome, banners and messages are translated.
import { useEffect, useState } from "react";
import type { Role } from "./types";
import type { PlayerView, LogEntry } from "./types";

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

// Pick one of two strings by locale (used for inline UI text).
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
      const name = eventName(l, e.event ?? "");
      // A curse names its victim; everything else just announces itself.
      if (e.b) return vi ? `🎲 ${name} → ${obj(e.b)}` : `🎲 ${name} → ${obj(e.b)}`;
      return `🎲 ${name}`;
    }
    case "skip":
      return vi ? `💤 ${subj(e.a)} mất lượt` : `💤 ${subj(e.a)} loses the turn`;
    case "reveal":
      return (vi ? `👁️ Vai của ${obj(e.a)} bị lộ` : `👁️ ${subj(e.a)}'s role is exposed`) + (e.role ? ` — ${roleLabel(l, e.role)}` : "");
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
  }
}

// --- random events (keyed by id in lib/events.ts) ---
// [vi name, en name, vi description, en description]
const EVENT_TEXT: Record<string, [string, string, string, string]> = {
  // luồng LƯỢT · hạn chế
  "jammed-gun": ["Súng Kẹt Đạn", "Jammed Gun", "Lượt này bạn không được đánh Bang!.", "You may not play Bang! this turn."],
  "clumsy-hand": ["Tay Vụng", "Clumsy Hand", "Lượt này chỉ được đánh 1 lá bài.", "You may play only 1 card this turn."],
  prohibition: ["Lệnh Cấm Rượu", "Prohibition", "Beer và Saloon vô hiệu lượt này.", "Beer and Saloon do nothing this turn."],
  "short-barrel": ["Nòng Cụt", "Short Barrel", "Tầm bắn của bạn về 1, bất kể súng.", "Your range drops to 1, whatever gun you hold."],
  fasting: ["Ngày Chay", "Fasting", "Không được dùng lá rút thêm bài.", "Card-drawing cards are unavailable."],
  "tied-hands": ["Tay Bị Trói", "Tied Hands", "Không được đặt lá xanh hay đổi súng.", "You may not play blue cards or swap guns."],
  silence: ["Im Lặng", "Silence", "Gatling, Indians! và Duel bị cấm.", "Gatling, Indians! and Duel are forbidden."],
  "no-looting": ["Cấm Cướp Bóc", "No Looting", "Panic! và Cat Balou bị cấm.", "Panic! and Cat Balou are forbidden."],
  drought: ["Nắng Cháy", "Drought", "Cuối lượt chỉ giữ được số bài = máu − 1.", "End-of-turn hand limit is one lower."],
  ceasefire: ["Lệnh Ngừng Bắn", "Ceasefire", "Không ai mất máu trong lượt này.", "Nobody loses life this turn."],
  oversleep: ["Ngủ Nướng", "Oversleep", "Bạn mất lượt này.", "Your turn is forfeited."],
  "empty-pockets": ["Túi Rỗng", "Empty Pockets", "Đầu lượt chỉ rút 1 lá.", "You draw only 1 card this turn."],
  drunk: ["Say Rượu", "Drunk", "Bang! của bạn bay vào một mục tiêu ngẫu nhiên trong tầm.", "Your Bang! hits a random target in range instead."],
  hangover: ["Nôn Nao", "Hangover", "Không được bắn và giới hạn bài giảm 1.", "No Bang!, and your hand limit drops by 1."],

  // luồng LƯỢT · tăng cường
  "hot-streak": ["Đạn Vô Hạn", "Hot Streak", "Lượt này bắn Bang! không giới hạn.", "Unlimited Bang! this turn."],
  "gun-oil": ["Dầu Súng", "Gun Oil", "Lượt này được bắn 2 lá Bang!.", "You may fire two Bang! this turn."],
  "piercing-round": ["Đạn Xuyên", "Piercing Round", "Mọi đòn trong lượt này gây thêm 1 sát thương.", "Every hit this turn deals 1 extra damage."],
  "eagle-eye": ["Mắt Đại Bàng", "Eagle Eye", "Tầm bắn +1 trong lượt này.", "+1 range this turn."],
  "sniper-nest": ["Ổ Bắn Tỉa", "Sniper Nest", "Lượt này bắn được mọi khoảng cách.", "You can shoot at any distance this turn."],
  "card-rain": ["Mưa Bài", "Card Rain", "Đầu lượt rút 3 lá thay vì 2.", "Draw 3 instead of 2 this turn."],
  frenzy: ["Cơn Điên", "Frenzy", "Bỏ luật mỗi loại lá 1 lần/lượt.", "The once-per-turn card rule is suspended."],
  "dead-eye": ["Ngắm Chuẩn", "Dead Eye", "Đối thủ cần thêm 1 Missed! để né Bang! của bạn.", "Targets need one more Missed! to dodge you."],
  "lucky-hand": ["Tay May", "Lucky Hand", "Mọi lần Draw! lật 2 lá và chọn lá tốt hơn.", "Every Draw! flips two and keeps the better."],
  "private-supply": ["Tiếp Tế Riêng", "Private Supply", "Bạn rút ngay 2 lá.", "You immediately draw 2 cards."],
  "sleight-of-hand": ["Tay Nhanh", "Sleight of Hand", "Bạn lấy 1 lá từ tay một người ngẫu nhiên.", "You take a card from a random player's hand."],
  "second-wind": ["Lấy Lại Sức", "Second Wind", "Bạn hồi 1 máu.", "You regain 1 life point."],

  // luồng LƯỢT · lời nguyền
  shackled: ["Bị Xích", "Shackled", "Người bị nhắm không được bắn ở lượt tới của họ.", "The target may not shoot on their next turn."],
  "marked-man": ["Bị Đánh Dấu", "Marked Man", "Người bị nhắm nhận thêm 1 sát thương mỗi đòn, 2 lượt.", "The target takes 1 extra damage per hit for 2 turns."],
  "guardian-angel": ["Thiên Thần Hộ Mệnh", "Guardian Angel", "Người yếu nhất miễn sát thương 1 lượt.", "The weakest player takes no damage for a turn."],
  wanted: ["Truy Nã", "Wanted", "Ai hạ được người bị treo thưởng sẽ rút 3 lá.", "Whoever kills the wanted player draws 3 cards."],

  // luồng BÀN · trừng phạt
  "cave-in": ["Sập Mỏ", "Cave-in", "Người đang chơi mất 1 máu.", "The active player loses 1 life."],
  plague: ["Dịch Bệnh", "Plague", "Mọi người trên 1 máu mất 1 máu.", "Everyone above 1 life loses 1."],
  stampede: ["Bò Điên", "Stampede", "Một người ngẫu nhiên mất 1 máu.", "A random player loses 1 life."],
  toll: ["Thuế Quan", "Toll", "Mỗi người bỏ 1 lá ngẫu nhiên.", "Everyone discards a random card."],
  inspection: ["Thanh Tra", "Inspection", "Người nhiều bài nhất phải bỏ về giới hạn.", "The player with the most cards trims to their limit."],
  "night-thief": ["Trộm Đêm", "Night Thief", "Một người ngẫu nhiên mất 1 lá.", "A random player loses a card."],
  "strong-wind": ["Gió To", "Strong Wind", "Mọi Dynamite chuyển sang người kế tiếp.", "Every Dynamite passes along."],
  "wet-fuse": ["Dây Cháy Ướt", "Wet Fuse", "Mọi Dynamite trên bàn bị bỏ.", "Every Dynamite in play is discarded."],
  jailbreak: ["Vượt Ngục", "Jailbreak", "Mọi Jail bị bỏ — tù nhân được thả.", "Every Jail is discarded — prisoners walk free."],

  // luồng BÀN · phúc lợi
  "healing-spring": ["Giếng Thần", "Healing Spring", "Mọi người hồi 1 máu.", "Everyone regains 1 life."],
  "supply-drop": ["Tiếp Tế", "Supply Drop", "Mọi người rút 1 lá.", "Everyone draws a card."],
  "divine-favor": ["Ơn Trên", "Divine Favor", "Người ít máu nhất hồi 2 máu.", "The player with the least life regains 2."],
  "flea-market": ["Chợ Trời", "Flea Market", "Mở một lượt General Store miễn phí.", "A free General Store round opens."],
  reshuffle: ["Xáo Lại", "Reshuffle", "Chồng bài bỏ được trộn lại vào bộ.", "The discard pile is shuffled back into the deck."],

  // luồng BÀN · hỗn loạn
  "musical-chairs": ["Đổi Chỗ", "Musical Chairs", "Hai người ngẫu nhiên đổi ghế — khoảng cách đổi theo.", "Two random players swap seats — distances change."],
  "hand-swap": ["Đổi Tay", "Hand Swap", "Hai người ngẫu nhiên đổi toàn bộ bài trên tay.", "Two random players swap entire hands."],
  "pass-the-hand": ["Chuyền Tay", "Pass the Hand", "Mọi người chuyền tay bài theo chiều đi.", "Everyone passes their hand along the play direction."],
  "gun-shuffle": ["Đổi Súng", "Gun Shuffle", "Mọi người chuyền súng theo chiều đi.", "Everyone passes their gun along the play direction."],
  reverse: ["Đảo Chiều", "Reverse", "Thứ tự lượt đảo chiều từ giờ.", "The turn order reverses from now on."],
  "role-leak": ["Tiết Lộ Vai", "Role Leak", "Vai của một người bị công khai.", "One player's role becomes public."],

  // luồng BÀN · toàn cục kéo dài
  sandstorm: ["Bão Cát", "Sandstorm", "Mọi Bang! cần thêm 1 Missed! để né.", "Every Bang! needs one more Missed! to dodge."],
  fog: ["Sương Mù", "Fog", "Mọi người thấy nhau xa hơn 1.", "Everyone sees everyone 1 farther away."],
  "open-plains": ["Đồng Bằng", "Open Plains", "Mọi người thấy nhau gần hơn 1.", "Everyone sees everyone 1 closer."],
  "happy-hour": ["Giờ Vàng", "Happy Hour", "Mỗi Beer hồi 2 máu.", "Each Beer restores 2 life."],
  wartime: ["Thời Chiến", "Wartime", "Mọi sát thương +1.", "All damage is increased by 1."],
  survival: ["Chế Độ Sinh Tồn", "Survival", "Không ai hồi máu được (vẫn cứu được khi sắp gục).", "No healing — a dying player may still drink to survive."],
  "bad-weather": ["Thời Tiết Xấu", "Bad Weather", "Mọi lần Draw! lật 2 lá và lấy lá xấu hơn.", "Every Draw! flips two and keeps the worse."],
  "lucky-table": ["Bàn May", "Lucky Table", "Mọi lần Draw! lật 2 lá và lấy lá tốt hơn.", "Every Draw! flips two and keeps the better."],
  truce: ["Hiệp Ước", "Truce", "Không ai được bắn hay Duel Cảnh Sát Trưởng.", "Nobody may Bang! or Duel the Sheriff."],
  "gold-rush": ["Cơn Sốt Vàng", "Gold Rush", "Mọi người rút thêm 1 lá ở đầu lượt.", "Everyone draws 1 extra card in their draw phase."],
};

export const eventName = (l: Locale, id: string) => EVENT_TEXT[id]?.[l === "vi" ? 0 : 1] ?? id;
export const eventDesc = (l: Locale, id: string) => EVENT_TEXT[id]?.[l === "vi" ? 2 : 3] ?? "";

// Frequency picker labels (host, lobby).
const EVENT_LEVEL_LABEL: Record<string, [string, string]> = {
  off: ["Tắt", "Off"],
  low: ["Ít", "Light"],
  normal: ["Vừa", "Normal"],
  high: ["Điên", "Chaos"],
  mayhem: ["Hỗn Mang", "Mayhem"],
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

// --- error messages (server sends Vietnamese; map to EN, with a few parametric) ---
const ERROR_EN: Record<string, string> = {
  "Phòng không tồn tại": "Room not found",
  "Ván đang diễn ra, không thể vào": "Game in progress — can't join",
  "Không tìm thấy người chơi": "Player not found",
  "Không vào lại được phòng": "Couldn't rejoin the room",
  "Ván đã bắt đầu": "The game already started",
  "Số người chơi không hợp lệ": "Invalid player count",
  "Bạn phải rút bài trước": "You must draw first",
  "Đang chờ phản ứng": "Waiting for a reaction",
  "Mục tiêu không hợp lệ": "Invalid target",
  "Mục tiêu ngoài tầm bắn": "Target out of range",
  "Chỉ 1 Bang!/lượt (trừ Volcanic/Willy)": "Only 1 Bang! per turn (unless Volcanic/Willy)",
  "Không thể bỏ tù Cảnh Sát Trưởng": "Can't jail the Sheriff",
  "Người này đã bị giam": "That player is already jailed",
  "Máu đã đầy": "Life is already full",
  "Missed! chỉ dùng để phản ứng Bang!": "Missed! can only be used to react to a Bang!",
  "Chỉ lấy được của người ở khoảng cách 1": "Only from a player at distance 1",
  "Mục tiêu không có bài": "Target has no cards",
  "Không phải lượt phản ứng của bạn": "Not your turn to react",
  "Không có lá né hợp lệ": "No valid card to dodge with",
  "Không có Beer đó": "No such Beer",
  "Chưa tới lượt bạn trong Duel": "Not your turn in the Duel",
  "Không có Bang! hợp lệ": "No valid Bang!",
  "Chưa tới lượt chọn của bạn": "Not your turn to pick",
  "Lá không hợp lệ": "Invalid card",
  "Không phải lượt của bạn": "Not your turn",
  "Chỉ Sid Ketchum dùng được": "Only Sid Ketchum can do this",
  "Chọn đúng 2 lá khác nhau": "Pick exactly 2 different cards",
  "Không có lá đó": "No such card",
  "Sự kiện đang cấm hồi máu": "An event forbids healing",
  "Sự kiện đang cấm loại lá này": "An event forbids this kind of card",
  "Sự kiện: không được bắn lượt này": "Event: you can't shoot this turn",
  "Hiệp Ước: không được bắn Cảnh Sát Trưởng": "Truce: the Sheriff can't be shot",
};
export function tError(l: Locale, msg: string): string {
  if (l === "vi") return msg;
  if (ERROR_EN[msg]) return ERROR_EN[msg];
  // Parametric fallbacks.
  let m = msg.match(/^Bỏ bớt (\d+) lá/);
  if (m) return `Discard ${m[1]} card(s) (limit = life)`;
  m = msg.match(/^Cần tối thiểu (\d+) người/);
  if (m) return `Need at least ${m[1]} players`;
  m = msg.match(/^Tối đa (\d+) người/);
  if (m) return `At most ${m[1]} players`;
  m = msg.match(/^Phòng đã đầy \(tối đa (\d+)\)/);
  if (m) return `Room full (max ${m[1]})`;
  m = msg.match(/^Đã có .+ trên bàn$/);
  if (m) return "Already in play";
  m = msg.match(/^Không có (Bang!|Missed!) hợp lệ$/);
  if (m) return `No valid ${m[1]}`;
  m = msg.match(/^Sự kiện đang cấm (.+)$/);
  if (m) return `An event forbids ${m[1]}`;
  m = msg.match(/^Sự kiện: chỉ được đánh (\d+) lá lượt này$/);
  if (m) return `Event: only ${m[1]} card(s) playable this turn`;
  return msg;
}
