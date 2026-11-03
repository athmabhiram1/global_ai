// FROZEN — DO NOT EDIT. Task 1.5 acceptance tests, hardest difficulty.
// Only non-test sources may change; test edits need a plan amendment.
package main

import "testing"

func supportConfig() *Config {
	c := DefaultConfig()
	c.Policies = map[string]Policy{
		"support-bot": {Name: "support-bot", Mode: ModeRewrite, Deny: []string{"farm.example"}},
		"chat":        {Name: "chat", Mode: ModeAnnotate},
	}
	return c
}

func TestVirtualKeyWins(t *testing.T) {
	p := ResolvePolicy(supportConfig(), "support-bot", "chat")
	if p.Name != "support-bot" {
		t.Fatalf("policy = %q, want support-bot", p.Name)
	}
}

func TestRouteFallbackWhenNoKey(t *testing.T) {
	p := ResolvePolicy(supportConfig(), "", "chat")
	if p.Name != "chat" {
		t.Fatalf("policy = %q, want chat", p.Name)
	}
}

func TestUnknownKeyAndRouteFallToDefault(t *testing.T) {
	p := ResolvePolicy(supportConfig(), "nobody", "nowhere")
	if p.Name != "default" || p.Mode != ModeAnnotate {
		t.Fatalf("policy = %+v, want default annotate", p)
	}
}

func TestDefaultPolicyCarriesGlobalDeny(t *testing.T) {
	c := DefaultConfig()
	c.Authority.Deny = []string{"evil.example"}
	p := ResolvePolicy(c, "", "")
	ok, reason := p.Admit(Chunk{Domain: "evil.example", Provenance: ProvenanceKnown})
	if ok || reason != ReasonAuthorityDenied {
		t.Fatalf("got %v %q, want false authority_denied", ok, reason)
	}
}

func TestDeniedDomainDropped(t *testing.T) {
	p := Policy{Deny: []string{"farm.example"}}
	ok, reason := p.Admit(Chunk{Domain: "farm.example", Provenance: ProvenanceKnown})
	if ok || reason != ReasonAuthorityDenied {
		t.Fatalf("got %v %q, want false authority_denied", ok, reason)
	}
}

func TestInferredNotHardDropped(t *testing.T) {
	p := Policy{Deny: []string{"farm.example"}}
	if ok, _ := p.Admit(Chunk{Domain: "farm.example", Provenance: ProvenanceInferred}); !ok {
		t.Fatal("inferred provenance must not hard-drop")
	}
}

func TestSubdomainOfDeniedIsDenied(t *testing.T) {
	p := Policy{Deny: []string{"farm.example"}}
	ok, _ := p.Admit(Chunk{Domain: "shop.farm.example", Provenance: ProvenanceKnown})
	if ok {
		t.Fatal("subdomain of a denied domain must be denied")
	}
}

func TestUnrelatedDomainAdmitted(t *testing.T) {
	p := Policy{Deny: []string{"farm.example"}}
	if ok, _ := p.Admit(Chunk{Domain: "good.example", Provenance: ProvenanceKnown}); !ok {
		t.Fatal("unrelated domain must be admitted")
	}
}

func TestEmbeddingsPassThrough(t *testing.T) {
	if (Policy{}).IsChatEndpoint("/v1/embeddings") {
		t.Fatal("embeddings treated as chat")
	}
}

func TestChatCompletionsIsChat(t *testing.T) {
	if !(Policy{}).IsChatEndpoint("/v1/chat/completions") {
		t.Fatal("chat completions not treated as chat")
	}
}
