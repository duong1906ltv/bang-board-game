// Đo bàn 3D bằng SỐ, không bằng mắt. Hai câu hỏi, cùng một kiểu trả lời:
// người ngồi có đè nhau / lọt khung không, và áo có phân biệt được không.
//
// Bàn lên 8 người nghĩa là 7 đối thủ chia nhau đúng cái cung mà 6 người đang ngồi:
// `arc` trong layout() chạm trần 1.5π từ nOpp = 6, nên người thứ 7 không làm cung
// rộng thêm — họ chỉ chen vào. Câu hỏi là chen tới mức nào.
//
//   npx tsx scripts/check-table-readability.ts
//
// Import thẳng geometry.ts — file đó cố ý không có JSX để cửa này mở được.
//
// Đọc kết quả theo lối SO SÁNH, không theo ngưỡng tuyệt đối: bàn 4→7 người đang
// chạy thật ngoài production, nên bất cứ con số nào chúng đã sống chung được thì
// bàn 8 cũng sống được. Chỉ khi bàn 8 tệ HƠN mức 4→7 mới là việc của phase này.

import type { PlayerPublic } from "../lib/types";
import { MAX_PLAYERS } from "../lib/types";
import { AVATAR_COLORS, SEAT_GAP, layout, seatPositions } from "../components/three/scene/geometry";

// Chỗ rộng nhất của một figure: vai loe cylinderGeometry(shoulderR*1.12) với
// shoulderR = 0.25 → bán kính 0.28. Vành mũ 0.27 hẹp hơn một chút.
const FIGURE_R = 0.28;

// Đỉnh mũ figure hình khối — thứ cao nhất phải lọt khung, xem CROWN_Y_BLOCK.
const CROWN_Y = 0.85;

const SHIPPING = [3, 4, 5, 6]; // nOpp của bàn 4→7, tức những gì đang chạy thật
const NEW = 7; // nOpp của bàn 8

const deg = (rad: number) => (rad * 180) / Math.PI;
const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);

function fakeSeats(n: number): PlayerPublic[] {
  return Array.from({ length: n }, (_, seat) => ({ seat }) as PlayerPublic);
}

// Góc lệch so với trục ngắm mà một điểm đòi hỏi, tách ngang và dọc. Trục ngắm nằm
// trong mặt phẳng x=0 nên hệ camera chỉ xoay quanh trục x — không cần ma trận.
function offAxis(
  point: { x: number; y: number; z: number },
  cam: { y: number; z: number },
  targetZ: number,
) {
  const pitch = Math.atan2(cam.y, cam.z - targetZ);
  const dy = point.y - cam.y;
  const dz = point.z - cam.z;
  const forward = -(dz * Math.cos(pitch) + dy * Math.sin(pitch));
  const up = dy * Math.cos(pitch) - dz * Math.sin(pitch);
  return { h: Math.atan2(Math.abs(point.x), forward), v: Math.atan2(Math.abs(up), forward) };
}

interface Measured {
  nOpp: number;
  table: number;
  minGap: number;
  clearance: number;
  worstH: number;
  worstSeat: number;
  minAspect: number;
}

function measure(nOpp: number): Measured {
  const { felt, arc, camY, camZ, fov } = layout(nOpp);
  const positions = seatPositions(fakeSeats(nOpp + 1), 0, arc, felt);
  const opps = [...positions.entries()]
    .filter(([seat]) => seat !== 0)
    .map(([seat, v]) => ({ seat, x: v.x, z: v.z, ang: Math.atan2(v.z, v.x) }))
    .sort((a, b) => a.ang - b.ang);

  let minGap = Infinity;
  for (let i = 1; i < opps.length; i++) {
    minGap = Math.min(minGap, Math.hypot(opps[i - 1].x - opps[i].x, opps[i - 1].z - opps[i].z));
  }

  let worstH = 0;
  let worstSeat = -1;
  for (const o of opps) {
    const a = offAxis({ x: o.x, y: CROWN_Y, z: o.z }, { y: camY, z: camZ }, -felt * 0.12);
    if (a.h > worstH) {
      worstH = a.h;
      worstSeat = o.seat;
    }
  }
  // Khung hình phải rộng bao nhiêu lần chiều cao thì ghế lệch nhất mới lọt.
  const halfV = (fov * Math.PI) / 180 / 2;
  return {
    nOpp,
    table: nOpp + 1,
    minGap,
    clearance: minGap - FIGURE_R * 2,
    worstH,
    worstSeat,
    minAspect: Math.tan(worstH) / Math.tan(halfV),
  };
}

console.log(`figure rộng ${f2(FIGURE_R * 2)} → hai ghế phải cách nhau hơn ngần đó\n`);

