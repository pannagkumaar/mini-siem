import React, { useState, useEffect } from 'react'
import { searchLogs, getSearchSuggestions, saveSearch, getSavedSearches } from '../api'

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
  
  // AI Query Builder
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: nlQuery }),
      })

      if (!response.ok) {
        throw new Error(`AI conversion failed: ${response.statusText}`)
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
      setError(err.message || 'AI query conversion failed')
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

  const getSourceColor = (source) => {
    const colors = {
      'windows': 'bg-blue-900/50 text-blue-200 border-blue-800',
      'linux': 'bg-orange-900/50 text-orange-200 border-orange-800',
      'firewall': 'bg-red-900/50 text-red-200 border-red-800',
      'network': 'bg-purple-900/50 text-purple-200 border-purple-800',
      'app': 'bg-green-900/50 text-green-200 border-green-800',
    }
    return colors[source?.toLowerCase()] || 'bg-gray-800 text-gray-300 border-gray-700'
  }

  const totalPages = Math.ceil(totalResults / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-100">Advanced Search</h2>
        <p className="text-sm text-gray-500 mt-1">Query logs using SIEM syntax</p>
      </div>

      {/* Search Bar Section */}
      <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4 space-y-4">
        {/* AI Query Builder Toggle */}
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide">
            Query
          </label>
          <button
            onClick={() => setShowAiBuilder(!showAiBuilder)}
            className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded text-xs font-semibold transition"
          >
            <span>🤖</span>
            {showAiBuilder ? 'Manual Query' : 'AI Query Builder'}
          </button>
        </div>

        {/* AI Natural Language Query */}
        {showAiBuilder ? (
          <div className="space-y-3 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-700/50 rounded p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-purple-300 text-sm font-bold">🤖 AI Query Builder</span>
              <span className="text-xs text-gray-400">Describe what you want to find in plain English</span>
            </div>
            
            <div className="space-y-2">
              <textarea
                value={nlQuery}
                onChange={(e) => setNlQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && convertNaturalLanguageQuery()}
                placeholder="e.g., show me all failed login attempts from admin users in the last hour on production servers"
                className="w-full px-3 py-2 bg-[#0a0e27] border border-[#1a2332] rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-purple-500 text-sm resize-none"
                rows="3"
              />
              
              <div className="flex gap-2">
                <button
                  onClick={convertNaturalLanguageQuery}
                  disabled={aiConverting || !nlQuery.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  {aiConverting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                      <span>Converting...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Convert to Query</span>
                    </>
                  )}
                </button>
              </div>

              {aiExplanation && (
                <div className="bg-green-900/20 border border-green-700/50 rounded p-3 text-xs text-green-200">
                  <span className="font-semibold">Query explanation:</span> {aiExplanation}
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <div className="font-semibold text-gray-400">Examples:</div>
                <div className="pl-2 space-y-0.5">
                  <div>• "show me failed logins"</div>
                  <div>• "admin activity on production servers in the last hour"</div>
                  <div>• "powershell commands with high severity"</div>
                  <div>• "network connections from suspicious IPs"</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={handleQueryChange}
                onKeyPress={(e) => e.key === 'Enter' && performSearch()}
                placeholder="e.g., severity:high AND event_type:login_failure"
                className="w-full px-3 py-2 bg-[#0a0e27] border border-[#1a2332] rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono text-sm"
              />
              
              {/* Auto-complete suggestions */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0e27] border border-[#1a2332] rounded shadow-xl z-10">
                  {filteredSuggestions.slice(0, 5).map((suggestion, idx) => (
                    <div
                      key={idx}
                      onClick={() => applySuggestion(suggestion)}
                      className="px-3 py-2 hover:bg-[#151b2e] cursor-pointer text-sm text-gray-300 border-b border-[#1a2332] last:border-0"
                    >
                      {Array.isArray(suggestion) ? suggestion[0] : suggestion}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Time Range
            </label>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#0a0e27] border border-[#1a2332] rounded text-gray-300 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value={1}>Last 1 hour</option>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={7 * 24}>Last 7 days</option>
              <option value={30 * 24}>Last 30 days</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Results Per Page
            </label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value))
                setOffset(0)
              }}
              className="w-full px-3 py-2 bg-[#0a0e27] border border-[#1a2332] rounded text-gray-300 text-sm focus:outline-none focus:border-blue-500"
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
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white text-sm font-medium rounded transition"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              disabled={!query.trim()}
              className="px-3 py-2 bg-[#1a2744] hover:bg-[#1f2d4f] disabled:bg-[#0a0e27] border border-[#2a3f5f] text-gray-300 rounded transition text-sm"
              title="Save this search"
            >
              Save
            </button>
          </div>
        </div>

        {/* Query Help */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-400">Query Syntax Help</summary>
          <div className="mt-2 p-3 bg-[#0a0e27] rounded border border-[#1a2332] space-y-1">
            <div><code className="text-blue-400">field:value</code> - Exact match</div>
            <div><code className="text-blue-400">field:wild*</code> - Wildcard search</div>
            <div><code className="text-blue-400">field:&gt;100</code> - Range comparison</div>
            <div><code className="text-blue-400">timestamp:1h ago</code> - Relative time</div>
            <div><code className="text-blue-400">query1 AND query2</code> - Both conditions</div>
            <div><code className="text-blue-400">query1 OR query2</code> - Either condition</div>
            <div><code className="text-blue-400">(query1 OR query2) AND query3</code> - Grouping</div>
          </div>
        </details>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-4">
          <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Saved Searches</div>
          <div className="flex flex-wrap gap-2">
            {savedSearches.map((search) => (
              <button
                key={search._id}
                onClick={() => loadSavedSearch(search.query)}
                className="px-3 py-1.5 bg-[#0a0e27] hover:bg-[#151b2e] border border-[#1a2332] hover:border-blue-800 rounded text-xs text-gray-300 transition"
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
        <div className="space-y-4">
          {/* Results Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#0f1629] border border-[#1a2332] rounded">
            <div className="text-sm">
              <span className="text-xl font-semibold text-gray-100">{totalResults}</span>
              <span className="text-gray-400 ml-1">results</span>
              <span className="text-gray-600 text-xs ml-3">Page {currentPage} of {totalPages}</span>
              <span className="text-gray-600 text-xs ml-3">{searchTime}ms</span>
            </div>
          </div>

          {/* Results List */}
          <div className="space-y-2">
            {results.map((log) => (
              <div
                key={log._id}
                className="bg-[#0f1629] border border-[#1a2332] rounded overflow-hidden hover:border-[#2a3f5f] transition cursor-pointer"
                onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}
              >
                {/* Summary Row */}
                <div className="p-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSeverityColor(log.severity)}`}>
                        {log.severity?.toUpperCase()}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getSourceColor(log.source)}`}>
                        {log.source?.toUpperCase()}
                      </span>
                      <span className="text-blue-400 text-xs font-mono">
                        {log.event_type}
                      </span>
                    </div>
                    
                    <div className="text-gray-300 text-xs mb-1">
                      <span className="text-gray-600">Host:</span> {log.host}
                      {log.user && <><span className="text-gray-600 ml-3">User:</span> {log.user}</>}
                      {log.ip && <><span className="text-gray-600 ml-3">IP:</span> {log.ip}</>}
                    </div>
                    
                    <div className="text-gray-600 text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <svg 
                    className={`w-5 h-5 text-gray-500 transition-transform ${expandedId === log._id ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded Details */}
                {expandedId === log._id && (
                  <div className="border-t border-[#1a2332] bg-[#0a0e27] p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {Object.entries(log).map(([key, value]) => {
                        if (key === '_id' || key === '_score' || typeof value === 'object') return null
                        return (
                          <div key={key}>
                            <div className="text-gray-600 font-mono">{key}</div>
                            <div className="text-gray-300 break-words">
                              {typeof value === 'string' ? value : JSON.stringify(value)}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Raw data if exists */}
                    {log.raw && (
                      <div className="mt-3 pt-3 border-t border-[#1a2332]">
                        <div className="text-gray-600 font-mono text-xs mb-2">Raw Log Data</div>
                        <pre className="bg-[#0f1629] border border-[#1a2332] p-2 rounded text-xs text-gray-400 overflow-auto max-h-48">
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
            <div className="flex items-center justify-between px-4 py-3 bg-[#0f1629] border border-[#1a2332] rounded">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-3 py-2 bg-[#1a2744] hover:bg-[#1f2d4f] disabled:bg-[#0a0e27] disabled:text-gray-700 text-gray-300 text-sm rounded transition border border-[#2a3f5f]"
              >
                Previous
              </button>
              
              <span className="text-gray-400 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= totalResults}
                className="px-3 py-2 bg-[#1a2744] hover:bg-[#1f2d4f] disabled:bg-[#0a0e27] disabled:text-gray-700 text-gray-300 text-sm rounded transition border border-[#2a3f5f]"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && query && (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <p className="text-gray-400">No results found</p>
          <p className="text-sm text-gray-600 mt-2">Try adjusting your query or time range</p>
        </div>
      )}

      {!loading && results.length === 0 && !query && (
        <div className="bg-[#0f1629] border border-[#1a2332] rounded p-12 text-center">
          <p className="text-gray-400">Enter a search query to get started</p>
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1629] border border-[#1a2332] rounded max-w-md w-full">
            <div className="p-4 border-b border-[#1a2332] flex justify-between items-center">
              <h3 className="text-base font-semibold text-gray-100">Save Search</h3>
              <button 
                onClick={() => setShowSaveModal(false)}
                className="text-gray-400 hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Search name"
                className="w-full px-3 py-2 bg-[#0a0e27] border border-[#1a2332] rounded text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500"
              />
              
              <textarea
                value={searchDescription}
                onChange={(e) => setSearchDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-[#0a0e27] border border-[#1a2332] rounded text-gray-100 placeholder-gray-600 text-sm focus:outline-none focus:border-blue-500 h-20 resize-none"
              />
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 px-3 py-2 bg-[#1a2744] hover:bg-[#1f2d4f] border border-[#2a3f5f] rounded text-sm text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSearch}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SearchPage
