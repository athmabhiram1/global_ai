// Reason badge for a killed chunk: the drop reason code carried by the
// ledger (stale, duplicate_of:<id>, authority_denied, ... — ARCH §6).
export default function ReasonBadge({ reason }: { reason?: string }) {
  if (!reason) return null
  return (
    <span className="chip r" data-testid="reason-badge" title={`drop reason: ${reason}`}>
      {reason}
    </span>
  )
}
