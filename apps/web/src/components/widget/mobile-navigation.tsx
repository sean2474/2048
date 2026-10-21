"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "ui/i18n";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type NavigationLink = { href: string; label: string };

export function MobileNavigation({
  label,
  links,
  authLinks,
}: {
  label: string;
  links: NavigationLink[];
  authLinks: NavigationLink[];
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  function item({ href, label: itemLabel }: NavigationLink, index: number) {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        onNavigate={() => setOpen(false)}
        data-analytics-link={href}
        aria-current={active ? "page" : undefined}
        data-active={active}
        className="group flex min-h-16 items-center gap-5 rounded-xl px-3 py-3 text-foreground transition-colors hover:bg-foreground/5 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[active=true]:text-primary"
      >
        <span
          aria-hidden="true"
          className="w-5 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 text-[clamp(1.5rem,7vw,2rem)] font-semibold leading-tight tracking-tight">
          {itemLabel}
        </span>
        <ArrowUpRight
          className="size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[active=true]:opacity-100"
          aria-hidden="true"
        />
      </Link>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          className="size-11 shrink-0 rounded-xl lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex h-dvh w-full flex-col pt-[env(safe-area-inset-top)] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none lg:hidden"
        >
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <div className="mx-auto flex w-full max-w-xl shrink-0 items-center justify-between gap-4 px-6 py-5 sm:px-8">
            <Link
              href="/"
              onNavigate={() => setOpen(false)}
              data-analytics-link="/"
              aria-label={t("2048 Duo home")}
              className="inline-flex min-h-11 items-center rounded-lg text-lg font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              2048<span className="font-medium">{t("Duo")}</span>
            </Link>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("Close")}
                className="size-11 rounded-full bg-foreground/5 hover:bg-foreground/10"
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <nav
            aria-label={label}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8"
          >
            <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center py-4">
              <p
                aria-hidden="true"
                className="mb-4 px-3 text-xs font-medium tracking-widest text-muted-foreground"
              >
                {label}
              </p>
              <div className="space-y-1">{links.map(item)}</div>
            </div>
          </nav>
          {authLinks.length > 0 && (
            <div className="mx-auto grid w-full max-w-xl shrink-0 grid-cols-2 gap-3 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8">
              {authLinks.map(({ href, label: itemLabel }, index) => (
                <Button
                  key={href}
                  asChild
                  variant={index === 0 ? "outline" : "default"}
                  className="min-h-12 rounded-xl"
                >
                  <Link
                    href={href}
                    onNavigate={() => setOpen(false)}
                    data-analytics-link={href}
                    aria-current={pathname === href ? "page" : undefined}
                  >
                    {itemLabel}
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
