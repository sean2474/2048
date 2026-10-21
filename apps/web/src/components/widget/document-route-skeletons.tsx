import "server-only";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/components/widget/page-heading";
import { LoadingAction, LoadingFrame } from "./route-skeletons";
import { getRequestI18n } from "@/lib/i18n/server";

type AuthMode = "login" | "signup" | "forgot-password" | "reset-password";
async function AuthLoading({ mode }: { mode: AuthMode }) {
  const { t } = await getRequestI18n();
  const title = {
    login: "Log in",
    signup: "Create an account",
    "forgot-password": "Reset password",
    "reset-password": "Choose a new password",
  }[mode];
  const description = {
    login: "Log in to save your games and play ranked.",
    signup: undefined,
    "forgot-password": "We’ll email you a link to choose a new password.",
    "reset-password": "Use a password you haven’t used on this account before.",
  }[mode];
  const fields = mode === "signup" ? 3 : mode === "forgot-password" ? 1 : 2;
  return (
    <LoadingFrame
      route={mode}
      label={t("Loading selection…")}
      className="mx-auto w-full max-w-[480px] px-4 py-6 sm:py-10"
    >
      {mode !== "reset-password" && <Skeleton className="mb-5 h-11 w-32" />}
      <div className="mb-6">
        <PageHeading
          icon={mode === "signup" ? "crown" : "profile"}
          title={t(title)}
          description={description && t(description)}
        />
      </div>
      <section className="space-y-6 game-panel bg-card p-6 sm:p-8">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
        <LoadingAction className="w-full" />
        {(mode === "login" || mode === "signup") && (
          <>
            <Skeleton className="mx-auto h-5 w-48 max-w-full" />
            <LoadingAction className="w-full" />
          </>
        )}
      </section>
    </LoadingFrame>
  );
}
export function LoginLoading() {
  return <AuthLoading mode="login" />;
}
export function SignupLoading() {
  return <AuthLoading mode="signup" />;
}
export function ForgotPasswordLoading() {
  return <AuthLoading mode="forgot-password" />;
}
export function ResetPasswordLoading() {
  return <AuthLoading mode="reset-password" />;
}

async function LegalLoading({ privacy = false }: { privacy?: boolean }) {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route={privacy ? "privacy" : "terms"}
      label={t("Loading selection…")}
      className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-10"
    >
      <h1 className="text-3xl font-bold tracking-tight">
        {t(privacy ? "Privacy policy" : "Terms of use")}
      </h1>
      <Skeleton className="h-14 w-full" />
      {[0, 1, 2].map((index) => (
        <section key={index} className="space-y-3">
          <Skeleton className="h-7 w-48" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((line) => (
              <Skeleton key={line} className={`h-4 ${line === 3 ? "w-3/4" : "w-full"}`} />
            ))}
          </div>
        </section>
      ))}
    </LoadingFrame>
  );
}
export function TermsLoading() {
  return <LegalLoading />;
}
export function PrivacyLoading() {
  return <LegalLoading privacy />;
}

export async function AuthErrorLoading() {
  const { t } = await getRequestI18n();
  return (
    <LoadingFrame
      route="auth/error"
      label={t("Loading selection…")}
      className="mx-auto max-w-[520px] px-4 py-8 sm:py-12"
    >
      <section className="space-y-5 game-panel bg-card p-6 shadow-sm sm:p-8">
        <Skeleton className="size-16" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-28 w-full" />
        <LoadingAction className="w-full" />
      </section>
    </LoadingFrame>
  );
}
