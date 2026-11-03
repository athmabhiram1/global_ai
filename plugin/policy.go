package main

import "strings"

// Policy is one named admission rule-set. Resolution order is virtual key,
// then route, then the default policy built from the global config.
type Policy struct {
	Name string   `json:"name"`
	Mode Mode     `json:"mode"`
	Deny []string `json:"deny"`
}

// ResolvePolicy picks the admission policy for a request. A named policy in
// cfg.Policies wins by virtual key first, then by route; otherwise the
// default policy (global mode plus the global deny list) applies.
func ResolvePolicy(cfg *Config, virtualKey, route string) Policy {
	if cfg != nil {
		if p, ok := cfg.Policies[virtualKey]; virtualKey != "" && ok {
			return named(p, virtualKey)
		}
		if p, ok := cfg.Policies[route]; route != "" && ok {
			return named(p, route)
		}
	}
	mode := ModeAnnotate
	var deny []string
	if cfg != nil {
		mode = cfg.Mode
		deny = cfg.Authority.Deny
	}
	return Policy{Name: "default", Mode: mode, Deny: deny}
}

func named(p Policy, name string) Policy {
	if p.Name == "" {
		p.Name = name
	}
	return p
}

// Admit reports whether a chunk survives the hard-deny check and, when it
// does not, the reason code. Only known-provenance chunks from denied
// domains are dropped here; inferred provenance is never hard-dropped.
func (p Policy) Admit(c Chunk) (bool, string) {
	if c.Provenance == ProvenanceKnown && domainDenied(c.Domain, p.Deny) {
		return false, ReasonAuthorityDenied
	}
	return true, ""
}

// IsChatEndpoint reports whether an HTTP path is a chat-completions call.
// Embeddings, speech, and every other endpoint pass through untouched.
func (p Policy) IsChatEndpoint(path string) bool {
	return strings.HasPrefix(path, "/v1/chat/completions")
}

func domainDenied(domain string, deny []string) bool {
	domain = strings.ToLower(domain)
	for _, d := range deny {
		d = strings.ToLower(d)
		if domain == d || strings.HasSuffix(domain, "."+d) {
			return true
		}
	}
	return false
}
