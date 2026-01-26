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

  const getSourceColor = (source) => {
    switch (source?.toLowerCase()) {
      case 'windows':
        return 'bg-blue-700'
      case 'linux':
        return 'bg-orange-700'
      case 'firewall':
        return 'bg-red-700'
      case 'network':
        return 'bg-purple-700'
      case 'app':
        return 'bg-green-700'
      default:
        return 'bg-gray-700'
    }
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
        <h1 className="text-3xl font-bold">📋 Security Logs</h1>
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

      {/* Filter Bars */}
      <div className="space-y-3">
        {/* Severity Filter */}
        {availableSeverities.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2 font-semibold">Filter by Severity:</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilters({...filters, severity: null})}
                className={`px-4 py-2 rounded font-semibold transition text-sm ${
                  filters.severity === null 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All ({logs.length})
              </button>
              {availableSeverities.map(severity => (
                <button
                  key={severity}
                  onClick={() => setFilters({...filters, severity})}
                  className={`px-4 py-2 rounded font-semibold capitalize transition text-sm ${
                    filters.severity === severity
                      ? `${getSeverityColor(severity)}`
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2 font-semibold">Filter by Source:</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilters({...filters, source: null})}
                className={`px-4 py-2 rounded font-semibold transition text-sm ${
                  filters.source === null 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All Sources
              </button>
              {availableSources.map(source => (
                <button
                  key={source}
                  onClick={() => setFilters({...filters, source})}
                  className={`px-4 py-2 rounded font-semibold capitalize transition text-sm text-white ${
                    filters.source === source
                      ? `${getSourceColor(source)} ring-2 ring-white`
                      : `${getSourceColor(source)} opacity-75 hover:opacity-100`
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
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2 font-semibold">Filter by Event Type:</p>
            <div className="flex gap-2 flex-wrap">
              <select
                value={filters.event_type || ''}
                onChange={(e) => setFilters({...filters, event_type: e.target.value || null})}
                className="bg-gray-700 text-white px-4 py-2 rounded border border-gray-600 hover:border-gray-500 text-sm"
              >
                <option value="">All Event Types</option>
                {availableEventTypes.map(eventType => (
                  <option key={eventType} value={eventType}>{eventType}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Logs List */}
      {loading && logs.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">No logs found matching your criteria</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log._id}
              className="bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-600 transition cursor-pointer"
              onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
            >
              {/* Log Header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${getSeverityColor(log.severity)}`}>
                        {log.severity?.toUpperCase()}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-bold text-white ${getSourceColor(log.source)}`}>
                        {log.source?.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded font-mono">{log.event_type}</span>
                    </div>
                    
                    {/* Quick Info */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mt-3">
                      {log.host && (
                        <div className="text-gray-400">
                          <span className="text-gray-500 block text-xs">Host</span>
                          <span className="text-blue-300 font-mono">{log.host}</span>
                        </div>
                      )}
                      {log.user && (
                        <div className="text-gray-400">
                          <span className="text-gray-500 block text-xs">User</span>
                          <span className="text-green-300">{log.user}</span>
                        </div>
                      )}
                      {log.ip && (
                        <div className="text-gray-400">
                          <span className="text-gray-500 block text-xs">IP Address</span>
                          <span className="text-yellow-300 font-mono">{log.ip}</span>
                        </div>
                      )}
                      {log.timestamp && (
                        <div className="text-gray-400">
                          <span className="text-gray-500 block text-xs">Timestamp</span>
                          <span className="text-purple-300 text-xs">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="text-right">
                        <span className="text-xl text-gray-500">{expandedId === log._id ? '▼' : '▶'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === log._id && (
                <div className="border-t border-gray-700 bg-gray-900 p-4 space-y-4">
                  {/* Field Details */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {log.timestamp && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Timestamp</h4>
                        <p className="text-sm text-gray-300">{new Date(log.timestamp).toISOString()}</p>
                      </div>
                    )}
                    {log.source && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Source</h4>
                        <p className="text-sm text-gray-300 capitalize">{log.source}</p>
                      </div>
                    )}
                    {log.event_type && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Event Type</h4>
                        <p className="text-sm text-gray-300 font-mono">{log.event_type}</p>
                      </div>
                    )}
                    {log.host && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Host</h4>
                        <p className="text-sm text-gray-300 font-mono">{log.host}</p>
                      </div>
                    )}
                    {log.user && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">User</h4>
                        <p className="text-sm text-gray-300">{log.user}</p>
                      </div>
                    )}
                    {log.ip && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">IP Address</h4>
                        <p className="text-sm text-gray-300 font-mono">{log.ip}</p>
                      </div>
                    )}
                    {log.severity && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Severity</h4>
                        <p className="text-sm text-gray-300 capitalize">{log.severity}</p>
                      </div>
                    )}
                  </div>

                  {/* Raw JSON */}
                  {log.raw && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Raw Log Data</h4>
                      <div className="bg-gray-800 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto">
                        <pre>{JSON.stringify(log.raw, null, 2)}</pre>
                      </div>
                    </div>
                  )}

                  {/* Log ID */}
                  <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                    <span className="font-mono">ID: {log._id}</span>
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
          Showing {logs.length} of {logs.length} logs from the last {hours} hour(s)
        </div>
      )}
    </div>
  )
}

export default LogsPage
