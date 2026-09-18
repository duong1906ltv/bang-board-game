// Mặt bài toàn chữ, cho những lá chưa có tranh.
//
// 22 trong 44 loại lá không có ảnh lẫn vector — đúng bằng phần Dodge City. Trước đây
// chúng rơi về emoji 🂠, nên hai chục lá khác nhau nhìn y hệt nhau và trông như thiếu
// sót. Bài in toàn chữ là một cách trình bày có thật, và nó phân biệt được từng lá.
//
// Tên lá cũng đang nằm ở .pc-name phía trên, nên khi mặt chữ này bật thì phần đó tắt —
// một cái tên in hai lần trên cùng một lá không phải thiết kế, là lỗi.

// Chiều rộng/cao còn lại của ô art sau khi trừ padding, đọc từ globals.css:
//   md: thẻ 104×150, padding 7 + viền trong 3 → rộng 84
//   sm: thẻ 72×104,  padding 5 + viền trong 2 → rộng 58
// Chiều cao là phần .pc-center thực nhận sau khi tên và dòng hiệu ứng đã lấy phần.
//   lg: thẻ nhân vật 168×226, ô art cao 132 (đặt cứng trong CharacterFace)
const BOX = { md: { w: 84, h: 62 }, sm: { w: 58, h: 44 }, lg: { w: 140, h: 118 } } as const;

// Bề rộng trung bình một ký tự chữ hoa serif đậm ≈ 0.62 lần cỡ chữ. Trần trên để tên
// ngắn ("BIA") không phình thành biển hiệu.
const ADVANCE = 0.62;
const CAP = { md: 21, sm: 15, lg: 34 } as const;

export function CardTextFace({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  const box = BOX[size];
  const longest = Math.max(...words.map((w) => w.length), 1);

  // Vừa bề ngang theo từ dài nhất, VÀ vừa bề dọc theo số dòng. Lấy cái nhỏ hơn — thiếu
  // một trong hai phép là chữ tràn ra ngoài khung.
  const byWidth = box.w / (longest * ADVANCE);
  const byHeight = box.h / (words.length * 1.06);
  const px = Math.min(CAP[size], byWidth, byHeight);

  return (
    <span className="pc-textface" style={{ fontSize: `${px.toFixed(1)}px` }}>
      {words.map((w, i) => (
        <span key={i}>{w}</span>
      ))}
    </span>
  );
}
