import { InvestigationList } from "@/components/investigation-list";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <InvestigationList kind="audit" search={await searchParams} />;
}
