// Ngôi sao cảnh sát trưởng, thay cho emoji 🤠. Không phải chọn cho đẹp: Sheriff là vai
// trung tâm của Bang! — ván nào cũng có đúng một người đeo nó, và cả bàn xoay quanh việc
// giữ hoặc hạ người đó. Emoji thì mỗi hệ điều hành vẽ một kiểu và không nhận theme.
//
// Toạ độ 10 đỉnh tính bằng lượng giác (R=44 đỉnh, r=18.5 lõm, quanh tâm 50,50), bi tròn
// ở mũi lùi vào 3 đơn vị để dính thân sao chứ không rời ra.

export function BrandMark({ size = 76 }: { size?: number }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Bang!"
    >
      <g fill="currentColor">
        <path d="M50.00 6.00L60.87 35.03L91.85 36.40L67.59 55.72L75.86 85.60L50.00 68.50L24.14 85.60L32.41 55.72L8.15 36.40L39.13 35.03Z" />
        <circle cx="50.00" cy="9.00" r="4.4" />
        <circle cx="88.99" cy="37.33" r="4.4" />
        <circle cx="74.10" cy="83.17" r="4.4" />
        <circle cx="25.90" cy="83.17" r="4.4" />
        <circle cx="11.01" cy="37.33" r="4.4" />
      </g>
      {/* Lỗ đạn giữa sao: vòng tròn khoét ngược bằng fill của nền, không phải một mesh
          riêng — nên nó luôn đúng màu dù sao đổi màu theo trạng thái. */}
      <circle cx="50" cy="46" r="7.2" fill="var(--bg)" opacity="0.55" />
    </svg>
  );
}
