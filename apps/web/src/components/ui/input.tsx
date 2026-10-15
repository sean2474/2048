"use client";
import { useI18n } from "ui/i18n";

import { ChangeEventHandler, FocusEventHandler, PropsWithChildren } from "react";

interface InputProps {
  label: string;
  value?: string;
  readOnly?: boolean;
  name: string;
  type: string;
  className?: string;
  defaultValue?: string;
  maxLength?: number;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  bgColor?: string;
}

export const Input = (props : InputProps & PropsWithChildren) => {
  const { t } = useI18n();
  return (
    <div className={`relative grid gap-2 ${props.className || ""}`}>
      <label htmlFor={props.name} className="text-sm font-semibold">{t(props.label)}</label>
      <input
        onChange={props.onChange}
        type={props.type}
        id={props.name}
        name={props.name}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        className={`h-12 w-full rounded-xl border bg-background/40 px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 ${props.children ? "pr-14" : ""}`}
        style={props.bgColor ? { backgroundColor: props.bgColor } : undefined}
        value={props.value}
        defaultValue={props.defaultValue}
        maxLength={props.maxLength}
        readOnly={props.readOnly}
      />
      {props.children}
    </div>
  );
}
