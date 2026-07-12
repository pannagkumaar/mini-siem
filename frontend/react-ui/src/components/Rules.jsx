import React, { useState, useEffect } from 'react'
import { getRules } from '../api'
import { Panel, SeverityTag, NeutralTag, ConsoleSpinner, Chevron, SEVERITY_COLOR, hexToRgba } from './ui'

const API_BASE = 'http://localhost:8000'

export function RulesClean() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterSeverity, setFilterSeverity] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    severity: 'medium',
    event_type: '',
    source: '',
    conditions: [{ field: '', operator: '', value: '' }]
  })

  useEffect(() => {
    fetchRules()
    const interval = setInterval(fetchRules, 30000)
    return () => clearInterval(interval)
  }, [])

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

  const handleCreateRule = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    setCreateSuccess(false)

    try {
      const ruleYaml = {
        id: `DET-${String(Date.now()).slice(-3)}`,
        name: newRule.name,
        description: newRule.description,
        severity: newRule.severity,
        condition: {
          event_type: newRule.event_type,
          source: newRule.source
        }
      }

      newRule.conditions.forEach(cond => {
        if (cond.field && cond.operator && cond.value) {
          if (cond.operator === 'equals') {
            ruleYaml.condition[cond.field] = cond.value
          } else if (cond.operator === 'contains') {
            ruleYaml.condition[`${cond.field}_contains`] = cond.value
          } else if (cond.operator === 'greater_than') {
            ruleYaml.condition[`${cond.field}_gt`] = cond.value
          }
        }
      })

      const response = await fetch(`${API_BASE}/rules/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleYaml)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to create rule')
      }

      setCreateSuccess(true)
      setTimeout(() => {
        setShowCreateModal(false)
        setCreateSuccess(false)
        resetForm()
        fetchRules()
      }, 2000)

    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const resetForm = () => {
    setNewRule({
      name: '',
      description: '',
      severity: 'medium',
      event_type: '',
      source: '',
      conditions: [{ field: '', operator: '', value: '' }]
    })
  }

  const addCondition = () => {
    setNewRule({ ...newRule, conditions: [...newRule.conditions, { field: '', operator: '', value: '' }] })
  }

  const removeCondition = (index) => {
    setNewRule({ ...newRule, conditions: newRule.conditions.filter((_, i) => i !== index) })
  }

  const updateCondition = (index, field, value) => {
    const updated = [...newRule.conditions]
    updated[index] = { ...updated[index], [field]: value }
    setNewRule({ ...newRule, conditions: updated })
  }

  const filteredRules = filterSeverity
    ? stats?.rules?.filter(r => r.severity?.toLowerCase() === filterSeverity.toLowerCase()) || []
    : stats?.rules || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-xl font-semibold text-bone tracking-tight">Rules</h1>
          <p className="eyebrow mt-1">Detection patterns</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn is-active">
          Create Rule
        </button>
      </div>

      {error && (
        <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--crit)', color: 'var(--crit)', background: 'rgba(255,77,61,0.06)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <ConsoleSpinner label="Loading rules" />
      ) : !stats || !stats.rules || stats.rules.length === 0 ? (
        <Panel className="p-12 text-center">
          <p className="text-dim text-sm">No rules available</p>
        </Panel>
      ) : (
        <>
          {/* Summary strip */}
          <Panel className="flex flex-wrap divide-x divide-line">
            <button
              onClick={() => setFilterSeverity(null)}
              className={`flex-1 min-w-[120px] px-5 py-4 text-left transition-colors ${filterSeverity === null ? 'bg-panel2' : 'hover:bg-panel2/60'}`}
            >
              <div className="eyebrow">Total</div>
              <div className="mono text-2xl font-semibold text-bone mt-1 tabular-nums">{stats.total_rules}</div>
            </button>

            {stats.by_severity && Object.entries(stats.by_severity).map(([severity, count]) => {
              const color = SEVERITY_COLOR[severity] || '#6a6a70'
              const active = filterSeverity === severity
              return (
                <button
                  key={severity}
                  onClick={() => setFilterSeverity(active ? null : severity)}
                  className="flex-1 min-w-[120px] px-5 py-4 text-left transition-colors"
                  style={active ? { background: hexToRgba(color, 0.08) } : undefined}
                >
                  <div className="eyebrow capitalize" style={active ? { color } : undefined}>{severity}</div>
                  <div className="mono text-2xl font-semibold mt-1 tabular-nums" style={{ color: active ? color : 'var(--bone)' }}>
                    {count}
                  </div>
                </button>
              )
            })}
          </Panel>

          {filterSeverity && (
            <div className="flex items-center justify-between px-4 py-2 panel text-sm">
              <div className="flex items-center gap-2">
                <span className="text-dim">Filtered by</span>
                <SeverityTag severity={filterSeverity} />
              </div>
              <button onClick={() => setFilterSeverity(null)} className="eyebrow text-signal hover:underline">
                Clear
              </button>
            </div>
          )}

          {/* Rules List */}
          <div className="space-y-2">
            {filteredRules.map((rule) => (
              <Panel key={rule.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-panel2 transition-colors"
                  onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <SeverityTag severity={rule.severity} />
                        <span className="mono text-[11px] text-faint">{rule.id}</span>
                        {rule.type && <NeutralTag>{rule.type}</NeutralTag>}
                      </div>
                      <h3 className="text-[15px] font-medium text-bone mb-1">{rule.name}</h3>
                      <p className="text-sm text-dim">{rule.description}</p>
                    </div>
                    <Chevron open={expandedId === rule.id} />
                  </div>
                </div>

                {expandedId === rule.id && (
                  <div className="px-4 pb-4 border-t hairline pt-4">
                    <div className="eyebrow mb-2">Condition</div>
                    <div className="border hairline rounded p-3 mono text-xs text-dim">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(rule.condition, null, 2)}</pre>
                    </div>
                    {rule.threshold && (
                      <div className="mt-3">
                        <div className="eyebrow mb-2">Threshold</div>
                        <div className="border hairline rounded p-3 mono text-xs text-dim">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(rule.threshold, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                    {rule.mitre_tag && rule.mitre_tag.length > 0 && (
                      <div className="mt-3">
                        <div className="eyebrow mb-2">MITRE ATT&amp;CK</div>
                        <div className="flex flex-wrap gap-2">
                          {rule.mitre_tag.map((tag, idx) => (
                            <NeutralTag key={idx}>{tag}</NeutralTag>
                          ))}
                        </div>
                      </div>
                    )}
                    {rule.remediation && rule.remediation.length > 0 && (
                      <div className="mt-3">
                        <div className="eyebrow mb-2">Remediation</div>
                        <ul className="space-y-1">
                          {rule.remediation.map((r, i) => (
                            <li key={i} className="text-sm text-bone/90 flex gap-2">
                              <span className="text-faint">&mdash;</span>{r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            ))}
          </div>
        </>
      )}

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <Panel className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b hairline flex justify-between items-center sticky top-0 bg-panel z-10">
              <h2 className="text-lg font-semibold text-bone">Create Detection Rule</h2>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-faint hover:text-bone">
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-5 space-y-5">
              {createError && (
                <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--crit)', color: 'var(--crit)', background: 'rgba(255,77,61,0.06)' }}>
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--ok)', color: 'var(--ok)', background: 'rgba(62,207,142,0.06)' }}>
                  Rule created successfully
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="eyebrow block mb-1.5">Rule Name *</label>
                  <input
                    type="text"
                    required
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    className="field w-full px-3 py-2 text-sm"
                    placeholder="e.g., Suspicious PowerShell Execution"
                  />
                </div>

                <div>
                  <label className="eyebrow block mb-1.5">Description *</label>
                  <textarea
                    required
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    className="field w-full px-3 py-2 text-sm"
                    rows="2"
                    placeholder="Describe what this rule detects"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="eyebrow block mb-1.5">Severity *</label>
                    <select
                      required
                      value={newRule.severity}
                      onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })}
                      className="field w-full px-3 py-2 text-sm"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="eyebrow block mb-1.5">Event Type *</label>
                    <input
                      type="text"
                      required
                      value={newRule.event_type}
                      onChange={(e) => setNewRule({ ...newRule, event_type: e.target.value })}
                      className="field w-full px-3 py-2 text-sm"
                      placeholder="process_create"
                    />
                  </div>

                  <div>
                    <label className="eyebrow block mb-1.5">Source</label>
                    <input
                      type="text"
                      value={newRule.source}
                      onChange={(e) => setNewRule({ ...newRule, source: e.target.value })}
                      className="field w-full px-3 py-2 text-sm"
                      placeholder="windows"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="eyebrow">Additional Conditions</h3>
                  <button type="button" onClick={addCondition} className="btn">
                    Add Condition
                  </button>
                </div>

                {newRule.conditions.map((condition, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={condition.field}
                      onChange={(e) => updateCondition(index, 'field', e.target.value)}
                      className="field flex-1 px-3 py-2 text-sm"
                      placeholder="Field"
                    />
                    <select
                      value={condition.operator}
                      onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                      className="field px-3 py-2 text-sm"
                    >
                      <option value="">Operator</option>
                      <option value="equals">Equals</option>
                      <option value="contains">Contains</option>
                      <option value="greater_than">Greater Than</option>
                    </select>
                    <input
                      type="text"
                      value={condition.value}
                      onChange={(e) => updateCondition(index, 'value', e.target.value)}
                      className="field flex-1 px-3 py-2 text-sm"
                      placeholder="Value"
                    />
                    {newRule.conditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="btn px-3"
                        style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t hairline">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetForm(); }}
                  className="btn"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button type="submit" className="btn is-active" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Rule'}
                </button>
              </div>
            </form>
          </Panel>
        </div>
      )}
    </div>
  )
}

export default RulesClean
