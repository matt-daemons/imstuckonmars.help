"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { isDebugShortcut, isEditingElement } from "@/lib/debug/shortcut";
import "./debug-menu.css";

export type DebugSection = { title: string; rows: { label: string; value: string | number }[] };

export function DebugMenu({
  page,
  readSections,
  shortcut = true,
  controls,
}: {
  page: string;
  readSections: () => DebugSection[];
  shortcut?: boolean;
  controls?: ReactNode;
}) {
  const owner = useRef<HTMLSpanElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const read = useRef(readSections);
  read.current = readSections;
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<DebugSection[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const refresh = () => {
    setSections(read.current());
    setCopied(false);
    setCopyError(false);
  };

  useEffect(() => {
    if (!shortcut) return;
    const keydown = (event: KeyboardEvent) => {
      if (!isDebugShortcut(event)) return;
      const path = event.composedPath();
      if (
        path.some((target) => target instanceof Element && isEditingElement(target)) ||
        isEditingElement(document.activeElement)
      )
        return;
      const owners = [...document.querySelectorAll("[data-debug-owner]")];
      if (owners.at(-1) !== owner.current) return;
      const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
      const topDialog = dialogs.at(-1);
      if (
        topDialog &&
        !topDialog.contains(owner.current) &&
        !topDialog.matches("[data-debug-dialog]")
      )
        return;
      event.preventDefault();
      if (!open)
        previousFocus.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen((value) => !value);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [open, shortcut]);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ page, sections }, null, 2));
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <>
      <span ref={owner} data-debug-owner={shortcut ? page : undefined} hidden />
      {!shortcut && (
        <Button
          variant="outline"
          onClick={() => {
            previousFocus.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setOpen(true);
          }}
        >
          Open debug menu
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup
          data-debug-dialog
          className="debug-menu"
          bottomStickOnMobile={false}
          finalFocus={() => previousFocus.current}
        >
          <DialogHeader>
            <DialogTitle>Debug menu · {page}</DialogTitle>
            <DialogDescription>
              {controls
                ? "Diagnostics and debug controls. Shift+D toggles this panel."
                : "Read-only diagnostics. Shift+D toggles this panel."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {controls}
            {sections.map((section) => (
              <section key={section.title} className="debug-section">
                <h3>{section.title}</h3>
                <dl>
                  {section.rows.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <section className="debug-section">
              <h3>Browser</h3>
              <dl>
                <div>
                  <dt>Viewport</dt>
                  <dd>
                    {typeof window === "undefined"
                      ? "Unavailable"
                      : `${window.innerWidth} × ${window.innerHeight} CSS px`}
                  </dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>
                    {typeof navigator === "undefined"
                      ? "Unavailable"
                      : navigator.onLine
                        ? "Online"
                        : "Offline"}
                  </dd>
                </div>
              </dl>
            </section>
          </DialogPanel>
          <DialogFooter>
            <span role="status">
              {copyError
                ? "Copy failed. Select the values to copy manually."
                : copied
                  ? "Diagnostics copied"
                  : ""}
            </span>
            <Button variant="outline" onClick={refresh}>
              Refresh
            </Button>
            <Button variant="outline" onClick={() => void copy()}>
              Copy diagnostics
            </Button>
            <DialogClose render={<Button variant="secondary" />}>Close</DialogClose>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
