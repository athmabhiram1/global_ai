import { useEffect, useState } from 'react'
import { api, type Claim, type DecisionDetail } from '../api'
import AutopsyPanel from './AutopsyPanel'
import ReasonBadge from './ReasonBadge'

interface Props {
  requestId: string
  onClose: () => void
}

function freshnessLabel(fresh: number): string {
  if (fresh >= 0.7) return 'FRESH'
  if (fresh >= 0.4) return 'AGING'
  return 'STALE'
}

function ClaimRow({ claim }: { claim: Claim }) {
  return (
    <div className="claim">
      <p>{claim.text}</p>
      <div className="cm">
        <span className="chip">
          {freshnessLabel(claim.freshness)} {claim.freshness.toFixed(2)}
        </span>
        <span className="ev">evidence: {claim.evidence.join(', ')}</span>
      </div>
    </div>
  )
}

export function DecisionDrawerView({
  detail,
  onAutopsy,
}: {
  detail: DecisionDetail
  onAutopsy: (chunkId: string) => void
}) {
  const kept = detail.chunks.filter((c) => c.verdict === 'keep')
  const dropped = detail.chunks.filter((c) => c.verdict === 'drop')
  return (
    <>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt>mode</dt>
          <dd>
            <span className="chip">{detail.mode}</span>
          </dd>
        </div>
        <div>
          <dt>policy</dt>
          <dd className="mono">{detail.policy}</dd>
        </div>
        <div>
          <dt>chunks</dt>
          <dd className="mono">
            {detail.cout}/{detail.cin} kept
          </dd>
        </div>
        <div>
          <dt>tokens</dt>
          <dd className="mono">
            {detail.tin}→{detail.tout}
          </dd>
        </div>
        <div>
          <dt>credits</dt>
          <dd className="mono">{detail.cred}</dd>
        </div>
        <div>
          <dt>duration</dt>
          <dd className="mono">{detail.ms} ms</dd>
        </div>
      </dl>
      <h4 className="mb-2 text-sm font-medium">
        Kept <span className="mono">({kept.length})</span>
      </h4>
      <ul className="mb-4 flex flex-col gap-2" data-testid="kept-list">
        {kept.map((c) => (
          <li key={c.id} className="chunk keep">
            <span className="mono">{c.id}</span>{' '}
            <span className="mono">{c.dom}</span>{' '}
            <span className="chip g">kept</span>{' '}
            <span className="mono">{c.score !== undefined ? c.score.toFixed(3) : '—'}</span>{' '}
            <button
              className="btn ml-2"
              data-testid="autopsy-trigger"
              onClick={() => onAutopsy(c.id)}
            >
              autopsy
            </button>
          </li>
        ))}
      </ul>
      {kept.length === 0 && (
        <p className="lede">
          Nothing to ablate — every chunk was killed at admission.
        </p>
      )}
      <h4 className="mb-2 text-sm font-medium">
        Dropped <span className="mono">({dropped.length})</span>
      </h4>
      <ul className="mb-4 flex flex-col gap-2" data-testid="dropped-list">
        {dropped.map((c) => (
          <li key={c.id} className="chunk drop">
            <span className="mono">{c.id}</span>{' '}
            <span className="mono">{c.dom}</span>{' '}
            <span className="chip r">killed</span>{' '}
            <ReasonBadge reason={c.reason} />
          </li>
        ))}
      </ul>
      <h4 className="mb-2 text-sm font-medium">Claim freshness</h4>
      {detail.claims.length > 0 ? (
        <div className="mb-4">
          {detail.claims.map((claim, i) => (
            <ClaimRow key={`${claim.text}-${i}`} claim={claim} />
          ))}
        </div>
      ) : (
        <p className="lede">No claim rows for this decision.</p>
      )}
    </>
  )
}

export default function DecisionDrawer({ requestId, onClose }: Props) {
  const [detail, setDetail] = useState<DecisionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ablate, setAblate] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null)
    setError(null)
    setAblate(null)
    api
      .decision(requestId)
      .then(setDetail)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [requestId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="drawer fixed inset-y-0 right-0 flex w-full max-w-xl flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Decision ${requestId}`}
    >
      <header className="flex items-center gap-3 border-b p-4">
        <h3 className="mono text-sm">{requestId}</h3>
        <button className="btn ml-auto" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p className="memo badm" role="alert">
            {error}
          </p>
        )}
        {!detail && !error && <p className="lede">Loading…</p>}
        {detail && (
          <>
            <DecisionDrawerView
              detail={detail}
              onAutopsy={(id) =>
                setAblate((cur) => (cur === id ? null : id))
              }
            />
            {ablate && (
              <AutopsyPanel requestId={requestId} chunkId={ablate} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
