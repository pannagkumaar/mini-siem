import React, { useState, useEffect } from 'react'
import { getAlerts } from './api'
import { TestAIButton } from './TestAI'

// API functions for AI analysis
const analyzeAlertAI = async (alertId) => {
  const response = await fetch(`http://localhost:8000/ai/analyze/${alertId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error(`AI analysis failed: ${response.statusText}`)
  }
  
  return response.json()
}

const getAlertAnalysis = async (alertId) => {
  const response = await fetch(`http://localhost:8000/ai/analysis/${alertId}`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch analysis: ${response.statusText}`)
  }
  
  return response.json()
}

const getAIStats = async () => {
  const response = await fetch(`http://localhost:8000/ai/stats`)
  
  if (!response.ok) {
    throw new Error(`Failed to fetch AI stats: ${response.statusText}`)
  }
  
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

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true)
        const response = await getAlerts(hours, limit)
        setAlerts(response.data.alerts || [])
        setError(null)
        
        // Load existing AI analyses for alerts
        await loadAIAnalyses(response.data.alerts || [])
      } catch (err) {
        setError(err.message || 'Failed to load alerts')
        console.error('Error fetching alerts:', err)
      } finally {
        setLoading(false)
      }
    }

    // Fetch AI stats
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
    }, 10000) // Refresh every 10s

    return () => clearInterval(interval)
  }, [hours, limit])

  const loadAIAnalyses = async (alertsList) => {
    const analyses = {}
    
    // Load existing analyses for all alerts
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
        setAiAnalyses(prev => ({
          ...prev,
          [alertId]: response.analysis
        }))
      }
    } catch (err) {
      console.error('AI analysis failed:', err)
      // Show more user-friendly error message
      if (err.message.includes('503')) {
        alert('AI agent is not available or needs configuration. Please check that the Groq API key is set.')
      } else {
        alert('AI analysis failed: ' + err.message)
      }
    } finally {
      setAnalyzingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(alertId)
        return newSet
      })
    }
  }

  const renderAIRecommendations = (alertId) => {
    const analysis = aiAnalyses[alertId]
    const isAnalyzing = analyzingIds.has(alertId)
    
    if (isAnalyzing) {
      return (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
            <span className="text-blue-300 text-sm font-medium">🤖 AI analyzing alert...</span>
          </div>
        </div>
      )
    }
    
    if (!analysis) {
      return (
        <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm">🤖 AI Security Analysis</span>
              {aiStats && aiStats.status === 'disabled' && (
                <span className="text-xs text-red-400">(API key needed)</span>
              )}
            </div>
            <button
              onClick={() => handleAnalyzeAlert(alertId)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition"
              title="Analyze this alert with AI for expert recommendations"
            >
              🔍 Analyze with AI
            </button>
          </div>
        </div>
      )
    }
    
    return (
      <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-green-300 text-sm font-bold">🤖 AI Security Analysis</span>
          <span className="text-xs text-gray-400">
            ({new Date(analysis.analysis_timestamp).toLocaleString()})
          </span>
          <button
            onClick={() => handleAnalyzeAlert(alertId)}
            className="ml-auto px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition"
            title="Re-analyze with AI"
          >
            ↻
          </button>
        </div>
        <div className="prose prose-sm prose-invert max-w-none">
          <div 
            className="text-sm text-gray-200 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ 
              __html: analysis.recommendations
                .replace(/## (.+)/g, '<h3 class="text-yellow-300 font-bold mt-4 mb-2">$1</h3>')
                .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
                .replace(/\*(.+?)\*/g, '<em class="text-blue-300">$1</em>')
                .replace(/`(.+?)`/g, '<code class="bg-gray-800 px-1 py-0.5 rounded text-green-300 font-mono text-xs">$1</code>')
                .replace(/\n/g, '<br/>')
            }}
          />
        </div>
      </div>
    )
  }

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-600 text-white'
      case 'high':
        return 'bg-orange-600 text-white'
      case 'medium':
        return 'bg-yellow-600 text-white'
      case 'low':
        return 'bg-blue-600 text-white'
      default:
        return 'bg-gray-600 text-white'
    }
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
      {/* Test AI Component */}
      <TestAIButton />
      
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">🔔 Security Alerts</h1>
          <p className="text-gray-400 mt-1">Real-time detection engine alerts with AI-powered analysis</p>
          {aiStats && (
            <div className="mt-2 text-sm text-gray-500">
              🤖 AI Agent: {aiStats.status === 'active' ? '✓ Active' : aiStats.status === 'disabled' ? '⚠ Disabled' : '❌ Error'} 
              {aiStats.total_analyses > 0 && ` | ${aiStats.total_analyses} analyses performed`}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 hover:border-gray-500"
          >
            <option value="1">Last 1 hour</option>
            <option value="6">Last 6 hours</option>
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className="bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 hover:border-gray-500"
          >
            <option value="50">Show: 50</option>
            <option value="100">Show: 100</option>
            <option value="200">Show: 200</option>
            <option value="500">Show: 500</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-100">
          <p className="font-bold">⚠️ Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Severity Filter Bar */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterSeverity(null)}
            className={`px-4 py-2 rounded font-semibold transition ${
              filterSeverity === null 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All ({alerts.length})
          </button>
          {Object.entries(severityCounts).map(([severity, count]) => (
            <button
              key={severity}
              onClick={() => setFilterSeverity(severity)}
              className={`px-4 py-2 rounded font-semibold capitalize transition ${
                filterSeverity === severity
                  ? `bg-${severity === 'critical' ? 'red' : severity === 'high' ? 'orange' : severity === 'medium' ? 'yellow' : 'blue'}-600 text-white`
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {severity} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List */}
      {loading && alerts.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading alerts...</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">No alerts detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => (
            <div
              key={alert._id}
              className="bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition cursor-pointer"
              onClick={() => setExpandedId(expandedId === alert._id ? null : alert._id)}
            >
              {/* Alert Header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded text-sm font-bold ${getSeverityColor(alert.rule_severity)}`}>
                        {alert.rule_severity?.toUpperCase()}
                      </span>
                      <h3 className="text-lg font-bold text-white">{alert.rule_name}</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">{alert.rule_id}</p>
                    
                    {/* Quick Info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {alert.matched_log?.host && (
                        <div className="text-gray-400">
                          <span className="text-gray-500">Host:</span> <span className="text-blue-300 font-mono">{alert.matched_log.host}</span>
                        </div>
                      )}
                      {alert.matched_log?.user && (
                        <div className="text-gray-400">
                          <span className="text-gray-500">User:</span> <span className="text-blue-300">{alert.matched_log.user}</span>
                        </div>
                      )}
                      {alert.matched_log?.event_type && (
                        <div className="text-gray-400">
                          <span className="text-gray-500">Event:</span> <span className="text-yellow-300 font-mono text-xs">{alert.matched_log.event_type}</span>
                        </div>
                      )}
                      {alert.matched_log?.ip && (
                        <div className="text-gray-400">
                          <span className="text-gray-500">IP:</span> <span className="text-green-300 font-mono">{alert.matched_log.ip}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {new Date(alert.timestamp).toLocaleString()}
                    </p>
                    <span className="text-xl">{expandedId === alert._id ? '▼' : '▶'}</span>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === alert._id && (
                <div className="border-t border-gray-700 bg-gray-900 p-4 space-y-4">
                  {/* AI Analysis Section */}
                  {renderAIRecommendations(alert._id)}
                  
                  <div>
                    <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Full Log Details</h4>
                    <div className="bg-gray-800 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto">
                      <pre>{JSON.stringify(alert.matched_log, null, 2)}</pre>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Alert Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Alert ID:</span>
                          <span className="text-gray-300 font-mono">{alert._id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Timestamp:</span>
                          <span className="text-gray-300">{new Date(alert.timestamp).toISOString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Rule ID:</span>
                          <span className="text-gray-300 font-mono">{alert.rule_id}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Source Details</h4>
                      <div className="space-y-2 text-sm">
                        {alert.matched_log?.source && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Source:</span>
                            <span className="text-gray-300 capitalize">{alert.matched_log.source}</span>
                          </div>
                        )}
                        {alert.matched_log?.severity && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Severity:</span>
                            <span className="text-gray-300 capitalize">{alert.matched_log.severity}</span>
                          </div>
                        )}
                        {alert.matched_log?.event_type && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Event Type:</span>
                            <span className="text-gray-300 font-mono text-xs">{alert.matched_log.event_type}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Raw Log Button */}
                  <div>
                    <button className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition">
                      📋 View Original Log
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary Footer */}
      {!loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center text-sm text-gray-400">
          Showing {filteredAlerts.length} of {alerts.length} alerts from the last {hours} hour(s)
        </div>
      )}
    </div>
  )
}

export default AlertsPage
