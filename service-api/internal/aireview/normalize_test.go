package aireview

import "testing"

func TestNormalize_CommentsStripped(t *testing.T) {
	in := "x = 1  # a comment\ny = 2 # another"
	got := Normalize(in)
	want := "x = 1\ny = 2"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestNormalize_StringHashPreserved(t *testing.T) {
	// A `#` inside a string literal must NOT be treated as a comment start —
	// otherwise we'd cache-collide on "x = '#a'" vs "x = '#b'".
	in := `x = "#not a comment"`
	got := Normalize(in)
	if got != in {
		t.Fatalf("got %q want unchanged %q", got, in)
	}
}

func TestNormalize_BlankLinesDropped(t *testing.T) {
	in := "x = 1\n\n\ny = 2\n"
	got := Normalize(in)
	want := "x = 1\ny = 2"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestNormalize_LeadingIndentationPreserved(t *testing.T) {
	// Python is whitespace-sensitive — leading indent is semantic, must survive.
	in := "def f():\n    x = 1\n    return x\n"
	got := Normalize(in)
	want := "def f():\n    x = 1\n    return x"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestNormalize_CRLFBecomesLF(t *testing.T) {
	in := "x = 1\r\ny = 2\r\n"
	got := Normalize(in)
	want := "x = 1\ny = 2"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestHash_StableForCosmeticChanges(t *testing.T) {
	a := "x = 1  # v1\ny = 2"
	b := "x = 1   # v2 docstring change\n\ny = 2\n"
	if Hash(a) != Hash(b) {
		t.Fatalf("expected equal hashes for cosmetic diff; got %s != %s",
			Hash(a), Hash(b))
	}
}

func TestHash_DifferentForSemanticChange(t *testing.T) {
	a := "x = 1"
	b := "x = 2"
	if Hash(a) == Hash(b) {
		t.Fatalf("expected different hashes for semantic diff")
	}
}
