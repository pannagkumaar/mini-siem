import React, { useState, useEffect } from 'react'
import { getRules } from './api'

export function RulesPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterSeverity, setFilterSeverity] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true)
        const response = await getRules()
        setStats(response.data)
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to load rules')
        console.error('Error fetching rules:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRules()
    const interval = setInterval(fetchRules, 30000) // Refresh every 30s

    return () => clearInterval(interval)
  }, [])

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

  const filteredRules = filterSeverity
    ? stats?.rules?.filter(r => r.severity?.toLowerCase() === filterSeverity.toLowerCase()) || []
    : stats?.rules || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-3xl font-bold">⚙️ Detection Rules</h1>

      {error && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 text-red-100">
          <p className="font-bold">⚠️ Error</p>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading rules...</p>
        </div>
      ) : !stats || !stats.rules || stats.rules.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">No rules available</p>
        </div>
      ) : (
        <>
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Total Rules</p>
                  <p className="text-4xl font-bold text-blue-400">{stats.total_rules}</p>
                </div>
                <span className="text-4xl">📋</span>
              </div>
            </div>

            {stats.by_severity && Object.entries(stats.by_severity)
              .sort((a, b) => {
                const order = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 }
                return (order[a[0].toLowerCase()] || 999) - (order[b[0].toLowerCase()] || 999)
              })
              .map(([severity, count]) => (
                <div key={severity} className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-sm mb-1 capitalize">{severity} Severity</p>
                      <p className={`text-4xl font-bold ${getSeverityTextColor(severity)}`}>{count}</p>
                    </div>
                    <span className={`text-2xl px-3 py-2 rounded ${getSeverityColor(severity)}`}>
                      {severity.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {/* Severity Filter */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2 font-semibold">Filter by Severity:</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterSeverity(null)}
                className={`px-4 py-2 rounded font-semibold transition ${
                  filterSeverity === null 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                All ({stats.total_rules})
              </button>
              {stats.by_severity && Object.entries(stats.by_severity).map(([severity, count]) => (
                <button
                  key={severity}
                  onClick={() => setFilterSeverity(severity)}
                  className={`px-4 py-2 rounded font-semibold capitalize transition ${
                    filterSeverity === severity
                      ? `${getSeverityColor(severity)}`
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {severity} ({count})
                </button>
              ))}
            </div>
          </div>

          {/* Rules List */}
          <div className="space-y-3">
            {filteredRules.length === 0 ? (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                <p className="text-gray-400">No rules match the selected severity</p>
              </div>
            ) : (
              filteredRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="bg-gray-800 border border-gray-700 rounded-lg border-l-4 border-l-blue-500 hover:border-gray-600 transition cursor-pointer"
                  onClick={() => setExpandedId(expandedId === idx ? null : idx)}
                >
                  {/* Rule Header */}
                  <div className="p-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded text-sm font-bold ${getSeverityColor(rule.severity)}`}>
                            {rule.severity?.toUpperCase()}
                          </span>
                          <h3 className="text-lg font-bold text-white">{rule.name}</h3>
                        </div>
                        <p className="text-sm text-gray-400 font-mono mb-2">ID: {rule.id}</p>
                        {rule.description && (
                          <p className="text-sm text-gray-300">{rule.description}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-lg text-gray-500">{expandedId === idx ? '▼' : '▶'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === idx && rule.condition && (
                    <div className="border-t border-gray-700 bg-gray-900 p-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Condition</h4>
                        <div className="bg-gray-800 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                          <pre>{JSON.stringify(rule.condition, null, 2)}</pre>
                        </div>
                      </div>

                      {rule.mitre_tag && (
                        <div>
                          <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">MITRE ATT&CK</h4>
                          <div className="flex gap-2 flex-wrap">
                            {Array.isArray(rule.mitre_tag) ? rule.mitre_tag.map((tag, i) => (
                              <span key={i} className="bg-purple-700 text-purple-200 px-3 py-1 rounded text-xs font-semibold">
                                {tag}
                              </span>
                            )) : (
                              <span className="text-gray-500">{rule.mitre_tag}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Full JSON */}
                      <div>
                        <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Full Rule</h4>
                        <div className="bg-gray-800 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto">
                          <pre>{JSON.stringify(rule, null, 2)}</pre>
                        </div>
                      </div>

                      {/* Info Footer */}
                      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
                        <p>Rule is actively monitoring for matching patterns</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Summary Footer */}
          {filteredRules.length > 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center text-sm text-gray-400">
              Showing {filteredRules.length} of {stats.total_rules} rules
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default RulesPage
