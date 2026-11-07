import type { SentenceDiff as Diff } from '../api'

interface Props {
  withText: string
  withoutText: string
  diff: Diff
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function SentenceDiff({ withText, withoutText, diff }: Props) {
  const changed = new Set(diff.changed)
  const removed = new Set(diff.removed)
  const added = new Set(diff.added)
  const withS = sentences(withText)
  const withoutS = sentences(withoutText)

  return (
    <div className="diffgrid grid gap-4 md:grid-cols-2">
      <div className="memo badm">
        <header>
          <span className="dot"></span>with — original answer
        </header>
        {withS.map((s, i) => {
          const hot = changed.has(s) || removed.has(s)
          return (
            <p
              key={i}
              className={hot ? 'chg' : undefined}
              data-testid={hot ? 'changed-sentence' : undefined}
            >
              {s}
            </p>
          )
        })}
      </div>
      <div className="memo goodm">
        <header>
          <span className="dot"></span>without — ablated
        </header>
        {withoutS.map((s, i) => {
          const hot = changed.has(s) || added.has(s)
          return (
            <p
              key={i}
              className={hot ? 'chg' : undefined}
              data-testid={hot ? 'changed-sentence' : undefined}
            >
              {s}
            </p>
          )
        })}
      </div>
    </div>
  )
}
