import React, { useState, useEffect } from 'react'
import { searchLogs, getSearchSuggestions, saveSearch, getSavedSearches } from './api'

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
    
    // Show suggestions if typing
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

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'bg-red-600'
      case 'high': return 'bg-orange-600'
      case 'medium': return 'bg-yellow-600'
      case 'low': return 'bg-blue-600'
      default: return 'bg-gray-600'
    }
  }

  const getSourceBgColor = (source) => {
    const colors = {
      'windows': 'bg-blue-700',
      'linux': 'bg-orange-700',
      'firewall': 'bg-red-700',
      'network': 'bg-purple-700',
      'app': 'bg-green-700',
    }
    return colors[source?.toLowerCase()] || 'bg-gray-700'
  }

  const totalPages = Math.ceil(totalResults / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <span className="text-2xl">🔍</span>
            Advanced Search
          </h1>
          <p className="text-gray-400">Search logs with powerful query syntax</p>
        </div>

        {/* Search Bar Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-6 shadow-xl">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Query
            </label>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                onKeyPress={(e) => e.key === 'Enter' && performSearch()}
                placeholder="e.g., severity:high AND event_type:login_failure"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono text-sm"
              />
              
              {/* Auto-complete suggestions */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-700 border border-slate-600 rounded shadow-lg z-10">
                  {filteredSuggestions.slice(0, 5).map((suggestion, idx) => (
                    <div
                      key={idx}
                      onClick={() => applySuggestion(suggestion)}
                      className="px-4 py-2 hover:bg-slate-600 cursor-pointer text-sm text-gray-300 border-b border-slate-600 last:border-0"
                    >
                      {Array.isArray(suggestion) ? suggestion[0] : suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Time Range
              </label>
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={1}>Last 1 hour</option>
                <option value={6}>Last 6 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={7 * 24}>Last 7 days</option>
                <option value={30 * 24}>Last 30 days</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Results Per Page
              </label>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value))
                  setOffset(0)
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
            </div>
            
            <div className="flex items-end gap-2">
              <button
                onClick={performSearch}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded transition-colors"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button
                onClick={() => setShowSaveModal(true)}
                disabled={!query.trim()}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-800 text-white rounded transition-colors"
                title="Save this search"
              >
                💾
              </button>
            </div>
          </div>

          {/* Query Help */}
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer hover:text-gray-300">Query Syntax Help</summary>
            <div className="mt-2 p-3 bg-slate-700/50 rounded border border-slate-600 space-y-2">
              <div><code className="text-blue-400">field:value</code> - Exact match</div>
              <div><code className="text-blue-400">field:wild*</code> - Wildcard search</div>
              <div><code className="text-blue-400">field:&gt;100</code> - Range comparison</div>
              <div><code className="text-blue-400">timestamp:1h ago</code> - Relative time</div>
              <div><code className="text-blue-400">query1 AND query2</code> - Both conditions</div>
              <div><code className="text-blue-400">query1 OR query2</code> - Either condition</div>
              <div><code className="text-blue-400">(query1 OR query2) AND query3</code> - Grouping with parentheses</div>
            </div>
          </details>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-600 rounded text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-400 text-sm font-medium">📌 Saved Searches:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {savedSearches.map((search) => (
                <button
                  key={search._id}
                  onClick={() => loadSavedSearch(search.query)}
                  className="px-3 py-1 bg-blue-900/50 hover:bg-blue-800 border border-blue-600 rounded text-sm text-blue-300 transition-colors"
                  title={search.description}
                >
                  {search.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results Section */}
        {results.length > 0 && (
          <div>
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4 px-4 py-3 bg-slate-800 rounded border border-slate-700">
              <div className="text-white text-sm">
                <span className="font-bold text-lg">{results.length}</span>
                <span className="text-gray-400"> results (Page {currentPage} of {totalPages})</span>
                <span className="text-gray-500 text-xs ml-4">Search took {searchTime}ms</span>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-3">
              {results.map((log) => (
                <div
                  key={log._id}
                  className="bg-slate-800 border border-slate-700 rounded hover:border-slate-600 transition-all cursor-pointer"
                  onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
                >
                  {/* Summary Row */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className={`${getSeverityColor(log.severity)} text-white text-xs font-bold px-2 py-1 rounded`}>
                          {log.severity?.toUpperCase()}
                        </span>
                        <span className={`${getSourceBgColor(log.source)} text-white text-xs font-bold px-2 py-1 rounded`}>
                          {log.source?.toUpperCase()}
                        </span>
                        <span className="text-blue-400 text-sm font-mono">
                          {log.event_type}
                        </span>
                      </div>
                      
                      <div className="text-gray-300 text-sm mb-1">
                        <span className="text-gray-500">Host:</span> {log.host}
                        {log.user && <><span className="text-gray-500 ml-4">User:</span> {log.user}</>}
                        {log.ip && <><span className="text-gray-500 ml-4">IP:</span> {log.ip}</>}
                      </div>
                      
                      <div className="text-gray-500 text-xs">
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="text-gray-500 text-xl">
                      {expandedId === log._id ? '▼' : '▶'}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedId === log._id && (
                    <div className="border-t border-slate-700 bg-slate-900/50 p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {Object.entries(log).map(([key, value]) => {
                          if (key === '_id' || key === '_score' || typeof value === 'object') return null
                          return (
                            <div key={key}>
                              <div className="text-gray-500 font-mono text-xs">{key}</div>
                              <div className="text-gray-300 break-words">
                                {typeof value === 'string' ? value : JSON.stringify(value)}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Raw data if exists */}
                      {log.raw && (
                        <div className="mt-4 pt-4 border-t border-slate-700">
                          <div className="text-gray-500 font-mono text-xs mb-2">Raw Log Data</div>
                          <pre className="bg-slate-950 p-3 rounded text-xs text-gray-400 overflow-auto max-h-48">
                            {JSON.stringify(log.raw, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between px-4 py-3 bg-slate-800 rounded border border-slate-700">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors"
                >
                  ← Previous
                </button>
                
                <span className="text-gray-400 text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= totalResults}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && query && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">No results found</p>
            <p className="text-sm mt-2">Try adjusting your search query or time range</p>
          </div>
        )}

        {!loading && results.length === 0 && !query && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">👇 Enter a search query to get started</p>
          </div>
        )}

        {/* Save Search Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-white mb-4">Save Search</h2>
              
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Search name (e.g., 'Failed Logins High Severity')"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 mb-3 focus:outline-none focus:border-blue-500"
              />
              
              <textarea
                value={searchDescription}
                onChange={(e) => setSearchDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-gray-500 mb-4 focus:outline-none focus:border-blue-500 h-20 resize-none"
              />
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSearch}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
