import type { ReactNode } from "react";

/** The original console frame: tinted title rail, cyan rule, square black surface. */
export function ConsolePane({
  id,
  number,
  title,
  detail,
  className = "",
  children,
}: {
  id: string;
  number: string;
  title: string;
  detail?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`hb-pane ${className}`}
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
    >
      <header className="hb-panel-heading">
        <span className="hb-pane-number" aria-hidden>
          {number}
        </span>
        <h2 id={`${id}-title`}>{title}</h2>
        <span className="hb-heading-rule" aria-hidden />
        {detail && <span className="hb-pane-label">{detail}</span>}
      </header>
      {children}
    </section>
  );
}
