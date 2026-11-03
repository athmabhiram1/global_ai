package main

import "unicode/utf8"

// TokenCounter counts tokens for budget enforcement. Until a real tokenizer
// is wired in, it uses ceil(runes/4) and reports the "estimate" method in
// every decision record, per the ARCH failure-mode table.
type TokenCounter struct{}

func NewTokenCounter() *TokenCounter { return &TokenCounter{} }

// Count returns the token estimate for s. Empty input is zero.
func (t *TokenCounter) Count(s string) int {
	n := utf8.RuneCountInString(s)
	if n == 0 {
		return 0
	}
	return (n + 3) / 4
}

// Method names how the count was produced.
func (t *TokenCounter) Method() string { return "estimate" }
