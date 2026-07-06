import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bang!",
  description: "Game bài Viễn Tây Bang! chơi online",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
