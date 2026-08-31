// Nhiệm vụ phụ ẩn — lớp house cho người chơi một mục tiêu riêng, chỉ mình biết.
//
// Mỗi người nhận một nhiệm vụ lúc chia vai. Chỉ mình thấy khi đang làm; xong thì cả bàn biết
// và nhận thưởng. Bật/tắt được cả phòng ở Lobby, như sự kiện ngẫu nhiên.
//
// BA LUẬT THIẾT KẾ, và bảng đầu tiên đã bị loại sạch vì phá luật 1:
//   1. Mỗi nhiệm vụ PHẢI nêu được nó bắt bạn TỪ BỎ cái gì. Bảng cũ có 11/14 chỉ mô tả thứ
//      người chơi vốn đã làm (bị bắn, còn sống, gây sát thương) — không quyết định nào, chỉ là
//      vé số tự cào. Căng thẳng đến từ nhiệm vụ CẤM, không phải nhiệm vụ ĐÒI.
//   2. Ưu tiên hy sinh MỘT-KHOẢNH-KHẮC. Kiêng ≠ tàn khốc: đòi kỷ luật nhiều lượt thì tỷ lệ
//      hoàn thành thấp và dễ bị phớt lờ cả ván — vô hình theo đường khác. 10/13 có goal 1.
//   3. Thưởng phải ăn được cái giá, chuẩn 1 HP ≈ 1.5 lá. Không bù nổi thì chơi tối ưu là phớt
//      lờ tất cả. Sim và unit test đều MÙ với luật này — chỉ ván thật kiểm được.
//
// INVARIANT TIER — thứ chặn "nhiệm vụ ẩn bất khả thi", loại lỗi im lặng nhất có thể có ở đây:
// người chơi mất tính năng cả ván và không biết để mà cãi.
//   Tier 1 — predicate chỉ đọc state của chính người giữ. Luôn hoàn thành được.
//   Tier 2 — đếm hành động của mình nhắm vào người khác KHÔNG NÊU TÊN. Đếm số người khác nhau
//            thì ngưỡng ≤ 3 (pool co lại khi người ta chết); đếm lượng tích luỹ thì không trần.
//   Tier 3 — CẤM. Nêu tên một người / một role / một ghế cụ thể. MissionRoom cố ý không có
//            `players`, nên tầng type không cho viết Tier 3 ngay từ đầu.
//
// DẠNG BỊ CẤM: "đánh lá X N lần". Ba tầng chặn cộng dồn trong engine này — luật once-per-turn
// (isExemptPlay chỉ miễn gun và bang-like) khoá mỗi defId một lần/lượt; nhiều lá có guard riêng
// (playBeer từ chối khi đã đủ máu); và event cấm cả nhóm lá suốt một round. Cộng thêm: Beer cứu
// người đang chết đi qua respond() chứ không qua playCard(), nên signal `play` không nổ cho cú đó.
//
// CỔNG COUNT: khoá nhiệm vụ vào lá nào thì phải tra `count` trong lib/cards.ts trước. ≤2 bản
// không được làm cổng duy nhất. Cổng này đã loại `high-roller` ("để Dynamite nổ trên mình"):
// dynamite có count 1, và nổ hay không là Draw! ra 2-9 Bích ≈ 15% chứ không điều khiển được.
//
// Import: chỉ `import type` từ ./game/state. lib/i18n.ts là "use client" và import MISSION_BY_ID
// để lấy emoji, còn engine kéo node:crypto qua escapeReward — import giá trị sẽ lôi nó vào
// bundle browser. lib/predictions.ts và lib/events.ts theo cùng luật này, cùng lý do.

import type { Player } from "./game/state";

// Chỉ 5 nhánh. Registry không dùng kill/draw/check — đừng cắm thêm "cho đủ bộ".
export type MissionSignal =
  | { t: "play"; actor: Player; defId: string; target?: Player }
  | { t: "damage"; actor: Player | null; target: Player; n: number }
  | { t: "heal"; actor: Player; n: number }
  | { t: "discard"; actor: Player; defId: string; forced: boolean }
  | { t: "turnEnd"; actor: Player; plays: number; playedDefIds: string[] };

