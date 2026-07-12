import React, { useState, useEffect } from 'react'
import { searchLogs, getSearchSuggestions, saveSearch, getSavedSearches } from '../api'
import { Panel, SeverityTag, NeutralTag, ConsoleSpinner, Chevron, PulseDot } from './ui'

export function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [totalResults, setTotalResults] = useState(0)
  const [searchTime, setSearchTime] = useState(0)
  const [expandedId, setExpandedId] = useState(null)
  const [suggestions, setSuggestions] = useState({})
  const [savedSearches, setSavedSearches] = useState([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [searchName, setSearchName] = useState('')
  const [searchDescription, setSearchDescription] = useState('')

  // Natural language query builder
  const [nlQuery, setNlQuery] = useState('')
  const [aiConverting, setAiConverting] = useState(false)
  const [showAiBuilder, setShowAiBuilder] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')

  // Pagination
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(50)
  const [hours, setHours] = useState(24)

  // Auto-complete
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState([])

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const data = await getSearchSuggestions()
        setSuggestions(data)
      } catch (err) {
        console.error('Error fetching suggestions:', err)
      }
    }

    fetchSuggestions()
    loadSavedSearches()
  }, [])

  const loadSavedSearches = async () => {
    try {
      const data = await getSavedSearches()
      setSavedSearches(data.searches || [])
    } catch (err) {
      console.error('Error loading saved searches:', err)
    }
  }

  const performSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a search query')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await searchLogs(query, hours, limit, offset)
      setResults(response.data.results || [])
      setTotalResults(response.data.total || 0)
      setSearchTime(response.data.took_ms || 0)
    } catch (err) {
      setError(err.message || 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleQueryChange = (e) => {
    const value = e.target.value
    setQuery(value)

    if (value.length > 0) {
      const lastWord = value.split(/[\s()]+/).pop().toLowerCase()

      if (lastWord.includes(':') || lastWord.length > 1) {
        const matching = suggestions.examples?.filter(([example]) =>
          example.toLowerCase().includes(lastWord)
        ) || []

        setFilteredSuggestions(matching)
        setShowSuggestions(true)
      } else {
        const matching = suggestions.fields?.filter(f =>
          f.toLowerCase().startsWith(lastWord)
        ) || []

        setFilteredSuggestions(matching)
        setShowSuggestions(matching.length > 0)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const applySuggestion = (suggestion) => {
    if (Array.isArray(suggestion)) {
      setQuery(suggestion[0])
    } else {
      setQuery(query.replace(/\S+$/, suggestion + ':'))
    }
    setShowSuggestions(false)
  }

  const convertNaturalLanguageQuery = async () => {
    if (!nlQuery.trim()) {
      setError('Please enter a natural language query')
      return
    }

    try {
      setAiConverting(true)
      setError(null)
      setAiExplanation('')

      const response = await fetch('http://localhost:8000/ai/convert-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery }),
      })

      if (!response.ok) {
        throw new Error(`Query conversion failed: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        setQuery(data.query)
        setAiExplanation(data.explanation)
        setShowAiBuilder(false)
        setNlQuery('')
      } else {
        setError(data.error || 'Failed to convert query')
      }
    } catch (err) {
      setError(err.message || 'Query conversion failed')
      console.error('Error converting query:', err)
    } finally {
      setAiConverting(false)
    }
  }

  const handleSaveSearch = async () => {
    if (!searchName.trim()) {
      setError('Please enter a search name')
      return
    }

    try {
      await saveSearch(searchName, query, searchDescription)
      setShowSaveModal(false)
      setSearchName('')
      setSearchDescription('')
      loadSavedSearches()
    } catch (err) {
      setError('Failed to save search')
    }
  }

  const loadSavedSearch = (savedQuery) => {
    setQuery(savedQuery)
    setOffset(0)
  }

  const totalPages = Math.ceil(totalResults / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-bone tracking-tight">Search</h1>
        <p className="eyebrow mt-1">Query logs and alerts using SIEM syntax</p>
      </div>

      {/* Search Bar Section */}
      <Panel className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <label className="eyebrow">Query</label>
          <div className="flex border hairline rounded overflow-hidden">
            <button
              onClick={() => setShowAiBuilder(false)}
              className={`mono text-[11px] uppercase tracking-wide px-3 py-1.5 transition-colors ${!showAiBuilder ? 'bg-panel2 text-signal' : 'text-faint hover:text-dim'}`}
            >
              Query syntax
            </button>
            <button
              onClick={() => setShowAiBuilder(true)}
              className={`mono text-[11px] uppercase tracking-wide px-3 py-1.5 transition-colors border-l hairline ${showAiBuilder ? 'bg-panel2 text-signal' : 'text-faint hover:text-dim'}`}
            >
              Natural language
            </button>
          </div>
        </div>

        {showAiBuilder ? (
          <div className="space-y-3 border hairline rounded p-4">
            <p className="text-xs text-dim">Describe what you want to find in plain English.</p>

            <textarea
              value={nlQuery}
              onChange={(e) => setNlQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && convertNaturalLanguageQuery()}
              placeholder="e.g., show me all failed login attempts from admin users in the last hour"
              className="field w-full px-3 py-2 text-sm resize-none"
              rows="3"
            />

            <button
              onClick={convertNaturalLanguageQuery}
              disabled={aiConverting || !nlQuery.trim()}
              className="btn is-active w-full"
            >
              {aiConverting ? (
                <>
                  <PulseDot live color="#06201d" />
                  Converting&hellip;
                </>
              ) : 'Convert to query'}
            </button>

            {aiExplanation && (
              <div className="border rounded p-3 text-xs" style={{ borderColor: 'var(--ok)', color: 'var(--ok)', background: 'rgba(62,207,142,0.06)' }}>
                {aiExplanation}
              </div>
            )}

            <div className="text-xs text-faint space-y-1">
              <div className="eyebrow">Examples</div>
              <div className="pl-1 space-y-0.5 mono">
                <div>show me failed logins</div>
                <div>admin activity on production servers in the last hour</div>
                <div>powershell commands with high severity</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyPress={(e) => e.key === 'Enter' && performSearch()}
              placeholder="e.g., severity:high AND event_type:login_failure"
              className="field w-full px-3 py-2 mono text-sm"
            />

            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 panel shadow-xl z-10">
                {filteredSuggestions.slice(0, 5).map((suggestion, idx) => (
                  <div
                    key={idx}
                    onClick={() => applySuggestion(suggestion)}
                    className="px-3 py-2 hover:bg-panel2 cursor-pointer text-sm text-dim border-b hairline last:border-0 mono"
                  >
                    {Array.isArray(suggestion) ? suggestion[0] : suggestion}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Options */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="eyebrow block mb-1">Time Range</label>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))} className="field w-full px-3 py-2 text-sm">
              <option value={1}>Last 1 hour</option>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={7 * 24}>Last 7 days</option>
              <option value={30 * 24}>Last 30 days</option>
            </select>
          </div>

          <div>
            <label className="eyebrow block mb-1">Results Per Page</label>
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0) }}
              className="field w-full px-3 py-2 text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button onClick={performSearch} disabled={loading} className="btn is-active flex-1">
              {loading ? 'Searching…' : 'Search'}
            </button>
            <button onClick={() => setShowSaveModal(true)} disabled={!query.trim()} className="btn" title="Save this search">
              Save
            </button>
          </div>
        </div>

        {/* Query Help */}
        <details className="text-xs text-faint">
          <summary className="cursor-pointer hover:text-dim eyebrow inline">Query syntax help</summary>
          <div className="mt-2 p-3 border hairline rounded space-y-1 mono">
            <div><span className="text-signal">field:value</span> — exact match</div>
            <div><span className="text-signal">field:wild*</span> — wildcard search</div>
            <div><span className="text-signal">field:&gt;100</span> — range comparison</div>
            <div><span className="text-signal">timestamp:1h ago</span> — relative time</div>
            <div><span className="text-signal">query1 AND query2</span> — both conditions</div>
            <div><span className="text-signal">query1 OR query2</span> — either condition</div>
            <div><span className="text-signal">(query1 OR query2) AND query3</span> — grouping</div>
          </div>
        </details>
      </Panel>

      {error && (
        <div className="border rounded px-4 py-3 text-sm mono" style={{ borderColor: 'var(--crit)', color: 'var(--crit)', background: 'rgba(255,77,61,0.06)' }}>
          {error}
        </div>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <Panel className="p-4">
          <div className="eyebrow mb-2">Saved Searches</div>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((search) => (
              <button
                key={search._id}
                onClick={() => loadSavedSearch(search.query)}
                className="btn"
                title={search.description}
              >
                {search.name}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-4 py-3 panel">
            <div className="text-sm">
              <span className="mono text-xl font-semibold text-bone">{totalResults}</span>
              <span className="text-dim ml-1">results</span>
              <span className="mono text-faint text-xs ml-3">page {currentPage} of {totalPages}</span>
              <span className="mono text-faint text-xs ml-3">{searchTime}ms</span>
            </div>
          </div>

          <div className="space-y-2">
            {results.map((log) => (
              <Panel key={log._id} className="overflow-hidden cursor-pointer hover:border-line2" onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}>
                <div className="p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <SeverityTag severity={log.severity} />
                      <NeutralTag>{log.source}</NeutralTag>
                      <span className="text-signal text-xs mono">{log.event_type}</span>
                    </div>

                    <div className="text-dim text-xs mb-1 mono">
                      <span className="text-faint">host</span> {log.host}
                      {log.user && <><span className="text-faint ml-3">user</span> {log.user}</>}
                      {log.ip && <><span className="text-faint ml-3">ip</span> {log.ip}</>}
                    </div>

                    <div className="text-faint text-xs mono">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <Chevron open={expandedId === log._id} />
                </div>

                {expandedId === log._id && (
                  <div className="border-t hairline p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {Object.entries(log).map(([key, value]) => {
                        if (key === '_id' || key === '_score' || typeof value === 'object') return null
                        return (
                          <div key={key}>
                            <div className="text-faint mono">{key}</div>
                            <div className="text-dim break-words">
                              {typeof value === 'string' ? value : JSON.stringify(value)}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {log.raw && (
                      <div className="mt-3 pt-3 border-t hairline">
                        <div className="eyebrow mb-2">Raw Log Data</div>
                        <pre className="border hairline p-2 rounded mono text-xs text-dim overflow-auto max-h-48">
                          {JSON.stringify(log.raw, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </Panel>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 panel">
              <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="btn">
                Previous
              </button>
              <span className="mono text-dim text-sm">Page {currentPage} of {totalPages}</span>
              <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= totalResults} className="btn">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && query && (
        <Panel className="p-12 text-center">
          <p className="text-dim text-sm">No results found</p>
          <p className="text-xs text-faint mt-2">Try adjusting your query or time range</p>
        </Panel>
      )}

      {!loading && results.length === 0 && !query && (
        <Panel className="p-12 text-center">
          <p className="text-dim text-sm">Enter a search query to get started</p>
        </Panel>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <Panel className="max-w-md w-full">
            <div className="p-4 border-b hairline flex justify-between items-center">
              <h3 className="text-[15px] font-semibold text-bone">Save Search</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-faint hover:text-bone">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Search name"
                className="field w-full px-3 py-2 text-sm"
              />
              <textarea
                value={searchDescription}
                onChange={(e) => setSearchDescription(e.target.value)}
                placeholder="Description (optional)"
                className="field w-full px-3 py-2 text-sm h-20 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={() => setShowSaveModal(false)} className="btn flex-1">Cancel</button>
                <button onClick={handleSaveSearch} className="btn is-active flex-1">Save</button>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}

export default SearchPage
