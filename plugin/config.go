package main

import (
	"encoding/json"
	"fmt"
)

// Mode is how the curator treats the chunks it decides to drop.
type Mode string

const (
	// ModeAnnotate records decisions but never changes the request.
	ModeAnnotate Mode = "annotate"
	// ModeRewrite drops chunks it judges inadmissible.
	ModeRewrite Mode = "rewrite"
	// ModeBlock rejects the request outright when policy is violated.
	ModeBlock Mode = "block"
)

// BudgetConfig bounds how much context the pipeline may keep and spend.
type BudgetConfig struct {
	MaxContextTokens int `json:"max_context_tokens"`
	MaxChunks        int `json:"max_chunks"`
	MaxTavilyCredits int `json:"max_tavily_credits"`
}

// IndependenceConfig floors the diversity of the selected chunks.
type IndependenceConfig struct {
	MinSources             int     `json:"min_sources"`
	NearDuplicateThreshold float64 `json:"near_duplicate_threshold"`
}

// AuthorityConfig lists trusted and denied domains and the freshness classes
// that require a primary source.
type AuthorityConfig struct {
	Allow             []string `json:"allow"`
	Deny              []string `json:"deny"`
	RequirePrimaryFor []string `json:"require_primary_for"`
}

// knownFreshnessClasses mirrors docs/ARCHITECTURE.md §8. Ruling: "security"
// in the rev.2 example policy is not a class with a defined half-life, so it
// is not accepted here; the default policy requires primary for price only.
var knownFreshnessClasses = map[string]bool{
	"price": true, "version": true, "law": true, "static": true,
}

// TavilyConfig bounds the freshness oracle: which transports to try, in
// what order, and how the plugin authenticates the direct path. The relay
// path needs no key: Bifrost injects the credential server-side.
type TavilyConfig struct {
	TransportOrder []string `json:"transport_order"`
	RelayName      string   `json:"relay_name"`
	RelayBaseURL   string   `json:"relay_base_url"`
	SearchDepth    string   `json:"search_depth"`
	MaxAgeHours    int      `json:"max_age_hours"`
	TimeoutMs      int      `json:"timeout_ms"`
}

// Config is the plugin's "config" block from config.json.
type Config struct {
	Enabled      bool               `json:"enabled"`
	Mode         Mode               `json:"mode"`
	Store        string             `json:"store_path"`
	Budget       BudgetConfig       `json:"budget"`
	Independence IndependenceConfig `json:"independence"`
	Authority    AuthorityConfig    `json:"authority"`
	Tavily       TavilyConfig       `json:"tavily"`
	// Policies holds per-virtual-key and per-route overrides by name.
	Policies map[string]Policy `json:"policies,omitempty"`
}

// DefaultConfig returns the Task 1.1 defaults from the plan.
func DefaultConfig() *Config {
	c := &Config{}
	c.applyDefaults()
	return c
}

// ParseConfig decodes an opaque plugin config, fills defaults, and validates.
func ParseConfig(raw any) (*Config, error) {
	data, err := json.Marshal(raw)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	cfg.applyDefaults()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c *Config) applyDefaults() {
	if c.Mode == "" {
		c.Mode = ModeAnnotate
	}
	if c.Store == "" {
		c.Store = "/data/contextcurator.db"
	}
	if c.Budget.MaxContextTokens == 0 {
		c.Budget.MaxContextTokens = 4000
	}
	if c.Budget.MaxChunks == 0 {
		c.Budget.MaxChunks = 8
	}
	if c.Budget.MaxTavilyCredits == 0 {
		c.Budget.MaxTavilyCredits = 2
	}
	if c.Independence.MinSources == 0 {
		c.Independence.MinSources = 2
	}
	if c.Independence.NearDuplicateThreshold == 0 {
		c.Independence.NearDuplicateThreshold = 0.85
	}
	if c.Authority.Allow == nil {
		c.Authority.Allow = []string{"*.gov", "*.edu", "docs.*", "github.com"}
	}
	if c.Authority.Deny == nil {
		c.Authority.Deny = []string{"content-farm.example"}
	}
	if c.Authority.RequirePrimaryFor == nil {
		c.Authority.RequirePrimaryFor = []string{"price"}
	}
	if len(c.Tavily.TransportOrder) == 0 {
		c.Tavily.TransportOrder = []string{"http"}
	}
	if c.Tavily.RelayName == "" {
		c.Tavily.RelayName = "tavily"
	}
	if c.Tavily.SearchDepth == "" {
		c.Tavily.SearchDepth = "basic"
	}
}

// Validate rejects configurations that would make the plugin behave in a way
// the operator did not ask for. It is called at startup, never per request.
func (c *Config) Validate() error {
	switch c.Mode {
	case ModeAnnotate, ModeRewrite, ModeBlock:
	default:
		return fmt.Errorf("context-curator: unknown mode %q (want annotate, rewrite or block)", c.Mode)
	}
	if c.Store == "" {
		return fmt.Errorf("context-curator: store_path must not be empty")
	}
	if c.Budget.MaxContextTokens <= 0 {
		return fmt.Errorf("context-curator: budget.max_context_tokens must be > 0")
	}
	if c.Budget.MaxChunks <= 0 {
		return fmt.Errorf("context-curator: budget.max_chunks must be > 0")
	}
	if c.Budget.MaxTavilyCredits < 0 {
		return fmt.Errorf("context-curator: budget.max_tavily_credits must be >= 0")
	}
	th := c.Independence.NearDuplicateThreshold
	if th <= 0 || th > 1 {
		return fmt.Errorf("context-curator: independence.near_duplicate_threshold must be in (0,1]")
	}
	for _, class := range c.Authority.RequirePrimaryFor {
		if !knownFreshnessClasses[class] {
			return fmt.Errorf("context-curator: unknown freshness class %q in require_primary_for", class)
		}
	}
	for name, p := range c.Policies {
		switch p.Mode {
		case "", ModeAnnotate, ModeRewrite, ModeBlock:
		default:
			return fmt.Errorf("context-curator: policy %q has unknown mode %q", name, p.Mode)
		}
	}
	return nil
}
