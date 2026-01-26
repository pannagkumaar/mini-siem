import React, { useState, useEffect } from 'react'
import { getRules } from './api'

const API_BASE = 'http://localhost:8000'

export function RulesEnhanced() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterSeverity, setFilterSeverity] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)
  const [createSuccess, setCreateSuccess] = useState(false)

  // Form state for new rule
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
      // Build the rule YAML structure
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

      // Add additional conditions
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
        fetchRules() // Refresh rules list
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

  const filteredRules = filterSeverity
    ? stats?.rules?.filter(r => r.severity?.toLowerCase() === filterSeverity.toLowerCase()) || []
    : stats?.rules || []

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          ⚙️ Detection Rules
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg text-white font-medium shadow-lg transition-all duration-200 flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Create New Rule</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-100">
          <p className="font-bold">⚠️ Error</p>
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
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
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6 hover:border-cyan-500 transition shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1 uppercase tracking-wider">Total Rules</p>
                  <p className="text-4xl font-bold text-cyan-400">{stats.total_rules}</p>
                </div>
                <span className="text-4xl">📋</span>
              </div>
            </div>

            {stats.by_severity && Object.entries(stats.by_severity).map(([severity, count]) => (
              <div 
                key={severity}
                className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6 hover:border-gray-500 transition cursor-pointer shadow-xl"
                onClick={() => setFilterSeverity(filterSeverity === severity ? null : severity)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-sm mb-1 uppercase tracking-wider">{severity}</p>
                    <p className={`text-4xl font-bold ${severity === 'critical' ? 'text-red-400' : severity === 'high' ? 'text-orange-400' : severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {count}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${filterSeverity === severity ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                    {filterSeverity === severity ? '✓' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Filter indicator */}
          {filterSeverity && (
            <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-gray-400">
                Filtered by severity: <span className={`font-bold ${getSeverityColor(filterSeverity)} px-3 py-1 rounded ml-2`}>
                  {filterSeverity}
                </span>
              </p>
              <button
                onClick={() => setFilterSeverity(null)}
                className="text-cyan-400 hover:text-cyan-300 text-sm"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* Rules List */}
          <div className="space-y-4">
            {filteredRules.map((rule) => (
              <div 
                key={rule.id}
                className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg hover:border-gray-500 transition shadow-xl"
              >
                <div 
                  className="p-6 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-3 py-1 rounded text-xs font-bold ${getSeverityColor(rule.severity)}`}>
                          {rule.severity}
                        </span>
                        <span className="text-gray-500 text-sm font-mono">{rule.id}</span>
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">{rule.name}</h3>
                      <p className="text-gray-400 text-sm">{rule.description}</p>
                    </div>
                    <svg 
                      className={`w-6 h-6 text-gray-400 transition-transform ${expandedId === rule.id ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {expandedId === rule.id && (
                  <div className="px-6 pb-6 border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-3">CONDITIONS</h4>
                    <div className="bg-gray-900 rounded p-4 font-mono text-sm text-gray-300">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(rule.condition, null, 2)}</pre>
                    </div>
                    {rule.mitre_tag && rule.mitre_tag.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-bold text-gray-400 mb-2">MITRE ATT&CK</h4>
                        <div className="flex flex-wrap gap-2">
                          {rule.mitre_tag.map((tag, idx) => (
                            <span key={idx} className="px-2 py-1 bg-purple-900 text-purple-200 rounded text-xs font-mono">
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
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl border border-gray-700 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 z-10">
              <h2 className="text-2xl font-bold text-white">Create Detection Rule</h2>
              <button 
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-6 space-y-6">
              {createError && (
                <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-100">
                  <p className="font-bold">⚠️ Error</p>
                  <p>{createError}</p>
                </div>
              )}

              {createSuccess && (
                <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 text-green-100">
                  <p className="font-bold">✓ Success</p>
                  <p>Rule created successfully!</p>
                </div>
              )}

              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-cyan-400">Basic Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Rule Name *</label>
                  <input
                    type="text"
                    required
                    value={newRule.name}
                    onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                    placeholder="e.g., Suspicious PowerShell Execution"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Description *</label>
                  <textarea
                    required
                    value={newRule.description}
                    onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                    rows="3"
                    placeholder="Describe what this rule detects..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Severity *</label>
                    <select
                      required
                      value={newRule.severity}
                      onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Event Type *</label>
                    <input
                      type="text"
                      required
                      value={newRule.event_type}
                      onChange={(e) => setNewRule({ ...newRule, event_type: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                      placeholder="e.g., process_create"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Source</label>
                    <input
                      type="text"
                      value={newRule.source}
                      onChange={(e) => setNewRule({ ...newRule, source: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                      placeholder="e.g., windows"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Conditions */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-cyan-400">Additional Conditions</h3>
                  <button
                    type="button"
                    onClick={addCondition}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white"
                  >
                    + Add Condition
                  </button>
                </div>

                {newRule.conditions.map((condition, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={condition.field}
                      onChange={(e) => updateCondition(index, 'field', e.target.value)}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                      placeholder="Field (e.g., process_name)"
                    />
                    <select
                      value={condition.operator}
                      onChange={(e) => updateCondition(index, 'operator', e.target.value)}
                      className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
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
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-cyan-500 focus:outline-none"
                      placeholder="Value"
                    />
                    {newRule.conditions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCondition(index)}
                        className="px-3 py-2 bg-red-900 hover:bg-red-800 rounded text-white"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-4 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); resetForm(); }}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-lg text-white font-medium disabled:opacity-50"
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

export default RulesEnhanced