const all = [...SHIPPING, NEW].map(measure);
for (const m of all) {
  const { ring, felt, arc, camY, camZ, fov } = layout(m.nOpp);
  console.log(`── bàn ${m.table} người (${m.nOpp} đối thủ)${m.nOpp === NEW ? "  ← MỚI" : ""}`);
  console.log(
    `   ring ${f2(ring)} · felt ${f2(felt)} · seatR ${f2(felt + SEAT_GAP)} · arc ${deg(arc).toFixed(0)}° · cam (0, ${f2(camY)}, ${f2(camZ)}) fov ${fov}°`,
  );
  console.log(
    `   ghế liền kề gần nhất ${f3(m.minGap)} → hở ${f3(m.clearance)} ${m.clearance > 0 ? "✓" : "✗ ĐÈ NHAU"}`,
  );
  console.log(
    `   ghế lệch trục nhiều nhất: seat ${m.worstSeat} ở ${deg(m.worstH).toFixed(1)}° → khung phải rộng ≥ ${f2(m.minAspect)}× chiều cao`,
  );
  console.log();
}

// ─── Kết luận: bàn 8 so với những bàn đang chạy thật ─────────────────────────
const ship = all.filter((m) => m.nOpp !== NEW);
const eight = all.find((m) => m.nOpp === NEW)!;
const tightestGap = Math.min(...ship.map((m) => m.minGap));
const widestNeed = Math.max(...ship.map((m) => m.minAspect));

console.log("── bàn 8 so với bàn 4→7 (đang chạy thật) ──");
console.log(
  `   khoảng ghế: ${f3(eight.minGap)} vs chật nhất hiện nay ${f3(tightestGap)} → ${
    eight.clearance > 0
      ? `còn hở ${f3(eight.clearance)}, KHÔNG đè nhau`
      : "✗ ĐÈ NHAU — phải chỉnh layout()"
  }`,
);
console.log(
  `   bề ngang khung: cần ${f2(eight.minAspect)}× vs rộng nhất hiện nay ${f2(widestNeed)}× → ${
    eight.minAspect <= widestNeed
      ? "KHÔNG đòi hỏi gì hơn, không có hồi quy khung hình"
      : "✗ đòi khung rộng hơn mọi bàn hiện có"
  }`,
);
console.log(
  `\n   Lưu ý: ${f2(widestNeed)}× là tỉ lệ khung hình bàn hiện tại VỐN đã đòi (điện thoại`,
);
console.log(
  `   dựng đứng ~0.46× thì ghế rìa đã nằm ngoài khung từ bàn 4 người). Đó là chuyện có`,
);
console.log(`   sẵn, không phải thứ bàn 8 gây ra — đừng sửa nó ở phase này.`);

// ─── Áo có phân biệt được không ──────────────────────────────────────────────
// Cùng lối đọc so sánh: cặp áo sát nhau nhất trong bảng đang chạy là chuẩn. Một màu
// mới cách xa hơn chuẩn đó thì nó dễ phân biệt hơn hai cái áo người chơi vốn đã sống
// chung được — không cần ngưỡng tuyệt đối nào.

const FELT_AND_ROOM = ["#2f7d47", "#246438", "#173f24", "#3a2a1a"]; // gradient nỉ + nền phòng

const srgbToLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16)));
  let X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [X, Z] = [f(X), f(Z)];
  const fy = f(Y);
  return [116 * fy - 16, 500 * (X - fy), 200 * (fy - Z)];
}

const deltaE = (a: string, b: string) =>
  Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

console.log("\n── áo có phân biệt được không ──");
console.log(
  `   ${AVATAR_COLORS.length} màu cho tối đa ${MAX_PLAYERS} chỗ → ${
    AVATAR_COLORS.length >= MAX_PLAYERS ? "✓ đủ" : "✗ THIẾU, sẽ có người mặc trùng áo"
  }`,
);

let closest = { d: Infinity, a: "", b: "" };
for (let i = 0; i < AVATAR_COLORS.length; i++) {
  for (let j = i + 1; j < AVATAR_COLORS.length; j++) {
    const d = deltaE(AVATAR_COLORS[i], AVATAR_COLORS[j]);
    if (d < closest.d) closest = { d, a: AVATAR_COLORS[i], b: AVATAR_COLORS[j] };
  }
}
console.log(`   cặp áo sát nhau nhất: ${closest.a} vs ${closest.b} → ΔE ${closest.d.toFixed(1)}`);

let toGround = { d: Infinity, shirt: "", ground: "" };
for (const shirt of AVATAR_COLORS) {
  for (const ground of FELT_AND_ROOM) {
    const d = deltaE(shirt, ground);
    if (d < toGround.d) toGround = { d, shirt, ground };
  }
}
console.log(
  `   áo chìm vào nền nhất: ${toGround.shirt} trên ${toGround.ground} → ΔE ${toGround.d.toFixed(1)}`,
);
