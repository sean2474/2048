import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/widget/page-heading";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "@/components/widget/feedback-form";
import { getI18n } from "@/lib/i18n/server";
export default async function FeedbackPage() {
  const { t } = await getI18n();
  return <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
    <div className="mb-6"><PageHeading icon="feedback" title={t("Bugs & feedback")} description={t("Tell us what went wrong or what could be better.")}><Button asChild variant="outline"><Link href="/settings"><ArrowLeft aria-hidden="true" />{t("Settings")}</Link></Button></PageHeading></div>
    <FeedbackForm />
  </main>;
}
