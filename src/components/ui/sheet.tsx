"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Ширина панели на ПК. */
  size?: "md" | "lg";
}

/**
 * Адаптивная выдвижная панель: снизу (bottom sheet) на телефоне/планшете,
 * справа (slide-over) на ПК. Esc и клик по фону закрывают, фокус переносится внутрь.
 */
export function Sheet({ open, onClose, title, description, children, footer, size = "md" }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="animate-fade absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "animate-sheet absolute flex flex-col bg-white shadow-2xl outline-none",
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl",
          "lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:rounded-none",
          size === "lg" ? "lg:w-[640px]" : "lg:w-[480px]",
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 lg:hidden" aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && <div className="mt-0.5 text-sm text-slate-500">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex size-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Закрыть"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom shrink-0 border-t border-slate-100 bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