// Mảnh Room predicate được đọc. Hẹp có chủ đích: KHÔNG có `players`, nên không predicate nào
// chỉ được vào một người cụ thể. Đó là Tier 3 bị chặn ở tầng type thay vì bằng lời hứa.
export interface MissionRoom {
  aliveCount: number;
  deadCount: number;
  woundedCount: number;
}

// Lớp che thật, cho `no-cover`. KHÔNG phải mọi lá xanh: giữ một Jail không phải "từ chối lớp
// che", nó là vũ khí dùng lên người khác, và Dynamite là thứ bạn muốn tống đi.
const COVER_DEF_IDS = ["mustang", "barrel"];
const hasCoverInHand = (p: Player) => p.hand.some((c) => COVER_DEF_IDS.includes(c.defId));
const hasCoverInPlay = (p: Player) => p.equipment.some((c) => COVER_DEF_IDS.includes(c.defId));

export interface MissionDef {
  id: string;
  emoji: string;
  tier: 1 | 2;
  weight: number;
  goal: number;
  reward: { cards?: number; hp?: number };
  // Cộng bao nhiêu tiến độ cho signal này (0 = không liên quan). Hàm THUẦN: không side effect,
  // không tự đánh dấu hoàn thành, không tự phát thưởng — phía gọi giữ counter và mốc goal.
  track: (s: MissionSignal, me: Player, room: MissionRoom, seen: string[]) => number;
  // Khoá để `seen` khỏi đếm trùng. Chỉ two-birds cần.
  seenKey?: (s: MissionSignal) => string | null;
  // true → tiến độ về 0 VÀ seen xoá sạch. Dùng cho chuỗi liên tiếp và đếm-trong-một-lượt.
  breaks?: (s: MissionSignal, me: Player) => boolean;
}

const mine = (s: MissionSignal, me: Player) =>
  s.t === "damage" ? s.actor?.id === me.id : s.actor.id === me.id;

