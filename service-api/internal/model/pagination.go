package model

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// Paginated is the canonical wrapper for list responses. Matches the
// `PaginatedList` schema. `NextCursor` is `nil` when the caller has
// reached the end of the result set.
type Paginated[T any] struct {
	Items      []T     `json:"items"`
	NextCursor *string `json:"next_cursor"`
}

// EncodeCursor marshals an opaque cursor payload as base64(json). The
// internal shape is per-operation — callers define the fields they
// need to resume. Returning the pointer lets callers pass `nil` for
// "no more pages" without a sentinel value.
func EncodeCursor(payload any) (*string, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode cursor: %w", err)
	}
	s := base64.StdEncoding.EncodeToString(b)
	return &s, nil
}

// DecodeCursor reverses EncodeCursor; callers cast the target to the
// per-operation struct.
func DecodeCursor(raw string, out any) error {
	if raw == "" {
		return nil
	}
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return fmt.Errorf("decode cursor: %w", err)
	}
	if err := json.Unmarshal(b, out); err != nil {
		return fmt.Errorf("unmarshal cursor: %w", err)
	}
	return nil
}
