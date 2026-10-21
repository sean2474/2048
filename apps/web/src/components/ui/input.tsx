"use client";
import { useI18n } from "ui/i18n";

import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  type: string;
}

export const Input = ({ label, className, children, ...props }: InputProps) => {
  const { t } = useI18n();
  return (
    <div className={`relative grid gap-2 ${className || ""}`}>
      <label htmlFor={props.id ?? props.name} className="text-sm font-semibold">
        {t(label)}
      </label>
      <input
        {...props}
        id={props.id ?? props.name}
        className={`h-12 w-full rounded-xl border bg-background/40 px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${children ? "pr-14" : ""}`}
      />
      {children}
    </div>
  );
};