export const MISSIONS: MissionDef[] = [
  // Tay trắng cuối lượt = không Missed!, không Beer, trần trụi đến hết vòng. Đường hoàn thành:
  // tay 4 lá, đánh Bang! + Beer + Panic! + Mustang trong một lượt là xong (4 defId khác nhau,
  // luật once-per-turn cho phép). Hoặc đơn giản hơn: bỏ hết ở phase discard.
  { id: "all-in", emoji: "🃏", tier: 1, weight: 8, goal: 1, reward: { cards: 2 },
    track: (s, me) => (s.t === "turnEnd" && mine(s, me) && me.hand.length === 0 ? 1 : 0) },

  // Cố ý ăn một phát Bang! trong khi tay ĐANG có Missed!. Giá: đúng 1 HP. Đường hoàn thành:
  // Missed! có 12 bản trong bộ 80, và bị bắn là chuyện xảy ra mỗi vòng — chỉ cần bấm "bỏ qua"
  // thay vì "né" đúng một lần.
  //
  // Không đọc được Calamity Janet: canUseAs (Bang!⇄Missed!) nằm trong engine, mà file này chỉ
  // import type. Nên chỉ khớp lá `missed` thật. Nghiêng về phía KHÓ hơn, không lỏng hơn.
  { id: "no-shield", emoji: "🩸", tier: 1, weight: 8, goal: 1, reward: { cards: 2 },
    track: (s, me) =>
      s.t === "damage" && s.target.id === me.id && me.hand.some((c) => c.defId === "missed") ? 1 : 0 },

  // Tự bỏ lưới an toàn của mình khi KHÔNG bị bắt bỏ. Missed! 12 bản + Beer 6 bản = 18 bản, và
  // discardCard không kiểm giới hạn tay nên bỏ lúc nào cũng được. `forced` là thứ tạo ra hy
  // sinh: bỏ vì quá giới hạn tay thì không phải tự nguyện.
  { id: "throw-it-away", emoji: "🗑️", tier: 1, weight: 7, goal: 1, reward: { cards: 2 },
    track: (s, me) =>
      s.t === "discard" && mine(s, me) && !s.forced && (s.defId === "missed" || s.defId === "beer") ? 1 : 0 },

  // Gatling/Indians lúc đang 1 HP: chọc cả bàn khi cách cái chết đúng một đòn. Gatling 1 bản +
  // Indians 2 bản = 3 bản — mỏng, và đó là lý do weight thấp hơn phần còn lại.
  { id: "reckless", emoji: "💥", tier: 1, weight: 5, goal: 1, reward: { cards: 2 },
    track: (s, me) =>
      s.t === "play" && mine(s, me) && (s.defId === "gatling" || s.defId === "indians") && me.hp === 1 ? 1 : 0 },

  // Kết thúc lượt ở ≤2 HP mà trên bàn không có lớp che, TRONG KHI tay đang có. Cái mệnh đề
  // cuối là thứ cho nó răng: bỏ nó ra thì người ≤2 HP vốn không có lá che nào sẽ hoàn thành
  // tình cờ — đúng cái bệnh "nhiệm vụ an toàn" mà cả bảng này sinh ra để tránh.
  //
  // goal 1, không phải 2: Mustang 2 bản + Barrel 2 bản = 4 bản trong bộ 80, nên tay ~4 lá có
  // ~20% đang giữ một lá che. Nhân với ≤2 HP rồi nhân tiếp với hai lượt LIÊN TIẾP thì thành
  // compound-rare. Một lượt đã là hy sinh thật, thấy được, và vô lý.
  { id: "no-cover", emoji: "🚪", tier: 1, weight: 6, goal: 1, reward: { cards: 3 },
    track: (s, me) =>
      s.t === "turnEnd" && mine(s, me) && me.hp <= 2 && !hasCoverInPlay(me) && hasCoverInHand(me) ? 1 : 0 },

  // Bỏ trọn một lượt trong khi tay có ≥3 lá. Không ai làm thế trừ khi có lý do — đó là điểm.
  // Đường hoàn thành: rút xong rồi bấm hết lượt, đúng một lần.
  { id: "mercy", emoji: "🕊️", tier: 1, weight: 8, goal: 1, reward: { cards: 2 },
    track: (s, me) => (s.t === "turnEnd" && mine(s, me) && s.plays === 0 && me.hand.length >= 3 ? 1 : 0) },

  // Bang! là lá CUỐI trên tay: bắn xong là trần trụi. Bang! có 25 bản, dày nhất bộ, nên đường
  // hoàn thành chỉ là chờ tay xuống còn một lá Bang! rồi bắn thay vì giữ.
  { id: "last-bullet", emoji: "🔫", tier: 1, weight: 8, goal: 1, reward: { cards: 2 },
    track: (s, me) => (s.t === "play" && mine(s, me) && s.defId === "bang" && me.hand.length === 0 ? 1 : 0) },

  // 4 lá trong một lượt. Luật once-per-turn nghĩa là 4 defId KHÁC NHAU (Bang! được miễn nên
  // nhiều Bang! vẫn tính), và dốc sạch tay là cái giá.
  { id: "spendthrift", emoji: "💸", tier: 1, weight: 6, goal: 1, reward: { cards: 2 },
    track: (s, me) => (s.t === "turnEnd" && mine(s, me) && s.plays >= 4 ? 1 : 0) },

  // Duel vào người ĐANG nhiều bài hơn mình: Duel đốt Bang! của cả hai bên lần lượt, ai hết
  // trước thì mất máu — nên nhắm người giàu bài hơn là tự chọn kèo dưới. Duel 3 bản.
  // Tier 2: đọc số bài của một người khác nhưng không nêu tên ai.
  { id: "duel-me", emoji: "⚔️", tier: 2, weight: 5, goal: 1, reward: { cards: 2 },
    track: (s, me) =>
      s.t === "play" && mine(s, me) && s.defId === "duel" && !!s.target && s.target.hand.length > me.hand.length ? 1 : 0 },

  // Bắn trúng 2 người KHÁC NHAU trong cùng một lượt, và cái giá là cả tay bài. Đường hoàn
  // thành cần HAI thứ, không phải một: bỏ trần Bang!/lượt (Volcanic 2 bản, hoặc Willy the Kid)
  // VÀ với tới được người thứ hai — tầm mặc định là 1 nên chỉ hai người ngồi cạnh là trong
  // tầm; xa hơn thì cần súng dài. Gatling KHÔNG dùng được: nó nhắm cả bàn nên engine không ghi
  // shot cho ai, đúng định nghĩa "bắn ai" mà đoán-hành-động cũng dùng.
  // Tier 2, đếm số người khác nhau nên ngưỡng 2 — dưới trần 3. `seen` chống đếm trùng,
  // `breaks` xoá nó mỗi lượt.
  { id: "two-birds", emoji: "🎯", tier: 2, weight: 5, goal: 2, reward: { cards: 2 },
    track: (s, me, _room, seen) =>
      s.t === "damage" && s.actor?.id === me.id && s.target.id !== me.id && !seen.includes(s.target.id) ? 1 : 0,
    seenKey: (s) => (s.t === "damage" ? s.target.id : null),
    breaks: (s) => s.t === "turnEnd" },

  // 3 lượt liên tiếp không đánh Bang!: nhường nhịp độ và cơ hội hạ người. Đọc playedDefIds của
  // lượt vừa xong, nên một lượt không có Bang! nào vẫn tính dù có đánh lá khác.
  { id: "pacifist", emoji: "⏳", tier: 1, weight: 7, goal: 3, reward: { cards: 2 },
    track: (s, me) => (s.t === "turnEnd" && mine(s, me) && !s.playedDefIds.includes("bang") ? 1 : 0),
    breaks: (s, me) => s.t === "play" && mine(s, me) && s.defId === "bang" },

  // Kết thúc 2 lượt liên tiếp ở đúng 1 HP: nghĩa là KHÔNG uống Beer khi đang chết dở.
  { id: "on-the-brink", emoji: "🩹", tier: 1, weight: 6, goal: 2, reward: { cards: 3 },
    track: (s, me) => (s.t === "turnEnd" && mine(s, me) && me.hp === 1 ? 1 : 0),
    breaks: (s, me) => s.t === "turnEnd" && mine(s, me) && me.hp !== 1 },

  // 3 lượt của mình trong lúc thiếu máu mà không hồi điểm nào: từ chối Beer/Saloon/Sid suốt.
  // breaks đọc lượng hồi THỰC TẾ (healPlayer trả về), nên một cú Beer bị Prohibition chặn
  // không ngắt chuỗi — đúng, vì người chơi đã không hồi được gì.
  // Thưởng có HP, và là nhiệm vụ duy nhất như vậy: chịu khát ba lượt thì được uống — đúng chất,
  // và nó là thứ giữ cho nhánh quy đổi-dưới-Prohibition trong payReward khỏi thành code chết.
  // Giá trị ≈ 1 lá + 1 HP ≈ 2.5 lá theo chuẩn 1 HP ≈ 1.5 lá, xấp xỉ 3 lá nó vốn có.
  { id: "dry-spell", emoji: "🚱", tier: 1, weight: 6, goal: 3, reward: { cards: 1, hp: 1 },
    track: (s, me) => (s.t === "turnEnd" && mine(s, me) && me.hp < me.maxHp ? 1 : 0),
    breaks: (s, me) => s.t === "heal" && mine(s, me) && s.n > 0 },
];

