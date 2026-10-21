"use client";
import { useSyncExternalStore } from "react";
import { useI18n } from "ui/i18n";

const subscribe = () => () => {};
export function MatchTime({
  value,
  dateOnly = false,
  className,
}: {
  value: string;
  dateOnly?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = dateOnly
    ? { dateStyle: "short" }
    : { dateStyle: "short", timeStyle: "short" };
  const text = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat(locale, options).format(date),
    () => new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(date) + " UTC",
  );
  return (
    <time dateTime={value} className={className}>
      {text}
    </time>
  );
}
