import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

export const SEVERITY_COLOR = {
  critical: '#ff4d3d',
  high: '#ff9f40',
  medium: '#e8c14a',
  low: '#5b93b0',
}

export const STATUS_COLOR = {
  open: '#ff9f40',
  investigating: '#4fd1c5',
  resolved: '#3ecf8e',
}

const NEUTRAL = '#6a6a70'

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function ColorTag({ label, color }) {
  return (
    <span
      className="tag"
      style={{ color, borderColor: hexToRgba(color, 0.45), background: hexToRgba(color, 0.09) }}
    >
      <span className="tag-dot" style={{ background: color }} />
      {label}
    </span>
  )
}

export function SeverityTag({ severity }) {
  const key = (severity || 'unknown').toLowerCase()
  return <ColorTag label={key} color={SEVERITY_COLOR[key] || NEUTRAL} />
}

export function StatusTag({ status }) {
  const key = (status || 'unknown').toLowerCase()
  return <ColorTag label={key} color={STATUS_COLOR[key] || NEUTRAL} />
}

/** Shows an incident's computed risk score (0-100), colored by risk band
 * using the same severity palette. Hover reveals the factor breakdown from
 * correlation-engine/risk.py so the score is never opaque. */
export function RiskBadge({ score, band, factors }) {
  if (score === undefined || score === null) return null
  const key = (band || 'low').toLowerCase()
  const color = SEVERITY_COLOR[key] || NEUTRAL
  const title = factors && factors.length
    ? factors.map((f) => `${f.label}: +${f.points}`).join('\n')
    : undefined
  return (
    <span
      className="tag"
      style={{ color, borderColor: hexToRgba(color, 0.45), background: hexToRgba(color, 0.09) }}
      title={title}
    >
      <span className="tag-dot" style={{ background: color }} />
      risk {score}
    </span>
  )
}

/** Plain grayscale tag for non-severity metadata (source, event type, etc.) -
 * color is reserved for severity/status signal only. */
export function NeutralTag({ children, title }) {
  return (
    <span
      className="tag"
      style={{ color: 'var(--dim)', borderColor: 'var(--line-2)', background: 'transparent' }}
      title={title}
    >
      {children}
    </span>
  )
}

/** The recurring "signal strength" visualization used for magnitudes. */
export function TickMeter({ value, total, color, ticks = 20, height = 14 }) {
  const filled = total > 0 ? Math.round((value / total) * ticks) : 0
  return (
    <div className="tickmeter">
      {Array.from({ length: ticks }).map((_, i) => (
        <span
          key={i}
          className="tick"
          style={{ height, background: i < filled ? color : 'var(--line-2)' }}
        />
      ))}
    </div>
  )
}

export function PulseDot({ live = true, color }) {
  return (
    <span
      className={`pulse-dot${live ? ' is-live' : ''}`}
      style={color ? { '--dot-color': color } : undefined}
    />
  )
}

export function Panel({ className = '', children, ...rest }) {
  return (
    <div className={`panel ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function ConsoleSpinner({ label }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <div className="tickmeter">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="tick tick-scan"
            style={{ height: 18, background: 'var(--signal)', animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      {label && <div className="eyebrow">{label}</div>}
    </div>
  )
}

/** A toggleable filter button that picks up a signal color only when active. */
export function FilterChip({ active, onClick, color, children }) {
  const style = active && color
    ? { color, borderColor: hexToRgba(color, 0.5), background: hexToRgba(color, 0.09) }
    : undefined
  return (
    <button onClick={onClick} className={`btn ${active ? 'is-active' : ''}`} style={style}>
      {children}
    </button>
  )
}

export function Chevron({ open }) {
  return (
    <svg
      className={`w-4 h-4 text-faint transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical']

function formatTickTime(iso, hours) {
  const d = new Date(iso)
  if (hours <= 24) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  // The dashboard's longest range (7d) still buckets in sub-day intervals
  // (6h), so a date-only label would repeat several times per day - always
  // pair date with time here so every tick is distinct.
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} ${time}`
}

/** Transforms the raw /timeseries API response into a recharts-friendly
 * array, one row per bucket, with a value per severity for the given
 * metric ("logs" or "alerts"). */
export function toTrendSeries(points, metric, hours) {
  return (points || []).map((p) => {
    const bySeverity = p[metric] || {}
    const row = { time: p.time, label: formatTickTime(p.time, hours) }
    for (const sev of SEVERITY_ORDER) row[sev] = bySeverity[sev] || 0
    return row
  })
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0)
  return (
    <div className="panel px-3 py-2">
      <div className="eyebrow mb-1.5">{label}</div>
      {payload.slice().reverse().map((p) => (
        p.value > 0 && (
          <div key={p.dataKey} className="flex items-center gap-2 mono text-xs mb-0.5">
            <span className="w-2 h-2 flex-none" style={{ background: p.color }} />
            <span className="text-dim capitalize">{p.dataKey}</span>
            <span className="text-bone ml-4 tabular-nums">{p.value}</span>
          </div>
        )
      ))}
      <div className="mono text-xs text-faint mt-1 pt-1 border-t hairline tabular-nums">total {total}</div>
    </div>
  )
}

/** The flagship visualization: a stacked area chart of event volume over
 * time, colored by severity - the same signal-color discipline used
 * everywhere else, applied to a real time series instead of a snapshot. */
export function SeverityTrendChart({ data, height = 240 }) {
  const hasData = data.some((row) => SEVERITY_ORDER.some((sev) => row[sev] > 0))

  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-faint text-xs" style={{ height }}>
        No data in this window
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {SEVERITY_ORDER.map((sev) => (
            <linearGradient key={sev} id={`trend-fill-${sev}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={SEVERITY_COLOR[sev]} stopOpacity={0.5} />
              <stop offset="95%" stopColor={SEVERITY_COLOR[sev]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--line)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--faint)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
          axisLine={{ stroke: 'var(--line)' }}
          tickLine={false}
          minTickGap={32}
        />
        <YAxis
          tick={{ fill: 'var(--faint)', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
          axisLine={false}
          tickLine={false}
          width={44}
          allowDecimals={false}
        />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--line-2)', strokeWidth: 1 }} />
        {SEVERITY_ORDER.map((sev) => (
          <Area
            key={sev}
            type="monotone"
            dataKey={sev}
            stackId="severity"
            stroke={SEVERITY_COLOR[sev]}
            strokeWidth={1.25}
            fill={`url(#trend-fill-${sev})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
