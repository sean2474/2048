// Server-rendered SVG/HTML charts for the admin overview. Values are always labeled directly,
// so color never carries meaning alone; each chart also renders a screen-reader table.

// Validated categorical palette (light surface): fixed slot order, never cycled.
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;

type Column = { label: string; value: number; title?: string };

export function ColumnChart({ columns, title, locale, valueLabel }: { columns: Column[]; title: string; locale: string; valueLabel: string }) {
  const width = 640, height = 180, left = 36, bottom = 24, top = 8;
  const plotWidth = width - left - 8, plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...columns.map(column => column.value));
  const step = plotWidth / Math.max(1, columns.length);
  const bar = Math.max(2, Math.min(28, step - 2));
  const labelEvery = Math.max(1, Math.ceil(columns.length / 8));
  const gridValues = [maximum, maximum / 2];
  return <figure className="space-y-3">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="h-auto w-full text-muted-foreground">
      {gridValues.map(value => {
        const y = top + plotHeight - (value / maximum) * plotHeight;
        return <g key={value}><line x1={left} x2={width - 8} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.18" strokeDasharray={value === maximum ? undefined : "2 4"} /><text x={left - 6} y={y + 4} textAnchor="end" fontSize="10" fill="currentColor">{Math.round(value).toLocaleString(locale)}</text></g>;
      })}
      <line x1={left} x2={width - 8} y1={top + plotHeight} y2={top + plotHeight} stroke="currentColor" strokeOpacity="0.4" />
      {columns.map((column, index) => {
        const x = left + index * step + (step - bar) / 2;
        const barHeight = (column.value / maximum) * plotHeight;
        const y = top + plotHeight - barHeight;
        const radius = Math.min(4, bar / 2, barHeight);
        return <g key={column.label}>
          <title>{column.title ?? `${column.label}: ${column.value.toLocaleString(locale)}`}</title>
          {barHeight > 0 && <path d={`M${x} ${top + plotHeight} V${y + radius} Q${x} ${y} ${x + radius} ${y} H${x + bar - radius} Q${x + bar} ${y} ${x + bar} ${y + radius} V${top + plotHeight} Z`} fill={SERIES_COLORS[0]} />}
          <rect x={left + index * step} y={top} width={step} height={plotHeight} fill="transparent" />
          {index % labelEvery === 0 && <text x={x + bar / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="currentColor">{column.label}</text>}
        </g>;
      })}
    </svg>
    <table className="sr-only"><caption>{title}</caption><thead><tr><th scope="col">{title}</th><th scope="col">{valueLabel}</th></tr></thead><tbody>{columns.map(column => <tr key={column.label}><th scope="row">{column.label}</th><td>{column.value.toLocaleString(locale)}</td></tr>)}</tbody></table>
  </figure>;
}

export function BarList({ rows, locale, color = SERIES_COLORS[0] }: { rows: { label: string; count: number }[]; locale: string; color?: string }) {
  const maximum = Math.max(1, ...rows.map(row => row.count));
  return <ul className="max-h-80 space-y-4 overflow-y-auto">{rows.map(row => <li key={row.label} className="text-xs">
    <div className="flex justify-between gap-4"><span className="text-muted-foreground">{row.label}</span><span className="font-semibold tabular-nums">{row.count.toLocaleString(locale)}</span></div>
    <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-1.5 rounded-full" style={{ width: `${row.count / maximum * 100}%`, backgroundColor: color }} /></div>
  </li>)}</ul>;
}

export type RateRow = { key: string; label: string; wins: number; samples: number; color: string; detail?: string };
export const MIN_RATE_SAMPLES = 5;

export function RateBars({ rows, locale, sampleLabel, lowSampleLabel, emptyLabel }: { rows: RateRow[]; locale: string; sampleLabel: (count: string) => string; lowSampleLabel: string; emptyLabel: string }) {
  return <ol className="space-y-4">{rows.map(row => {
    const rate = row.samples ? row.wins / row.samples : null;
    const thin = row.samples > 0 && row.samples < MIN_RATE_SAMPLES;
    return <li key={row.key} className="grid gap-2 text-xs sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} /><span className="truncate font-semibold">{row.label}</span>{row.detail && <span className="truncate text-muted-foreground">{row.detail}</span>}</div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="absolute inset-y-0 left-1/2 w-px border-l border-dashed border-foreground/40" />
        {rate !== null && <div className="h-3 rounded-full" style={{ width: `${rate * 100}%`, backgroundColor: row.color, opacity: thin ? 0.45 : 1 }} />}
      </div>
      <div className="tabular-nums sm:text-right">{rate === null ? <span className="text-muted-foreground">{emptyLabel}</span> : <><strong>{Math.round(rate * 100).toLocaleString(locale)}%</strong><span className="ml-2 text-muted-foreground">{sampleLabel(row.samples.toLocaleString(locale))}</span>{thin && <span className="ml-2 text-muted-foreground">· {lowSampleLabel}</span>}</>}</div>
    </li>;
  })}</ol>;
}
