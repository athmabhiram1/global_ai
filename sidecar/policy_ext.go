// Task 2: live deny, policy mode, and policy summary endpoints.
//
// handleDeny hard-blocks a domain: it loads the reputation row (creating a
// Beta(1,1) prior when missing), sets Denied, persists it, and returns the
// row. The plugin reads the same row on the next request, so the kill list
// is fleet-wide and cross-app.
//
// handlePolicyMode validates annotate|rewrite|block and persists the choice
// in the settings table; the plugin resolves it at request time.
//
// handlePolicySummary returns the structured values the console needs
// (effective mode, budget, freshness, authority, independence, tavily,
// claims, autopsy) parsed from the YAML with stdlib only, so the UI never
// parses YAML in the browser. GET /policy is untouched and still serves the
// raw YAML verbatim.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/athmabhiram/context-curator/plugin/store"
)

// settingsModeKey is the settings-table key for the live policy mode.
const settingsModeKey = "mode"

// validPolicyMode reports whether m is an admissible live policy mode.
func validPolicyMode(m string) bool {
	switch m {
	case "annotate", "rewrite", "block":
		return true
	}
	return false
}

// normalizeDomain canonicalizes a domain for reputation keys: trimmed,
// lowercased, no trailing dot. The extractor already normalizes chunk
// domains this way, so deny/feedback rows must match it or the pipeline
// will never see them.
func normalizeDomain(d string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(d)), ".")
}

// handleDeny sets or clears the Denied flag on one domain reputation.
func (s *Server) handleDeny(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	var body struct {
		Domain string `json:"domain"`
		Denied bool   `json:"denied"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		s.writeErr(w, http.StatusBadRequest, "invalid deny request")
		return
	}
	if body.Domain == "" {
		s.writeErr(w, http.StatusBadRequest, "domain required")
		return
	}
	body.Domain = normalizeDomain(body.Domain)
	if body.Domain == "" {
		s.writeErr(w, http.StatusBadRequest, "domain required")
		return
	}
	ctx := r.Context()
	rep, err := s.Store.GetReputation(ctx, body.Domain)
	if err != nil {
		if !errors.Is(err, store.ErrNotFound) {
			s.writeErr(w, http.StatusInternalServerError, "store error")
			return
		}
		rep = priorReputation(body.Domain, time.Now())
	}
	rep.Denied = body.Denied
	rep.LastSeen = time.Now()
	if err := s.Store.SetReputation(ctx, rep); err != nil {
		s.writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	s.writeJSON(w, http.StatusOK, rep)
}

// handlePolicyMode validates the requested mode and persists it.
func (s *Server) handlePolicyMode(w http.ResponseWriter, r *http.Request) {
	if s.Store == nil {
		s.writeErr(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	var body struct {
		Mode string `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil && !errors.Is(err, io.EOF) {
		s.writeErr(w, http.StatusBadRequest, "invalid mode request")
		return
	}
	if !validPolicyMode(body.Mode) {
		s.writeErr(w, http.StatusBadRequest, "mode must be annotate, rewrite, or block")
		return
	}
	if err := s.Store.SetSetting(r.Context(), settingsModeKey, body.Mode); err != nil {
		s.writeErr(w, http.StatusInternalServerError, "store error")
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{
		"mode":           body.Mode,
		"effective_mode": body.Mode,
	})
}

// effectivePolicyMode resolves the live mode: the stored setting wins when
// present and valid, otherwise the YAML default (falling back to annotate).
func (s *Server) effectivePolicyMode(ctx context.Context, configured string) (effective, stored string) {
	if s.Store != nil {
		if v, err := s.Store.GetSetting(ctx, settingsModeKey); err == nil && validPolicyMode(v) {
			return v, v
		} else if err == nil {
			stored = v
		}
	}
	if validPolicyMode(configured) {
		return configured, stored
	}
	return "annotate", stored
}

// handlePolicySummary returns structured policy values for the console.
func (s *Server) handlePolicySummary(w http.ResponseWriter, r *http.Request) {
	if s.PolicyJSON == "" {
		s.writeErr(w, http.StatusServiceUnavailable, "no policy loaded")
		return
	}
	cfg := policyConfigMap(s.PolicyJSON)
	configured, _ := cfg["mode"].(string)
	effective, stored := s.effectivePolicyMode(r.Context(), configured)
	out := map[string]any{
		"effective_mode":  effective,
		"mode":            effective,
		"configured_mode": configured,
		"stored_mode":     stored,
		"budget":          sectionOrEmpty(cfg, "budget"),
		"freshness":       sectionOrEmpty(cfg, "freshness"),
		"authority":       sectionOrEmpty(cfg, "authority"),
		"independence":    sectionOrEmpty(cfg, "independence"),
		"tavily":          sectionOrEmpty(cfg, "tavily"),
		"claims":          sectionOrEmpty(cfg, "claims"),
		"autopsy":         sectionOrEmpty(cfg, "autopsy"),
	}
	s.writeJSON(w, http.StatusOK, out)
}

// sectionOrEmpty returns the named section as a map, or an empty object when
// the policy does not define it (so the UI always sees {} not null).
func sectionOrEmpty(cfg map[string]any, key string) map[string]any {
	if sec, ok := cfg[key].(map[string]any); ok && sec != nil {
		return sec
	}
	return map[string]any{}
}

// policyConfigMap extracts the context_curator mapping from the policy
// document. YAML is parsed with a minimal stdlib-only subset parser (nested
// maps by indentation, scalars, inline flow lists, scalar block sequences);
// a JSON document falls back to encoding/json.
func policyConfigMap(doc string) map[string]any {
	trimmed := strings.TrimSpace(doc)
	if strings.HasPrefix(trimmed, "{") {
		var v map[string]any
		if err := json.Unmarshal([]byte(trimmed), &v); err == nil {
			if cc, ok := v["context_curator"].(map[string]any); ok {
				return cc
			}
			return v
		}
	}
	root := parseSimpleYAML(doc)
	if cc, ok := root["context_curator"].(map[string]any); ok && cc != nil {
		return cc
	}
	return map[string]any{}
}

// yamlLine is one significant source line: its indent width and content.
type yamlLine struct {
	indent  int
	content string
}

// yamlLines strips blanks, full-line comments, and inline comments (a #
// preceded by whitespace outside quotes), keeping indent widths.
func yamlLines(src string) []yamlLine {
	var out []yamlLine
	for _, raw := range strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n") {
		indent := 0
		for indent < len(raw) && raw[indent] == ' ' {
			indent++
		}
		content := stripYAMLComment(strings.TrimSpace(raw[indent:]))
		if content == "" {
			continue
		}
		out = append(out, yamlLine{indent: indent, content: content})
	}
	return out
}

