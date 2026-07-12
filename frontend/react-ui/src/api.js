import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Health check
export const checkHealth = async () => {
  return apiClient.get('/health')
}

// Get statistics
export const getStats = async () => {
  return apiClient.get('/stats')
}

// Get detailed summary with breakdowns
export const getSummary = async () => {
  return apiClient.get('/summary')
}

// Get detection rules
export const getRules = async () => {
  return apiClient.get('/rules')
}

// Get recent incidents
export const getIncidents = async (hours = 24) => {
  return apiClient.get(`/incidents?hours=${hours}`)
}

// Get recent alerts
export const getAlerts = async (hours = 24, limit = 100) => {
  return apiClient.get(`/alerts?hours=${hours}&limit=${limit}`)
}

// Get recent logs with optional filters
export const getLogs = async (hours = 24, limit = 100, filters = {}) => {
  let url = `/logs?hours=${hours}&limit=${limit}`
  if (filters.event_type) url += `&event_type=${filters.event_type}`
  if (filters.severity) url += `&severity=${filters.severity}`
  if (filters.source) url += `&source=${filters.source}`
  return apiClient.get(url)
}

// Ingest a log
export const ingestLog = async (log) => {
  return apiClient.post('/ingest', log)
}

// Ingest batch of logs
export const ingestLogs = async (logs) => {
  return apiClient.post('/ingest', logs)
}

// Start incident investigation
export const startInvestigation = async (incidentId) => {
  return apiClient.put(`/incidents/${incidentId}/investigate`)
}

// Resolve incident
export const resolveIncident = async (incidentId, notes = '') => {
  return apiClient.put(`/incidents/${incidentId}/resolve`, { notes })
}

// Update incident status
export const updateIncidentStatus = async (incidentId, status, notes = '') => {
  return apiClient.put(`/incidents/${incidentId}/status`, { status, notes })
}

// Generate (or fetch cached) AI root cause analysis for an incident
export const generateIncidentRCA = async (incidentId, force = false) => {
  return apiClient.post(`/ai/rca/${incidentId}${force ? '?force=true' : ''}`)
}

// Get existing AI RCA for an incident, if any
export const getIncidentRCA = async (incidentId) => {
  return apiClient.get(`/ai/rca/${incidentId}`)
}

// Search logs with advanced query
export const searchLogs = async (query, hours = 24, limit = 100, offset = 0) => {
  const params = new URLSearchParams({
    q: query,
    hours: hours.toString(),
    limit: limit.toString(),
    offset: offset.toString()
  })
  return apiClient.get(`/search?${params.toString()}`)
}

// Get search suggestions
export const getSearchSuggestions = async (partial = '') => {
  if (!partial) return { fields: [], values: {} }
  return apiClient.get(`/search/suggestions?q=${encodeURIComponent(partial)}`)
}

// Save a search query
export const saveSearch = async (name, query, description = '') => {
  return apiClient.post('/search/save', { name, query, description })
}

// Get saved searches
export const getSavedSearches = async () => {
  return apiClient.get('/search/saved')
}

// Convert natural language to SIEM query
export const convertNaturalLanguageQuery = async (naturalQuery) => {
  return apiClient.post('/ai/convert-query', { natural_query: naturalQuery })
}