export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(
  MISSIONS.map((m) => [m.id, m])
);

// Chọn n nhiệm vụ khác nhau theo weight, loại trừ `exclude`. Trả về ít hơn n nếu pool cạn.
export function pickMissions(n: number, exclude: string[], rand: () => number = Math.random): MissionDef[] {
  const pool = MISSIONS.filter((m) => !exclude.includes(m.id));
  const out: MissionDef[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((sum, m) => sum + m.weight, 0);
    let roll = rand() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { idx = i; break; }
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// Chạy một signal qua nhiệm vụ của một người. KHÔNG phát thưởng — phía gọi làm việc đó, và đó
// là thứ khiến một nhiệm vụ không thể tự bẻ luật.
export function advance(
  def: MissionDef,
  s: MissionSignal,
  me: Player,
  room: MissionRoom,
  progress: number,
  seen: string[]
): { progress: number; seen: string[]; done: boolean } {
  // breaks trước track: on-the-brink đọc cả hai trên cùng một signal turnEnd, và "không còn ở
  // 1 HP" phải xoá chuỗi chứ không được cộng tiếp.
  if (def.breaks?.(s, me)) return { progress: 0, seen: [], done: false };
  const gain = def.track(s, me, room, seen);
  if (gain <= 0) return { progress, seen, done: false };
  const key = def.seenKey?.(s);
  const nextSeen = key ? [...seen, key] : seen;
  const next = Math.min(def.goal, progress + gain);
  return { progress: next, seen: nextSeen, done: next >= def.goal };
}
