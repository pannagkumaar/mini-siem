import React, { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import IncidentsPage from './components/Incidents'
import AlertsPage from './components/Alerts'
import LogsPage from './components/Logs'
import Rules from './components/Rules'
import { SearchPage } from './components/Search'
import { PulseDot } from './components/ui'
import './index.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'search', label: 'Search' },
  { id: 'logs', label: 'Logs' },
  { id: 'rules', label: 'Rules' },
]

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <svg width="20" height="20" viewBox="0 0 32 32" className="flex-none">
        <rect x="2" y="18" width="3" height="8" fill="#4fd1c5" />
        <rect x="7" y="13" width="3" height="13" fill="#4fd1c5" />
        <rect x="12" y="7" width="3" height="19" fill="#ff9f40" />
        <rect x="17" y="15" width="3" height="11" fill="#4fd1c5" />
        <rect x="22" y="10" width="3" height="16" fill="#4fd1c5" />
      </svg>
      <div>
        <div className="font-semibold text-bone text-[15px] leading-tight tracking-tight">Mini-SIEM</div>
        <div className="eyebrow leading-tight">SOC Console</div>
      </div>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="mono text-xs text-dim tabular-nums">{now.toLocaleTimeString([], { hour12: false })}</span>
}

export function App() {
  const [activePage, setActivePage] = useState('dashboard')

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
        return <Rules />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-ink text-bone flex flex-col">
      {/* Header */}
      <header className="border-b hairline sticky top-0 z-50 bg-ink">
        <div className="px-5 h-14 flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <PulseDot live />
              <span className="eyebrow text-signal">Live</span>
            </div>
            <Clock />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 border-r hairline overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)] flex flex-col justify-between">
          <nav className="py-4">
            {NAV_ITEMS.map((item) => {
              const active = activePage === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`w-full text-left pl-5 pr-4 py-2.5 flex items-center gap-3 border-l-2 transition-colors ${
                    active
                      ? 'border-signal text-bone bg-panel'
                      : 'border-transparent text-dim hover:text-bone hover:bg-panel/60'
                  }`}
                >
                  <span className="mono text-[11px] tracking-widest uppercase">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="px-5 py-4 border-t hairline space-y-2">
            <a
              href="http://localhost:5601"
              target="_blank"
              rel="noopener noreferrer"
              className="block eyebrow hover:text-bone transition-colors"
            >
              OpenSearch &#8599;
            </a>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="block eyebrow hover:text-bone transition-colors"
            >
              API Docs &#8599;
            </a>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-8 max-w-[1400px]">{renderPage()}</div>
        </main>
      </div>
    </div>
  )
}

export default App
