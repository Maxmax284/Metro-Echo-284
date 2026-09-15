import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReveal } from "./useReveal";

/** One column of readable width, revealed once when it arrives. */
export function Section({
  children,
  className,
  label,
  id,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  id?: string;
}) {
  const { ref, shown } = useReveal(0.15);
  return (
    <section
      id={id}
      ref={ref}
      className={cn(
        "mx-auto w-full max-w-2xl px-5 py-16 transition-all duration-[var(--motion-slow)] ease-out sm:py-24",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className,
      )}
    >
      {label ? (
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
      ) : null}
      {children}
    </section>
  );
}

export function Line({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-base leading-relaxed text-muted-foreground", className)}>{children}</p>;
}

export function Head({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-balance text-2xl font-semibold tracking-tight sm:text-3xl", className)}>{children}</h2>
  );
}
