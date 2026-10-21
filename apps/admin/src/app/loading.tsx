import ConsoleLoading from "./(console)/loading";

// This boundary also covers the console layout's permission lookup.
export default function Loading() {
  return <main className="mx-auto max-w-7xl px-4 py-6 sm:p-8 lg:p-10"><ConsoleLoading /></main>;
}
