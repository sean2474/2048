import "server-only";
import { C2S } from "schema/in-game";
import { headers } from "next/headers";
import { HeaderLoading } from "./header";
import {
  HomeLoading,
  SettingsLoading,
  FindMatchLoading,
  FeedbackLoading,
  FriendsLoading,
  AchievementsLoading,
  LoadoutLoading,
  ShopLoading,
  SoloLoading,
  RulebookLoading,
  LeaderboardLoading,
} from "./route-skeletons";
import {
  CreateRoomLoading,
  JoinRoomLoading,
  OnlineLoading,
  RankedLoading,
  GameLoading,
  TutorialLoading,
  WatchLoading,
} from "./game-route-skeletons";
import {
  LoginLoading,
  SignupLoading,
  ForgotPasswordLoading,
  ResetPasswordLoading,
  TermsLoading,
  PrivacyLoading,
  AuthErrorLoading,
} from "./document-route-skeletons";
import HistoryLoading from "@/app/history/loading";

const routes = {
  "/": HomeLoading,
  "/settings": SettingsLoading,
  "/find-match": FindMatchLoading,
  "/feedback": FeedbackLoading,
  "/friends": FriendsLoading,
  "/achievements": AchievementsLoading,
  "/loadout": LoadoutLoading,
  "/shop": ShopLoading,
  "/solo": SoloLoading,
  "/how-to-play": RulebookLoading,
  "/tutorial": TutorialLoading,
  "/history": HistoryLoading,
  "/play/create": CreateRoomLoading,
  "/play/join": JoinRoomLoading,
  "/play/online": OnlineLoading,
  "/play/ranked": RankedLoading,
  "/login": LoginLoading,
  "/signup": SignupLoading,
  "/forgot-password": ForgotPasswordLoading,
  "/reset-password": ResetPasswordLoading,
  "/terms": TermsLoading,
  "/privacy": PrivacyLoading,
  "/auth/error": AuthErrorLoading,
};

// The initial account/provider boundary precedes Next's route-level boundaries.
// Reuse their exact server skeletons so hard loads and soft navigations agree.
// Middleware overwrites this layout hint; it is never used for authorization.
export async function SessionLoading() {
  const requestHeaders = await headers();
  const route = new URL(requestHeaders.get("x-2048-route") ?? "/", "http://loading.local");
  const path = route.pathname.replace(/\/$/, "") || "/";
  const gameId = /^\/play\/([^/]+)$/.exec(path)?.[1];
  const game = gameId && C2S.joinRoom.safeParse({ t: "joinRoom", roomId: gameId }).success;
  const Loading =
    routes[path as keyof typeof routes] ??
    (game ? GameLoading : /^\/watch\/[^/]+$/.test(path) ? WatchLoading : null);
  return (
    <>
      <HeaderLoading />
      {path === "/leaderboard" ? (
        <LeaderboardLoading solo={route.searchParams.get("mode") === "solo"} />
      ) : (
        Loading && <Loading />
      )}
    </>
  );
}
