import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interaugh ｜ 世界を、巻き込む",
  description:
    "Interaugh（インタラフ）— Web3と日本のものづくりで、日本の才能を世界の舞台へ。Nチケ・KATAOMOI・CryptoWashiを展開。",
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
