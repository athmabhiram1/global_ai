import { useState } from 'react'
import { api, type AutopsyResult } from '../api'
import SentenceDiff from './SentenceDiff'

interface Props {
  requestId: string
  chunkId: string
}

// Pure proof view: influence, with/without memos, changed-sentence count.
// Split from the fetching panel so the proof renders in tests without I/O.
export function AutopsyResultView({
  result,
  chunkId,
}: {
  result: AutopsyResult
  chunkId: string
}) {
  return (
    <div aria-label={`Autopsy result for ${chunkId}`}>
      <p className="mb-2">
        influence <span className="mono">{result.influence.toFixed(2)}</span>{' '}
        {result.cached && <span className="chip">cached</span>}
      </p>
      <p className="mb-2">
        {result.diff.changed.length} / {result.diff.total} sentences changed
      </p>
      <SentenceDiff
        withText={result.with}
        withoutText={result.without}
        diff={result.diff}
      />
    </div>
  )
}

export default function AutopsyPanel({ requestId, chunkId }: Props) {
  const [result, setResult] = useState<AutopsyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    setError(null)
    try {
      setResult(await api.autopsy(requestId, chunkId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <section aria-label={`Autopsy of ${chunkId}`} className="autopsy">
      <h4 className="mb-2 text-sm font-medium">
        Autopsy <span className="mono">{chunkId}</span>
      </h4>
      {!result && !error && (
        <button className="btn" onClick={run} disabled={running}>
          {running ? 'Replaying…' : 'Run ablation'}
        </button>
      )}
      {error && (
        <p className="memo badm" role="alert">
          {error}{' '}
          <button className="btn ml-2" onClick={run}>
            Retry
          </button>
        </p>
      )}
      {result && (
        <>
          <AutopsyResultView result={result} chunkId={chunkId} />
          <button className="btn mt-2" onClick={run} disabled={running}>
            {running ? 'Replaying…' : 'Re-run'}
          </button>
        </>
      )}
    </section>
  )
}
