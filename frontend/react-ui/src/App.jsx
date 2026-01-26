import React, { useState } from 'react'
import DashboardClean from './components/DashboardClean'
import IncidentsPage from './components/IncidentsClean'
import AlertsPage from './components/AlertsClean'
import LogsPage from './components/LogsClean'
import RulesClean from './components/RulesClean'
import { SearchPage } from './components/SearchClean'
import './index.css'

export function App() {
  const [activePage, setActivePage] = useState('dashboard')

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'search', label: 'Search' },
    { id: 'logs', label: 'Logs' },
    { id: 'rules', label: 'Rules' },
  ]

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardClean />
      case 'incidents':
        return <IncidentsPage />
      case 'alerts':
        return <AlertsPage />
      case 'search':
        return <SearchPage />
      case 'logs':
        return <LogsPage />
      case 'rules':
        return <RulesClean />
      default:
        return <DashboardClean />
    }
  }

  const currentNav = navigationItems.find(item => item.id === activePage)

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-[#0f1629] border-b border-[#1a2332] sticky top-0 z-50">
        <div className="max-w-full px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-100">
                Security Operations Center
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Real-time threat intelligence platform</p>
            </div>
            <div className="flex items-center space-x-6 text-xs text-gray-500">
              <div>
                <span className="text-gray-400">Active:</span> {currentNav?.label}
              </div>
              <div>{new Date().toLocaleTimeString()}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-[#0f1629] border-r border-[#1a2332] overflow-y-auto sticky top-16 h-[calc(100vh-4rem)]">
          <nav className="p-3 space-y-1">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full text-left px-4 py-3 rounded transition flex items-center text-sm ${
                  activePage === item.id
                    ? 'bg-[#1a2744] text-gray-100 border-l-2 border-blue-500'
                    : 'text-gray-400 hover:bg-[#151b2e] hover:text-gray-300'
                }`}
              >
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-4 border-t border-[#1a2332] mt-auto text-xs">
            <div className="space-y-2">
              <a href="http://localhost:5601" target="_blank" rel="noopener noreferrer" className="block text-gray-500 hover:text-gray-400 transition">
                OpenSearch
              </a>
              <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer" className="block text-gray-500 hover:text-gray-400 transition">
                API Documentation
              </a>
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
    </div>
  )
}

export default App