// stripYAMLComment cuts a trailing comment: # outside quotes that is either
// first or preceded by a space or tab.
func stripYAMLComment(s string) string {
	var inSingle, inDouble bool
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\'':
			if !inDouble {
				inSingle = !inSingle
			}
		case '"':
			if !inSingle {
				inDouble = !inDouble
			}
		case '#':
			if !inSingle && !inDouble && (i == 0 || s[i-1] == ' ' || s[i-1] == '\t') {
				return strings.TrimSpace(s[:i])
			}
		}
	}
	return s
}

// parseSimpleYAML parses nested string-keyed maps from the supported subset.
func parseSimpleYAML(src string) map[string]any {
	lines := yamlLines(src)
	pos := 0
	return parseYAMLMap(lines, &pos, -1)
}

// parseYAMLMap consumes map entries more indented than parentIndent.
func parseYAMLMap(lines []yamlLine, pos *int, parentIndent int) map[string]any {
	m := map[string]any{}
	for *pos < len(lines) {
		line := lines[*pos]
		if line.indent <= parentIndent {
			return m
		}
		if strings.HasPrefix(line.content, "- ") {
			return m
		}
		key, rest, found := strings.Cut(line.content, ":")
		key = strings.TrimSpace(key)
		if !found || key == "" || strings.Contains(key, " ") {
			*pos++
			continue
		}
		rest = strings.TrimSpace(rest)
		if rest == "" {
			*pos++
			if *pos < len(lines) && lines[*pos].indent > line.indent {
				if strings.HasPrefix(lines[*pos].content, "- ") {
					m[key] = parseYAMLSeq(lines, pos, line.indent)
				} else {
					m[key] = parseYAMLMap(lines, pos, line.indent)
				}
			} else {
				m[key] = nil
			}
			continue
		}
		m[key] = parseYAMLValue(rest)
		*pos++
	}
	return m
}

// parseYAMLSeq consumes "- item" lines more indented than parentIndent.
func parseYAMLSeq(lines []yamlLine, pos *int, parentIndent int) []any {
	var seq []any
	for *pos < len(lines) {
		line := lines[*pos]
		if line.indent <= parentIndent || !strings.HasPrefix(line.content, "- ") {
			break
		}
		item := strings.TrimSpace(strings.TrimPrefix(line.content, "- "))
		if item == "" {
			*pos++
			if *pos < len(lines) && lines[*pos].indent > line.indent {
				seq = append(seq, parseYAMLMap(lines, pos, line.indent))
			} else {
				seq = append(seq, nil)
			}
			continue
		}
		seq = append(seq, parseYAMLValue(item))
		*pos++
	}
	if seq == nil {
		seq = []any{}
	}
	return seq
}

// parseYAMLValue parses one scalar or inline flow list.
func parseYAMLValue(tok string) any {
	if strings.HasPrefix(tok, "[") && strings.HasSuffix(tok, "]") {
		inner := strings.TrimSpace(tok[1 : len(tok)-1])
		if inner == "" {
			return []any{}
		}
		var out []any
		for _, part := range splitFlowList(inner) {
			out = append(out, parseYAMLScalar(strings.TrimSpace(part)))
		}
		return out
	}
	return parseYAMLScalar(tok)
}

// splitFlowList splits on top-level commas, respecting quotes.
func splitFlowList(s string) []string {
	var parts []string
	var cur strings.Builder
	var inSingle, inDouble bool
	for _, r := range s {
		switch r {
		case '\'':
			if !inDouble {
				inSingle = !inSingle
			}
		case '"':
			if !inSingle {
				inDouble = !inDouble
			}
		case ',':
			if !inSingle && !inDouble {
				parts = append(parts, cur.String())
				cur.Reset()
				continue
			}
		}
		cur.WriteRune(r)
	}
	parts = append(parts, cur.String())
	return parts
}

// parseYAMLScalar converts one scalar token to bool, int, float, or string.
func parseYAMLScalar(tok string) any {
	if len(tok) >= 2 {
		if (tok[0] == '"' && tok[len(tok)-1] == '"') ||
			(tok[0] == '\'' && tok[len(tok)-1] == '\'') {
			return tok[1 : len(tok)-1]
		}
	}
	switch strings.ToLower(tok) {
	case "true":
		return true
	case "false":
		return false
	case "null", "~", "":
		return nil
	}
	if i, err := strconv.Atoi(tok); err == nil {
		return i
	}
	if f, err := strconv.ParseFloat(tok, 64); err == nil {
		return f
	}
	return tok
}
