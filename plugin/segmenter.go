package main

import (
	"fmt"

	"github.com/maximhq/bifrost/core/schemas"
)

// Segment splits a chat request's tool context into chunks with stable IDs
// ("c" + tool ordinal: position among the segmented tool messages).
// User prose, system prompts, and assistant messages are never segmented —
// the prose guard. Nil and message-less requests yield an empty slice,
// never an error.
func Segment(req *schemas.BifrostRequest) ([]Chunk, error) {
	if req == nil || req.ChatRequest == nil {
		return nil, nil
	}
	counter := NewTokenCounter()
	var chunks []Chunk
	for _, msg := range req.ChatRequest.Input {
		if msg.Role != schemas.ChatMessageRoleTool {
			continue
		}
		text := messageText(msg)
		if text == "" {
			continue
		}
		var toolCallID string
		if msg.ChatToolMessage != nil && msg.ChatToolMessage.ToolCallID != nil {
			toolCallID = *msg.ChatToolMessage.ToolCallID
		}
		chunks = append(chunks, Chunk{
			ID:         fmt.Sprintf("c%d", len(chunks)),
			ToolCallID: toolCallID,
			Role:       string(msg.Role),
			Tokens:     counter.Count(text),
			Text:       text,
		})
	}
	if chunks == nil {
		return nil, nil
	}
	return chunks, nil
}
