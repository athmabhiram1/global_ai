package main

import (
	"crypto/sha256"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// urlPattern extracts absolute http(s) URLs. Trailing sentence punctuation is
// trimmed after the match so prose stays readable and domains stay clean.
var urlPattern = regexp.MustCompile(`https?://[^\s<>"')\]]+`)

// ExtractProvenance fills a chunk's source identity: every absolute URL in
// text order, the first URL's domain, a whitespace-normalised content hash,
// and provenance known iff at least one URL survived. A preset FetchedAt
// (from tool metadata) is never overwritten.
func ExtractProvenance(c Chunk, now time.Time) Chunk {
	raw := urlPattern.FindAllString(c.Text, -1)
	urls := make([]string, 0, len(raw))
	for _, u := range raw {
		u = strings.TrimRight(u, ".,;:!?")
		if _, err := url.ParseRequestURI(u); err != nil {
			continue
		}
		urls = append(urls, u)
	}
	c.SourceURLs = urls
	if len(urls) > 0 {
		c.Provenance = ProvenanceKnown
		if domain, err := NormalizeDomain(urls[0]); err == nil {
			c.Domain = domain
		}
	} else {
		c.Provenance = ProvenanceInferred
	}
	c.ContentHash = hashText(c.Text)
	if c.FetchedAt.IsZero() {
		c.FetchedAt = now
	}
	return c
}

// NormalizeDomain returns the lowercase registrable host of an absolute URL,
// without port or path. Anything else is an error.
func NormalizeDomain(rawurl string) (string, error) {
	u, err := url.ParseRequestURI(strings.TrimSpace(rawurl))
	if err != nil {
		return "", fmt.Errorf("context-curator: bad url %q", rawurl)
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return "", fmt.Errorf("context-curator: url %q has no host", rawurl)
	}
	return host, nil
}

// hashText hashes whitespace-normalised text so reflowed copies match.
func hashText(s string) string {
	sum := sha256.Sum256([]byte(strings.Join(strings.Fields(s), " ")))
	return fmt.Sprintf("%x", sum)
}
