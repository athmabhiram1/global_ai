package main

import (
	"strings"

	"github.com/maximhq/bifrost/core/schemas"
)

// messageText reads a chat message's text regardless of which content shape
// it uses: a plain string or a list of content blocks.
func messageText(m schemas.ChatMessage) string {
	if m.Content == nil {
		return ""
	}
	if m.Content.ContentStr != nil {
		return *m.Content.ContentStr
	}
	var b strings.Builder
	for _, block := range m.Content.ContentBlocks {
		if block.Text != nil {
			b.WriteString(*block.Text)
		}
	}
	return b.String()
}

func ptr[T any](v T) *T { return &v }
