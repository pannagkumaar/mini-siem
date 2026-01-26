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
  const [animateStats, setAnimateStats] = useState(false)

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
        setAnimateStats(true)
        setTimeout(() => setAnimateStats(false), 500)
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

  if (loading && !stats.logs) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-cyan-500"></div>
          <div className="text-xl text-gray-300">Loading dashboard data...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-gray-800 via-gray-900 to-black p-6 rounded-lg shadow-2xl border border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              Security Operations Center
            </h1>
            <p className="text-gray-400 mt-2">Real-time threat monitoring and analysis</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-4 py-2 bg-gray-800 rounded-lg border border-gray-700">
              <div className={`h-2 w-2 rounded-full ${refreshInterval > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-sm text-gray-400">
                {refreshInterval > 0 ? `Live (${refreshInterval / 1000}s)` : 'Paused'}
              </span>
            </div>
            <button
              onClick={() => setRefreshInterval(refreshInterval === 5000 ? 0 : 5000)}
              className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-white text-sm font-medium shadow-lg transition-all duration-200"
            >
              {refreshInterval > 0 ? '⏸ Pause' : '▶ Resume'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-100 backdrop-blur">
          <p className="font-bold">⚠️ Error</p>
          <p>{error}</p>
        </div>
      )}

      {/* Enhanced Stats Cards with animations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Logs Card */}
        <div className={`bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl shadow-2xl border border-gray-700 hover:border-cyan-500 transition-all duration-300 ${animateStats ? 'scale-105' : 'scale-100'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-wider font-semibold">Total Logs</p>
              <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mt-2">
                {stats.logs.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-2">Events ingested</p>
            </div>
            <div className="bg-gradient-to-br from-cyan-600 to-blue-600 p-4 rounded-xl shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Alerts Card */}
        <div className={`bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl shadow-2xl border border-gray-700 hover:border-yellow-500 transition-all duration-300 ${animateStats ? 'scale-105' : 'scale-100'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-wider font-semibold">Active Alerts</p>
              <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mt-2">
                {stats.alerts.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-2">Detection matches</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-600 to-orange-600 p-4 rounded-xl shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Incidents Card */}
        <div className={`bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl shadow-2xl border border-gray-700 hover:border-red-500 transition-all duration-300 ${animateStats ? 'scale-105' : 'scale-100'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm uppercase tracking-wider font-semibold">Security Incidents</p>
              <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-pink-500 mt-2">
                {stats.incidents.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-2">Correlated threats</p>
            </div>
            <div className="bg-gradient-to-br from-red-600 to-pink-600 p-4 rounded-xl shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Severity Breakdown with enhanced visuals */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Log Severity */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2 text-2xl">📊</span> Log Severity Distribution
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
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2 text-2xl">🎯</span> Alert Severity Distribution
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
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center">
            <span className="mr-2 text-2xl">📈</span> Top Event Types
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(summary.log_event_types)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([eventType, count]) => (
                <div key={eventType} className="bg-gray-700/50 hover:bg-gray-700 rounded-lg p-4 text-center transition-all duration-200 border border-gray-600">
                  <p className="text-gray-300 font-mono text-sm mb-2 truncate">{eventType}</p>
                  <p className="text-2xl font-bold text-cyan-400">{count}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Detection Engine Info */}
      {stats.detection_engine && (
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-6 shadow-2xl">
          <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center">
            <span className="mr-2 text-2xl">⚙️</span> Detection Engine
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-700/50 rounded p-4 border border-gray-600">
              <p className="text-gray-400 text-sm">Total Rules</p>
              <p className="text-2xl font-bold text-cyan-400">{stats.detection_engine.total_rules}</p>
            </div>
            {stats.detection_engine.by_severity && Object.entries(stats.detection_engine.by_severity).map(([severity, count]) => (
              <div key={severity} className="bg-gray-700/50 rounded p-4 border border-gray-600">
                <p className="text-gray-400 text-sm capitalize">{severity} Rules</p>
                <p className={`text-2xl font-bold ${severity === 'critical' ? 'text-red-400' : severity === 'high' ? 'text-orange-400' : severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`}>{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard
