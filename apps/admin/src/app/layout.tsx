import type { Metadata } from "next";
import { I18nProvider } from "ui/i18n";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("2048 Duo Admin"), description: t("Game balance and player administration"), robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await getI18n();
  return <html lang={locale}><body className="antialiased"><I18nProvider initialLocale={locale} messages={messages}>{children}</I18nProvider></body></html>;
}
