export function isDebugShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "shiftKey"
    | "ctrlKey"
    | "altKey"
    | "metaKey"
    | "repeat"
    | "isComposing"
    | "defaultPrevented"
  >,
): boolean {
  return (
    event.key.toLowerCase() === "d" &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.repeat &&
    !event.isComposing &&
    !event.defaultPrevented
  );
}

export function isEditingElement(element: Element | null): boolean {
  return !!element?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"], [role="listbox"], [data-debug-shortcuts="off"]',
  );
}
