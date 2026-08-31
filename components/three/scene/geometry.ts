// Where the camera sits, where players sit, and the heights everything anchors to.
// No JSX and no scene objects, so a script can import this and check the numbers.
import * as THREE from "three";
import type { PlayerPublic } from "@/lib/types";

export function othersInTurnOrder<T extends { seat: number }>(players: T[], youSeat: number, n: number): T[] {
  return players
    .filter((p) => p.seat !== youSeat)
    .sort((a, b) => ((a.seat - youSeat + n) % n) - ((b.seat - youSeat + n) % n));
}

export function layout(nOpp: number) {
  const ring = 1.4 + 0.13 * nOpp; // radius of the opponent circle
  const felt = ring + 0.5; // felt top radius
  // Arc widens with player count so a full table wraps evenly around the felt
  // instead of bunching on the far side (up to ~270° for 6 opponents).
  const arc = Math.min(1.5, 0.6 + 0.15 * nOpp) * Math.PI;
  // Frame the camera relative to the table size so the whole table reads the same
  // way for any player count: a 3/4 "seated" view, table filling the width.
  const d = felt * 1.95;
  const camY = d * 0.6; // ~37° above horizon
  const camZ = d * 0.8;
  const fov = 55;
  return { ring, felt, arc, camY, camZ, fov };
}

// Distinct shirt colors so seated players read apart.
export const AVATAR_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#c39bd3"];

// Floor level (matches the Saloon shell). Avatar groups sit at the table top (y=0),
// so a body must reach down to here.
export const FLOOR_Y = -1.55;

// The green felt's top face — the surface everything on the table rests on. The
// wooden body's top is y=0 and TableInner lays the cloth just above it, so THIS is
// the number a card, a pile or a gun has to sit on, not 0.
export const FELT_Y = 0.03;

// How far above the felt a card lying flat is drawn — just enough to keep two
// coplanar surfaces apart in the depth buffer, nothing more. At the resting camera
// (4.2-5.2 units out, near=0.1) a 24-bit buffer resolves ~1.5e-5, so this is ~250x
// the margin needed while being 1.3% of a card's own width.
//
// The old values were guesses in the other direction — an opponent's hand sat 0.10
// above the cloth, 32% of the card's width, and the whole table read as hovering.
// They were guarding against a card sinking in when tilted, but no card here is ever
// tilted: the z-rotation in these placements is applied BEFORE the -90° x-rotation,
// so it spins the card in its own plane and leaves it perfectly horizontal.
export const CARD_LIFT = 0.004;

// Where the two centre piles sit, either side of the middle. Exported because three
// separate things have to agree on the draw pile's spot: the pile itself, the cards
// that come off it, and the arm that reaches for it.
export const DECK_X = -0.45;
export const DISCARD_X = 0.45;

// The point an arm reaches for and a drawn card lifts off from — a little above the
// top of the stack, so the hand arrives over the pile rather than through it.
export const deckTop = () => new THREE.Vector3(DECK_X, FELT_Y + CARD_LIFT + 0.06, 0);
// And the pile a discarded card is thrown onto — where a Cat Balou victim's hand goes.
export const discardTop = () => new THREE.Vector3(DISCARD_X, FELT_Y + CARD_LIFT + 0.06, 0);

// ─── Seating geometry ────────────────────────────────────────────────────────
// Functions, not duplicated arithmetic: widening the arc must never leave the shot
// camera framing a seat a player has moved off.

export const SEAT_GAP = 0.45; // seats sit this far out past the felt rim
export const YOUR_SEAT_ANG = Math.PI / 2; // you are always on the near edge (+z), facing -z

// Hàng bài trang bị lùi vào trong vành ghế một đoạn CỐ ĐỊNH, không phải một tỉ lệ của nó.
// Đoạn cần lùi là nửa lá trang bị (0.202) + nửa quạt bài úp (0.220) − 0.10 mà quạt vốn đã
// nhô ra ngoài ring = 0.322, và nó không đổi theo số người vì cả ba số hạng đều là kích
// thước lá bài. Tỉ lệ 0.92 cũ thì đổi: nó chừa ra 0.92·ring, hụt 0.148 ở bàn 7 người và
// 0.179 ở bàn 4 người — quạt đè lên bài trang bị ở mọi cỡ bàn, nặng nhất đúng ở bàn nhỏ
// nhất. Lùi 0.34 thì hở 0.018 ở cả 4→7 người.
export const EQUIP_SETBACK = 0.34;
export const equipRadius = (ring: number) => ring - EQUIP_SETBACK;

