import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interaugh | スマート名刺で、ビジネスの可能性を最大化する",
  description:
    "Interaughのスマート名刺サービスLP。NFC × AIで名刺交換後の導線を最適化し、ビジネスの可能性を広げます。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
