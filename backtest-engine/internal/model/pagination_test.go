package model

import "testing"

func TestEncodeDecodeCursor_Roundtrip(t *testing.T) {
	type payload struct {
		Offset int    `json:"o"`
		Key    string `json:"k"`
	}
	in := payload{Offset: 42, Key: "BTC_USDT"}
	ptr, err := EncodeCursor(in)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if ptr == nil {
		t.Fatal("expected non-nil cursor")
	}
	var out payload
	if err := DecodeCursor(*ptr, &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out != in {
		t.Errorf("roundtrip lost data: got %+v want %+v", out, in)
	}
}

func TestDecodeCursor_EmptyIsNoop(t *testing.T) {
	var out map[string]any
	if err := DecodeCursor("", &out); err != nil {
		t.Fatalf("empty cursor should not error, got %v", err)
	}
	if out != nil {
		t.Errorf("out should remain nil, got %v", out)
	}
}

func TestDecodeCursor_InvalidBase64(t *testing.T) {
	var out map[string]any
	if err := DecodeCursor("not base64!!", &out); err == nil {
		t.Fatal("expected error, got nil")
	}
}
