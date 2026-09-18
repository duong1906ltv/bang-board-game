// Distinct shirt colors so seated players read apart. Indexed by `i % length`, so the
// list must be at least MAX_PLAYERS long — at 7 entries a table of 8 dressed two people
// alike and there was no other way to tell them apart on the felt.
//
// Vàng #f1c40f là màu thứ 8, chọn bằng ΔE chứ không bằng mắt: nó cách màu áo gần nhất
// 56.9, trong khi cặp sát nhau nhất trong 7 màu cũ (#c0392b đỏ vs #d35400 cam) chỉ cách
// nhau 24.5 — tức áo mới còn dễ phân biệt hơn hai áo vốn đã sống chung được. Cách nỉ
// xanh 77.8, xa nhất trong cả bảng. Đo lại bằng scripts/check-table-readability.ts nếu đổi.
//
// Sống ở lib/ chứ không trong scene/geometry.ts vì màn home cũng dùng bảng này, mà
// geometry.ts import three — kéo cả three.js vào trang chủ chỉ để lấy 8 chuỗi hex.
export const AVATAR_COLORS = [
  "#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#c39bd3", "#f1c40f",
];
