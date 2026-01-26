import React, { useState } from 'react'
import Dashboard from './components/Dashboard'
import IncidentsPage from './components/Incidents'
import AlertsPage from './components/Alerts'
import LogsPage from './components/Logs'
import RulesPage from './components/Rules'
import { SearchPage } from './components/Search'
import './index.css'

export function App() {
  const [activePage, setActivePage] = useState('dashboard')

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊', color: 'text-blue-400' },
    { id: 'incidents', label: 'Incidents', icon: '🚨', color: 'text-red-400' },
    { id: 'alerts', label: 'Alerts', icon: '🔔', color: 'text-yellow-400' },
    { id: 'search', label: 'Search', icon: '🔍', color: 'text-green-400' },
    { id: 'logs', label: 'Logs', icon: '📋', color: 'text-cyan-400' },
    { id: 'rules', label: 'Rules', icon: '⚙️', color: 'text-purple-400' },
  ]

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard />
      case 'incidents':
        return <IncidentsPage />
      case 'alerts':
        return <AlertsPage />
      case 'search':
        return <SearchPage />
      case 'logs':
        return <LogsPage />
      case 'rules':
        return <RulesPage />
      default:
        return <Dashboard />
    }
  }

  const currentNav = navigationItems.find(item => item.id === activePage)

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-800 to-gray-900 border-b border-gray-700 sticky top-0 z-50 shadow-lg">
        <div className="max-w-full px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🛡️</span>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Mini SIEM
                </h1>
                <p className="text-xs text-gray-400">Security Information & Event Management</p>
              </div>
            </div>
            <div className="text-right text-sm text-gray-400">
              <p className="text-xs">Current Page: <span className={`font-semibold ${currentNav?.color}`}>{currentNav?.label}</span></p>
              <p className="text-xs mt-1">{new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-800 border-r border-gray-700 overflow-y-auto sticky top-16 h-[calc(100vh-4rem)]">
          <nav className="p-4 space-y-2">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full text-left px-4 py-4 rounded-lg transition flex items-center gap-3 font-medium ${
                  activePage === item.id
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
                {activePage === item.id && (
                  <span className="ml-auto">→</span>
                )}
              </button>
            ))}
          </nav>

          {/* Sidebar Footer - Quick Stats */}
          <div className="p-4 border-t border-gray-700 mt-auto space-y-2 text-xs text-gray-400">
            <div className="text-center py-2">
              <p className="text-gray-500 font-semibold mb-2">Quick Links</p>
              <div className="space-y-1">
                <a href="http://localhost:5601" target="_blank" rel="noopener noreferrer" className="block hover:text-blue-400 transition">
                  📊 OpenSearch Dashboards
                </a>
                <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer" className="block hover:text-blue-400 transition">
                  📖 API Docs
                </a>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="max-w-full">
              {renderPage()}
            </div>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-auto">
        <div className="max-w-full px-6 py-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <p>Mini SIEM • Built with FastAPI, OpenSearch, React & Vite</p>
            <p>Version 1.0.0 • All systems operational ✓</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
