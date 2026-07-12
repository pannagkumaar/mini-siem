import React, { useState, useEffect } from 'react'
import {
  getIncidents, startInvestigation, resolveIncident, updateIncidentStatus,
  generateIncidentRCA, getIncidentRCA, respondToIncident, getIncidentResponses,
} from '../api'
import {
  Panel, SeverityTag, StatusTag, RiskBadge, NeutralTag, FilterChip, ConsoleSpinner, Chevron, PulseDot,
  SEVERITY_COLOR, STATUS_COLOR,
} from './ui'

const MITRE_TACTIC_URL = (id) => `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`

export function IncidentsPage() {
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hours, setHours] = useState(24)
  const [sortBy, setSortBy] = useState('timestamp')
  const [expandedId, setExpandedId] = useState(null)
  const [filterStatus, setFilterStatus] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [showStatusModal, setShowStatusModal] = useState(null)
  const [statusNotes, setStatusNotes] = useState('')
  const [successMessage, setSuccessMessage] = useState(null)
  const [resolveMode, setResolveMode] = useState(null)
  const [rcaByIncident, setRcaByIncident] = useState({})
  const [rcaLoading, setRcaLoading] = useState(new Set())
  const [responsesByIncident, setResponsesByIncident] = useState({})
  const [respondForm, setRespondForm] = useState({}) // { [incidentId]: { action, target } }
  const [respondLoading, setRespondLoading] = useState(null)

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        setLoading(true)
        const response = await getIncidents(hours, sortBy)
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
  }, [hours, sortBy])

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

    if (nextExpanded !== null && incidentId && !(incidentId in responsesByIncident)) {
      try {
        const response = await getIncidentResponses(incidentId)
        setResponsesByIncident(prev => ({ ...prev, [incidentId]: response.data.responses || [] }))
      } catch (err) {
        // No response history yet - that's fine
      }
    }
  }

  const defaultRespondTarget = (incident, action) => {
    if (action === 'block_ip') return (incident.ips && incident.ips[0]) || ''
    if (action === 'disable_user') return (incident.users && incident.users[0]) || ''
    return (incident.hosts && incident.hosts[0]) || ''
  }

  const handleRespond = async (incident) => {
    const incidentId = incident.incident_id || incident._id
    const form = respondForm[incidentId] || {}
    const action = form.action || 'block_ip'
    const target = (form.target ?? defaultRespondTarget(incident, action)).trim()
    if (!target) {
      setError('A target is required for the response action')
      setTimeout(() => setError(null), 3000)
      return
    }

    setRespondLoading(incidentId)
    try {
      const response = await respondToIncident(incidentId, action, target)
      setResponsesByIncident(prev => ({
        ...prev,
        [incidentId]: [response.data.action, ...(prev[incidentId] || [])],
      }))
      setSuccessMessage(`Simulated ${action} on ${target}`)
      setTimeout(() => setSuccessMessage(null), 3000)
    } catch (err) {
      setError(err.message || 'Failed to record response action')
      setTimeout(() => setError(null), 3000)
    } finally {
      setRespondLoading(null)
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
        <div className="border hairline rounded p-4">
          <div className="flex items-center gap-2">
            <PulseDot live color="var(--signal)" />
            <span className="eyebrow text-signal">Generating root cause analysis&hellip;</span>
          </div>
        </div>
      )
    }

    if (!rca) {
      return (
        <div className="border hairline rounded p-4 flex items-center justify-between">
          <span className="eyebrow">AI Root Cause Analysis</span>
          <button onClick={() => handleGenerateRCA(incidentId)} className="btn is-active">
            Generate AI RCA
          </button>
        </div>
      )
    }

    const listSection = (title, items) => (
      items && items.length > 0 && (
        <div className="mb-4">
          <div className="eyebrow mb-1.5">{title}</div>
          <ul className="space-y-1">
            {items.map((item, i) => (
              <li key={i} className="text-sm text-bone/90 flex gap-2">
                <span className="text-faint">&mdash;</span>
                <span>{typeof item === 'object' ? `${item.id || ''} ${item.name || ''}`.trim() : item}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    )

    return (
      <div className="border rounded p-4" style={{ borderColor: 'var(--line-2)' }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="eyebrow text-signal">AI Root Cause Analysis</span>
          <NeutralTag>{rca.mode === 'llm' ? 'LLM mode' : 'template mode'}</NeutralTag>
          <button
            onClick={() => handleGenerateRCA(incidentId, true)}
            className="ml-auto btn"
            title="Regenerate"
          >
            Regenerate
          </button>
        </div>

        <div className="mb-4">
          <div className="eyebrow mb-1.5">Threat Summary</div>
          <p className="text-sm text-bone/90">{rca.threat_summary}</p>
        </div>
        <div className="mb-4">
          <div className="eyebrow mb-1.5">Root Cause</div>
          <p className="text-sm text-bone/90">{rca.root_cause_analysis}</p>
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
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-xl font-semibold text-bone tracking-tight">Incidents</h1>
          <p className="eyebrow mt-1">Correlated security events</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <FilterChip active={sortBy === 'timestamp'} onClick={() => setSortBy('timestamp')}>
              Newest
            </FilterChip>
            <FilterChip active={sortBy === 'risk'} onClick={() => setSortBy('risk')} color={SEVERITY_COLOR.critical}>
              Highest risk
            </FilterChip>
          </div>
          <select value={hours} onChange={(e) => setHours(parseInt(e.target.value))} className="field mono text-xs px-3 py-2">
            <option value="1">Last 1 hour</option>
            <option value="6">Last 6 hours</option>
            <option value="24">Last 24 hours</option>
            <option value="168">Last 7 days</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--crit)', color: 'var(--crit)', background: 'rgba(255,77,61,0.06)' }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--ok)', color: 'var(--ok)', background: 'rgba(62,207,142,0.06)' }}>
          {successMessage}
        </div>
      )}

      {/* Status Filter Bar */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip active={filterStatus === null} onClick={() => setFilterStatus(null)}>
          All &middot; {incidents.length}
        </FilterChip>
        {['open', 'investigating', 'resolved'].map((status) => (
          statusCounts[status] > 0 && (
            <FilterChip
              key={status}
              active={filterStatus === status}
              onClick={() => setFilterStatus(status)}
              color={STATUS_COLOR[status]}
            >
              {status} &middot; {statusCounts[status]}
            </FilterChip>
          )
        ))}
      </div>

      {/* Incidents List */}
      {loading ? (
        <ConsoleSpinner label="Loading incidents" />
      ) : filteredIncidents.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-dim text-sm">No incidents found</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {filteredIncidents.map((incident, idx) => (
            <Panel key={idx} className="overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <SeverityTag severity={incident.severity} />
                      <StatusTag status={incident.status} />
                      <RiskBadge score={incident.risk_score} band={incident.risk_band} factors={incident.risk_factors} />
                      <span className="mono text-[11px] text-faint">{new Date(incident.timestamp).toLocaleString()}</span>
                    </div>
                    <h3 className="text-[15px] font-medium text-bone mb-1">{incident.pattern_name || 'Incident'}</h3>
                    <p className="text-sm text-dim">{incident.description}</p>
                  </div>
                  <button onClick={() => handleExpand(idx, incident)} className="ml-4">
                    <Chevron open={expandedId === idx} />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {incident.status === 'open' && (
                    <button
                      onClick={() => handleInvestigate(incident.incident_id, idx)}
                      disabled={actionLoading === `investigate-${idx}`}
                      className="btn"
                    >
                      {actionLoading === `investigate-${idx}` ? 'Processing…' : 'Start Investigation'}
                    </button>
                  )}
                  {incident.status !== 'resolved' && (
                    <>
                      <button
                        onClick={() => { setShowStatusModal(idx); setResolveMode('status'); }}
                        className="btn"
                      >
                        Update Status
                      </button>
                      <button
                        onClick={() => { setShowStatusModal(idx); setResolveMode('resolve'); }}
                        className="btn is-active"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>

              {expandedId === idx && (
                <div className="px-4 pb-4 border-t hairline pt-4">
                  <div className="space-y-5">
                    <div>
                      <div className="eyebrow mb-2">Incident Details</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <span className="text-faint">Incident ID</span>
                          <span className="text-dim ml-2 mono text-xs">{incident.incident_id || 'n/a'}</span>
                        </div>
                        <div>
                          <span className="text-faint">Pattern</span>
                          <span className="text-dim ml-2 mono text-xs">{incident.pattern_id || 'n/a'}</span>
                        </div>
                      </div>
                    </div>

                    {incident.risk_factors && incident.risk_factors.length > 0 && (
                      <div>
                        <div className="eyebrow mb-2">
                          Risk Score &mdash; {incident.risk_score} ({incident.risk_band})
                        </div>
                        <div className="space-y-1 border hairline rounded p-3">
                          {incident.risk_factors.map((factor, i) => (
                            <div key={i} className="flex justify-between text-xs mono">
                              <span className="text-dim">{factor.label}</span>
                              <span className="text-bone">+{factor.points}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {incident.suspected_attack_chain && (
                      <div>
                        <div className="eyebrow mb-2">Suspected Attack Chain</div>
                        <p className="text-sm text-bone/90 mono border hairline rounded p-3">
                          {incident.suspected_attack_chain}
                        </p>
                      </div>
                    )}

                    {incident.mitre_techniques && incident.mitre_techniques.length > 0 && (
                      <div>
                        <div className="eyebrow mb-2">MITRE ATT&amp;CK Techniques</div>
                        <div className="flex flex-wrap gap-2">
                          {incident.mitre_techniques.map((tag, i) => (
                            <a key={i} href={MITRE_TACTIC_URL(tag)} target="_blank" rel="noopener noreferrer">
                              <NeutralTag>{tag}</NeutralTag>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="eyebrow mb-2">Affected Systems</div>
                      <div className="space-y-1 text-sm">
                        {incident.hosts && incident.hosts.length > 0 && (
                          <div><span className="text-faint">Hosts </span><span className="text-bone mono text-xs">{incident.hosts.join(', ')}</span></div>
                        )}
                        {incident.users && incident.users.length > 0 && (
                          <div><span className="text-faint">Users </span><span className="text-bone mono text-xs">{incident.users.join(', ')}</span></div>
                        )}
                        {(!incident.hosts || incident.hosts.length === 0) && (!incident.users || incident.users.length === 0) && (
                          <div className="text-faint text-xs">No system information available</div>
                        )}
                      </div>
                    </div>

                    {incident.events && incident.events.length > 0 && (
                      <div>
                        <div className="eyebrow mb-2">Related Events ({incident.events.length})</div>
                        <div className="space-y-2">
                          {incident.events.slice(0, 5).map((event, eventIdx) => (
                            <div key={eventIdx} className="border hairline rounded p-3">
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-bone text-sm mono">{event.event_type || 'event'}</span>
                                <span className="mono text-[11px] text-faint">{new Date(event.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><span className="text-faint">Host</span><span className="text-dim ml-1">{event.host || 'n/a'}</span></div>
                                <div><span className="text-faint">User</span><span className="text-dim ml-1">{event.user || 'n/a'}</span></div>
                                {event.source && <div><span className="text-faint">Source</span><span className="text-dim ml-1">{event.source}</span></div>}
                                {event.severity && <div><span className="text-faint">Severity</span><span className="text-dim ml-1 capitalize">{event.severity}</span></div>}
                              </div>
                              {event.raw && (
                                <details className="mt-2">
                                  <summary className="text-faint text-xs cursor-pointer hover:text-dim">Raw data</summary>
                                  <div className="border hairline rounded p-2 mt-1 mono text-xs text-dim max-h-32 overflow-auto">
                                    <pre className="whitespace-pre-wrap">{JSON.stringify(event.raw, null, 2)}</pre>
                                  </div>
                                </details>
                              )}
                            </div>
                          ))}
                          {incident.events.length > 5 && (
                            <p className="text-xs text-faint">+ {incident.events.length - 5} more events</p>
                          )}
                        </div>
                      </div>
                    )}

                    {incident.timeline && incident.timeline.length > 0 && (
                      <div>
                        <div className="eyebrow mb-2">Timeline</div>
                        <div className="space-y-1.5 border-l hairline pl-3">
                          {incident.timeline.map((step, stepIdx) => (
                            <div key={stepIdx} className="flex items-start gap-2 text-xs">
                              <span className="mono text-faint shrink-0">
                                {step.timestamp ? new Date(step.timestamp).toLocaleTimeString() : 'n/a'}
                              </span>
                              <span className="text-dim">
                                {step.rule_name || step.rule_id} <span className="text-faint">({step.event_type})</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {incident.recommended_actions && incident.recommended_actions.length > 0 && (
                      <div>
                        <div className="eyebrow mb-2">Recommended Actions</div>
                        <div className="space-y-1.5">
                          {incident.recommended_actions.map((action, actionIdx) => (
                            <label key={actionIdx} className="flex items-start gap-2 text-sm text-bone/90 cursor-pointer">
                              <input type="checkbox" className="mt-1 accent-signal" />
                              <span>{action}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="eyebrow mb-2">
                        Response Actions <span className="text-faint normal-case">(simulated)</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <select
                          value={respondForm[incident.incident_id || incident._id]?.action || 'block_ip'}
                          onChange={(e) => {
                            const id = incident.incident_id || incident._id
                            const action = e.target.value
                            setRespondForm(prev => ({ ...prev, [id]: { ...prev[id], action } }))
                          }}
                          className="field mono text-xs px-2 py-1.5"
                        >
                          <option value="block_ip">Block IP</option>
                          <option value="disable_user">Disable User</option>
                          <option value="isolate_host">Isolate Host</option>
                        </select>
                        <input
                          type="text"
                          value={
                            respondForm[incident.incident_id || incident._id]?.target
                            ?? defaultRespondTarget(incident, respondForm[incident.incident_id || incident._id]?.action || 'block_ip')
                          }
                          onChange={(e) => {
                            const id = incident.incident_id || incident._id
                            const target = e.target.value
                            setRespondForm(prev => ({ ...prev, [id]: { ...prev[id], target } }))
                          }}
                          className="field text-xs px-2 py-1.5 flex-1 min-w-[140px]"
                          placeholder="target (ip / user / host)"
                        />
                        <button
                          onClick={() => handleRespond(incident)}
                          disabled={respondLoading === (incident.incident_id || incident._id)}
                          className="btn is-active"
                        >
                          {respondLoading === (incident.incident_id || incident._id) ? 'Executing…' : 'Execute'}
                        </button>
                      </div>
                      {(responsesByIncident[incident.incident_id || incident._id] || []).length > 0 && (
                        <div className="space-y-1.5">
                          {(responsesByIncident[incident.incident_id || incident._id] || []).map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-xs mono border hairline rounded px-3 py-2">
                              <span className="text-dim">
                                {r.action} <span className="text-faint">&rarr;</span> {r.target}
                              </span>
                              <span className="text-faint">
                                {r.executed_at ? new Date(r.executed_at).toLocaleString() : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="eyebrow mb-2">AI Root Cause Analysis</div>
                      {renderRCA(incident.incident_id || incident._id)}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal !== null && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <Panel className="max-w-md w-full">
            <div className="p-4 border-b hairline flex justify-between items-center">
              <h3 className="text-[15px] font-semibold text-bone">
                {resolveMode === 'resolve' ? 'Resolve Incident' : 'Update Status'}
              </h3>
              <button
                onClick={() => { setShowStatusModal(null); setStatusNotes(''); }}
                className="text-faint hover:text-bone"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              {resolveMode === 'status' && (
                <div>
                  <label className="eyebrow block mb-2">New Status</label>
                  <select className="field w-full px-3 py-2 text-sm" id="statusSelect">
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              )}
              <div>
                <label className="eyebrow block mb-2">Notes</label>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="field w-full px-3 py-2 text-sm"
                  rows="3"
                  placeholder="Add notes about this action…"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowStatusModal(null); setStatusNotes(''); }}
                  className="btn"
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
                  className="btn is-active"
                >
                  {resolveMode === 'resolve' ? 'Resolve' : 'Update'}
                </button>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}

export default IncidentsPage
