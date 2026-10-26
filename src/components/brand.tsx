import { Container } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandProps {
  className?: string;
  inverted?: boolean;
}

export function Brand({ className, inverted = false }: BrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/50">
        <Container className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className={cn("block text-sm font-semibold tracking-tight", inverted ? "text-white" : "text-slate-900")}>Экспортэксперт</span>
        <span className={cn("block font-mono text-[10px] tracking-widest uppercase", inverted ? "text-indigo-300" : "text-indigo-600")}>
          Fleet · SOC
        </span>
      </span>
    </div>
  );
}
