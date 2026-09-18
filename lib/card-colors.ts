// Màu viền và khung gỗ của từng loại lá.
//
// Sống ở lib/ vì lá bài được vẽ ở HAI nơi bằng hai công nghệ khác nhau: PlayingCard.tsx
// dựng bằng CSS cho lá trên tay, CardMesh.tsx dựng bằng canvas cho lá trên bàn 3D. Chép
// tay hai bảng màu là chuyện sớm muộn cũng lệch, và lúc đó cùng một lá đọc ra như hai lá
// khác nhau tuỳ nó đang nằm đâu.
//
// Ba nấc gỗ giữ đúng thứ tự sáng→tối→trung của bản gốc, chỉ kéo sắc sang màu của loại:
// tô phẳng một màu thì mất vân và lá trông như miếng nhựa.
import type { CardKind } from "./cards";

export interface KindPalette {
  accent: string; // vòng viền quanh ruột giấy
  wood: [string, string, string]; // ba nấc của khung gỗ, theo hướng gradient
}

// Đo bằng ΔE chứ không bằng mắt: cặp sát nhau nhất là nâu↔súng 51.1, thừa ngưỡng 40
// "rõ ràng khác nhau". Đo lại nếu đổi màu.
export const KIND_PALETTE: Record<CardKind, KindPalette> = {
  brown: { accent: "#a06a2c", wood: ["#8a5c2c", "#55381a", "#6b471f"] },
  blue: { accent: "#3b82f6", wood: ["#3f5f86", "#22354d", "#2f4a68"] },
  green: { accent: "#e3c50b", wood: ["#8a7420", "#4a3d0f", "#6b5a18"] },
  gun: { accent: "#8a8f98", wood: ["#6a6f78", "#3a3e46", "#50555d"] },
};

// Nhân vật không phải một CardKind — nó là thẻ riêng, nhưng dùng chung cách dựng mặt lá.
export const CHARACTER_PALETTE: KindPalette = {
  accent: "#a855f7",
  wood: ["#6b4a8a", "#3c2a52", "#513a6b"],
};

export const paletteFor = (kind: CardKind | undefined): KindPalette =>
  KIND_PALETTE[kind ?? "brown"] ?? KIND_PALETTE.brown;
