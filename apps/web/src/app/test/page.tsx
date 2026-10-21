import { ObstacleLab } from "./obstacle-lab";

export default function TestPage() {
  return <main className="mx-auto max-w-xl px-4 py-8 bg-[var(--color-bg)] text-[var(--color-text)]">
    <h1 className="mb-4 text-2xl font-bold">2048 - Obstacle Test</h1>
    <ObstacleLab instructions={<div className="mt-2 text-xs text-[var(--color-text-subtle)] space-y-1">
      <p>• <strong>X Block (✖)</strong>: 움직이지만 합쳐지지 않음</p>
      <p>• <strong>HardBlock (🚫)</strong>: 움직이지도 합쳐지지도 않음</p>
    </div>} />
  </main>;
}
