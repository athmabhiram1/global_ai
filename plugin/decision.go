package main

import (
	"github.com/athmabhiram/context-curator/plugin/model"
)

// Decision and its reason codes live in plugin/model so the SQLite store and
// the sidecar can share them — package main cannot be imported. These aliases
// keep every existing reference (and frozen test) compiling unchanged.
type Decision = model.Decision
type DropReason = model.DropReason

const (
	ReasonStale             = model.ReasonStale
	ReasonAuthorityDenied   = model.ReasonAuthorityDenied
	ReasonLowRelevance      = model.ReasonLowRelevance
	ReasonOverBudget        = model.ReasonOverBudget
	ReasonPolicyMinSources  = model.ReasonPolicyMinSources
	ReasonRefreshFailed     = model.ReasonRefreshFailed
	ReasonProvenanceUnknown = model.ReasonProvenanceUnknown
)

const duplicateOfPrefix = model.DuplicateOfPrefix
