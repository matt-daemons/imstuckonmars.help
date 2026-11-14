import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AnchoredToastProvider, ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Design system · I'm stuck on Mars",
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AnchoredToastProvider>{children}</AnchoredToastProvider>
    </ToastProvider>
  );
}
