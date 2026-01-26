import React, { useState, useEffect } from 'react'
import { getAlerts } from './api'

export function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours] = useState(24)
  const [limit, setLimit] = useState(100)
  const [expandedId, setExpandedId] = useState(null)
  const [filterSeverity, setFilterSeverity] = useState(null)

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true)
        const response = await getAlerts(hours, limit)
        setAlerts(response.data.alerts || [])
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to load alerts')
        console.error('Error fetching alerts:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchAlerts()
    const interval = setInterval(fetchAlerts, 10000) // Refresh every 10s

    return () => clearInterval(interval)
  }, [hours, limit])

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
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">🔔 Security Alerts</h1>
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
