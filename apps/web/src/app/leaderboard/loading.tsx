import { headers } from "next/headers";
import { LeaderboardLoading } from "@/components/widget/route-skeletons";

export default async function Loading() {
  const route = new URL((await headers()).get("x-2048-route") ?? "/leaderboard", "http://loading.local");
  return <LeaderboardLoading solo={route.searchParams.get("mode") === "solo"} />;
}
