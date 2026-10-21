import assert from "node:assert/strict";

export function percentile(values, proportion) {
  assert.ok(values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0));
  return [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.ceil(values.length * proportion) - 1)
  ];
}
export function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = [row.app, row.route, row.device, row.auth ? "account" : "guest", row.cache].join(
      " | ",
    );
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([key, samples]) => ({
    key,
    samples: samples.length,
    ...Object.fromEntries(
      [
        "ttfbMs",
        "loadMs",
        "headingMs",
        "observedDataReadyMs",
        "fcpMs",
        "lcpMs",
        "longTaskMs",
        "transferBytes",
      ].map((metric) => {
        const values = samples.map((sample) => sample[metric]).filter(Number.isFinite);
        return [
          metric,
          values.length ? { median: percentile(values, 0.5), p95: percentile(values, 0.95) } : null,
        ];
      }),
    ),
  }));
}

// Browser-only probe. Observer values are samples through the post-load readiness observation, not field Core Web Vitals.
export function installProbe() {
  window.__benchmark = { lcp: null, lcpCandidates: [], longTasks: [], errors: [], heading: null };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__benchmark.lcp = entry.startTime;
      window.__benchmark.lcpCandidates.push({
        at: entry.startTime,
        size: entry.size,
        tag: entry.element?.tagName ?? null,
        id: entry.element?.id ?? null,
        text: entry.element?.textContent?.trim().slice(0, 100) ?? null,
        url: entry.url || null,
      });
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      window.__benchmark.longTasks.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask", buffered: true });
  const heading = new MutationObserver(() => {
    const element = document.querySelector("main h1, h1");
    if (element && element.getClientRects().length) {
      window.__benchmark.heading = performance.now();
      heading.disconnect();
    }
  });
  heading.observe(document, { subtree: true, childList: true });
}
export function readMetrics() {
  const navigation = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  return {
    ttfbMs: navigation.responseStart - navigation.startTime,
    domContentLoadedMs: navigation.domContentLoadedEventEnd,
    loadMs: navigation.loadEventEnd,
    headingMs: window.__benchmark.heading,
    observedDataReadyMs: performance.now(),
    fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    lcpMs: window.__benchmark.lcp,
    lcpCandidates: window.__benchmark.lcpCandidates,
    longTaskMs: window.__benchmark.longTasks.reduce((sum, entry) => sum + entry.duration, 0),
    resourceCount: resources.length,
    transferBytes:
      navigation.transferSize + resources.reduce((sum, resource) => sum + resource.transferSize, 0),
    resourceBytesNote:
      "Cross-origin bytes without Timing-Allow-Origin are unavailable; resource count still includes them.",
  };
}
