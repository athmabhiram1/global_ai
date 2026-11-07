import { useState } from 'react'
import Requests from './pages/Requests'
import Sources from './pages/Sources'
import PolicySection from './components/PolicySection'

type Page = 'requests' | 'sources' | 'policy'

export default function App() {
  const [page, setPage] = useState<Page>('requests')
  // Local deny kill-list shared by Sources and Policy (template.html state.deny).
  const [denied, setDenied] = useState<string[]>([])
  const toggleDeny = (domain: string) =>
    setDenied((cur) =>
      cur.includes(domain)
        ? cur.filter((d) => d !== domain)
        : [...cur, domain],
    )

  return (
    <div className="wrap min-h-screen py-8">
      <header className="topbar mb-8 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Context Curator
          <span className="chip ml-3">admission control</span>
        </h1>
        <nav className="ml-auto flex gap-2" aria-label="Console pages">
          <button
            className={`btn ${page === 'requests' ? 'btn-active' : ''}`}
            onClick={() => setPage('requests')}
            aria-current={page === 'requests' ? 'page' : undefined}
          >
            Requests
          </button>
          <button
            className={`btn ${page === 'sources' ? 'btn-active' : ''}`}
            onClick={() => setPage('sources')}
            aria-current={page === 'sources' ? 'page' : undefined}
          >
            Sources
          </button>
          <button
            className={`btn ${page === 'policy' ? 'btn-active' : ''}`}
            onClick={() => setPage('policy')}
            aria-current={page === 'policy' ? 'page' : undefined}
          >
            Policy
          </button>
        </nav>
      </header>
      {page === 'requests' ? (
        <Requests />
      ) : page === 'sources' ? (
        <Sources denied={denied} onToggleDeny={toggleDeny} />
      ) : (
        <PolicySection denied={denied} />
      )}
    </div>
  )
}
