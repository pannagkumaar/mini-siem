import React, { useState, useEffect } from 'react'
import { getLogs } from '../api'
import { Panel, SeverityTag, NeutralTag, FilterChip, ConsoleSpinner, Chevron, SEVERITY_COLOR } from './ui'

export function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours] = useState(24)
  const [limit, setLimit] = useState(100)
  const [expandedId, setExpandedId] = useState(null)
  const [filters, setFilters] = useState({
    severity: null,
    event_type: null,
    source: null,
  })

  const [availableEventTypes, setAvailableEventTypes] = useState([])
  const [availableSources, setAvailableSources] = useState([])
  const [availableSeverities, setAvailableSeverities] = useState([])

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const response = await getLogs(hours, limit, filters)
        setLogs(response.data.logs || [])

        const eventTypes = new Set()
        const sources = new Set()
        const severities = new Set()

        response.data.logs?.forEach(log => {
          if (log.event_type) eventTypes.add(log.event_type)
          if (log.source) sources.add(log.source)
          if (log.severity) severities.add(log.severity)
        })

        setAvailableEventTypes(Array.from(eventTypes).sort())
        setAvailableSources(Array.from(sources).sort())
        setAvailableSeverities(Array.from(severities).sort())

        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to load logs')
        console.error('Error fetching logs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
    const interval = setInterval(fetchLogs, 15000)

    return () => clearInterval(interval)
  }, [hours, limit, filters])

  const severityCounts = logs.reduce((acc, log) => {
    const severity = log.severity?.toLowerCase() || 'unknown'
    acc[severity] = (acc[severity] || 0) + 1
    return acc
  }, {})

  const sourceCounts = logs.reduce((acc, log) => {
    const source = log.source?.toLowerCase() || 'unknown'
    acc[source] = (acc[source] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-xl font-semibold text-bone tracking-tight">Logs</h1>
          <p className="eyebrow mt-1">Raw normalized event stream</p>
        </div>
        <div className="flex gap-2">
          <select value={hours} onChange={(e) => setHours(parseInt(e.target.value))} className="field mono text-xs px-3 py-2">
            <option value="1">Last 1 hour</option>
            <option value="6">Last 6 hours</option>
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </select>
          <select value={limit} onChange={(e) => setLimit(parseInt(e.target.value))} className="field mono text-xs px-3 py-2">
            <option value="50">Show 50</option>
            <option value="100">Show 100</option>
            <option value="200">Show 200</option>
            <option value="500">Show 500</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--crit)', color: 'var(--crit)', background: 'rgba(255,77,61,0.06)' }}>
          {error}
        </div>
      )}

      {/* Filter Bars */}
      <div className="space-y-3">
        {availableSeverities.length > 0 && (
          <Panel className="p-4">
            <div className="eyebrow mb-2">Severity</div>
            <div className="flex gap-2 flex-wrap">
              <FilterChip active={filters.severity === null} onClick={() => setFilters({ ...filters, severity: null })}>
                All &middot; {logs.length}
              </FilterChip>
              {availableSeverities.map(severity => (
                <FilterChip
                  key={severity}
                  active={filters.severity === severity}
                  onClick={() => setFilters({ ...filters, severity })}
                  color={SEVERITY_COLOR[severity.toLowerCase()]}
                >
                  {severity} &middot; {severityCounts[severity.toLowerCase()] || 0}
                </FilterChip>
              ))}
            </div>
          </Panel>
        )}

        {availableSources.length > 0 && (
          <Panel className="p-4">
            <div className="eyebrow mb-2">Source</div>
            <div className="flex gap-2 flex-wrap">
              <FilterChip active={filters.source === null} onClick={() => setFilters({ ...filters, source: null })}>
                All sources
              </FilterChip>
              {availableSources.map(source => (
                <FilterChip key={source} active={filters.source === source} onClick={() => setFilters({ ...filters, source })}>
                  {source} &middot; {sourceCounts[source.toLowerCase()] || 0}
                </FilterChip>
              ))}
            </div>
          </Panel>
        )}

        {availableEventTypes.length > 0 && (
          <Panel className="p-4">
            <div className="eyebrow mb-2">Event Type</div>
            <div className="flex gap-2 flex-wrap">
              <FilterChip active={filters.event_type === null} onClick={() => setFilters({ ...filters, event_type: null })}>
                All events
              </FilterChip>
              {availableEventTypes.map(eventType => (
                <FilterChip key={eventType} active={filters.event_type === eventType} onClick={() => setFilters({ ...filters, event_type: eventType })}>
                  {eventType}
                </FilterChip>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/* Logs List */}
      {loading ? (
        <ConsoleSpinner label="Loading logs" />
      ) : logs.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-dim text-sm">No logs found</p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {logs.map((log, idx) => (
            <Panel key={idx} className="overflow-hidden">
              <div
                className="p-3 cursor-pointer hover:bg-panel2 transition-colors"
                onClick={() => setExpandedId(expandedId === idx ? null : idx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="mono text-[11px] text-faint">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <SeverityTag severity={log.severity} />
                    <NeutralTag>{log.source}</NeutralTag>
                    <span className="text-sm text-bone mono">{log.event_type}</span>
                  </div>
                  <Chevron open={expandedId === idx} />
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-dim mono">
                  <span>{log.host || 'n/a'}</span>
                  <span>{log.user || 'n/a'}</span>
                  {log.ip && <span>{log.ip}</span>}
                </div>
              </div>

              {expandedId === idx && (
                <div className="px-3 pb-3 border-t hairline pt-3">
                  {log.raw ? (
                    <div>
                      <div className="eyebrow mb-2">Raw Log Data</div>
                      <div className="border hairline rounded p-3 mono text-xs text-dim max-h-96 overflow-auto">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.raw, null, 2)}</pre>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="eyebrow mb-2">Log Fields</div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {Object.entries(log).map(([key, value]) => (
                          key !== 'raw' && (
                            <div key={key} className="flex justify-between">
                              <span className="text-faint">{key}</span>
                              <span className="text-dim mono">{String(value)}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

export default LogsPage
