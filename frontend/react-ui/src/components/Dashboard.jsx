import React, { useState, useEffect } from 'react'
import { getStats, getSummary, getTimeseries, getIncidents } from '../api'
import {
  Panel, SeverityTag, RiskBadge, TickMeter, ConsoleSpinner, SEVERITY_COLOR,
  SeverityTrendChart, toTrendSeries, FilterChip,
} from './ui'

function StatCell({ label, value, caption }) {
  return (
    <div className="flex-1 px-6 py-5 min-w-[140px]">
      <div className="eyebrow">{label}</div>
      <div className="mono text-3xl font-semibold text-bone mt-2 tabular-nums">
        {(value ?? 0).toLocaleString()}
      </div>
      <div className="text-xs text-faint mt-1">{caption}</div>
    </div>
  )
}

function SeverityMeterList({ data, total }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, c]) => c), 1)

  if (entries.length === 0) {
    return <p className="text-faint text-xs">No data yet</p>
  }

  return (
    <div className="space-y-3">
      {entries.map(([severity, count]) => (
        <div key={severity} className="flex items-center gap-4">
          <div className="w-24 flex-none">
            <SeverityTag severity={severity} />
          </div>
          <TickMeter
            value={count}
            total={max}
            color={SEVERITY_COLOR[severity?.toLowerCase()] || '#6a6a70'}
            ticks={32}
            height={12}
          />
          <span className="mono text-xs text-dim ml-auto tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  )
}

export function Dashboard() {
  const [stats, setStats] = useState({
    logs: 0,
    alerts: 0,
    incidents: 0,
    detection_engine: null,
    correlation_engine: null,
  })
  const [summary, setSummary] = useState({
    log_severity: {},
    log_event_types: {},
    alert_severity: {},
    logs_total: 0,
    alerts_total: 0,
  })
  const [timeseries, setTimeseries] = useState({ points: [], hours: 24 })
  const [trendMetric, setTrendMetric] = useState('logs')
  const [trendHours, setTrendHours] = useState(24)
  const [topRiskIncident, setTopRiskIncident] = useState(null)
  const [avgOpenRisk, setAvgOpenRisk] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshInterval, setRefreshInterval] = useState(5000)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsResponse, summaryResponse, incidentsResponse] = await Promise.all([
          getStats(),
          getSummary(),
          getIncidents(24, 'risk'),
        ])
        setStats(statsResponse.data)
        setSummary(summaryResponse.data)

        const incidents = incidentsResponse.data.incidents || []
        const openWithRisk = incidents.filter(
          (i) => i.status === 'open' && typeof i.risk_score === 'number'
        )
        setTopRiskIncident(openWithRisk[0] || null)
        setAvgOpenRisk(
          openWithRisk.length > 0
            ? Math.round(openWithRisk.reduce((sum, i) => sum + i.risk_score, 0) / openWithRisk.length)
            : null
        )

        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to fetch dashboard data')
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)

    return () => clearInterval(interval)
  }, [refreshInterval])

  useEffect(() => {
    const fetchTrend = async () => {
      try {
        const response = await getTimeseries(trendHours)
        setTimeseries(response.data)
      } catch (err) {
        console.error('Error fetching timeseries:', err)
      }
    }

    fetchTrend()
    if (refreshInterval <= 0) return undefined
    const interval = setInterval(fetchTrend, Math.max(refreshInterval, 15000))
    return () => clearInterval(interval)
  }, [trendHours, refreshInterval])

  if (loading && !stats.logs) {
    return <ConsoleSpinner label="Loading overview" />
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-xl font-semibold text-bone tracking-tight">Overview</h1>
          <p className="eyebrow mt-1">System metrics &amp; security status</p>
        </div>
        <button
          onClick={() => setRefreshInterval(refreshInterval === 5000 ? 0 : 5000)}
          className={`btn ${refreshInterval > 0 ? 'is-active' : ''}`}
        >
          {refreshInterval > 0 ? `Auto-refresh 5s` : 'Refresh paused'}
        </button>
      </div>

      {error && (
        <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--crit)', color: 'var(--crit)', background: 'rgba(255,77,61,0.06)' }}>
          {error}
        </div>
      )}

      {/* Instrument strip */}
      <Panel className="flex flex-wrap divide-x divide-line">
        <StatCell label="Logs Ingested" value={stats.logs} caption="events indexed" />
        <StatCell label="Alerts" value={stats.alerts} caption="rule matches" />
        <StatCell label="Incidents" value={stats.incidents} caption="correlated" />
        {stats.detection_engine && (
          <StatCell label="Rules Loaded" value={stats.detection_engine.total_rules} caption="active" />
        )}
        {avgOpenRisk !== null && (
          <StatCell label="Avg Open Risk" value={avgOpenRisk} caption="risk score" />
        )}
      </Panel>

      {/* Highest-risk open incident */}
      {topRiskIncident && (
        <Panel className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow">Highest Open Risk</div>
            <RiskBadge
              score={topRiskIncident.risk_score}
              band={topRiskIncident.risk_band}
              factors={topRiskIncident.risk_factors}
            />
          </div>
          <div className="flex items-center gap-3 mb-1">
            <SeverityTag severity={topRiskIncident.severity} />
            <h3 className="text-[15px] font-medium text-bone">{topRiskIncident.pattern_name || 'Incident'}</h3>
          </div>
          <p className="text-sm text-dim">{topRiskIncident.description}</p>
        </Panel>
      )}

      {/* Trend chart */}
      <Panel className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="eyebrow">
            {trendMetric === 'logs' ? 'Log Volume' : 'Alert Volume'} Over Time
            <span className="text-faint normal-case tracking-normal"> &middot; {timeseries.interval || '1h'} buckets</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <FilterChip active={trendMetric === 'logs'} onClick={() => setTrendMetric('logs')}>
                Logs
              </FilterChip>
              <FilterChip active={trendMetric === 'alerts'} onClick={() => setTrendMetric('alerts')} color={SEVERITY_COLOR.high}>
                Alerts
              </FilterChip>
            </div>
            <select
              value={trendHours}
              onChange={(e) => setTrendHours(parseInt(e.target.value))}
              className="field mono text-xs px-2 py-1.5"
            >
              <option value="6">6h</option>
              <option value="24">24h</option>
              <option value="168">7d</option>
            </select>
          </div>
        </div>
        <SeverityTrendChart data={toTrendSeries(timeseries.points, trendMetric, trendHours)} />
      </Panel>

      {/* Severity Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel className="p-5">
          <div className="eyebrow mb-4">Log Severity</div>
          <SeverityMeterList data={summary.log_severity} total={summary.logs_total} />
        </Panel>

        <Panel className="p-5">
          <div className="eyebrow mb-4">Alert Severity</div>
          <SeverityMeterList data={summary.alert_severity} total={summary.alerts_total} />
        </Panel>
      </div>

      {/* Event Types */}
      {Object.keys(summary.log_event_types || {}).length > 0 && (
        <Panel className="p-5">
          <div className="eyebrow mb-4">Top Event Types</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(summary.log_event_types)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([eventType, count]) => (
                <div key={eventType} className="border hairline rounded p-3">
                  <p className="mono text-xs text-dim truncate">{eventType}</p>
                  <p className="mono text-xl font-semibold text-bone mt-1 tabular-nums">{count}</p>
                </div>
              ))}
          </div>
        </Panel>
      )}

      {/* Detection Engine Stats */}
      {stats.detection_engine && (
        <Panel className="p-5">
          <div className="eyebrow mb-4">Detection Engine</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="border hairline rounded p-3">
              <p className="mono text-xs text-dim">Total Rules</p>
              <p className="mono text-2xl font-semibold text-bone mt-1 tabular-nums">
                {stats.detection_engine.total_rules}
              </p>
            </div>
            {stats.detection_engine.by_severity &&
              Object.entries(stats.detection_engine.by_severity).map(([severity, count]) => (
                <div key={severity} className="border hairline rounded p-3">
                  <p className="mono text-xs text-dim capitalize">{severity}</p>
                  <p className="mono text-2xl font-semibold text-bone mt-1 tabular-nums">{count}</p>
                </div>
              ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

export default Dashboard
