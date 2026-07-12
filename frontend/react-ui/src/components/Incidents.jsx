import React, { useState, useEffect } from 'react'
import {
  getIncidents, startInvestigation, resolveIncident, updateIncidentStatus,
  generateIncidentRCA, getIncidentRCA,
} from '../api'

const MITRE_TACTIC_URL = (id) => `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`

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
  const [resolveMode, setResolveMode] = useState(null)
  const [rcaByIncident, setRcaByIncident] = useState({})
  const [rcaLoading, setRcaLoading] = useState(new Set())

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
    const interval = setInterval(fetchIncidents, 10000)

    return () => clearInterval(interval)
  }, [hours])

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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return 'bg-red-900/50 text-red-200 border-red-800'
      case 'investigating':
        return 'bg-yellow-900/50 text-yellow-200 border-yellow-800'
      case 'resolved':
        return 'bg-green-900/50 text-green-200 border-green-800'
      default:
        return 'bg-gray-800 text-gray-300 border-gray-700'
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
      await startInvestigation(incidentId)
      setSuccessMessage('Investigation started')
      
      setIncidents(incidents.map((inc, i) => 
        i === idx ? { ...inc, status: 'investigating' } : inc
      ))
      
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to start investigation')
      setTimeout(() => setError(null), 3000)
    } finally {
      setActionLoading(null)
    }
  }

  const handleStatusUpdate = async (incidentId, idx, newStatus) => {
    try {
      setActionLoading(`status-${idx}`)
      await updateIncidentStatus(incidentId, newStatus, statusNotes)
      setSuccessMessage(`Status updated to ${newStatus}`)
      
      setIncidents(incidents.map((inc, i) => 
        i === idx ? { ...inc, status: newStatus } : inc
      ))
      
      setShowStatusModal(null)
      setStatusNotes('')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update status')
      setTimeout(() => setError(null), 3000)
    } finally {
      setActionLoading(null)
    }
  }

  const handleResolve = async (incidentId, idx) => {
    try {
      setActionLoading(`resolve-${idx}`)
      await resolveIncident(incidentId, statusNotes)
      setSuccessMessage('Incident resolved')
      
      setIncidents(incidents.map((inc, i) => 
        i === idx ? { ...inc, status: 'resolved' } : inc
      ))
      
      setShowStatusModal(null)
      setStatusNotes('')
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to resolve incident')
      setTimeout(() => setError(null), 3000)
    } finally {
      setActionLoading(null)
    }
  }

  const handleExpand = async (idx, incident) => {
    const nextExpanded = expandedId === idx ? null : idx
    setExpandedId(nextExpanded)

    const incidentId = incident.incident_id || incident._id
    if (nextExpanded !== null && incidentId && !(incidentId in rcaByIncident)) {
      try {
        const response = await getIncidentRCA(incidentId)
        if (response.data.rca) {
          setRcaByIncident(prev => ({ ...prev, [incidentId]: response.data.rca }))
        }
      } catch (err) {
        // No RCA yet - that's fine, user can generate one
      }
    }
  }

  const handleGenerateRCA = async (incidentId, force = false) => {
    setRcaLoading(prev => new Set(prev).add(incidentId))
    try {
      const response = await generateIncidentRCA(incidentId, force)
      if (response.data.rca) {
        setRcaByIncident(prev => ({ ...prev, [incidentId]: response.data.rca }))
      }
    } catch (err) {
      setError(err.message || 'Failed to generate AI RCA')
      setTimeout(() => setError(null), 4000)
    } finally {
      setRcaLoading(prev => {
        const next = new Set(prev)
        next.delete(incidentId)
        return next
      })
    }
  }

  const renderRCA = (incidentId) => {
    const rca = rcaByIncident[incidentId]
    const isLoading = rcaLoading.has(incidentId)

    if (isLoading) {
      return (
        <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
            <span className="text-blue-300 text-sm font-medium">Generating AI root cause analysis...</span>
          </div>
        </div>
      )
    }

    if (!rca) {
      return (
        <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 flex items-center justify-between">
          <span className="text-yellow-400 text-sm font-medium">AI Root Cause Analysis</span>
          <button
            onClick={() => handleGenerateRCA(incidentId)}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition"
          >
            Generate AI RCA
          </button>
        </div>
      )
    }

    const listSection = (title, items) => (
      items && items.length > 0 && (
        <div className="mb-3">
          <h5 className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">{title}</h5>
          <ul className="list-disc list-inside space-y-0.5">
            {items.map((item, i) => (
              <li key={i} className="text-sm text-gray-300">
                {typeof item === 'object' ? `${item.id || ''} ${item.name || ''}`.trim() : item}
              </li>
            ))}
          </ul>
        </div>
      )
    )

    return (
      <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-green-300 text-sm font-bold">AI Root Cause Analysis</span>
          <span className="text-xs px-2 py-0.5 rounded bg-[#0f1629] border border-[#1a2332] text-gray-400">
            {rca.mode === 'llm' ? 'LLM mode' : 'template mode'}
          </span>
          <button
            onClick={() => handleGenerateRCA(incidentId, true)}
            className="ml-auto px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition"
            title="Regenerate"
          >
            Regenerate
          </button>
        </div>

        <div className="mb-3">
          <h5 className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">Threat Summary</h5>
          <p className="text-sm text-gray-200">{rca.threat_summary}</p>
        </div>
        <div className="mb-3">
          <h5 className="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">Root Cause</h5>
          <p className="text-sm text-gray-200">{rca.root_cause_analysis}</p>
        </div>
        {listSection('Evidence', rca.evidence)}
        {listSection('MITRE ATT&CK Mapping', rca.mitre_attack_mapping)}
        {listSection('Immediate Containment', rca.immediate_containment)}
        {listSection('Investigation Steps', rca.investigation_steps)}
        {listSection('Remediation', rca.remediation)}
        {listSection('False Positive Considerations', rca.false_positive_considerations)}
        {listSection('Prevention Measures', rca.prevention_measures)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Security Incidents</h2>
          <p className="text-sm text-gray-500 mt-1">Correlated security events</p>
        </div>
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
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded px-4 py-3 text-red-200 text-sm">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {successMessage && (
        <div className="bg-green-900/20 border border-green-800 rounded px-4 py-3 text-green-200 text-sm">
          <span className="font-medium">Success:</span> {successMessage}
        </div>
      )}

      {/* Status Filter Bar */}
      <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus(null)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition border ${
              filterStatus === null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
            }`}
          >
            All ({incidents.length})
          </button>
          {['open', 'investigating', 'resolved'].map((status) => (
            statusCounts[status] > 0 && (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition border capitalize ${
                  filterStatus === status
                    ? getStatusColor(status)
                    : 'bg-[#0a0e27] text-gray-400 border-[#1a2332] hover:border-[#2a3f5f]'
                }`}
              >
                {status} ({statusCounts[status]})
              </button>
            )
          ))}
        </div>
      </div>

      {/* Incidents List */}
      {loading ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading incidents</p>
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <p className="text-gray-400">No incidents found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident, idx) => (
            <div 
              key={idx}
              className="bg-[#0f1629] border border-[#1a2332] rounded overflow-hidden"
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(incident.severity)}`}>
                        {incident.severity}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(incident.status)}`}>
                        {incident.status}
                      </span>
                      <span className="text-gray-600 text-xs">{new Date(incident.timestamp).toLocaleString()}</span>
                    </div>
                    <h3 className="text-base font-medium text-gray-100 mb-1">{incident.pattern_name || 'Incident'}</h3>
                    <p className="text-sm text-gray-400">{incident.description}</p>
                  </div>
                  <button
                    onClick={() => handleExpand(idx, incident)}
                    className="ml-4"
                  >
                    <svg 
                      className={`w-5 h-5 text-gray-500 transition-transform ${expandedId === idx ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {incident.status === 'open' && (
                    <button
                      onClick={() => handleInvestigate(incident.incident_id, idx)}
                      disabled={actionLoading === `investigate-${idx}`}
                      className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-xs text-white disabled:opacity-50"
                    >
                      {actionLoading === `investigate-${idx}` ? 'Processing...' : 'Start Investigation'}
                    </button>
                  )}
                  {incident.status !== 'resolved' && (
                    <>
                      <button
                        onClick={() => { setShowStatusModal(idx); setResolveMode('status'); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs text-white"
                      >
                        Update Status
                      </button>
                      <button
                        onClick={() => { setShowStatusModal(idx); setResolveMode('resolve'); }}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs text-white"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expandedId === idx && (
                <div className="px-4 pb-4 border-t border-[#1a2332] pt-4 bg-[#0a0e27]">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Incident Details</h4>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-gray-500">Incident ID:</span>
                          <span className="text-gray-300 ml-2 font-mono text-xs">{incident.incident_id || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Pattern:</span>
                          <span className="text-gray-300 ml-2 font-mono text-xs">{incident.pattern_id || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {incident.suspected_attack_chain && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Suspected Attack Chain</h4>
                        <p className="text-sm text-gray-300 font-mono bg-[#0f1629] border border-[#1a2332] rounded p-2">
                          {incident.suspected_attack_chain}
                        </p>
                      </div>
                    )}

                    {incident.mitre_techniques && incident.mitre_techniques.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">MITRE ATT&CK Techniques</h4>
                        <div className="flex flex-wrap gap-2">
                          {incident.mitre_techniques.map((tag, i) => (
                            <a
                              key={i}
                              href={MITRE_TACTIC_URL(tag)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 bg-purple-900/50 hover:bg-purple-900/70 text-purple-200 border border-purple-800 rounded text-xs font-mono"
                            >
                              {tag}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Affected Systems</h4>
                      <div className="space-y-1 text-sm">
                        {incident.hosts && incident.hosts.length > 0 && (
                          <div>
                            <span className="text-gray-500">Hosts: </span>
                            <span className="text-gray-300">{incident.hosts.join(', ')}</span>
                          </div>
                        )}
                        {incident.users && incident.users.length > 0 && (
                          <div>
                            <span className="text-gray-500">Users: </span>
                            <span className="text-gray-300">{incident.users.join(', ')}</span>
                          </div>
                        )}
                        {(!incident.hosts || incident.hosts.length === 0) && (!incident.users || incident.users.length === 0) && (
                          <div className="text-gray-500 text-xs">No system information available</div>
                        )}
                      </div>
                    </div>

                    {incident.events && incident.events.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Related Events ({incident.events.length})</h4>
                        <div className="space-y-2">
                          {incident.events.slice(0, 5).map((event, eventIdx) => (
                            <div key={eventIdx} className="bg-[#0f1629] border border-[#1a2332] rounded p-3">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-gray-300 text-sm font-medium">{event.event_type || 'Event'}</span>
                                <span className="text-gray-600 text-xs">{new Date(event.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Host:</span>
                                  <span className="text-gray-300 ml-1">{event.host || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">User:</span>
                                  <span className="text-gray-300 ml-1">{event.user || 'N/A'}</span>
                                </div>
                                {event.source && (
                                  <div>
                                    <span className="text-gray-500">Source:</span>
                                    <span className="text-gray-300 ml-1">{event.source}</span>
                                  </div>
                                )}
                                {event.severity && (
                                  <div>
                                    <span className="text-gray-500">Severity:</span>
                                    <span className="text-gray-300 ml-1 capitalize">{event.severity}</span>
                                  </div>
                                )}
                              </div>
                              {event.raw && (
                                <details className="mt-2">
                                  <summary className="text-gray-500 text-xs cursor-pointer hover:text-gray-400">View raw data</summary>
                                  <div className="bg-[#0a0e27] border border-[#1a2332] rounded p-2 mt-1 font-mono text-xs text-gray-400 max-h-32 overflow-auto">
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(event.raw, null, 2)}</pre>
                                  </div>
                                </details>
                              )}
                            </div>
                          ))}
                          {incident.events.length > 5 && (
                            <p className="text-xs text-gray-500">+ {incident.events.length - 5} more events</p>
                          )}
                        </div>
                      </div>
                    )}

                    {incident.timeline && incident.timeline.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Timeline</h4>
                        <div className="space-y-1.5">
                          {incident.timeline.map((step, stepIdx) => (
                            <div key={stepIdx} className="flex items-start gap-2 text-xs">
                              <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                              <span className="text-gray-600 font-mono shrink-0">
                                {step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : 'N/A'}
                              </span>
                              <span className="text-gray-300">
                                {step.rule_name || step.rule_id} <span className="text-gray-600">({step.event_type})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {incident.recommended_actions && incident.recommended_actions.length > 0 && (
                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Recommended Actions</h4>
                        <div className="space-y-1">
                          {incident.recommended_actions.map((action, actionIdx) => (
                            <label key={actionIdx} className="flex items-start gap-2 text-sm text-gray-300">
                              <input type="checkbox" className="mt-1" />
                              <span>{action}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">AI Root Cause Analysis</h4>
                      {renderRCA(incident.incident_id || incident._id)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal !== null && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1629] border border-[#1a2332] rounded max-w-md w-full">
            <div className="p-4 border-b border-[#1a2332] flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-100">
                {resolveMode === 'resolve' ? 'Resolve Incident' : 'Update Status'}
              </h3>
              <button 
                onClick={() => { setShowStatusModal(null); setStatusNotes(''); }}
                className="text-gray-400 hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {resolveMode === 'status' && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">New Status</label>
                  <select
                    className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                    id="statusSelect"
                  >
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">Notes</label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  rows="3"
                  placeholder="Add notes about this action..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowStatusModal(null); setStatusNotes(''); }}
                  className="px-3 py-2 bg-[#1a2744] hover:bg-[#1f2d4f] border border-[#2a3f5f] rounded text-sm text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (resolveMode === 'resolve') {
                      handleResolve(incidents[showStatusModal].incident_id, showStatusModal)
                    } else {
                      const newStatus = document.getElementById('statusSelect').value
                      handleStatusUpdate(incidents[showStatusModal].incident_id, showStatusModal, newStatus)
                    }
                  }}
                  className={`px-3 py-2 rounded text-sm text-white ${
                    resolveMode === 'resolve' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {resolveMode === 'resolve' ? 'Resolve' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default IncidentsPage
