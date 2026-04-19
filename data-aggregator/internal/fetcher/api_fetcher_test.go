package fetcher

import (
	"testing"
	"time"
)

func TestDecodeGateioCandlesticks_stringFields(t *testing.T) {
	body := []byte(`[{"t":"1700000000","v":"1.5","c":"2","h":"3","l":"1","o":"2","sum":"10"}]`)
	out, err := decodeGateioCandlesticks("BTC_USDT", body)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("len=%d", len(out))
	}
	c := out[0]
	if c.Symbol != "BTC_USDT" || c.Volume != 1.5 || c.Close != 2 || c.QuoteVolume == nil || *c.QuoteVolume != 10 {
		t.Fatalf("candle=%+v", c)
	}
	if !c.Ts.Equal(time.Unix(1700000000, 0).UTC()) {
		t.Fatalf("ts=%v", c.Ts)
	}
}

func TestDecodeGateioCandlesticks_numericFields(t *testing.T) {
	body := []byte(`[{"t":1700000001,"v":2.5,"c":2.1,"h":3.1,"l":1.1,"o":2.2,"sum":11.5}]`)
	out, err := decodeGateioCandlesticks("ETH_USDT", body)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 {
		t.Fatalf("len=%d", len(out))
	}
	c := out[0]
	if c.Symbol != "ETH_USDT" || c.Volume != 2.5 || c.Close != 2.1 {
		t.Fatalf("candle=%+v", c)
	}
	if c.QuoteVolume == nil || *c.QuoteVolume != 11.5 {
		t.Fatalf("quote=%v", c.QuoteVolume)
	}
}
