"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
export function QuerySelect({ name, value, options, className }: { name: string; value: string; options: { value: string; label: string }[]; className?: string }) {
  const router = useRouter(), pathname = usePathname(), current = useSearchParams();
  const [pending, startTransition] = useTransition();
  return <select name={name} className={className} value={value} disabled={pending} aria-busy={pending} onChange={event => {
    const params = new URLSearchParams(current);
    params.set(name, event.target.value); params.delete("offset");
    startTransition(() => router.replace(`${pathname}?${params}`));
  }}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
}
