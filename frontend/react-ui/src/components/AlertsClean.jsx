import React, { useState, useEffect } from 'react'
import { getAlerts } from './api'

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
    }, 10000)

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
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
            <span className="text-blue-300 text-sm font-medium">🤖 AI analyzing alert...</span>
          </div>
        </div>
      )
    }
    
    if (!analysis) {
      return (
        <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm font-medium">🤖 AI Security Analysis</span>
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
      <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 mb-4">
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
        return 'bg-red-900/50 text-red-200 border-red-800'
      case 'high':
        return 'bg-orange-900/50 text-orange-200 border-orange-800'
      case 'medium':
        return 'bg-yellow-900/50 text-yellow-200 border-yellow-800'
      case 'low':
        return 'bg-blue-900/50 text-blue-200 border-blue-800'
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700'
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Security Alerts</h2>
          <p className="text-sm text-gray-500 mt-1">Detection rule matches with AI-powered analysis</p>
          {aiStats && (
            <div className="mt-2 text-xs text-gray-600">
              🤖 AI Agent: {aiStats.status === 'active' ? '✓ Active' : aiStats.status === 'disabled' ? '⚠ Disabled' : '❌ Error'} 
              {aiStats.total_analyses > 0 && ` | ${aiStats.total_analyses} analyses performed`}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <select
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="bg-[#0f1629] border border-[#1a2332] text-gray-300 px-3 py-2 rounded text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="1">Last 1 hour</option>
            <option value="6">Last 6 hours</option>
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className="bg-[#0f1629] border border-[#1a2332] text-gray-300 px-3 py-2 rounded text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="50">Show: 50</option>
            <option value="100">Show: 100</option>
            <option value="200">Show: 200</option>
            <option value="500">Show: 500</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded px-4 py-3 text-red-200 text-sm">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {/* Severity Filter Bar */}
      <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterSeverity(null)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition border ${
              filterSeverity === null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
            }`}
          >
            All ({alerts.length})
          </button>
          {['critical', 'high', 'medium', 'low'].map((severity) => (
            severityCounts[severity] > 0 && (
              <button
                key={severity}
                onClick={() => setFilterSeverity(severity)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition border capitalize ${
                  filterSeverity === severity
                    ? getSeverityColor(severity)
                    : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                }`}
              >
                {severity} ({severityCounts[severity]})
              </button>
            )
          ))}
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading alerts</p>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <p className="text-gray-400">No alerts found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert, idx) => (
            <div 
              key={idx}
              className="bg-[#0f1629] border border-[#1a2332] rounded overflow-hidden"
            >
              <div 
                className="p-4 cursor-pointer hover:bg-[#151b2e] transition"
                onClick={() => setExpandedId(expandedId === idx ? null : idx)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(alert.rule_severity)}`}>
                        {alert.rule_severity}
                      </span>
                      <span className="text-gray-600 text-xs">{new Date(alert.timestamp).toLocaleString()}</span>
                    </div>
                    <h3 className="text-base font-medium text-gray-100 mb-1">{alert.rule_name || 'Alert'}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-400">
                      <span>Host: {alert.host || 'N/A'}</span>
                      <span>User: {alert.user || 'N/A'}</span>
                      {alert.ip && <span>IP: {alert.ip}</span>}
                    </div>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-gray-500 transition-transform ${expandedId === idx ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {expandedId === idx && (
                <div className="px-4 pb-4 border-t border-[#1a2332] pt-4 bg-[#0a0e27]">
                  <div className="space-y-4">
                    {/* AI Analysis Section */}
                    {renderAIRecommendations(alert._id)}
                    
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Alert Details</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-gray-500">Rule ID:</span>
                          <span className="text-gray-300 font-mono text-xs ml-2">{alert.rule_id || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Severity:</span>
                          <span className="text-gray-300 ml-2 capitalize">{alert.rule_severity || 'N/A'}</span>
                        </div>
                        {alert.mitre_tags && alert.mitre_tags.length > 0 && (
                          <div className="col-span-2">
                            <span className="text-gray-500">MITRE ATT&CK:</span>
                            <span className="text-gray-300 ml-2">{alert.mitre_tags.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {alert.matched_log && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Matched Log Event</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <div>
                            <span className="text-gray-500">Event Type:</span>
                            <span className="text-gray-300 ml-2">{alert.matched_log.event_type || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Source:</span>
                            <span className="text-gray-300 ml-2">{alert.matched_log.source || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Timestamp:</span>
                            <span className="text-gray-300 ml-2 text-xs">{new Date(alert.matched_log.timestamp).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Severity:</span>
                            <span className="text-gray-300 ml-2 capitalize">{alert.matched_log.severity || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {alert.matched_log?.raw && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Raw Log Data</h4>
                        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-3 font-mono text-xs text-gray-300 max-h-60 overflow-auto">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(alert.matched_log.raw, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default AlertsPage
