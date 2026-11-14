import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";

import { cn } from "@/lib/utils";

import "./globals.css";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "I'm stuck on Mars",
  metadataBase: new URL("https://imstuckonmars.help"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // The Hermes theme is dark only; `dark` also enables coss's dark-surface tweaks.
      className={cn(
        "dark font-sans antialiased",
        barlow.variable,
        barlowCondensed.variable,
        jetbrainsMono.variable,
      )}
    >
      <body>{children}</body>
    </html>
  );
}
