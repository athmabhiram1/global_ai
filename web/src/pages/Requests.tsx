import { useCallback, useEffect, useState } from 'react'
import { api, type DecisionListItem } from '../api'
import DecisionDrawer from '../components/DecisionDrawer'
import { MeasuredStrip, OverviewKPIs } from '../components/Overview'

export function RequestsTable({
  rows,
  onOpen,
}: {
  rows: DecisionListItem[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="tel">
      <table>
        <thead>
          <tr>
            <th>request</th>
            <th>policy</th>
            <th>mode</th>
            <th>kept</th>
            <th>tokens</th>
            <th>credits</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>
                <button
                  className="mono underline"
                  onClick={() => onOpen(d.id)}
                >
                  {d.id}
                </button>
              </td>
              <td>{d.policy}</td>
              <td>
                <span className="chip">{d.mode}</span>
              </td>
              <td className="mono">
                {d.cout}/{d.cin}
              </td>
              <td className="mono">
                {d.tin}→{d.tout}
              </td>
              <td className="mono">{d.cred}</td>
              <td className="mono">{d.t}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Requests() {
  const [rows, setRows] = useState<DecisionListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .decisions()
      .then(setRows)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <section aria-label="Recent decisions">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-medium">Recent decisions</h2>
        <button className="btn ml-auto" onClick={load}>
          Refresh
        </button>
      </div>
      {rows !== null && (
        <>
          <OverviewKPIs rows={rows} />
          <MeasuredStrip />
        </>
      )}
      {error && (
        <p className="memo badm" role="alert">
          Sidecar unreachable ({error}). Is cc-sidecar on{' '}
          {new URLSearchParams(location.search).get('sidecar') ||
            'http://localhost:8090'}
          ?
        </p>
      )}
      {rows === null && !error && <p className="lede">Loading…</p>}
      {rows !== null && rows.length === 0 && (
        <p className="lede">No decisions yet — no data is a valid state.</p>
      )}
      {rows !== null && rows.length > 0 && (
        <RequestsTable rows={rows} onOpen={setOpenId} />
      )}
      {openId && (
        <DecisionDrawer requestId={openId} onClose={() => setOpenId(null)} />
      )}
    </section>
  )
}
