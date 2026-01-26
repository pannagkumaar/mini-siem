import React, { useState, useEffect } from 'react'
import { getLogs } from './api'

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

        // Extract unique values for filters
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
    const interval = setInterval(fetchLogs, 15000) // Refresh every 15s

    return () => clearInterval(interval)
  }, [hours, limit, filters])

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

  const getSourceColor = (source) => {
    const colors = {
      'windows': 'bg-blue-900/50 text-blue-200 border-blue-800',
      'linux': 'bg-orange-900/50 text-orange-200 border-orange-800',
      'firewall': 'bg-red-900/50 text-red-200 border-red-800',
      'network': 'bg-purple-900/50 text-purple-200 border-purple-800',
      'app': 'bg-green-900/50 text-green-200 border-green-800',
    }
    return colors[source?.toLowerCase()] || 'bg-gray-800 text-gray-300 border-gray-700'
  }

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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Security Logs</h2>
          <p className="text-sm text-gray-500 mt-1">Raw log data</p>
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

      {/* Filter Bars */}
      <div className="space-y-3">
        {/* Severity Filter */}
        {availableSeverities.length > 0 && (
          <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Filter by Severity</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilters({...filters, severity: null})}
                className={`px-3 py-1.5 rounded text-xs font-medium transition border ${
                  filters.severity === null 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                }`}
              >
                All ({logs.length})
              </button>
              {availableSeverities.map(severity => (
                <button
                  key={severity}
                  onClick={() => setFilters({...filters, severity})}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition border ${
                    filters.severity === severity
                      ? getSeverityColor(severity)
                      : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                  }`}
                >
                  {severity} ({severityCounts[severity.toLowerCase()] || 0})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Source Filter */}
        {availableSources.length > 0 && (
          <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Filter by Source</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilters({...filters, source: null})}
                className={`px-3 py-1.5 rounded text-xs font-medium transition border ${
                  filters.source === null 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                }`}
              >
                All Sources
              </button>
              {availableSources.map(source => (
                <button
                  key={source}
                  onClick={() => setFilters({...filters, source})}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition border ${
                    filters.source === source
                      ? getSourceColor(source)
                      : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                  }`}
                >
                  {source} ({sourceCounts[source.toLowerCase()] || 0})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Event Type Filter */}
        {availableEventTypes.length > 0 && (
          <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
            <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Filter by Event Type</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilters({...filters, event_type: null})}
                className={`px-3 py-1.5 rounded text-xs font-medium transition border ${
                  filters.event_type === null 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                }`}
              >
                All Events
              </button>
              {availableEventTypes.map(eventType => (
                <button
                  key={eventType}
                  onClick={() => setFilters({...filters, event_type: eventType})}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition border ${
                    filters.event_type === eventType
                      ? 'bg-blue-900/50 text-blue-200 border-blue-800'
                      : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                  }`}
                >
                  {eventType}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading logs</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <p className="text-gray-400">No logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log, idx) => (
            <div 
              key={idx}
              className="bg-[#0f1629] border border-[#1a2332] rounded overflow-hidden"
            >
              <div 
                className="p-3 cursor-pointer hover:bg-[#151b2e] transition"
                onClick={() => setExpandedId(expandedId === idx ? null : idx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1">
                    <span className="text-gray-600 text-xs font-mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(log.severity)}`}>
                      {log.severity}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSourceColor(log.source)}`}>
                      {log.source}
                    </span>
                    <span className="text-sm text-gray-300">{log.event_type}</span>
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
                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                  <span>Host: {log.host || 'N/A'}</span>
                  <span>User: {log.user || 'N/A'}</span>
                  {log.ip && <span>IP: {log.ip}</span>}
                </div>
              </div>

              {expandedId === idx && (
                <div className="px-3 pb-3 border-t border-[#1a2332] pt-3 bg-[#0a0e27]">
                  {log.raw ? (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Raw Log Data</h4>
                      <div className="bg-[#0f1629] border border-[#1a2332] rounded p-3 font-mono text-xs text-gray-300 max-h-96 overflow-auto">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.raw, null, 2)}</pre>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Log Fields</h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {Object.entries(log).map(([key, value]) => (
                          key !== 'raw' && (
                            <div key={key} className="flex justify-between">
                              <span className="text-gray-500">{key}:</span>
                              <span className="text-gray-300 font-mono">{String(value)}</span>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default LogsPage
