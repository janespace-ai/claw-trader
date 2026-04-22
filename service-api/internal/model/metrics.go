package model

// Metrics holds one dimension's worth of backtest summary values.
// 30+ numerical fields; zero-valued when N/A.
type Metrics struct {
	// Returns
	TotalReturn          float64 `json:"total_return"`
	AnnualizedReturn     float64 `json:"annualized_return"`
	MaxDrawdown          float64 `json:"max_drawdown"`
	MaxDrawdownDuration  float64 `json:"max_drawdown_duration"`
	ProfitFactor         float64 `json:"profit_factor"`
	Expectancy           float64 `json:"expectancy"`
	EquityFinal          float64 `json:"equity_final"`
	EquityPeak           float64 `json:"equity_peak"`

	// Risk
	VolatilityAnn        float64 `json:"volatility_ann"`
	DownsideDeviation    float64 `json:"downside_deviation"`
	VaR95                float64 `json:"var_95"`
	CVaR95               float64 `json:"cvar_95"`
	MaxConsecutiveWins   int     `json:"max_consecutive_wins"`
	MaxConsecutiveLosses int     `json:"max_consecutive_losses"`

	// Risk-adjusted
	SharpeRatio          float64 `json:"sharpe_ratio"`
	SortinoRatio         float64 `json:"sortino_ratio"`
	CalmarRatio          float64 `json:"calmar_ratio"`
	OmegaRatio           float64 `json:"omega_ratio"`
	WinRate              float64 `json:"win_rate"`
	RiskRewardRatio      float64 `json:"risk_reward_ratio"`
	RecoveryFactor       float64 `json:"recovery_factor"`

	// Trade analysis
	TotalTrades          int     `json:"total_trades"`
	AvgTradeReturn       float64 `json:"avg_trade_return"`
	AvgWin               float64 `json:"avg_win"`
	AvgLoss              float64 `json:"avg_loss"`
	AvgTradeDuration     float64 `json:"avg_trade_duration"`
	MaxTradeDuration     float64 `json:"max_trade_duration"`
	LongTrades           int     `json:"long_trades"`
	ShortTrades          int     `json:"short_trades"`
	BestTrade            float64 `json:"best_trade"`
	WorstTrade           float64 `json:"worst_trade"`
}

// MetricsSet groups metrics by ALL / LONG / SHORT dimensions.
type MetricsSet struct {
	All   Metrics `json:"all"`
	Long  Metrics `json:"long"`
	Short Metrics `json:"short"`
}
