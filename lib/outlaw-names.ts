// Biệt danh phát cho người chưa tự đặt tên.
//
// Không bắt gõ tên là bớt được một bước trước khi vào bàn, nhưng "Người chơi 1" thì thà
// đừng đặt còn hơn. Được phát một biệt danh tay súng là một nghi thức hợp với game này —
// và nó gợi ý luôn kiểu tên nên đặt nếu muốn tự sửa.
//
// Hai danh sách riêng chứ không dịch qua lại: chơi chữ trong tiếng Việt ("Sáu Ngón",
// "Út Nhanh Tay") dịch sang tiếng Anh là mất, và ngược lại.

const VI = [
  "Bill Cà Nhắc", "Ba Đạn", "Tư Sẹo", "Năm Móm",
  "Joe Lì", "Sáu Ngón", "Hai Súng", "Bảy Râu",
  "Út Nhanh Tay", "Lão Mắt Kính", "Tám Lạnh", "Cọp Xám",
  "Ngựa Hoang", "Mười Đen", "Chín Cụt", "Tư Ria",
];

const EN = [
  "Limping Bill", "Three-Shot Joe", "Scarface Sam", "Toothless Ned",
  "Quickdraw Kate", "Six-Finger Sal", "Two-Gun Tom", "Whiskers Pete",
  "Grey Cougar", "Wild Horse", "Black Ten", "Stump Charlie",
  "Cold Hannah", "Squint McGraw", "Ace Mulligan", "Dust Devil",
];

// `avoid` để bấm xúc xắc lần nào cũng ra tên khác — trúng lại đúng tên đang hiện thì
// người bấm tưởng nút hỏng.
export function randomOutlawName(locale: string, avoid?: string): string {
  const pool = locale === "en" ? EN : VI;
  const choices = avoid ? pool.filter((n) => n !== avoid) : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}
