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
        const [statsResponse, summaryResponse] = await Promise.all([
          getStats(),
          getSummary(),
        ])
        setStats(statsResponse.data)
        setSummary(summaryResponse.data)
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

  const getSeverityBarColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-500'
      case 'high':
        return 'bg-orange-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (loading && !stats.logs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent"></div>
          <div className="text-sm text-gray-400">Loading dashboard</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Overview</h2>
          <p className="text-sm text-gray-500 mt-1">System metrics and security status</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <div className={`h-1.5 w-1.5 rounded-full ${refreshInterval > 0 ? 'bg-green-500' : 'bg-gray-500'}`}></div>
            <span>{refreshInterval > 0 ? `Auto-refresh ${refreshInterval / 1000}s` : 'Paused'}</span>
          </div>
          <button
            onClick={() => setRefreshInterval(refreshInterval === 5000 ? 0 : 5000)}
            className="px-3 py-1.5 bg-[#1a2744] hover:bg-[#1f2d4f] border border-[#2a3f5f] rounded text-xs text-gray-300 transition"
          >
            {refreshInterval > 0 ? 'Pause' : 'Resume'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded px-4 py-3 text-red-200 text-sm">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Logs</p>
              <p className="text-3xl font-semibold text-gray-100 mt-2">{stats.logs.toLocaleString()}</p>
              <p className="text-xs text-gray-600 mt-1">Events ingested</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Active Alerts</p>
              <p className="text-3xl font-semibold text-yellow-400 mt-2">{stats.alerts.toLocaleString()}</p>
              <p className="text-xs text-gray-600 mt-1">Detection matches</p>
            </div>
          </div>
        </div>

        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Open Incidents</p>
              <p className="text-3xl font-semibold text-red-400 mt-2">{stats.incidents.toLocaleString()}</p>
              <p className="text-xs text-gray-600 mt-1">Correlated events</p>
            </div>
          </div>
        </div>
      </div>

      {/* Severity Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Log Severity Distribution</h3>
          <div className="space-y-3">
            {Object.keys(summary.log_severity || {}).length === 0 ? (
              <p className="text-gray-500 text-xs">No data available</p>
            ) : (
              Object.entries(summary.log_severity)
                .sort((a, b) => b[1] - a[1])
                .map(([severity, count]) => (
                  <div key={severity} className="flex items-center">
                    <div className={`px-2 py-0.5 rounded text-xs font-medium capitalize min-w-[70px] text-center border ${getSeverityColor(severity)}`}>
                      {severity}
                    </div>
                    <div className="flex-1 ml-3 flex items-center">
                      <div className="bg-[#1a2332] rounded-full h-1.5 flex-1 overflow-hidden">
                        <div 
                          className={`h-full ${getSeverityBarColor(severity)}`}
                          style={{ width: `${(count / (summary.logs_total || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <span className="ml-2 text-gray-400 text-xs min-w-[40px] text-right">{count}</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Alert Severity Distribution</h3>
          <div className="space-y-3">
            {Object.keys(summary.alert_severity || {}).length === 0 ? (
              <p className="text-gray-500 text-xs">No data available</p>
            ) : (
              Object.entries(summary.alert_severity)
                .sort((a, b) => b[1] - a[1])
                .map(([severity, count]) => (
                  <div key={severity} className="flex items-center">
                    <div className={`px-2 py-0.5 rounded text-xs font-medium capitalize min-w-[70px] text-center border ${getSeverityColor(severity)}`}>
                      {severity}
                    </div>
                    <div className="flex-1 ml-3 flex items-center">
                      <div className="bg-[#1a2332] rounded-full h-1.5 flex-1 overflow-hidden">
                        <div 
                          className={`h-full ${getSeverityBarColor(severity)}`}
                          style={{ width: `${(count / (summary.alerts_total || 1)) * 100}%` }}
                        ></div>
                      </div>
                      <span className="ml-2 text-gray-400 text-xs min-w-[40px] text-right">{count}</span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      {/* Event Types */}
      {Object.keys(summary.log_event_types || {}).length > 0 && (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Top Event Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(summary.log_event_types)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([eventType, count]) => (
                <div key={eventType} className="bg-[#1a2744]/50 border border-[#2a3f5f] rounded p-3 text-center">
                  <p className="text-gray-400 text-xs truncate font-mono">{eventType}</p>
                  <p className="text-xl font-semibold text-gray-200 mt-1">{count}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Detection Engine Stats */}
      {stats.detection_engine && (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Detection Engine</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#1a2744]/50 border border-[#2a3f5f] rounded p-3">
              <p className="text-gray-500 text-xs">Total Rules</p>
              <p className="text-2xl font-semibold text-gray-200 mt-1">{stats.detection_engine.total_rules}</p>
            </div>
            {stats.detection_engine.by_severity && Object.entries(stats.detection_engine.by_severity).map(([severity, count]) => (
              <div key={severity} className="bg-[#1a2744]/50 border border-[#2a3f5f] rounded p-3">
                <p className="text-gray-500 text-xs capitalize">{severity}</p>
                <p className="text-2xl font-semibold text-gray-200 mt-1">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
