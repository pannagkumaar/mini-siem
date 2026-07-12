import React, { useState, useEffect, useRef } from 'react'
import { getAlerts } from '../api'
import { Panel, SeverityTag, NeutralTag, FilterChip, ConsoleSpinner, Chevron, PulseDot, SEVERITY_COLOR } from './ui'

const analyzeAlertAI = async (alertId) => {
  const response = await fetch(`http://localhost:8000/ai/analyze/${alertId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) throw new Error(`AI analysis failed: ${response.statusText}`)
  return response.json()
}

const getAlertAnalysis = async (alertId) => {
  const response = await fetch(`http://localhost:8000/ai/analysis/${alertId}`)
  if (!response.ok) throw new Error(`Failed to fetch analysis: ${response.statusText}`)
  return response.json()
}

const getAIStats = async () => {
  const response = await fetch(`http://localhost:8000/ai/stats`)
  if (!response.ok) throw new Error(`Failed to fetch AI stats: ${response.statusText}`)
  return response.json()
}

export function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours] = useState(24)
  const [limit, setLimit] = useState(100)
  const [expandedId, setExpandedId] = useState(null)
  const [filterSeverity, setFilterSeverity] = useState(null)
  const [aiAnalyses, setAiAnalyses] = useState({})
  const [analyzingIds, setAnalyzingIds] = useState(new Set())
  const [aiStats, setAiStats] = useState(null)
  const isFirstLoadRef = useRef(true)

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await getAlerts(hours, limit)
        const newAlerts = response.data.alerts || []

        setAlerts(prevAlerts => {
          if (prevAlerts.length === 0 ||
              newAlerts.length !== prevAlerts.length ||
              !newAlerts.every((alert, idx) =>
                prevAlerts[idx] &&
                prevAlerts[idx]._id === alert._id &&
                JSON.stringify(prevAlerts[idx]) === JSON.stringify(alert)
              )) {
            return newAlerts
          }
          return prevAlerts
        })

        setError(null)
        await loadAIAnalyses(newAlerts)

        if (isFirstLoadRef.current) {
          setLoading(false)
          isFirstLoadRef.current = false
        }
      } catch (err) {
        setError(err.message || 'Failed to load alerts')
        console.error('Error fetching alerts:', err)
        setLoading(false)
      }
    }

    const fetchAIStats = async () => {
      try {
        const response = await getAIStats()
        setAiStats(response.stats)
      } catch (err) {
        console.error('Error fetching AI stats:', err)
      }
    }

    fetchAlerts()
    fetchAIStats()

    const interval = setInterval(() => {
      fetchAlerts()
      fetchAIStats()
    }, 15000)

    return () => clearInterval(interval)
  }, [hours, limit])

  const loadAIAnalyses = async (alertsList) => {
    const analyses = {}
    for (const alert of alertsList) {
      try {
        const response = await getAlertAnalysis(alert._id)
        if (response.analysis) {
          analyses[alert._id] = response.analysis
        }
      } catch (err) {
        // Analysis doesn't exist yet - that's okay
      }
    }
    setAiAnalyses(analyses)
  }

  const handleAnalyzeAlert = async (alertId) => {
    setAnalyzingIds(prev => new Set(prev).add(alertId))
    try {
      const response = await analyzeAlertAI(alertId)
      if (response.success) {
        setAiAnalyses(prev => ({ ...prev, [alertId]: response.analysis }))
      }
    } catch (err) {
      console.error('AI analysis failed:', err)
      if (err.message.includes('503')) {
        alert('AI agent is not configured. Set GROQ_API_KEY to enable per-alert analysis.')
      } else {
        alert('AI analysis failed: ' + err.message)
      }
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev)
        next.delete(alertId)
        return next
      })
    }
  }

  const renderAIRecommendations = (alertId) => {
    const analysis = aiAnalyses[alertId]
    const isAnalyzing = analyzingIds.has(alertId)

    if (isAnalyzing) {
      return (
        <div className="border hairline rounded p-4">
          <div className="flex items-center gap-2">
            <PulseDot live color="var(--signal)" />
            <span className="eyebrow text-signal">Analyzing alert&hellip;</span>
          </div>
        </div>
      )
    }

    if (!analysis) {
      return (
        <div className="border hairline rounded p-4 flex items-center justify-between">
          <span className="eyebrow">AI Analysis</span>
          <button onClick={() => handleAnalyzeAlert(alertId)} className="btn is-active">
            Analyze with AI
          </button>
        </div>
      )
    }

    return (
      <div className="border rounded p-4" style={{ borderColor: 'var(--line-2)' }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="eyebrow text-signal">AI Analysis</span>
          <span className="mono text-[11px] text-faint">
            {new Date(analysis.analysis_timestamp).toLocaleString()}
          </span>
          <button
            onClick={() => handleAnalyzeAlert(alertId)}
            className="ml-auto btn"
            title="Re-analyze"
          >
            Refresh
          </button>
        </div>
        <div
          className="text-sm text-bone/90 leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{
            __html: analysis.recommendations
              .replace(/## (.+)/g, '<div class="eyebrow mt-4 mb-1">$1</div>')
              .replace(/\*\*(.+?)\*\*/g, '<strong class="text-bone">$1</strong>')
              .replace(/\*(.+?)\*/g, '<em class="text-dim">$1</em>')
              .replace(/`(.+?)`/g, '<code class="mono text-signal">$1</code>')
              .replace(/\n/g, '<br/>')
          }}
        />
      </div>
    )
  }

  const filteredAlerts = filterSeverity
    ? alerts.filter(a => a.rule_severity?.toLowerCase() === filterSeverity.toLowerCase())
    : alerts

  const severityCounts = alerts.reduce((acc, alert) => {
    const severity = alert.rule_severity?.toLowerCase() || 'unknown'
    acc[severity] = (acc[severity] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-xl font-semibold text-bone tracking-tight">Alerts</h1>
          <p className="eyebrow mt-1">
            Detection rule matches
            {aiStats && (
              <>
                {' '}&middot; AI agent{' '}
                {aiStats.status === 'active' ? 'active' : aiStats.status === 'disabled' ? 'template mode' : 'error'}
                {aiStats.total_analyses > 0 && ` · ${aiStats.total_analyses} analyses`}
              </>
            )}
          </p>
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

      {/* Severity Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip active={filterSeverity === null} onClick={() => setFilterSeverity(null)}>
          All &middot; {alerts.length}
        </FilterChip>
        {['critical', 'high', 'medium', 'low'].map((severity) => (
          severityCounts[severity] > 0 && (
            <FilterChip
              key={severity}
              active={filterSeverity === severity}
              onClick={() => setFilterSeverity(severity)}
              color={SEVERITY_COLOR[severity]}
            >
              {severity} &middot; {severityCounts[severity]}
            </FilterChip>
          )
        ))}
      </div>

      {/* Alerts List */}
      {loading ? (
        <ConsoleSpinner label="Loading alerts" />
      ) : filteredAlerts.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-dim text-sm">No alerts found</p>
        </Panel>
      ) : (
        <div className="space-y-2">
          {filteredAlerts.map((alert) => (
            <Panel key={alert._id} className="overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-panel2 transition-colors"
                onClick={() => setExpandedId(expandedId === alert._id ? null : alert._id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <SeverityTag severity={alert.rule_severity} />
                      <span className="mono text-[11px] text-faint">
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-medium text-bone mb-1">{alert.rule_name || 'Alert'}</h3>
                    <div className="flex items-center gap-4 text-xs text-dim mono">
                      <span>{alert.host || 'n/a'}</span>
                      <span>{alert.user || 'n/a'}</span>
                      {alert.ip && <span>{alert.ip}</span>}
                    </div>
                  </div>
                  <Chevron open={expandedId === alert._id} />
                </div>
              </div>

              {expandedId === alert._id && (
                <div className="px-4 pb-4 border-t hairline pt-4 space-y-4">
                  {renderAIRecommendations(alert._id)}

                  <div>
                    <div className="eyebrow mb-2">Alert Details</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <span className="text-faint">Rule ID</span>
                        <span className="mono text-dim ml-2 text-xs">{alert.rule_id || 'n/a'}</span>
                      </div>
                      <div>
                        <span className="text-faint">Severity</span>
                        <span className="text-bone ml-2 capitalize">{alert.rule_severity || 'n/a'}</span>
                      </div>
                      {alert.mitre_tags && alert.mitre_tags.length > 0 && (
                        <div className="col-span-2 flex items-center gap-2 flex-wrap">
                          <span className="text-faint">MITRE ATT&amp;CK</span>
                          {alert.mitre_tags.map((tag, i) => (
                            <NeutralTag key={i}>{tag}</NeutralTag>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {alert.matched_log && (
                    <div>
                      <div className="eyebrow mb-2">Matched Event</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-faint">Event Type</span>
                          <span className="text-bone ml-2 mono text-xs">{alert.matched_log.event_type || 'n/a'}</span>
                        </div>
                        <div>
                          <span className="text-faint">Source</span>
                          <span className="text-bone ml-2 mono text-xs">{alert.matched_log.source || 'n/a'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {alert.matched_log?.raw && (
                    <div>
                      <div className="eyebrow mb-2">Raw Log</div>
                      <div className="border hairline rounded p-3 mono text-xs text-dim max-h-60 overflow-auto">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(alert.matched_log.raw, null, 2)}</pre>
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

export default AlertsPage
