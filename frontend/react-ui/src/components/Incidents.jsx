import React, { useState, useEffect } from 'react'
import { getIncidents, startInvestigation, resolveIncident, updateIncidentStatus } from './api'

export function IncidentsPage() {
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours] = useState(24)
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [showStatusModal, setShowStatusModal] = useState(null)
  const [statusNotes, setStatusNotes] = useState('')
  const [successMessage, setSuccessMessage] = useState(null)
  const [resolveMode, setResolveMode] = useState(null)  // 'status' or 'resolve'

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        setLoading(true)
        const response = await getIncidents(hours)
        setIncidents(response.data.incidents || [])
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to load incidents')
        console.error('Error fetching incidents:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchIncidents()
    const interval = setInterval(fetchIncidents, 10000) // Refresh every 10s

    return () => clearInterval(interval)
  }, [hours])

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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'bg-red-900 text-red-200'
      case 'investigating':
        return 'bg-yellow-900 text-yellow-200'
      case 'resolved':
        return 'bg-green-900 text-green-200'
      default:
        return 'bg-gray-700 text-gray-200'
    }
  }

  const filteredIncidents = filterStatus
    ? incidents.filter(i => i.status?.toLowerCase() === filterStatus.toLowerCase())
    : incidents

  const statusCounts = incidents.reduce((acc, incident) => {
    const status = incident.status?.toLowerCase() || 'unknown'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  const handleInvestigate = async (incidentId, idx) => {
    try {
      setActionLoading(`investigate-${idx}`)
      const response = await startInvestigation(incidentId)
      setSuccessMessage('Investigation started ✓')
      
      // Update local state
      setIncidents(incidents.map((inc, i) => 
        i === idx ? { ...inc, status: 'investigating' } : inc
      ))
      
      // Keep success message visible longer
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      setError(err.message || 'Failed to start investigation')
      console.error('Error:', err)
      setTimeout(() => setError(null), 5000)
    } finally {
      setActionLoading(null)
    }
  }

  const handleStatusUpdate = async (incidentId, idx, newStatus) => {
    try {
      setActionLoading(`status-${idx}`)
      const response = await updateIncidentStatus(incidentId, newStatus)
      setSuccessMessage(`Status updated to ${newStatus} ✓`)
      
      // Update local state
      setIncidents(incidents.map((inc, i) => 
        i === idx ? { ...inc, status: newStatus } : inc
      ))
      
      // Close modal first
      setShowStatusModal(null)
      setStatusNotes('')
      setResolveMode(null)
      
      // Keep success message visible longer
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      setError(err.message || 'Failed to update status')
      console.error('Error:', err)
      setTimeout(() => setError(null), 5000)
    } finally {
      setActionLoading(null)
    }
  }

  const handleResolve = async (incidentId, idx) => {
    try {
      setActionLoading(`resolve-${idx}`)
      const response = await resolveIncident(incidentId, statusNotes || null)
      setSuccessMessage('Incident resolved ✓')
      
      // Update local state
      setIncidents(incidents.map((inc, i) => 
        i === idx ? { ...inc, status: 'resolved' } : inc
      ))
      
      // Close modal first
      setShowStatusModal(null)
      setStatusNotes('')
      setResolveMode(null)
      
      // Keep success message visible longer
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err) {
      setError(err.message || 'Failed to resolve incident')
      console.error('Error:', err)
      setTimeout(() => setError(null), 5000)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">🚨 Security Incidents</h1>
        <div>
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
        </div>
      </div>

      {error && (
        <div className="fixed top-4 right-4 bg-red-600 border-2 border-red-400 rounded-lg p-4 text-white shadow-lg z-40">
          <p className="font-bold text-lg">⚠️ {error}</p>
        </div>
      )}

      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-600 border-2 border-green-400 rounded-lg p-4 text-white shadow-lg z-40 animate-bounce">
          <p className="font-bold text-lg">{successMessage}</p>
        </div>
      )}

      {/* Status Filter Bar */}
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus(null)}
            className={`px-4 py-2 rounded font-semibold transition ${
              filterStatus === null 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All ({incidents.length})
          </button>
          {Object.entries(statusCounts).map(([status, count]) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded font-semibold capitalize transition ${
                filterStatus === status
                  ? `${getStatusColor(status)} ring-2 ring-white`
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {status} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Incidents List */}
      {loading && incidents.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading incidents...</p>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-lg">✓ No incidents detected</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredIncidents.map((incident, idx) => (
            <div
              key={idx}
              className="bg-gray-800 border border-gray-700 rounded-lg border-l-4 border-l-red-500 hover:border-gray-600 transition cursor-pointer"
              onClick={() => setExpandedId(expandedId === idx ? null : idx)}
            >
              {/* Incident Header */}
              <div className="p-4">
                <div className="flex justify-between items-start gap-4 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded text-sm font-bold ${getSeverityColor(incident.severity)}`}>
                        {incident.severity?.toUpperCase()}
                      </span>
                      <h3 className="text-lg font-bold text-white">{incident.title || 'Untitled Incident'}</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">ID: <span className="font-mono">{incident.pattern_id}</span></p>
                    <p className="text-sm text-gray-300 mb-3">{incident.description}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-3 py-1 rounded text-xs font-bold ${getStatusColor(incident.status)}`}>
                      {incident.status?.toUpperCase()}
                    </span>
                    <p className="text-xs text-gray-500 mt-2">{new Date(incident.timestamp).toLocaleString()}</p>
                  </div>
                </div>

                {/* Quick Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-gray-900 rounded p-3">
                  {incident.host && (
                    <div className="text-gray-400">
                      <span className="text-gray-500 text-xs">Host</span>
                      <p className="text-blue-300 font-mono">{incident.host}</p>
                    </div>
                  )}
                  {incident.user && (
                    <div className="text-gray-400">
                      <span className="text-gray-500 text-xs">User</span>
                      <p className="text-green-300">{incident.user}</p>
                    </div>
                  )}
                  {incident.alert_count !== undefined && (
                    <div className="text-gray-400">
                      <span className="text-gray-500 text-xs">Related Alerts</span>
                      <p className="text-yellow-300 font-bold text-lg">{incident.alert_count}</p>
                    </div>
                  )}
                  {incident.impact && (
                    <div className="text-gray-400">
                      <span className="text-gray-500 text-xs">Impact</span>
                      <p className="text-orange-300 capitalize">{incident.impact}</p>
                    </div>
                  )}
                </div>

                {/* Expand indicator */}
                <div className="text-right text-gray-500 mt-2">
                  <span className="text-lg">{expandedId === idx ? '▼' : '▶'}</span>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === idx && (
                <div className="border-t border-gray-700 bg-gray-900 p-4 space-y-4">
                  {/* Incident Metadata */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Incident ID</h4>
                      <p className="text-sm text-gray-300 font-mono">{incident.pattern_id}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Detected</h4>
                      <p className="text-sm text-gray-300">{new Date(incident.timestamp).toISOString()}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Status</h4>
                      <p className={`text-sm capitalize ${incident.status === 'open' ? 'text-red-300' : incident.status === 'investigating' ? 'text-yellow-300' : 'text-green-300'}`}>
                        {incident.status}
                      </p>
                    </div>
                    {incident.start_time && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Started</h4>
                        <p className="text-sm text-gray-300">{new Date(incident.start_time).toLocaleTimeString()}</p>
                      </div>
                    )}
                    {incident.end_time && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Ended</h4>
                        <p className="text-sm text-gray-300">{new Date(incident.end_time).toLocaleTimeString()}</p>
                      </div>
                    )}
                    {incident.affected_entities && (
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-1">Affected Entities</h4>
                        <p className="text-sm text-gray-300">{incident.affected_entities}</p>
                      </div>
                    )}
                  </div>

                  {/* Alert Timeline */}
                  {incident.alert_timeline && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">📊 Alert Timeline</h4>
                      <div className="bg-gray-800 rounded p-3 space-y-2 max-h-64 overflow-y-auto">
                        {Array.isArray(incident.alert_timeline) ? (
                          incident.alert_timeline.map((alert, i) => (
                            <div key={i} className="text-xs text-gray-400 border-l-2 border-gray-700 pl-3 py-1">
                              <span className="text-blue-400">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                              {' - '}
                              <span className="text-yellow-400">{alert.rule_name}</span>
                              <span className="text-gray-500"> ({alert.host})</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500">No timeline available</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendation */}
                  {incident.recommendation && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">💡 Recommendation</h4>
                      <div className="bg-blue-900 border border-blue-700 rounded p-3">
                        <p className="text-sm text-blue-200">{incident.recommendation}</p>
                      </div>
                    </div>
                  )}

                  {/* Full JSON View */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-300 mb-2 uppercase">Full Details</h4>
                    <div className="bg-gray-800 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">
                      <pre>{JSON.stringify(incident, null, 2)}</pre>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-2 border-t border-gray-700">
                    <button 
                      onClick={() => handleInvestigate(incident._id || incident.pattern_id, idx)}
                      disabled={actionLoading === `investigate-${idx}` || incident.status === 'investigating'}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition"
                    >
                      {actionLoading === `investigate-${idx}` ? '⏳ Loading...' : '👁️ Investigate'}
                    </button>
                    <button 
                      onClick={() => {
                        setShowStatusModal(idx)
                        setResolveMode('status')
                        setStatusNotes('')
                      }}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm font-semibold transition"
                    >
                      🔄 Status Update
                    </button>
                    <button 
                      onClick={() => {
                        setShowStatusModal(idx)
                        setResolveMode('resolve')
                        setStatusNotes('')
                      }}
                      disabled={actionLoading === `resolve-${idx}` || incident.status === 'resolved'}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition"
                    >
                      {actionLoading === `resolve-${idx}` ? '⏳ Loading...' : '✓ Resolve'}
                    </button>
                  </div>

                  {/* Status Update Modal */}
                  {showStatusModal === idx && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-bold text-white mb-4">
                          {resolveMode === 'resolve' ? 'Resolve Incident' : 'Update Incident Status'}
                        </h3>
                        
                        {/* Status Update Mode */}
                        {resolveMode === 'status' && (
                          <div className="space-y-3 mb-6">
                            <label className="flex items-center gap-3 cursor-pointer p-3 rounded hover:bg-gray-700">
                              <input 
                                type="radio" 
                                name="status" 
                                value="open" 
                                onChange={() => handleStatusUpdate(incident._id || incident.pattern_id, idx, 'open')}
                                className="w-4 h-4"
                              />
                              <span className="text-white">🔴 Open</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer p-3 rounded hover:bg-gray-700">
                              <input 
                                type="radio" 
                                name="status" 
                                value="investigating" 
                                onChange={() => handleStatusUpdate(incident._id || incident.pattern_id, idx, 'investigating')}
                                className="w-4 h-4"
                              />
                              <span className="text-white">🟡 Investigating</span>
                            </label>
                          </div>
                        )}

                        {/* Resolve Mode */}
                        {resolveMode === 'resolve' && (
                          <>
                            <p className="text-gray-300 mb-4">Are you sure you want to resolve this incident?</p>
                            <div className="mb-4">
                              <label className="block text-sm text-gray-300 mb-2">Resolution Notes (optional)</label>
                              <textarea
                                value={statusNotes}
                                onChange={(e) => setStatusNotes(e.target.value)}
                                placeholder="Add resolution notes..."
                                className="w-full bg-gray-700 text-white rounded p-2 border border-gray-600 text-sm focus:outline-none focus:border-blue-500"
                                rows="3"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolve(incident._id || incident.pattern_id, idx)}
                                disabled={actionLoading === `resolve-${idx}`}
                                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded font-semibold transition"
                              >
                                {actionLoading === `resolve-${idx}` ? '⏳ Resolving...' : '✓ Confirm Resolve'}
                              </button>
                              <button
                                onClick={() => {
                                  setShowStatusModal(null)
                                  setStatusNotes('')
                                  setResolveMode(null)
                                }}
                                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition"
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        )}

                        {/* Status Update Buttons */}
                        {resolveMode === 'status' && (
                          <button 
                            onClick={() => {
                              setShowStatusModal(null)
                              setStatusNotes('')
                              setResolveMode(null)
                            }}
                            className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary Footer */}
      {!loading && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-center text-sm text-gray-400">
          Showing {filteredIncidents.length} of {incidents.length} incidents from the last {hours} hour(s)
        </div>
      )}
    </div>
  )
}

export default IncidentsPage
