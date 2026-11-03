package main

import (
	"math"
	"time"

	"github.com/athmabhiram/context-curator/plugin/model"
)

// Reputation is the Beta-Bernoulli trust posterior for one source domain,
// shared with the store and the sidecar through plugin/model. The alias keeps
// every reference compiling unchanged.
type Reputation = model.Reputation

// reputationCap bounds each Beta-Bernoulli count: a flood of observations
// must not pin a domain so hard that fresh evidence stops moving it.
const reputationCap = 10000

// reputationDecayBase is the per-day retention of evidence over the prior:
// each day keeps 99% of the distance from (1,1).
const reputationDecayBase = 0.99

// Utility is the posterior mean alpha/(alpha+beta): the domain's expected
// trustworthiness. A non-positive count sum carries no evidence, so it
// reports the uniform-prior mean 0.5.
func Utility(r Reputation) float64 {
	if r.Alpha+r.Beta <= 0 {
		return 0.5
	}
	return r.Alpha / (r.Alpha + r.Beta)
}

// Apply folds one observation into the posterior: a positive outcome bumps
// alpha, a negative one bumps beta. Each count caps at 10000, and the
// observation refreshes LastSeen to now.
func Apply(r Reputation, positive bool) Reputation {
	if positive {
		r.Alpha = math.Min(r.Alpha+1, reputationCap)
	} else {
		r.Beta = math.Min(r.Beta+1, reputationCap)
	}
	r.LastSeen = time.Now()
	return r
}

// Decay pulls the posterior toward the uniform prior (1,1) for the days
// elapsed since LastSeen: 1+(v-1)*0.99^days per count. Stale evidence fades
// instead of freezing a domain at an old verdict. LastSeen advances to now.
func Decay(r Reputation, now time.Time) Reputation {
	days := now.Sub(r.LastSeen).Hours() / 24
	if days < 0 {
		days = 0
	}
	factor := math.Pow(reputationDecayBase, days)
	r.Alpha = 1 + (r.Alpha-1)*factor
	r.Beta = 1 + (r.Beta-1)*factor
	r.LastSeen = now
	return r
}
