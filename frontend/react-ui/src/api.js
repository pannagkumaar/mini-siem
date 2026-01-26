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
