import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 active:bg-indigo-800",
  secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
  outline: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  destructive: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  success: "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800",
  warning: "bg-amber-400 text-slate-950 shadow-sm hover:bg-amber-500",
} as const;

/** D-17: на телефоне и планшете (< lg) все кнопки не ниже 44 px; на ПК — прежняя плотность. */
const SIZES = {
  sm: "h-11 lg:h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-11 lg:h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
  icon: "size-11 lg:size-10 rounded-lg",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
  loading?: boolean;
}

export function buttonClasses(variant: ButtonVariant = "default", size: keyof typeof SIZES = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", loading = false, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
