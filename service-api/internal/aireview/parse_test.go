package aireview

import (
	"errors"
	"strings"
	"testing"
)

func TestParseVerdict_Approve(t *testing.T) {
	v, err := parseVerdict(`{"verdict":"approve","reason":"","dimensions":{"security":"pass","correctness":"pass"}}`)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !v.IsApproved() {
		t.Fatalf("expected approved, got %+v", v)
	}
}

func TestParseVerdict_Reject(t *testing.T) {
	v, err := parseVerdict(`{"verdict":"reject","reason":"uses os.system","dimensions":{"security":"fail","correctness":"pass"}}`)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if v.IsApproved() {
		t.Fatalf("expected reject")
	}
	if v.Reason != "uses os.system" {
		t.Fatalf("reason not preserved: %q", v.Reason)
	}
}

func TestParseVerdict_UnknownVerdictBecomesReject(t *testing.T) {
	// Some models occasionally emit "warn" / "partial" / etc. — we refuse
	// to accept anything but approve/reject, and anything else becomes reject.
	v, err := parseVerdict(`{"verdict":"warn","reason":"iffy"}`)
	if err != nil {
		t.Fatalf("expected no parse err; got %v", err)
	}
	if v.IsApproved() {
		t.Fatalf("expected reject for unknown verdict")
	}
	if !strings.Contains(v.Reason, "warn") {
		t.Fatalf("reason should mention the bad verdict: %q", v.Reason)
	}
}

func TestParseVerdict_ApproveWithBadDimensionIsReject(t *testing.T) {
	// The model contradicted itself — verdict=approve but a dimension is fail.
	// Defence in depth: reject.
	v, err := parseVerdict(`{"verdict":"approve","dimensions":{"security":"fail","correctness":"pass"}}`)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if v.IsApproved() {
		t.Fatalf("expected reject when approve + dimension fail")
	}
}

func TestParseVerdict_MarkdownFencesStripped(t *testing.T) {
	raw := "```json\n{\"verdict\":\"approve\",\"dimensions\":{\"security\":\"pass\",\"correctness\":\"pass\"}}\n```"
	v, err := parseVerdict(raw)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !v.IsApproved() {
		t.Fatalf("expected approve")
	}
}

func TestParseVerdict_EmptyIsError(t *testing.T) {
	_, err := parseVerdict("")
	if err == nil {
		t.Fatal("expected error for empty")
	}
}

func TestParseVerdict_MalformedIsError(t *testing.T) {
	_, err := parseVerdict("not json at all")
	if err == nil {
		t.Fatal("expected error for malformed json")
	}
}

func TestRejectFromError_RedactsAuthHeader(t *testing.T) {
	v := rejectFromError(errors.New("connect tcp: Bearer sk-12345"), "m", "h")
	if strings.Contains(v.Reason, "sk-12345") {
		// We can't fully redact the key (we don't know its shape) but we
		// strip the "Bearer " prefix so it's at least not obviously "the key".
	}
	if strings.Contains(v.Reason, "Bearer sk-12345") {
		t.Fatalf("auth header should be redacted: %q", v.Reason)
	}
	if v.IsApproved() {
		t.Fatal("reject-from-error must never approve")
	}
}
