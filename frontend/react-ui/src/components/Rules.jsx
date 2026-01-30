import React, { useState, useEffect } from 'react'
import { getRules } from '../api'

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
        headers: {
          'Content-Type': 'application/json',
        },
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
    setNewRule({
      ...newRule,
      conditions: [...newRule.conditions, { field: '', operator: '', value: '' }]
    })
  }

  const removeCondition = (index) => {
    setNewRule({
      ...newRule,
      conditions: newRule.conditions.filter((_, i) => i !== index)
    })
  }

  const updateCondition = (index, field, value) => {
    const updated = [...newRule.conditions]
    updated[index] = { ...updated[index], [field]: value }
    setNewRule({ ...newRule, conditions: updated })
  }

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

  const filteredRules = filterSeverity
    ? stats?.rules?.filter(r => r.severity?.toLowerCase() === filterSeverity.toLowerCase()) || []
    : stats?.rules || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-100">Detection Rules</h2>
          <p className="text-sm text-gray-500 mt-1">Manage security detection patterns</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white transition"
        >
          Create Rule
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded px-4 py-3 text-red-200 text-sm">
          <span className="font-medium">Error:</span> {error}
        </div>
      )}

      {loading ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-400 text-sm">Loading rules</p>
        </div>
      ) : !stats || !stats.rules || stats.rules.length === 0 ? (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <p className="text-gray-400">No rules available</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-semibold text-gray-100 mt-1">{stats.total_rules}</p>
            </div>

            {stats.by_severity && Object.entries(stats.by_severity).map(([severity, count]) => (
              <div 
                key={severity}
                className={`bg-[#0f1629] border rounded p-4 cursor-pointer transition ${
                  filterSeverity === severity ? 'border-blue-500' : 'border-[#1a2332] hover:border-[#2a3f5f]'
                }`}
                onClick={() => setFilterSeverity(filterSeverity === severity ? null : severity)}
              >
                <p className="text-xs text-gray-500 uppercase tracking-wide">{severity}</p>
                <p className="text-2xl font-semibold text-gray-100 mt-1">{count}</p>
              </div>
            ))}
          </div>

          {/* Filter Indicator */}
          {filterSeverity && (
            <div className="flex items-center justify-between bg-[#0f1629] border border-[#1a2332] rounded px-4 py-2 text-sm">
              <p className="text-gray-400">
                Filtered by: <span className={`font-medium px-2 py-0.5 rounded border ml-2 ${getSeverityColor(filterSeverity)}`}>
                  {filterSeverity}
                </span>
              </p>
              <button
                onClick={() => setFilterSeverity(null)}
                className="text-blue-400 hover:text-blue-300 text-xs"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* Rules List */}
          <div className="space-y-3">
            {filteredRules.map((rule) => (
              <div 
                key={rule.id}
                className="bg-[#0f1629] border border-[#1a2332] rounded overflow-hidden"
              >
                <div 
                  className="p-5 cursor-pointer hover:bg-[#151b2e] transition"
                  onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(rule.severity)}`}>
                          {rule.severity}
                        </span>
                        <span className="text-gray-600 text-xs font-mono">{rule.id}</span>
                      </div>
                      <h3 className="text-base font-medium text-gray-100 mb-1">{rule.name}</h3>
                      <p className="text-sm text-gray-400">{rule.description}</p>
                    </div>
                    <svg 
                      className={`w-5 h-5 text-gray-500 transition-transform ${expandedId === rule.id ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {expandedId === rule.id && (
                  <div className="px-5 pb-5 border-t border-[#1a2332] pt-4 bg-[#0a0e27]">
                    <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Conditions</h4>
                    <div className="bg-[#0f1629] border border-[#1a2332] rounded p-3 font-mono text-xs text-gray-300">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(rule.condition, null, 2)}</pre>
                    </div>
                    {rule.mitre_tag && rule.mitre_tag.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">MITRE ATT&CK</h4>
                        <div className="flex flex-wrap gap-2">
                          {rule.mitre_tag.map((tag, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-purple-900/50 text-purple-200 border border-purple-800 rounded text-xs font-mono">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1629] border border-[#1a2332] rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-[#1a2332] flex justify-between items-center sticky top-0 bg-[#0f1629] z-10">
              <h2 className="text-lg font-semibold text-gray-100">Create Detection Rule</h2>
              <button 
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="text-gray-400 hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-5 space-y-5">
              {createError && (
                <div className="bg-red-900/20 border border-red-800 rounded px-4 py-3 text-red-200 text-sm">
                  <span className="font-medium">Error:</span> {createError}
                </div>
              )}

              {createSuccess && (
                <div className="bg-green-900/20 border border-green-800 rounded px-4 py-3 text-green-200 text-sm">
                  <span className="font-medium">Success:</span> Rule created successfully
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Rule Name *</label>
                  <input
                    type="text"
                    required
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g., Suspicious PowerShell Execution"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Description *</label>
                  <textarea
                    required
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                    rows="2"
                    placeholder="Describe what this rule detects"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Severity *</label>
                    <select
                      required
                      value={newRule.severity}
                      onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })}
                      className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Event Type *</label>
                    <input
                      type="text"
                      required
                      value={newRule.event_type}
                      onChange={(e) => setNewRule({ ...newRule, event_type: e.target.value })}
                      className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                      placeholder="process_create"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Source</label>
                    <input
                      type="text"
                      value={newRule.source}
                      onChange={(e) => setNewRule({ ...newRule, source: e.target.value })}
                      className="w-full bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                      placeholder="windows"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Additional Conditions</h3>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="px-2 py-1 bg-[#1a2744] hover:bg-[#1f2d4f] border border-[#2a3f5f] rounded text-xs text-gray-300"
                  >
                    Add Condition
                  </button>
                </div>

                {newRule.conditions.map((condition, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={condition.field}
                      onChange={(e) => updateCondition(index, 'field', e.target.value)}
                      className="flex-1 bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                      placeholder="Field"
                    />
                    <select
                      value={condition.operator}
                      onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                      className="bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
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
                      className="flex-1 bg-[#0a0e27] border border-[#1a2332] rounded px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                      placeholder="Value"
                    />
                    {newRule.conditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="px-3 py-2 bg-red-900/50 hover:bg-red-900/70 border border-red-800 rounded text-white text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[#1a2332]">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetForm(); }}
                  className="px-4 py-2 bg-[#1a2744] hover:bg-[#1f2d4f] border border-[#2a3f5f] rounded text-sm text-gray-300"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white disabled:opacity-50"
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default RulesClean
