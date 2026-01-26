import React, { useState, useEffect } from 'react'
import { getStats, getSummary } from './api'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshInterval, setRefreshInterval] = useState(5000)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const statsResponse = await getStats()
        const summaryResponse = await getSummary()
        
        setStats(statsResponse.data)
        setSummary(summaryResponse.data)
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to load dashboard data')
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, refreshInterval)

    return () => clearInterval(interval)
  }, [refreshInterval])

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

  const getSeverityTextColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'text-red-400'
      case 'high':
        return 'text-orange-400'
      case 'medium':
        return 'text-yellow-400'
      case 'low':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }

  if (loading && !stats.logs) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-xl text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-100">
          <p className="font-bold">⚠️ Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Header with Refresh Control */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <select
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
          className="bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 hover:border-gray-500"
        >
          <option value="2000">Refresh: 2s</option>
          <option value="5000">Refresh: 5s</option>
          <option value="10000">Refresh: 10s</option>
          <option value="30000">Refresh: 30s</option>
        </select>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Total Logs</p>
              <p className="text-4xl font-bold text-blue-400">{stats.logs?.toLocaleString() || 0}</p>
            </div>
            <span className="text-4xl">📋</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">All ingested logs</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Active Alerts</p>
              <p className="text-4xl font-bold text-yellow-400">{stats.alerts?.toLocaleString() || 0}</p>
            </div>
            <span className="text-4xl">🔔</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Rule detections</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Open Incidents</p>
              <p className="text-4xl font-bold text-red-400">{stats.incidents?.toLocaleString() || 0}</p>
            </div>
            <span className="text-4xl">🚨</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Correlated events</p>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm mb-1">Active Rules</p>
              <p className="text-4xl font-bold text-purple-400">{stats.detection_engine?.total_rules || 0}</p>
            </div>
            <span className="text-4xl">⚙️</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Detection rules</p>
        </div>
      </div>

      {/* Severity Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Log Severity */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">📊</span> Log Severity Distribution
          </h3>
          <div className="space-y-3">
            {Object.keys(summary.log_severity || {}).length === 0 ? (
              <p className="text-gray-400 text-sm">No logs yet</p>
            ) : (
              Object.entries(summary.log_severity)
                .sort((a, b) => b[1] - a[1])
                .map(([severity, count]) => (
                  <div key={severity} className="flex items-center">
                    <div className={`px-3 py-1 rounded text-xs font-bold capitalize min-w-[80px] text-center ${getSeverityColor(severity)}`}>
                      {severity}
                    </div>
                    <div className="flex-1 ml-4 flex items-center">
                      <div className="bg-gray-700 rounded-full h-2 flex-1 overflow-hidden">
                        <div 
                          className={`h-full bg-gradient-to-r ${severity === 'critical' ? 'from-red-500 to-red-400' : severity === 'high' ? 'from-orange-500 to-orange-400' : severity === 'medium' ? 'from-yellow-500 to-yellow-400' : 'from-blue-500 to-blue-400'}`}
                          style={{ width: `${(count / (summary.logs_total || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <span className="ml-2 text-gray-400 text-sm min-w-[50px] text-right">{count}</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Alert Severity */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">🎯</span> Alert Severity Distribution
          </h3>
          <div className="space-y-3">
            {Object.keys(summary.alert_severity || {}).length === 0 ? (
              <p className="text-gray-400 text-sm">No alerts yet</p>
            ) : (
              Object.entries(summary.alert_severity)
                .sort((a, b) => b[1] - a[1])
                .map(([severity, count]) => (
                  <div key={severity} className="flex items-center">
                    <div className={`px-3 py-1 rounded text-xs font-bold capitalize min-w-[80px] text-center ${getSeverityColor(severity)}`}>
                      {severity}
                    </div>
                    <div className="flex-1 ml-4 flex items-center">
                      <div className="bg-gray-700 rounded-full h-2 flex-1 overflow-hidden">
                        <div 
                          className={`h-full bg-gradient-to-r ${severity === 'critical' ? 'from-red-500 to-red-400' : severity === 'high' ? 'from-orange-500 to-orange-400' : severity === 'medium' ? 'from-yellow-500 to-yellow-400' : 'from-blue-500 to-blue-400'}`}
                          style={{ width: `${(count / (summary.alerts_total || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <span className="ml-2 text-gray-400 text-sm min-w-[50px] text-right">{count}</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Top Event Types */}
      {Object.keys(summary.log_event_types || {}).length > 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2">📈</span> Top Event Types
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(summary.log_event_types)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([eventType, count]) => (
                <div key={eventType} className="bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-gray-300 font-mono text-sm mb-2 truncate">{eventType}</p>
                  <p className="text-2xl font-bold text-blue-400">{count}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Detection Engine Info */}
      {stats.detection_engine && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-blue-400 mb-4 flex items-center">
            <span className="mr-2">⚙️</span> Detection Engine
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-700 rounded p-4">
              <p className="text-gray-400 text-sm">Total Rules</p>
              <p className="text-2xl font-bold text-blue-400">{stats.detection_engine.total_rules}</p>
            </div>
            {stats.detection_engine.by_severity && Object.entries(stats.detection_engine.by_severity).map(([severity, count]) => (
              <div key={severity} className="bg-gray-700 rounded p-4">
                <p className="text-gray-400 text-sm capitalize">{severity} Rules</p>
                <p className={`text-2xl font-bold ${getSeverityTextColor(severity)}`}>{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlation Engine Info */}
      {stats.correlation_engine && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center">
            <span className="mr-2">🔗</span> Correlation Engine
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-700 rounded p-4">
              <p className="text-gray-400 text-sm">Patterns</p>
              <p className="text-2xl font-bold text-purple-400">{stats.correlation_engine.patterns}</p>
            </div>
            {stats.correlation_engine.last_run && (
              <div className="bg-gray-700 rounded p-4">
                <p className="text-gray-400 text-sm">Last Run</p>
                <p className="text-sm text-purple-300">{new Date(stats.correlation_engine.last_run).toLocaleTimeString()}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
