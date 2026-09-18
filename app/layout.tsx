import type { Metadata, Viewport } from "next";
import { Rye } from "next/font/google";
import "./globals.css";

// Chỉ dùng cho chữ "Bang!" ở màn chờ, không phải font nền của cả app: Rye là mặt chữ
// display kiểu bảng hiệu Viễn Tây, đọc dài thì mỏi và nó không có bộ chữ tiếng Việt.
// Buộc vào biến CSS nên chỗ nào cần thì gọi qua .brand, không rò ra chỗ khác.
const rye = Rye({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-brand" });

export const metadata: Metadata = {
  title: "Bang!",
  description: "Game bài Viễn Tây Bang! chơi online",
};

// The 3D table is touch-driven and full-bleed: pin the scale and cover the notch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={rye.variable}>
      <body>{children}</body>
    </html>
  );
}
