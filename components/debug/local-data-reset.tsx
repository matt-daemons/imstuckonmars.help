"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleX } from "lucide-react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ResetCode } from "@/lib/debug/reset-code";
import { isEditingElement } from "@/lib/debug/shortcut";
import { resetBrowserData } from "@/lib/browser-data";

export function LocalDataReset({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const code = new ResetCode();
    const keydown = (event: KeyboardEvent) => {
      if (
        open ||
        event
          .composedPath()
          .some((target) => target instanceof Element && isEditingElement(target)) ||
        isEditingElement(document.activeElement) ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        code.reset();
        return;
      }
      if (!code.press(event, performance.now())) return;
      event.preventDefault();
      previousFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setError(null);
      setOpen(true);
    };
    const abandon = () => code.reset();
    window.addEventListener("keydown", keydown);
    window.addEventListener("blur", abandon);
    document.addEventListener("visibilitychange", abandon);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("blur", abandon);
      document.removeEventListener("visibilitychange", abandon);
    };
  }, [open]);

  useEffect(() => {
    if (!resetting) return;
    void resetBrowserData(window)
      .then(() => window.location.reload())
      .catch((cause) => {
        setError(
          cause instanceof Error
            ? cause.message
            : "Local data could not be cleared. Check browser storage permissions and retry.",
        );
        setResetting(false);
      });
  }, [resetting]);

  return (
    <>
      {!resetting && children}
      <LocalDataResetDialog
        open={open}
        onOpenChange={setOpen}
        resetting={resetting}
        error={error}
        onReset={() => setResetting(true)}
        finalFocus={() => previousFocus.current}
      />
    </>
  );
}

export function LocalDataResetDialog({
  open,
  onOpenChange,
  resetting,
  error,
  onReset,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resetting: boolean;
  error: string | null;
  onReset: () => void;
  finalFocus?: () => HTMLElement | null;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!resetting) onOpenChange(value);
      }}
    >
      <AlertDialogPopup data-hazard initialFocus={() => cancel.current} finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset local data?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete saved simulation reports, training progress, the wake-word preference, this
            tab&apos;s mission session and the sidebar preference, then reload. This cannot be
            undone. Server missions and NASA data are not deleted. Other tabs keep their active
            mission sessions.
          </AlertDialogDescription>
          {error && (
            <p role="alert" className="flex items-start gap-2 text-destructive-foreground">
              <CircleX aria-hidden className="size-5 shrink-0" />
              {error}
            </p>
          )}
          <p role="status">{resetting ? "Resetting local data…" : ""}</p>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button ref={cancel} variant="outline" disabled={resetting} />}>
            Cancel
          </AlertDialogClose>
          <Button variant="destructive" disabled={resetting} onClick={onReset}>
            Reset local data
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