// Angle of opponent `i` of `count`, spread across the far arc — the far side first,
// widening symmetrically. Mirrors the order Opponents draws them in.
export function seatAngle(i: number, count: number, arc: number): number {
  const t = count === 1 ? 0.5 : i / (count - 1);
  return 1.5 * Math.PI - arc / 2 + arc * t;
}

// Which way a figure at seat angle `ang` must turn to face the middle of the table.
// A model looks down its own +z, and a Y rotation of t maps +z onto (sin t, cos t);
// facing the centre means pointing at -(cos ang, sin ang).
export const faceCentre = (ang: number) => Math.atan2(-Math.cos(ang), -Math.sin(ang));

// seat number -> world position of that player's chair, for every seat at the table
// including yours. Yours has no avatar drawn on it (you are the camera), but the
// shot camera still has to know where "you" are to frame a shot you fired.
export function seatPositions(
  players: PlayerPublic[],
  youSeat: number,
  arc: number,
  felt: number
): Map<number, THREE.Vector3> {
  const seatR = felt + SEAT_GAP;
  const at = (ang: number) => new THREE.Vector3(seatR * Math.cos(ang), 0, seatR * Math.sin(ang));
  const m = new Map<number, THREE.Vector3>();
  m.set(youSeat, at(YOUR_SEAT_ANG));
  const others = othersInTurnOrder(players, youSeat, players.length);
  others.forEach((p, i) => m.set(p.seat, at(seatAngle(i, others.length, arc))));
  return m;
}

// At module scope because the crosshair and the shot camera aim at the head too;
// as separate literals they would drift apart the first time the figure is resized.
export const AVATAR_SHOULDER_Y = 0.42; // torso top, just above the table rim (y=0)
export const AVATAR_HEAD_R = 0.15;
export const AVATAR_HEAD_Y = AVATAR_SHOULDER_Y + AVATAR_HEAD_R + 0.05; // clear of the shoulders

// --- kiểu thân người ---

// Thân cao bồi 3D đã TẮT. Không vì hiệu năng — vì người chơi thấy nó đáng sợ, và nguyên
// nhân là hình học chứ không phải model: một cái đầu vừa cỡ cho bảy ghế quanh bàn chỉ cao
// ~35px trên màn hình, mà một cái mặt cần 70-100px mới đọc được, nên thân người VĨNH VIỄN
// không có mặt. Thân gần-như-thật + mặt trống trong saloon tối là đúng công thức uncanny
// valley; thân hình khối thì không, vì nó chẳng hứa hẹn cái mặt nào.
//
// Ở đây, không phải trong Avatars.tsx: Players.tsx cũng phải đọc nó để treo dấu chỉ lượt
// đúng đỉnh mũ, và một hằng nằm hai nơi là một hằng sẽ lệch.
//
// Tách hẳn khỏi cờ `models`: cờ đó là công tắc chung "dùng .glb hay primitive" và còn phục
// vụ bàn, ghế, chai lọ, thùng — tắt nó là lột cả căn phòng chứ không chỉ bỏ người.
// Đảo lại bằng cách đổi đúng hằng này về true.
export const COWBOY_BODIES = false;

// Hai figure đội mũ lệch nhau 0.2: cao bồi đặt vành 0.3 trên xương đầu ở 0.62 và đỉnh tới
// 1.05; hình khối đặt vành ở 0.72 và đỉnh 0.85. Bất cứ thứ gì treo trên đầu phải đọc đúng
// một trong hai, nếu không nó sẽ đội lên figure này và bay lơ lửng trên figure kia.
export const CROWN_Y_COWBOY = 1.05;
export const CROWN_Y_BLOCK = 0.85;
export const crownY = () => (COWBOY_BODIES ? CROWN_Y_COWBOY : CROWN_Y_BLOCK);
