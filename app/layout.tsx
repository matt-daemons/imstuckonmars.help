import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { cn } from "@/lib/utils";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "I'm stuck on Mars",
  metadataBase: new URL("https://imstuckonmars.help"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans antialiased", inter.variable, geistMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
