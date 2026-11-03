// Reputation lives here (rather than in model.go) so the Beta-Bernoulli
// trust posterior stays beside the admission record types it annotates:
// package main cannot be imported, so the store and the sidecar share it
// through this package.
package model

import (
	"time"
)

// Reputation is the Beta-Bernoulli trust posterior for one source domain.
// Alpha counts positive observations, Beta negative ones; the pair starts at
// the uniform prior (1,1). Denied marks a policy-denied domain whose utility
// is forced to zero regardless of the counts.
type Reputation struct {
	Domain   string
	Alpha    float64
	Beta     float64
	LastSeen time.Time
	Denied   bool
}
