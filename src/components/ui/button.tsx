import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sw-blue text-white hover:bg-sw-blue-dark disabled:bg-sw-blue/60",
  secondary: "border border-ink bg-white text-ink hover:bg-panel disabled:opacity-60",
  ghost: "text-ink underline-offset-4 hover:underline disabled:opacity-60",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm font-semibold whitespace-nowrap",
    "transition-colors active:translate-y-px disabled:cursor-not-allowed",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}
