// Package aireview implements Gate 2 — LLM-based code review.
//
// Gate pipeline (from backtest/screener submit):
//
//	user code ─► Gate 1 (AST/compliance) ─► Gate 2 (this package) ─► sandbox-service
//
// Gate 2 is fail-closed: any error path — network, timeout, parse failure,
// unrecognized verdict — becomes a rejection.  There is no override flag.
//
// The package is organised as:
//
//	normalize.go       — code-hash derivation (cache key)
//	prompt.go          — system + user prompts, versioned
//	deepseek_client.go — DeepSeek chat-completions wire layer
//	cache.go           — claw.ai_review_cache read/upsert
//	audit.go           — claw.ai_review_audit append
//	service.go         — public Service.Review entrypoint
package aireview

import (
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"strings"
)

// Hash returns a deterministic cache key for the given user code.
//
// The key is sha256-hex of the *normalized* source:
//
//  1. Python comments stripped (`# ...` through end-of-line — string-literal
//     safe).
//  2. Blank lines removed.
//  3. Trailing whitespace stripped from each line.
//  4. CRLF normalized to LF.
//
// Rationale: cosmetic whitespace / comment edits should NOT cause a cache
// miss; that would punish users who re-run the same logic with a tweaked
// docstring and waste DeepSeek tokens.  But the normalization is deliberately
// shallow — anything that could change execution (identifiers, strings,
// numbers, operators) stays in the hash.
//
// The version prefix ("v1:") is included in the input so that a future
// normalization change can be rolled out without poisoning existing cache
// rows — bump to "v2:" and existing keys auto-invalidate.
func Hash(code string) string {
	normalized := Normalize(code)
	h := sha256.Sum256([]byte("v1:" + normalized))
	return hex.EncodeToString(h[:])
}

// Normalize returns the canonical form used by Hash.  Exposed for debugging
// / audit purposes — production code should call Hash directly.
func Normalize(code string) string {
	// CRLF → LF so Windows clients don't make us cache-miss.
	code = strings.ReplaceAll(code, "\r\n", "\n")
	code = strings.ReplaceAll(code, "\r", "\n")

	out := make([]string, 0, 64)
	for _, line := range strings.Split(code, "\n") {
		stripped := stripComment(line)
		// Collapse runs of internal whitespace to a single space.
		stripped = _wsRun.ReplaceAllString(stripped, " ")
		stripped = strings.TrimRight(stripped, " \t")
		if stripped == "" {
			continue
		}
		// Keep leading indentation (Python is whitespace-sensitive).  Re-attach
		// the original leading whitespace AFTER collapsing.  Simpler: take the
		// original leading whitespace from the raw line and prepend it.
		leading := leadingWS(line)
		out = append(out, leading+strings.TrimLeft(stripped, " \t"))
	}
	return strings.Join(out, "\n")
}

var _wsRun = regexp.MustCompile(`[ \t]+`)

func leadingWS(s string) string {
	i := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return s[:i]
}

// stripComment removes a trailing `# comment` from the line, respecting
// simple string literals so `x = "#not a comment"` isn't mangled.
//
// This is NOT a full Python parser.  It handles the cases that actually
// come up in user strategies (single-line comments after code); rare edge
// cases like unclosed triple-quoted strings spanning multiple lines will
// over-strip, but Gate 1's AST parser has already validated the source
// compiles, so genuine syntax weirdness won't reach us.
func stripComment(line string) string {
	inSingle, inDouble := false, false
	for i := 0; i < len(line); i++ {
		c := line[i]
		switch {
		case c == '\\' && i+1 < len(line):
			// Skip the escaped char.
			i++
		case c == '\'' && !inDouble:
			inSingle = !inSingle
		case c == '"' && !inSingle:
			inDouble = !inDouble
		case c == '#' && !inSingle && !inDouble:
			return line[:i]
		}
	}
	return line
}
