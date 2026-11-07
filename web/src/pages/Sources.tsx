import { useCallback, useEffect, useState } from 'react'
import { api, type RepItem } from '../api'

export function SourcesTable({
  rows,
  denied,
  onGood,
  onBad,
  onDeny,
  onReset,
}: {
  rows: RepItem[]
  denied: string[]
  onGood: (domain: string) => void
  onBad: (domain: string) => void
  onDeny: (domain: string) => void
  onReset: (domain?: string) => void
}) {
  return (
    <div className="tel">
      <table>
        <thead>
          <tr>
            <th>domain</th>
            <th>tier</th>
            <th>α / β</th>
            <th>seen</th>
            <th>feedback</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isDenied = denied.includes(r.domain) || r.tier === 'denied'
            return (
              <tr key={r.domain}>
                <td className="mono">{r.domain}</td>
                <td>
                  <span
                    className={`chip ${r.tier === 'denied' ? 'r' : r.tier === 'reputable' ? 'g' : r.tier === 'aggregator' ? 'a' : ''}`}
                  >
                    {r.tier}
                  </span>
                  {isDenied && (
                    <span
                      className="chip r"
                      data-testid={`deny-on-${r.domain}`}
                    >
                      denied
                    </span>
                  )}
                </td>
                <td className="mono">
                  {r.a}/{r.b}
                </td>
                <td>{r.seen}</td>
                <td className="flex gap-2">
                  <button className="btn" onClick={() => onGood(r.domain)}>
                    good
                  </button>
                  <button className="btn" onClick={() => onBad(r.domain)}>
                    bad
                  </button>
                  <button className="btn" onClick={() => onDeny(r.domain)}>
                    deny
                  </button>
                </td>
                <td>
                  <button className="btn" onClick={() => onReset(r.domain)}>
                    reset
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-2">
        <button className="btn" onClick={() => onReset(undefined)}>
          Reset all
        </button>
      </div>
    </div>
  )
}

// Deny is a local kill-list (template.html repAct): it lands in the Policy
// section chips immediately and takes effect at admission after a restart.
// No sidecar endpoint exists for it, so nothing is posted.
export default function Sources({
  denied,
  onToggleDeny,
}: {
  denied: string[]
  onToggleDeny: (domain: string) => void
}) {
  const [rows, setRows] = useState<RepItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .reputation()
      .then(setRows)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function vote(domain: string, verdict: 'good' | 'bad') {
    await api.feedback(domain, verdict)
    await load()
  }

  async function reset(domain?: string) {
    await api.resetRep(domain)
    await load()
  }

  return (
    <section aria-label="Source reputation">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-medium">Source reputation</h2>
        <span className="chip g">one table, all apps</span>
      </div>
      {error && (
        <p className="memo badm" role="alert">
          Sidecar unreachable ({error}).
        </p>
      )}
      {rows === null && !error && <p className="lede">Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="lede">No reputation rows yet.</p>
      )}
      {rows !== null && rows.length > 0 && (
        <SourcesTable
          rows={rows}
          denied={denied}
          onGood={(d) => void vote(d, 'good')}
          onBad={(d) => void vote(d, 'bad')}
          onDeny={onToggleDeny}
          onReset={(d) => void reset(d)}
        />
      )}
    </section>
  )
}
