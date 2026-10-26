"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ title }: { title: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Button
          variant="ghost"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.close();
          }}
        >
          <ArrowLeft /> Назад
        </Button>
        <p className="hidden truncate text-sm font-medium text-slate-600 sm:block">{title}</p>
        <Button onClick={() => window.print()}>
          <Printer /> Печать / PDF
        </Button>
      </div>
    </div>
  );
}
