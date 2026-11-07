import { useEffect, useState } from 'react'
import { api } from '../api'

// Policy mode descriptions, mirroring template.html MODE_DESC.
export const MODE_DESC: Record<string, string> = {
  annotate:
    'Nothing is removed. Decisions are recorded and attached as annotations — the safest default for unknown routes.',
  rewrite:
    'Dropped chunks are removed from context before the provider call; every fallback attempt sees the curated request.',
  block:
    'Requests containing hard-denied sources are refused outright. No provider call happens; the ledger shows blocked rows.',
}

// Pure view: live YAML text, resolved mode, and the deny kill-list.
export function PolicyView({
  raw,
  mode,
  denied,
}: {
  raw: string
  mode: string
  denied: string[]
}) {
  return (
    <div className="pol-grid">
      <div className="codeblk">
        <code data-testid="policy-yaml">{raw}</code>
      </div>
      <div className="comp">
        <div className="crow2">
          <b>Mode</b>
          <div className="cv">
            <p data-testid="policy-mode">
              mode: <b>{mode || 'unknown'}</b>
            </p>
            {mode && MODE_DESC[mode] && <p>{MODE_DESC[mode]}</p>}
          </div>
        </div>
        <div className="crow2">
          <b>Deny kill-list</b>
          <div className="cv" data-testid="deny-chips">
            {denied.length > 0 ? (
              denied.map((d) => (
                <span key={d} className="chip r">
                  {d}
                </span>
              ))
            ) : (
              <span className="lede">kill-list empty</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PolicySection({ denied }: { denied: string[] }) {
  const [raw, setRaw] = useState<string | null>(null)
  const [mode, setMode] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .policyText()
      .then((p) => {
        setRaw(p.raw)
        setMode(p.mode)
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [])

  return (
    <section aria-label="Policy">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-medium">Policy</h2>
        <span className="chip">resolved virtual key → route → default</span>
      </div>
      {error && (
        <p className="memo badm" role="alert">
          {/503/.test(error)
            ? 'No policy loaded — the sidecar has no policy file.'
            : error}
        </p>
      )}
      {raw === null && !error && <p className="lede">Loading…</p>}
      {raw !== null && <PolicyView raw={raw} mode={mode} denied={denied} />}
    </section>
  )
}
