import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });
const jetbrains = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin", "cyrillic"] });



export const metadata: Metadata = {
  title: "Shifru — Цепочечное шифрование",
  description: "Цепочечное шифрование данных с уникальными ключами на каждый чат. Квантово-устойчивое. Открытый API.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrains.variable} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}