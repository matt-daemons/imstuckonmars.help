import type { Metadata } from "next";
import {
  Atkinson_Hyperlegible_Next,
  IBM_Plex_Sans_Condensed,
  JetBrains_Mono,
} from "next/font/google";

import { cn } from "@/lib/utils";
import { ExpeditionProvider } from "@/components/expedition/expedition-provider";

import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-sans",
});
const plexCondensed = IBM_Plex_Sans_Condensed({
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
        atkinson.variable,
        plexCondensed.variable,
        jetbrainsMono.variable,
      )}
    >
      <body>
        <ExpeditionProvider>{children}</ExpeditionProvider>
      </body>
    </html>
  );
}
