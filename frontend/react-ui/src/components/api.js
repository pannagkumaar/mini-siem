import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
})

// Stats endpoint
export const getStats = () => {
  return api.get('/stats')
}

// Get detailed summary with breakdowns
export const getSummary = () => {
  return api.get('/summary')
}

// Rules endpoints
export const getRules = () => {
  return api.get('/rules')
}

export const getRule = (ruleId) => {
  return api.get(`/rules/${ruleId}`)
}

// Incidents endpoints
export const getIncidents = (hours = 24) => {
  return api.get(`/incidents?hours=${hours}`)
}

export const getIncident = (incidentId) => {
  return api.get(`/incidents/${incidentId}`)
}

export const updateIncident = (incidentId, updates) => {
  return api.put(`/incidents/${incidentId}`, updates)
}

export const updateIncidentStatus = (incidentId, status) => {
  return api.put(`/incidents/${incidentId}/status?status=${status}`)
}

export const startInvestigation = (incidentId) => {
  return api.put(`/incidents/${incidentId}/investigate`)
}

export const resolveIncident = (incidentId, notes = null) => {
  const params = new URLSearchParams()
  if (notes) params.append('notes', notes)
  return api.put(`/incidents/${incidentId}/resolve?${params.toString()}`)
}

// Advanced Search endpoints
export const searchLogs = (query, hours = 24, limit = 100, offset = 0) => {
  return api.get(`/search?q=${encodeURIComponent(query)}&hours=${hours}&limit=${limit}&offset=${offset}`)
}

export const getSearchSuggestions = () => {
  return api.get('/search/suggestions')
}

export const saveSearch = (name, query, description = null) => {
  const params = new URLSearchParams()
  params.append('name', name)
  params.append('query', query)
  if (description) params.append('description', description)
  return api.post(`/search/save?${params.toString()}`)
}

export const getSavedSearches = () => {
  return api.get('/search/saved')
}

// Alerts endpoint
export const getAlerts = (hours = 24, limit = 100) => {
  return api.get(`/alerts?hours=${hours}&limit=${limit}`)
}

// Logs endpoint
export const getLogs = (hours = 24, limit = 100, filters = {}) => {
  let url = `/logs?hours=${hours}&limit=${limit}`
  if (filters.event_type) url += `&event_type=${filters.event_type}`
  if (filters.severity) url += `&severity=${filters.severity}`
  if (filters.source) url += `&source=${filters.source}`
  return api.get(url)
}

// Health check
export const getHealth = () => {
  return api.get('/health')
}

// Ingest a log
export const ingestLog = async (log) => {
  return api.post('/ingest', log)
}

// Ingest batch of logs
export const ingestLogs = async (logs) => {
  return api.post('/ingest', logs)
}

export default api
